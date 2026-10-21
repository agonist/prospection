// Lance et lit les extractions Google Maps sur Apify (acteur compass/crawler-google-places).

const ACTEUR = 'compass~crawler-google-places';

function api(env: Env, chemin: string) {
  return `${String(env.APIFY_API || 'https://api.apify.com').replace(/\/$/, '')}/v2${chemin}`;
}

async function appeler<T>(env: Env, chemin: string, init: RequestInit = {}): Promise<{ data: T; reponse: Response }> {
  if (!env.APIFY_TOKEN) throw new Error('Clé Apify manquante : lancer `pnpm wrangler secret put APIFY_TOKEN`.');
  const reponse = await fetch(api(env, chemin), {
    ...init,
    headers: { authorization: `Bearer ${env.APIFY_TOKEN}`, 'content-type': 'application/json', ...init.headers },
  });
  if (!reponse.ok) throw new Error(`Apify a répondu ${reponse.status} : ${(await reponse.text()).slice(0, 200)}`);
  return { data: (await reponse.json()) as T, reponse };
}

export async function lancer(env: Env, termes: string[], parRecherche: number, contacts: boolean) {
  const { data } = await appeler<{ data: { id: string; defaultDatasetId: string } }>(env, `/acts/${ACTEUR}/runs`, {
    method: 'POST',
    body: JSON.stringify({
      searchStringsArray: termes,
      maxCrawledPlacesPerSearch: parRecherche,
      language: 'fr',
      countryCode: 'fr',
      maxReviews: 0,
      maxImages: 0,
      // Option payante d'Apify : visite les sites et renvoie les emails dans `emails`.
      // Notre analyse repasse de toute façon sur le site pour le constat.
      scrapeContacts: contacts,
    }),
  });
  return { runId: data.data.id, datasetId: data.data.defaultDatasetId };
}

// READY, RUNNING, SUCCEEDED, FAILED, ABORTED, TIMED-OUT…
export async function etat(env: Env, runId: string) {
  const { data } = await appeler<{ data: { status: string } }>(env, `/actor-runs/${runId}`);
  return data.data.status;
}

export async function fiches(env: Env, datasetId: string, decalage: number, nombre: number) {
  const { data, reponse } = await appeler<Record<string, unknown>[]>(
    env,
    `/datasets/${datasetId}/items?clean=true&format=json&offset=${decalage}&limit=${nombre}`,
  );
  return { fiches: data, total: Number(reponse.headers.get('x-apify-pagination-total') ?? data.length) };
}

// Nombre de fiches déjà trouvées, même pendant l'extraction.
export async function compte(env: Env, datasetId: string) {
  const { data } = await appeler<{ data: { itemCount: number } }>(env, `/datasets/${datasetId}`);
  return data.data.itemCount ?? 0;
}
