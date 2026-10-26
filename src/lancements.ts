// Lancer une extraction, depuis le formulaire, le pilote automatique ou Claude (MCP) :
// Google Maps sur Hubertino quand sa clé est là, sinon sur Apify ; le registre Sirene sur Apify.
import { lancer, lancerSirene } from './apify';
import { type Cible, DELAI_TERMES_MS, DEPARTEMENTS_DEFAUT, codeNaf, normaliserTerme, termesCible } from './cibles';
import { PAIRES_MAX_HUBERTINO, hubertinoActif, lancerHubertino } from './hubertino';

export type Paire = { metier: string; commune: string };

// Les recherches « métier commune » lancées ces 6 derniers mois, avec leur date.
export async function termesRecents(env: Env) {
  const { results } = await env.DB.prepare('SELECT terme, lance_le FROM termes WHERE lance_le > ?')
    .bind(new Date(Date.now() - DELAI_TERMES_MS).toISOString())
    .all<{ terme: string; lance_le: string }>();
  return new Map(results.map(({ terme, lance_le }) => [terme, lance_le]));
}

// Les recherches de la cible pas encore faites ces 6 derniers mois, commune par commune.
export async function termesAFaire(env: Env, cible: Cible): Promise<Paire[]> {
  const faits = await termesRecents(env);
  return termesCible(cible)
    .filter(({ terme }) => !faits.has(terme))
    .map(({ metier, commune }) => ({ metier, commune }));
}

// Chaque métier dans chaque commune, sans doublon, moins ce qui a été fait ces 6 derniers mois (sauf `forcer`).
export async function pairesAFaire(env: Env, metiers: string[], communes: string[], forcer: boolean) {
  const demandes = [...new Map(communes.flatMap((commune) => metiers.map((metier) => [normaliserTerme(`${metier} ${commune}`), { metier, commune }] as const))).entries()];
  const faits = forcer ? new Map<string, string>() : await termesRecents(env);
  return { demandees: demandes.length, aFaire: demandes.filter(([cle]) => !faits.has(cle)).map(([, paire]) => paire) };
}

function journal(env: Env, le: string, message: string, rechercheId: number) {
  return env.DB.prepare('INSERT INTO journal (le, niveau, message, recherche_id) VALUES (?, ?, ?, ?)').bind(le, 'info', message, rechercheId);
}

// Hubertino cherche chaque métier dans chaque commune : les paires demandées sont complétées
// en tableau croisé (quelques recherches de plus, à moins de 0,01 $ chacune).
async function lancerExtraction(env: Env, paires: Paire[], max: number, contacts: boolean) {
  if (hubertinoActif(env)) {
    const metiers = [...new Set(paires.map((p) => p.metier))];
    const communes = [...new Set(paires.map((p) => p.commune))];
    if (metiers.length * communes.length > PAIRES_MAX_HUBERTINO) {
      throw new Error(`Hubertino accepte ${PAIRES_MAX_HUBERTINO} recherches au plus par extraction (ici ${metiers.length} métiers × ${communes.length} communes).`);
    }
    const runId = await lancerHubertino(env, metiers, communes, max);
    return { runId, datasetId: runId, termes: communes.flatMap((commune) => metiers.map((metier) => `${metier} ${commune}`)), fournisseur: 'Hubertino' };
  }
  const termes = paires.map((p) => `${p.metier} ${p.commune}`);
  return { ...(await lancer(env, termes, max, contacts)), termes, fournisseur: 'Apify' };
}

export async function lancerGoogleMaps(env: Env, cible: string, paires: Paire[], max: number, options: { contacts?: boolean; auto?: boolean; sautes?: number } = {}) {
  const { contacts = false, auto = false, sautes = 0 } = options;
  const { runId, datasetId, termes, fournisseur } = await lancerExtraction(env, paires, max, contacts);
  const maintenant = new Date().toISOString();
  const { meta } = await env.DB.prepare('INSERT INTO recherches (cible, termes, run_id, dataset_id, cree_le, auto) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(cible, JSON.stringify(termes), runId, datasetId, maintenant, auto ? 1 : 0)
    .run();
  const id = Number(meta.last_row_id);
  await env.DB.batch([
    journal(
      env,
      maintenant,
      `Recherche n°${id} lancée ${auto ? 'par le pilote automatique ' : ''}sur ${fournisseur} : ${termes.length} recherches, ${max} fiches maximum chacune${contacts && fournisseur === 'Apify' ? ', avec extraction des emails' : ''}${sautes ? `. ${sautes} déjà faites il y a moins de 6 mois, sautées` : ''}.`,
      id,
    ),
    env.DB.prepare(
      `INSERT INTO termes (terme, cible, recherche_id, lance_le) SELECT value, ?, ?, ? FROM json_each(?) WHERE true
        ON CONFLICT (terme) DO UPDATE SET cible = excluded.cible, recherche_id = excluded.recherche_id, lance_le = excluded.lance_le`,
    ).bind(cible, id, maintenant, JSON.stringify(termes.map(normaliserTerme))),
  ]);
  return id;
}

// « 01.21Z Culture de la vigne » et « 67, 68 » en listes propres ; vides si rien n'est valable.
export function parametresCreations(naf: string[], departements: string[] | string) {
  const codes = [...new Set(naf.map(codeNaf).filter((code) => /^\d{2}\.\d{2}[A-Z]$/.test(code)))];
  const liste = typeof departements === 'string' ? departements.split(/[\s,;]+/) : departements;
  const depts = [...new Set(liste.map((d) => d.trim().toUpperCase()).filter(Boolean))];
  return { codes, depts };
}

export async function lancerCreations(env: Env, cible: Cible, demande: { codes: string[]; depts: string[]; jours: number; max: number; auto?: boolean }) {
  const { codes, jours, max, auto = false } = demande;
  const depts = demande.depts.length ? demande.depts : DEPARTEMENTS_DEFAUT;
  const { runId, datasetId } = await lancerSirene(env, { departements: depts, naf: codes, jours, max });
  const maintenant = new Date().toISOString();
  const { meta } = await env.DB.prepare("INSERT INTO recherches (cible, termes, run_id, dataset_id, cree_le, source, auto) VALUES (?, ?, ?, ?, ?, 'sirene', ?)")
    .bind(cible.cle, JSON.stringify([...codes, `${jours} jours`, depts.join(', ')]), runId, datasetId, maintenant, auto ? 1 : 0)
    .run();
  const id = Number(meta.last_row_id);
  await journal(
    env,
    maintenant,
    `Recherche n°${id} lancée ${auto ? 'par le pilote automatique' : 'sur Apify'} : entreprises créées ces ${jours} derniers jours (${codes.join(', ')}) dans le ${depts.join(', ')}.`,
    id,
  ).run();
  return id;
}
