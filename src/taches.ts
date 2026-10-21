// Tâche planifiée, toutes les minutes : suit les recherches Apify, importe leurs
// fiches par petits lots, puis analyse les sites des prospects importés.
// Les lots restent petits pour tenir dans les limites d'une exécution de Worker
// (50 requêtes D1 et 50 requêtes sortantes sur le plan gratuit).
import { STATUTS_AUTOMATIQUES, identifiant, statutApresAnalyse } from '../scripts/base.mjs';
import { cleDoublon, exclusion, normaliser } from '../scripts/lib.mjs';
import { analyser } from '../scripts/analyse.mjs';
import { compte, etat, fiches } from './apify';
import { type Cible, chargerCibles } from './cibles';

// En ligne, le plan gratuit impose de petits lots. En local (`pnpm local`), il
// n'y a pas de limite : les variables du même nom les agrandissent.
const IMPORT_PAR_PASSAGE = 25;
const ANALYSES_PAR_PASSAGE = 8;

function taille(valeur: unknown, defaut: number) {
  const nombre = Number(valeur);
  return Number.isInteger(nombre) && nombre > 0 ? nombre : defaut;
}
const ECHECS = ['FAILED', 'ABORTED', 'TIMED-OUT', 'TIMED_OUT'];

type Recherche = {
  id: number;
  cible: string;
  run_id: string;
  dataset_id: string;
  statut: string;
  importees: number;
  apify_statut: string;
  apify_fiches: number;
};

const ETATS_APIFY: Record<string, string> = {
  READY: 'en file d’attente',
  RUNNING: 'en cours',
  SUCCEEDED: 'terminée',
  FAILED: 'échouée',
  ABORTED: 'annulée',
  'TIMED-OUT': 'trop longue, arrêtée',
};

const JOURNAL = 'INSERT INTO journal (le, niveau, message, recherche_id) VALUES (?, ?, ?, ?)';

// Écrit dans le journal de l'admin et dans le terminal (`pnpm local`, `wrangler tail`).
function noter(env: Env, niveau: 'info' | 'succes' | 'erreur', message: string, rechercheId: number | null = null) {
  console.log(`[prospection] ${niveau === 'erreur' ? 'ERREUR ' : ''}${message}`);
  return env.DB.prepare(JOURNAL).bind(new Date().toISOString(), niveau, message, rechercheId);
}

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

export function ligneImport(fiche: Record<string, unknown>, nomCible: string, cible: Cible | undefined, maintenant: string) {
  const prospect = normaliser(fiche);
  if (!prospect.nom) return null;
  if (!prospect.recherche) prospect.recherche = `${cible?.recherche ?? ''} ${prospect.ville}`.trim();
  const raison = cible ? exclusion(prospect, cible) : null;
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
async function avancer(env: Env, recherche: Recherche, cibles: Record<string, Cible>, maintenant: string): Promise<boolean> {
  if (recherche.statut === 'en_cours') {
    const [statut, trouvees] = await Promise.all([etat(env, recherche.run_id), compte(env, recherche.dataset_id)]);
    const notes = [];
    if (statut !== recherche.apify_statut || trouvees !== recherche.apify_fiches) {
      notes.push(noter(env, 'info', `Recherche n°${recherche.id} : extraction Apify ${ETATS_APIFY[statut] ?? statut}, ${trouvees} fiches trouvées.`, recherche.id));
    }
    if (ECHECS.includes(statut)) {
      await env.DB.batch([
        ...notes,
        noter(env, 'erreur', `Recherche n°${recherche.id} : l’extraction Apify a échoué (${statut}). Voir console.apify.com → Runs.`, recherche.id),
        env.DB.prepare("UPDATE recherches SET statut = 'echec', apify_statut = ?, apify_fiches = ?, erreur = ?, fini_le = ? WHERE id = ?").bind(
          statut,
          trouvees,
          `Apify : ${statut}`,
          maintenant,
          recherche.id,
        ),
        // Une extraction échouée pourra être relancée sans attendre.
        env.DB.prepare('DELETE FROM termes WHERE recherche_id = ?').bind(recherche.id),
      ]);
      return false;
    }
    await env.DB.batch([
      ...notes,
      env.DB.prepare("UPDATE recherches SET apify_statut = ?, apify_fiches = ?, erreur = '' WHERE id = ?").bind(statut, trouvees, recherche.id),
    ]);
    if (statut !== 'SUCCEEDED') return false;
  }

  const lot = await fiches(env, recherche.dataset_id, recherche.importees, taille(env.IMPORT_PAR_PASSAGE, IMPORT_PAR_PASSAGE));
  const lignes = lot.fiches.map((fiche) => ligneImport(fiche, recherche.cible, cibles[recherche.cible], maintenant)).filter((ligne) => ligne !== null);
  const importees = recherche.importees + lot.fiches.length;
  const fini = lot.fiches.length === 0 || importees >= lot.total;
  const horsCible = lignes.filter((ligne) => ligne[13] === 'hors_cible').length;
  await env.DB.batch([
    ...lignes.map((ligne) => env.DB.prepare(UPSERT).bind(...ligne)),
    env.DB.prepare('UPDATE recherches SET statut = ?, fiches = ?, importees = ?, fini_le = ? WHERE id = ?').bind(
      fini ? 'terminee' : 'import',
      lot.total,
      importees,
      fini ? maintenant : null,
      recherche.id,
    ),
    noter(
      env,
      fini ? 'succes' : 'info',
      `Recherche n°${recherche.id} : ${importees} / ${lot.total} fiches importées${horsCible ? ` (${horsCible} hors cible dans ce lot)` : ''}.${fini ? ' Les sites vont être analysés.' : ''}`,
      recherche.id,
    ),
  ]);
  return true;
}

type AAnalyser = { id: string; cible: string; nom: string; site: string; emails_fiche: string };

async function analyserLot(env: Env, cibles: Record<string, Cible>, maintenant: string) {
  const { results } = await env.DB.prepare("SELECT id, cible, nom, site, emails_fiche FROM prospects WHERE statut = 'a_analyser' ORDER BY vu_le LIMIT ?")
    .bind(taille(env.ANALYSES_PAR_PASSAGE, ANALYSES_PAR_PASSAGE))
    .all<AAnalyser>();
  if (!results.length) return;

  const analyses = await Promise.all(
    results.map((p) => analyser({ site: p.site, emails: JSON.parse(p.emails_fiche || '[]') }, cibles[p.cible] ?? { constats: [] })),
  );
  const LIBELLES: Record<string, string> = { nouveau: 'prêt à contacter', a_verifier: 'à vérifier', plus_tard: 'plus tard' };
  await env.DB.batch(
    results.flatMap((p, index) => {
      const analyse = analyses[index];
      const { statut, raison } = statutApresAnalyse(analyse);
      return [
        env.DB.prepare(
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
        ),
        noter(env, statut === 'nouveau' ? 'succes' : 'info', `${p.nom} : ${LIBELLES[statut] ?? statut}${statut === 'nouveau' ? ` (${analyse.constat?.phrase})` : ` (${raison})`}.`),
      ];
    }),
  );
}

export async function tache(env: Env) {
  const maintenant = new Date().toISOString();
  const semaine = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO etat (cle, valeur) VALUES ('dernier_passage', ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur").bind(maintenant),
    env.DB.prepare('DELETE FROM journal WHERE le < ?').bind(semaine),
  ]);

  const cibles = await chargerCibles(env);
  const recherche = await env.DB.prepare("SELECT * FROM recherches WHERE statut IN ('import', 'en_cours') ORDER BY statut = 'en_cours', id LIMIT 1").first<Recherche>();
  if (recherche) {
    try {
      if (await avancer(env, recherche, cibles, maintenant)) return;
    } catch (erreur) {
      await env.DB.batch([
        env.DB.prepare('UPDATE recherches SET erreur = ? WHERE id = ?').bind(String(erreur).slice(0, 500), recherche.id),
        noter(env, 'erreur', `Recherche n°${recherche.id} : ${String(erreur).slice(0, 300)}`, recherche.id),
      ]);
    }
  }
  try {
    await analyserLot(env, cibles, maintenant);
  } catch (erreur) {
    await noter(env, 'erreur', `Analyse des sites : ${String(erreur).slice(0, 300)}`).run();
  }
}
