// Tâche planifiée, toutes les minutes : suit les extractions (Apify, Hubertino), importe leurs
// fiches par petits lots, puis analyse les sites des prospects importés.
// Les lots restent petits pour tenir dans les limites d'une exécution de Worker
// (50 requêtes D1 et 50 requêtes sortantes sur le plan gratuit).
import { STATUTS_AUTOMATIQUES, identifiant, statutApresAnalyse } from '../scripts/base.mjs';
import { cleDoublon, exclusion, normaliser } from '../scripts/lib.mjs';
import { analyser } from '../scripts/analyse.mjs';
import { CONSTAT_CREATION } from '../scripts/cibles.mjs';
import { compte, etat, fiches } from './apify';
import { estHubertino } from './hubertino';
import { type Cible, chargerCibles } from './cibles';
import { type Avis, claudeActif, juger } from './claude';
import { enrichirLot, reprendrePropositions } from './enrichir';
import { nomLisible } from './html';
import { piloter } from './pilote';

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
  termes: string;
  statut: string;
  importees: number;
  apify_statut: string;
  apify_fiches: number;
  source: string;
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
  (id, cible, nom, categorie, ville, adresse, telephone, site, fiche_google, note_google, avis_google, recherche, emails_fiche, statut, raison, cree_le, vu_le, statut_le, origine, creation)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16, ?16, ?17, ?18)
  ON CONFLICT (id) DO UPDATE SET
    cible = excluded.cible, nom = excluded.nom, categorie = excluded.categorie, ville = excluded.ville,
    adresse = excluded.adresse, telephone = excluded.telephone, site = excluded.site,
    fiche_google = excluded.fiche_google, note_google = excluded.note_google, avis_google = excluded.avis_google,
    recherche = excluded.recherche, emails_fiche = excluded.emails_fiche, vu_le = excluded.vu_le,
    creation = CASE WHEN excluded.creation <> '' THEN excluded.creation ELSE prospects.creation END,
    raison = CASE WHEN prospects.statut IN (${AUTOMATIQUES}) THEN excluded.raison ELSE prospects.raison END,
    statut_le = CASE WHEN prospects.statut IN (${AUTOMATIQUES}) AND prospects.statut <> excluded.statut THEN excluded.statut_le ELSE prospects.statut_le END,
    statut = CASE WHEN prospects.statut IN (${AUTOMATIQUES}) THEN excluded.statut ELSE prospects.statut END`;

// Une entreprise du registre Sirene, mise au format d'une fiche Google Maps.
export function ficheSirene(item: Record<string, unknown>, cible: Cible | undefined): Record<string, unknown> | null {
  if (item.status !== 'found' || !item.siret || !item.name) return null;
  const code = String(item.nafCode ?? '');
  const libelle = cible?.naf.find((ligne) => ligne.toUpperCase().startsWith(code.toUpperCase()))?.slice(code.length).trim();
  const adresse = String(item.address ?? '');
  const ville = nomLisible(String(item.city ?? ''));
  return {
    placeId: `siret:${item.siret}`,
    title: nomLisible(String(item.name)),
    categoryName: libelle || code,
    city: ville,
    address: adresse.includes(String(item.postalCode ?? '')) ? adresse : [adresse, item.postalCode, ville].filter(Boolean).join(' '),
    searchString: `création ${ville}`.trim(),
    origine: 'sirene',
    creation: String(item.creationDate ?? ''),
  };
}

export function ligneImport(fiche: Record<string, unknown>, nomCible: string, cible: Cible | undefined, maintenant: string) {
  const prospect = normaliser(fiche);
  if (!prospect.nom) return null;
  if (!prospect.recherche) prospect.recherche = `${cible?.metiers[0] ?? ''} ${prospect.ville}`.trim();
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
    fiche.origine === 'sirene' ? 'sirene' : 'maps',
    String(fiche.creation ?? ''),
  ];
}

// Renvoie true si la recherche a consommé ce passage (un lot importé).
async function avancer(env: Env, recherche: Recherche, cibles: Record<string, Cible>, maintenant: string): Promise<boolean> {
  const fournisseur = estHubertino(recherche.run_id) ? 'Hubertino' : 'Apify';
  if (recherche.statut === 'en_cours') {
    const [statut, trouvees] = await Promise.all([etat(env, recherche.run_id), compte(env, recherche.dataset_id)]);
    const notes = [];
    if (statut !== recherche.apify_statut || trouvees !== recherche.apify_fiches) {
      notes.push(noter(env, 'info', `Recherche n°${recherche.id} : extraction ${fournisseur} ${ETATS_APIFY[statut] ?? statut}, ${trouvees} fiches trouvées.`, recherche.id));
    }
    if (ECHECS.includes(statut)) {
      await env.DB.batch([
        ...notes,
        noter(env, 'erreur', `Recherche n°${recherche.id} : l’extraction ${fournisseur} a échoué (${statut}). Voir ${fournisseur === 'Apify' ? 'console.apify.com → Runs' : 'hubertino.com → Scrapes'}.`, recherche.id),
        env.DB.prepare("UPDATE recherches SET statut = 'echec', apify_statut = ?, apify_fiches = ?, erreur = ?, fini_le = ? WHERE id = ?").bind(
          statut,
          trouvees,
          `${fournisseur} : ${statut}`,
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

  const lot = await fiches(env, recherche.dataset_id, recherche.importees, taille(env.IMPORT_PAR_PASSAGE, IMPORT_PAR_PASSAGE), JSON.parse(recherche.termes || '[]'));
  const cible = cibles[recherche.cible];
  const lignes = lot.fiches
    .map((fiche) => (recherche.source === 'sirene' ? ficheSirene(fiche, cible) : fiche))
    .map((fiche) => fiche && ligneImport(fiche, recherche.cible, cible, maintenant))
    .filter((ligne) => ligne != null);
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

type Analyse = { signaux: Record<string, unknown>; constat: { cle: string; phrase: string } | null; statut: string; email: string };

// L'avis de Claude, quand il existe, prime sur les règles pour le constat et
// pour écarter les sites déjà bons ; le choix de l'email reste le même.
export function decider(analyse: Analyse, avis: Avis | null) {
  if (avis?.verdict === 'hors_cible') {
    return { statut: 'hors_cible', raison: `hors cible selon Claude : ${avis.raisons[0] ?? ''}`, constat: null };
  }
  if (avis?.verdict === 'bon') {
    return { statut: 'plus_tard', raison: `site déjà bon selon Claude (${avis.qualite}/10) : ${avis.raisons[0] ?? ''}`, constat: null };
  }
  const constat = avis?.constat ? { cle: 'claude', phrase: avis.constat } : analyse.constat;
  const resultat = statutApresAnalyse({ ...analyse, constat });
  if (resultat.statut === 'nouveau' && avis?.confiance === 'basse') {
    return { statut: 'a_verifier', raison: `Claude n’a pas pu bien juger le site : ${avis.raisons[0] ?? 'page presque vide'}`, constat };
  }
  return { ...resultat, constat };
}

type AAnalyser = { id: string; cible: string; nom: string; categorie: string; ville: string; site: string; emails_fiche: string; email: string; email_source: string; origine: string };

async function analyserLot(env: Env, cibles: Record<string, Cible>, maintenant: string) {
  const { results } = await env.DB.prepare("SELECT id, cible, nom, categorie, ville, site, emails_fiche, email, email_source, origine FROM prospects WHERE statut = 'a_analyser' ORDER BY vu_le LIMIT ?")
    .bind(taille(env.ANALYSES_PAR_PASSAGE, ANALYSES_PAR_PASSAGE))
    .all<AAnalyser>();
  if (!results.length) return;
  const claude = claudeActif(env);

  const analyses = await Promise.all(
    // Une fiche qui fait planter l'analyse ne doit pas bloquer les autres.
    results.map((p) =>
      Promise.resolve()
        .then(async () => {
          const cible = cibles[p.cible];
          const analyse = await analyser({ site: p.site, nom: p.nom, emails: JSON.parse(p.emails_fiche || '[]').concat(p.email_source ? [p.email] : []) }, cible ?? { constats: [] });
          // Nouvelle entreprise sans site : pas de fiche Google à citer, l'email parle de sa création.
          if (p.origine === 'sirene' && !p.site) analyse.constat = { cle: 'creation', phrase: CONSTAT_CREATION };
          // Claude ne juge que les sites qu'on a pu lire ; sans clé, les règles suffisent.
          let avis: Avis | null = null;
          let erreurClaude = '';
          if (analyse.page && claude) {
            avis = await juger(env, {
              nom: p.nom,
              categorie: p.categorie,
              ville: p.ville,
              cible: cible?.nom ?? p.cible,
              metiers: cible?.metiers ?? [],
              attentes: cible?.attentes,
              page: analyse.page,
              signaux: analyse.signaux,
            }).catch((erreur: unknown) => {
              erreurClaude = String(erreur).slice(0, 200);
              return null;
            });
          }
          return { ...analyse, avis, erreurClaude };
        })
        .catch((erreur: unknown) => ({ erreur: String(erreur).slice(0, 200) })),
    ),
  );
  const LIBELLES: Record<string, string> = { nouveau: 'prêt à contacter', a_verifier: 'à vérifier', a_ecrire: 'à écrire à la main', a_enrichir: 'pas d’email sur le site, Claude va le chercher', plus_tard: 'plus tard' };
  await env.DB.batch(
    results.flatMap((p, index) => {
      const resultat = analyses[index];
      if ('erreur' in resultat) {
        return [
          env.DB.prepare("UPDATE prospects SET statut = 'a_verifier', raison = ?, statut_le = ? WHERE id = ? AND statut = 'a_analyser'").bind(
            `erreur d’analyse : ${resultat.erreur}`,
            maintenant,
            p.id,
          ),
          noter(env, 'erreur', `${p.nom} : erreur d’analyse (${resultat.erreur}), passé en « à vérifier ».`),
        ];
      }
      const { avis, erreurClaude, ...analyse } = resultat;
      const { statut, raison, constat } = decider(analyse, avis);
      // L'adresse déjà trouvée par Claude garde sa marque « non vérifiée » ; une adresse lue sur le site est vérifiée.
      return [
        env.DB.prepare(
          `UPDATE prospects SET email = ?1, email_statut = ?2, constat_cle = ?3, constat = ?4, signaux = ?5, statut = ?6, raison = ?7, statut_le = ?8,
            verdict = ?9, qualite = ?10, avis = ?11,
            email_verifie = CASE WHEN email = ?1 THEN email_verifie ELSE 1 END
            WHERE id = ?12 AND statut = 'a_analyser'`,
        ).bind(
          analyse.email,
          analyse.statut,
          constat?.cle ?? '',
          constat?.phrase ?? '',
          JSON.stringify(analyse.signaux),
          statut,
          raison,
          maintenant,
          avis?.verdict ?? '',
          avis?.qualite ?? null,
          avis ? JSON.stringify({ raisons: avis.raisons, confiance: avis.confiance }) : '',
          p.id,
        ),
        noter(
          env,
          statut === 'nouveau' ? 'succes' : 'info',
          `${p.nom} : ${LIBELLES[statut] ?? statut}${avis ? `, site ${avis.verdict === 'hors_cible' ? 'hors cible' : avis.verdict} ${avis.qualite}/10 selon Claude` : ''}${statut === 'nouveau' ? ` (${constat?.phrase})` : ` (${raison})`}.`,
        ),
        ...(erreurClaude ? [noter(env, 'erreur', `${p.nom} : Claude n’a pas répondu (${erreurClaude}), analyse faite avec les règles seules.`)] : []),
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
    env.DB.prepare("DELETE FROM etat WHERE cle LIKE 'claude_cout:%' AND cle < ?").bind(`claude_cout:${semaine.slice(0, 10)}`),
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
  } else {
    // Plus rien en cours : le pilote automatique lance la suite, s'il est activé.
    await piloter(env, cibles, (niveau, message) => noter(env, niveau, message));
  }
  try {
    await analyserLot(env, cibles, maintenant);
  } catch (erreur) {
    await noter(env, 'erreur', `Analyse des sites : ${String(erreur).slice(0, 300)}`).run();
  }
  try {
    await enrichirLot(env, maintenant, (niveau, message) => noter(env, niveau, message));
    await reprendrePropositions(env, maintenant);
  } catch (erreur) {
    await noter(env, 'erreur', `Recherche d’emails : ${String(erreur).slice(0, 300)}`).run();
  }
}
