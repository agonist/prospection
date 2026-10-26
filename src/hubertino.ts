// Google Maps par Hubertino (hubertino.com), à la place d'Apify quand HUBERTINO_API_KEY
// est renseignée : environ 0,40 $ les 1 000 fiches, email du site compris. Une
// extraction croise des métiers et des communes ; ses fiches sont converties au
// format Apify pour que l'import reste le même.
// API : https://hubertino.com/docs (OpenAPI : /api/v1/openapi.json).

const PREFIXE = 'hubertino:';
// Limite d'Hubertino : métiers × communes par extraction.
export const PAIRES_MAX_HUBERTINO = 2000;

export function hubertinoActif(env: Env) {
  return Boolean(env.HUBERTINO_API_KEY);
}

export function estHubertino(runId: string) {
  return runId.startsWith(PREFIXE);
}

async function appeler<T>(env: Env, chemin: string, init: RequestInit = {}): Promise<T> {
  if (!env.HUBERTINO_API_KEY) throw new Error('Clé Hubertino manquante : ajouter HUBERTINO_API_KEY dans .dev.vars.');
  const base = String(env.HUBERTINO_API || 'https://hubertino.com/api/v1').replace(/\/$/, '');
  const reponse = await fetch(`${base}${chemin}`, {
    ...init,
    headers: { authorization: `Bearer ${env.HUBERTINO_API_KEY}`, 'content-type': 'application/json', ...init.headers },
  });
  if (reponse.status === 402) throw new Error('Hubertino : plus assez de crédits (hubertino.com → Billing).');
  if (!reponse.ok) throw new Error(`Hubertino a répondu ${reponse.status} : ${(await reponse.text()).slice(0, 200)}`);
  return (await reponse.json()) as T;
}

// « Barr » devient « Barr, Alsace, France ». Une commune déjà précisée (« Nancy, France ») part telle quelle.
export function lieu(commune: string) {
  return commune.includes(',') ? commune.trim() : `${commune.trim()}, Alsace, France`;
}

// Lance une extraction : chaque métier est cherché dans chaque commune. Rend l'identifiant à suivre.
export async function lancerHubertino(env: Env, metiers: string[], communes: string[], parRecherche: number) {
  const reponse = await appeler<{ scrape: { id: string | number } }>(env, '/scrapes', {
    method: 'POST',
    body: JSON.stringify({
      categories: metiers,
      locations: communes.map(lieu),
      maxResults: Math.min(500, Math.max(1, parRecherche)),
      country: 'fr',
      // Visite des sites pour l'email et liens des réseaux sociaux : compris dans le prix.
      enrichWebsite: true,
      enrichLinks: true,
    }),
  });
  return `${PREFIXE}${reponse.scrape.id}`;
}

type Scrape = { status: string; resultCount?: number | null };

function identifiant(runId: string) {
  return encodeURIComponent(runId.slice(PREFIXE.length));
}

// Les états d'Hubertino traduits en états Apify, que la tâche sait suivre.
const ETATS: Record<string, string> = { queued: 'READY', running: 'RUNNING', done: 'SUCCEEDED', error: 'FAILED' };

export async function etatHubertino(env: Env, runId: string) {
  const reponse = await appeler<{ scrape?: Scrape } & Scrape>(env, `/scrapes/${identifiant(runId)}`);
  const status = (reponse.scrape ?? reponse).status;
  return ETATS[status] ?? status;
}

type Ligne = Record<string, unknown> & {
  _status?: string;
  query?: string | null;
  name?: string | null;
  category?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  rating?: number | null;
  reviews?: number | null;
  business_status?: string | null;
  location_link?: string | null;
  place_id?: string | null;
};

type Page = { count: number; rows: Ligne[]; hasMore: boolean };

function mots(texte: string) {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// La recherche « métier commune » qui a trouvé la fiche, reprise telle quelle dans l'email.
// Hubertino renvoie le métier et le lieu envoyés à Google Maps : on retrouve la paire lancée.
export function recherchePour(query: string | null | undefined, termes: string[]) {
  if (!query) return '';
  const dans = new Set(mots(query));
  const candidats = termes.filter((terme) => mots(terme).every((mot) => dans.has(mot)));
  return candidats.sort((a, b) => mots(b).length - mots(a).length)[0] ?? '';
}

// Une fiche Hubertino au format d'une fiche Apify.
function versApify(ligne: Ligne, termes: string[]) {
  return {
    placeId: ligne.place_id ?? '',
    title: ligne.name ?? '',
    categoryName: ligne.category ?? '',
    city: ligne.city ?? '',
    address: ligne.address ?? '',
    phone: ligne.phone ?? '',
    website: ligne.website ?? '',
    url: ligne.location_link ?? '',
    totalScore: ligne.rating ?? null,
    reviewsCount: ligne.reviews ?? null,
    searchString: recherchePour(ligne.query, termes),
    permanentlyClosed: /permanent/i.test(ligne.business_status ?? ''),
    emails: ligne.email ? [ligne.email] : [],
  } as Record<string, unknown>;
}

export async function fichesHubertino(env: Env, runId: string, decalage: number, nombre: number, termes: string[]) {
  const page = await appeler<Page>(env, `/scrapes/${identifiant(runId)}/results?offset=${decalage}&limit=${Math.min(5000, Math.max(1, nombre))}`);
  return { fiches: page.rows.map((ligne) => versApify(ligne, termes)), total: page.count };
}

// Nombre de fiches déjà trouvées, même pendant l'extraction.
export async function compteHubertino(env: Env, runId: string) {
  const page = await appeler<Page>(env, `/scrapes/${identifiant(runId)}/results?offset=0&limit=1`);
  return page.count ?? 0;
}
