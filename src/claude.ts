// Claude lit la page d'accueil de chaque prospect et juge si son site est déjà
// bon, puis écrit le constat de l'email 1 à partir de ce qu'il voit vraiment.
import Anthropic from '@anthropic-ai/sdk';
import { CONSTATS } from '../scripts/cibles.mjs';

export const MODELE_PAR_DEFAUT = 'claude-opus-5-5';

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

export function claudeActif(env: Env) {
  return Boolean(env.ANTHROPIC_API_KEY);
}

export function modele(env: Env) {
  return String(env.CLAUDE_MODELE || MODELE_PAR_DEFAUT);
}

export async function juger(env: Env, demande: Demande): Promise<Avis | null> {
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
  const avis = JSON.parse(texte.text) as Avis;
  avis.qualite = Math.min(10, Math.max(1, Math.round(avis.qualite)));
  avis.constat = avis.constat.trim().replace(/^en regardant[^,]*, j'ai remarqué que\s*/i, '').replace(/[.\s]+$/, '');
  return avis;
}
