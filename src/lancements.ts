// Lancer une extraction sur Apify, depuis le formulaire, le pilote automatique ou Claude (MCP).
import { lancer, lancerSirene } from './apify';
import { type Cible, DELAI_TERMES_MS, DEPARTEMENTS_DEFAUT, codeNaf, normaliserTerme, termesCible } from './cibles';

// Les recherches « métier commune » lancées ces 6 derniers mois, avec leur date.
export async function termesRecents(env: Env) {
  const { results } = await env.DB.prepare('SELECT terme, lance_le FROM termes WHERE lance_le > ?')
    .bind(new Date(Date.now() - DELAI_TERMES_MS).toISOString())
    .all<{ terme: string; lance_le: string }>();
  return new Map(results.map(({ terme, lance_le }) => [terme, lance_le]));
}

// Les recherches de la cible pas encore faites ces 6 derniers mois, commune par commune.
export async function termesAFaire(env: Env, cible: Cible) {
  const faits = await termesRecents(env);
  return termesCible(cible)
    .filter(({ terme }) => !faits.has(terme))
    .map(({ metier, commune }) => `${metier} ${commune}`);
}

function journal(env: Env, le: string, message: string, rechercheId: number) {
  return env.DB.prepare('INSERT INTO journal (le, niveau, message, recherche_id) VALUES (?, ?, ?, ?)').bind(le, 'info', message, rechercheId);
}

export async function lancerGoogleMaps(env: Env, cible: string, termes: string[], max: number, options: { contacts?: boolean; auto?: boolean; sautes?: number } = {}) {
  const { contacts = false, auto = false, sautes = 0 } = options;
  const { runId, datasetId } = await lancer(env, termes, max, contacts);
  const maintenant = new Date().toISOString();
  const { meta } = await env.DB.prepare('INSERT INTO recherches (cible, termes, run_id, dataset_id, cree_le, auto) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(cible, JSON.stringify(termes), runId, datasetId, maintenant, auto ? 1 : 0)
    .run();
  const id = Number(meta.last_row_id);
  await env.DB.batch([
    journal(
      env,
      maintenant,
      `Recherche n°${id} lancée ${auto ? 'par le pilote automatique' : 'sur Apify'} : ${termes.length} recherches, ${max} fiches maximum chacune${contacts ? ', avec extraction des emails' : ''}${sautes ? `. ${sautes} déjà faites il y a moins de 6 mois, sautées` : ''}.`,
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
