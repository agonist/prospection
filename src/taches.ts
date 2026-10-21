// Tâche planifiée, toutes les minutes : suit les recherches Apify, importe leurs
// fiches par petits lots, puis analyse les sites des prospects importés.
// Les lots restent petits pour tenir dans les limites d'une exécution de Worker
// (50 requêtes D1 et 50 requêtes sortantes sur le plan gratuit).
import { CIBLES } from '../scripts/cibles.mjs';
import { STATUTS_AUTOMATIQUES, identifiant, statutApresAnalyse } from '../scripts/base.mjs';
import { cleDoublon, exclusion, normaliser } from '../scripts/lib.mjs';
import { analyser } from '../scripts/analyse.mjs';
import { etat, fiches } from './apify';

const IMPORT_PAR_PASSAGE = 25;
const ANALYSES_PAR_PASSAGE = 8;
const ECHECS = ['FAILED', 'ABORTED', 'TIMED-OUT', 'TIMED_OUT'];

type Recherche = { id: number; cible: string; run_id: string; dataset_id: string; statut: string; importees: number };

const AUTOMATIQUES = STATUTS_AUTOMATIQUES.map((statut) => `'${statut}'`).join(', ');

// Insère la fiche, ou met à jour ses données. Un statut posé à la main reste ;
// un statut automatique repasse en « à analyser » pour rafraîchir le constat.
const UPSERT = `INSERT INTO prospects
  (id, cible, nom, categorie, ville, adresse, telephone, site, fiche_google, note_google, avis_google, recherche, emails_fiche, statut, raison, cree_le, vu_le, statut_le)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16, ?16)
  ON CONFLICT (id) DO UPDATE SET
    cible = excluded.cible, nom = excluded.nom, categorie = excluded.categorie, ville = excluded.ville,
    adresse = excluded.adresse, telephone = excluded.telephone, site = excluded.site,
    fiche_google = excluded.fiche_google, note_google = excluded.note_google, avis_google = excluded.avis_google,
    recherche = excluded.recherche, emails_fiche = excluded.emails_fiche, vu_le = excluded.vu_le,
    raison = CASE WHEN prospects.statut IN (${AUTOMATIQUES}) THEN excluded.raison ELSE prospects.raison END,
    statut_le = CASE WHEN prospects.statut IN (${AUTOMATIQUES}) AND prospects.statut <> excluded.statut THEN excluded.statut_le ELSE prospects.statut_le END,
    statut = CASE WHEN prospects.statut IN (${AUTOMATIQUES}) THEN excluded.statut ELSE prospects.statut END`;

export function ligneImport(fiche: Record<string, unknown>, nomCible: string, maintenant: string) {
  const cible = CIBLES[nomCible as keyof typeof CIBLES];
  const prospect = normaliser(fiche);
  if (!prospect.nom) return null;
  if (!prospect.recherche) prospect.recherche = `${cible.recherche} ${prospect.ville}`.trim();
  const raison = exclusion(prospect, cible);
  return [
    identifiant(prospect, cleDoublon(prospect)),
    nomCible,
    prospect.nom,
    prospect.categorie,
    prospect.ville,
    prospect.adresse,
    prospect.telephone,
    prospect.site,
    prospect.ficheGoogle,
    typeof prospect.noteGoogle === 'number' ? prospect.noteGoogle : null,
    typeof prospect.avisGoogle === 'number' ? prospect.avisGoogle : null,
    prospect.recherche,
    JSON.stringify(prospect.emails),
    raison ? 'hors_cible' : 'a_analyser',
    raison ?? '',
    maintenant,
  ];
}

// Renvoie true si la recherche a consommé ce passage (un lot importé).
async function avancer(env: Env, recherche: Recherche, maintenant: string): Promise<boolean> {
  if (recherche.statut === 'en_cours') {
    const statut = await etat(env, recherche.run_id);
    if (ECHECS.includes(statut)) {
      await env.DB.prepare("UPDATE recherches SET statut = 'echec', erreur = ?, fini_le = ? WHERE id = ?")
        .bind(`Apify : ${statut}`, maintenant, recherche.id)
        .run();
      return false;
    }
    if (statut !== 'SUCCEEDED') return false;
  }

  const lot = await fiches(env, recherche.dataset_id, recherche.importees, IMPORT_PAR_PASSAGE);
  const lignes = lot.fiches.map((fiche) => ligneImport(fiche, recherche.cible, maintenant)).filter((ligne) => ligne !== null);
  const importees = recherche.importees + lot.fiches.length;
  const fini = lot.fiches.length === 0 || importees >= lot.total;
  await env.DB.batch([
    ...lignes.map((ligne) => env.DB.prepare(UPSERT).bind(...ligne)),
    env.DB.prepare('UPDATE recherches SET statut = ?, fiches = ?, importees = ?, fini_le = ? WHERE id = ?').bind(
      fini ? 'terminee' : 'import',
      lot.total,
      importees,
      fini ? maintenant : null,
      recherche.id,
    ),
  ]);
  return true;
}

type AAnalyser = { id: string; cible: string; site: string; emails_fiche: string };

async function analyserLot(env: Env, maintenant: string) {
  const { results } = await env.DB.prepare("SELECT id, cible, site, emails_fiche FROM prospects WHERE statut = 'a_analyser' ORDER BY vu_le LIMIT ?")
    .bind(ANALYSES_PAR_PASSAGE)
    .all<AAnalyser>();
  if (!results.length) return;

  const analyses = await Promise.all(
    results.map((p) => analyser({ site: p.site, emails: JSON.parse(p.emails_fiche || '[]') }, CIBLES[p.cible as keyof typeof CIBLES])),
  );
  await env.DB.batch(
    results.map((p, index) => {
      const analyse = analyses[index];
      const { statut, raison } = statutApresAnalyse(analyse);
      return env.DB.prepare(
        `UPDATE prospects SET email = ?, email_statut = ?, constat_cle = ?, constat = ?, signaux = ?, statut = ?, raison = ?, statut_le = ?
          WHERE id = ? AND statut = 'a_analyser'`,
      ).bind(
        analyse.email,
        analyse.statut,
        analyse.constat?.cle ?? '',
        analyse.constat?.phrase ?? '',
        JSON.stringify(analyse.signaux),
        statut,
        raison,
        maintenant,
        p.id,
      );
    }),
  );
}

export async function tache(env: Env) {
  const maintenant = new Date().toISOString();
  const recherche = await env.DB.prepare("SELECT * FROM recherches WHERE statut IN ('import', 'en_cours') ORDER BY statut = 'en_cours', id LIMIT 1").first<Recherche>();
  if (recherche) {
    try {
      if (await avancer(env, recherche, maintenant)) return;
    } catch (erreur) {
      await env.DB.prepare('UPDATE recherches SET erreur = ? WHERE id = ?').bind(String(erreur).slice(0, 500), recherche.id).run();
    }
  }
  await analyserLot(env, maintenant);
}
