// Claude lit la page d'accueil de chaque prospect et juge si son site est déjà
// bon, puis écrit le constat de l'email 1 à partir de ce qu'il voit vraiment.
import Anthropic from '@anthropic-ai/sdk';
import { CONSTATS } from '../scripts/cibles.mjs';

export const MODELE_PAR_DEFAUT = 'claude-opus-5-5';
// Même modèle, nommé à la façon d'OpenRouter (openrouter.ai/models).
export const MODELE_OPENROUTER = 'anthropic/claude-opus-5.5';

export type Avis = {
  verdict: 'bon' | 'moyen' | 'faible' | 'hors_cible';
  qualite: number;
  constat: string;
  raisons: string[];
  confiance: 'haute' | 'moyenne' | 'basse';
};

type Page = { url: string; titre: string; description: string; liens: string[]; indices: string[]; poidsKo: number; texte: string };

type Demande = {
  nom: string;
  categorie: string;
  ville: string;
  cible: string;
  metiers: string[];
  page: Page;
  signaux: Record<string, unknown>;
};

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['bon', 'moyen', 'faible', 'hors_cible'] },
    qualite: { type: 'integer', description: 'De 1 (à refaire entièrement) à 10 (rien à proposer).' },
    constat: { type: 'string' },
    raisons: { type: 'array', items: { type: 'string' } },
    confiance: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
  },
  required: ['verdict', 'qualite', 'constat', 'raisons', 'confiance'],
  additionalProperties: false,
};

// Exemples de constats déjà utilisés, pour donner le ton.
const EXEMPLES = Object.values(CONSTATS)
  .map((phrase) => `- « ${phrase.replace('{annee}', '2018')} »`)
  .join('\n');

const SYSTEME = `Tu aides C'est bien beau, un studio web alsacien d'une personne, à choisir quelles petites entreprises contacter pour leur proposer un nouveau site.

On te donne la page d'accueil d'une entreprise, réduite à son texte visible, ses liens et quelques indices techniques relevés automatiquement. Tu ne vois pas le rendu visuel : juge sur ce que le texte, la structure et les indices montrent.

Rends :
- verdict : « bon » si le site est récent, complet et fait déjà son travail (rien d'utile à leur proposer) ; « moyen » s'il fonctionne mais manque de quelque chose d'important pour ce métier ; « faible » s'il est daté, vide, cassé ou incomplet ; « hors_cible » si la page montre que ce n'est pas une petite entreprise indépendante du métier visé (chaîne, franchise, coopérative, enseigne nationale, autre activité).
- qualite : une note de 1 à 10.
- constat : une phrase qui suit « En regardant votre site, j'ai remarqué que », au vouvoiement, en 25 mots au plus, sans majuscule au début ni point final. Elle doit être factuelle, précise et vérifiable par le patron en ouvrant son site : ne dis rien que les données ne montrent pas, n'invente aucun chiffre, ne sois jamais vexant. Choisis le manque qui compte le plus pour ses clients. Laisse-la vide si le verdict est « bon » ou « hors_cible ».
- raisons : deux à quatre éléments courts qui justifient le verdict, pour le studio.
- confiance : « basse » si la page est presque vide, en construction ou ne permet pas de juger.

Exemples de constats :
${EXEMPLES}`;

function message(d: Demande) {
  const signaux = Object.entries(d.signaux)
    .filter(([, valeur]) => valeur)
    .map(([cle, valeur]) => (typeof valeur === 'number' ? `${cle} (${valeur})` : cle));
  return `Entreprise : ${d.nom}
Catégorie Google : ${d.categorie || 'inconnue'}
Commune : ${d.ville || 'inconnue'}
Cible : ${d.cible} (métiers : ${d.metiers.join(', ')})

Page : ${d.page.url}
Titre : ${d.page.titre || '(aucun)'}
Description : ${d.page.description || '(aucune)'}
Poids du HTML : ${d.page.poidsKo} Ko
Indices techniques : ${d.page.indices.join(', ') || 'aucun'}
Signaux relevés par nos règles : ${signaux.join(', ') || 'aucun'}
Liens : ${d.page.liens.join(' | ') || '(aucun)'}

Texte visible :
<texte>
${d.page.texte || '(vide)'}
</texte>`;
}

// Une clé OpenRouter passe avant une clé Anthropic.
function openrouter(env: Env) {
  return Boolean(env.OPENROUTER_API_KEY);
}

export function claudeActif(env: Env) {
  return Boolean(env.OPENROUTER_API_KEY || env.ANTHROPIC_API_KEY);
}

export function modele(env: Env) {
  return String(env.CLAUDE_MODELE || (openrouter(env) ? MODELE_OPENROUTER : MODELE_PAR_DEFAUT));
}

function lireAvis(texte: string): Avis {
  // Certains modèles entourent le JSON de texte ou de ```json : on garde l'objet.
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  const avis = JSON.parse(debut >= 0 && fin > debut ? texte.slice(debut, fin + 1) : texte) as Avis;
  if (!['bon', 'moyen', 'faible', 'hors_cible'].includes(avis.verdict)) throw new Error(`Verdict inconnu : ${avis.verdict}`);
  avis.qualite = Math.min(10, Math.max(1, Math.round(Number(avis.qualite) || 5)));
  avis.constat = String(avis.constat ?? '').trim().replace(/^en regardant[^,]*, j'ai remarqué que\s*/i, '').replace(/[.\s]+$/, '');
  avis.raisons = Array.isArray(avis.raisons) ? avis.raisons.map(String) : [];
  if (!['haute', 'moyenne', 'basse'].includes(avis.confiance)) avis.confiance = 'moyenne';
  return avis;
}

async function jugerOpenRouter(env: Env, demande: Demande): Promise<Avis | null> {
  const base = String(env.OPENROUTER_API || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const reponse = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      'x-title': 'Prospection C\'est bien beau',
    },
    body: JSON.stringify({
      model: modele(env),
      max_tokens: 8000,
      messages: [
        { role: 'system', content: SYSTEME },
        { role: 'user', content: message(demande) },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'avis', strict: true, schema: SCHEMA } },
      // Tâche de tri : peu de réflexion suffit.
      reasoning: { effort: 'low' },
    }),
  });
  const corps = (await reponse.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  } | null;
  if (!reponse.ok || corps?.error) throw new Error(`OpenRouter ${reponse.status} : ${corps?.error?.message ?? 'réponse illisible'}`);
  const choix = corps?.choices?.[0];
  if (!choix?.message?.content || choix.message.refusal) return null;
  return lireAvis(choix.message.content);
}

export async function juger(env: Env, demande: Demande): Promise<Avis | null> {
  if (openrouter(env)) return jugerOpenRouter(env, demande);
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.ANTHROPIC_API ? { baseURL: String(env.ANTHROPIC_API) } : {}),
  });
  const reponse = await client.beta.messages.create({
    model: modele(env),
    max_tokens: 8000,
    system: SYSTEME,
    messages: [{ role: 'user', content: message(demande) }],
    // Tâche de tri : peu de réflexion suffit.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    // Si le modèle refuse (filtre de sécurité), l'API relance la demande sur un autre modèle.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  if (reponse.stop_reason === 'refusal') return null;
  const texte = reponse.content.find((bloc) => bloc.type === 'text');
  if (!texte || texte.type !== 'text') return null;
  return lireAvis(texte.text);
}

// Recherche d'email : Claude cherche sur le web l'adresse de contact d'une
// entreprise dont le site n'en montre pas. Il doit citer la page où il l'a lue ;
// l'adresse est ensuite vérifiée dans cette page avant d'être utilisée.

export type Trouvaille = { email: string; source: string; preuve: string };

type Entreprise = { nom: string; categorie: string; ville: string; adresse: string; site: string; telephone: string };

const SYSTEME_EMAIL = `Tu aides C'est bien beau, un studio web alsacien, à trouver l'adresse email de contact d'une petite entreprise, pour lui écrire un email de prospection.

Cherche sur le web : son site (pages contact, mentions légales, à propos), sa page Facebook ou Instagram, Pages Jaunes, l'office de tourisme, les annuaires de son métier, la presse locale.

Règles strictes :
- Ne rends qu'une adresse que tu as lue telle quelle dans une page, et donne l'URL exacte de cette page.
- N'invente jamais et ne devine jamais une adresse : pas de contact@ ou info@ supposé à partir du nom de domaine.
- Vérifie que la page parle bien de cette entreprise (même nom, même commune).
- Préfère une adresse générique (contact@, info@, le nom de l'entreprise) à l'adresse personnelle d'une personne.
- Si tu ne trouves rien de sûr, rends une adresse vide. C'est une bonne réponse.

Réponds uniquement avec un objet JSON : {"email": "...", "source": "..."}`;

function demandeEmail(e: Entreprise) {
  return `Entreprise : ${e.nom}
Catégorie Google : ${e.categorie || 'inconnue'}
Commune : ${e.ville || 'inconnue'}
Adresse : ${e.adresse || 'inconnue'}
Site : ${e.site || 'aucun'}
Téléphone : ${e.telephone || 'inconnu'}`;
}

function lireTrouvaille(texte: string, preuve: string): Trouvaille | null {
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut < 0 || fin <= debut) return null;
  const { email, source } = JSON.parse(texte.slice(debut, fin + 1)) as { email?: string; source?: string };
  const propre = String(email ?? '').trim().toLowerCase().replace(/^mailto:/, '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(propre)) return null;
  return { email: propre, source: String(source ?? '').trim(), preuve };
}

async function chercherOpenRouter(env: Env, e: Entreprise): Promise<Trouvaille | null> {
  const base = String(env.OPENROUTER_API || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const reponse = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'content-type': 'application/json', 'x-title': 'Prospection C\'est bien beau' },
    body: JSON.stringify({
      model: modele(env),
      max_tokens: 8000,
      messages: [
        { role: 'system', content: SYSTEME_EMAIL },
        { role: 'user', content: demandeEmail(e) },
      ],
      // Recherche web d'OpenRouter : les résultats sont ajoutés à la demande.
      plugins: [{ id: 'web', max_results: 5 }],
      reasoning: { effort: 'low' },
    }),
  });
  const corps = (await reponse.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: { message?: { content?: string | null; refusal?: string | null; annotations?: unknown[] } }[];
  } | null;
  if (!reponse.ok || corps?.error) throw new Error(`OpenRouter ${reponse.status} : ${corps?.error?.message ?? 'réponse illisible'}`);
  const message = corps?.choices?.[0]?.message;
  if (!message?.content || message.refusal) return null;
  return lireTrouvaille(message.content, JSON.stringify(message.annotations ?? []));
}

async function chercherAnthropic(env: Env, e: Entreprise): Promise<Trouvaille | null> {
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.ANTHROPIC_API ? { baseURL: String(env.ANTHROPIC_API) } : {}),
  });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: demandeEmail(e) }];
  let preuve = '';
  // Les outils web tournent chez Anthropic ; une longue recherche peut s'arrêter en « pause_turn » et se reprend.
  for (let tour = 0; tour < 4; tour++) {
    const reponse = await client.beta.messages.create({
      model: modele(env),
      max_tokens: 8000,
      system: SYSTEME_EMAIL,
      messages,
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 4 },
      ],
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    // Le texte des pages lues par web_fetch sert de preuve.
    preuve += JSON.stringify(reponse.content.filter((bloc) => bloc.type !== 'text'));
    if (reponse.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: reponse.content });
      continue;
    }
    if (reponse.stop_reason === 'refusal') return null;
    const texte = reponse.content.filter((bloc) => bloc.type === 'text').map((bloc) => (bloc.type === 'text' ? bloc.text : '')).join('');
    return lireTrouvaille(texte, preuve);
  }
  return null;
}

export function chercherEmail(env: Env, e: Entreprise) {
  return openrouter(env) ? chercherOpenRouter(env, e) : chercherAnthropic(env, e);
}
