// Mode autonome : chaque lundi, l'outil fait le point (chiffres, répartition des envois,
// alertes), prépare les lots de la semaine et relance les recherches quand le stock baisse.
// Bastien garde la main sur l'envoi : il télécharge le lot et l'importe dans Smartlead.
import {
  AVIS_MAX,
  RECHERCHES_PAR_JOUR,
  RECHERCHES_URGENCE,
  SEMAINES_DE_STOCK,
  ecart,
  lireExportSmartlead,
  lireReglages,
  planifier,
  retourSmartlead,
  semaineDe,
} from '../scripts/strategie.mjs';
import { type Cible, chargerCibles } from './cibles';
import { claudeActif, ecrirePoint } from './claude';
import { DEJA_PARTIES, csv, enCampagne, ligneSmartlead, reponseCsv } from './envoi';
import { echapper, icone, page } from './html';
import { termesAFaire } from './lancements';
import { SCORE, type Prospect } from './prospects';
import { smartleadActif } from './smartlead';

const JOUR_MS = 86_400_000;
const POSITIFS = "('a_repondu', 'maquette', 'client')";
// Le besoin de recherches est recalculé au plus toutes les 30 minutes.
const BESOINS_MS = 30 * 60_000;

export type Reglages = ReturnType<typeof lireReglages>;
type Plan = ReturnType<typeof planifier>;
type Noter = (niveau: 'info' | 'succes' | 'erreur', message: string) => D1PreparedStatement;
type Semaine = { contactes: number; reponses: number; positifs: number; desinscrits: number; rebonds: number; maquettes: number; clients: number; trouvees: number };
export type Point = { semaine: string; cree_le: string; plan: Plan & { passee: Semaine; par: 'claude' | 'regles'; erreur?: string }; texte: string; idee: string };

const ecrireEtat = (env: Env, cle: string, valeur: string) =>
  env.DB.prepare('INSERT INTO etat (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur').bind(cle, valeur);

async function lireEtat(env: Env, cle: string) {
  return (await env.DB.prepare('SELECT valeur FROM etat WHERE cle = ?').bind(cle).first<{ valeur: string }>())?.valeur ?? null;
}

export async function reglages(env: Env) {
  return lireReglages((await lireEtat(env, 'autonome')) ?? '');
}

// Le lot d'une cible : ses fiches prêtes, les meilleures d'abord, une seule fois par adresse,
// avec les tris que Bastien faisait à la main. Les fiches écartées gardent leur raison.
export async function lotCible(env: Env, cible: Cible) {
  const { results } = await env.DB.prepare(
    `SELECT *, ${SCORE} AS score FROM prospects WHERE cible = ? AND statut = 'nouveau' AND email <> '' AND email_statut IN ('generique', 'entreprise') AND ${DEJA_PARTIES} ORDER BY score DESC, vu_le DESC`,
  )
    .bind(cible.cle)
    .all<Prospect>();
  const gardees: Prospect[] = [];
  const ecartees: { p: Prospect; statut: string; raison: string }[] = [];
  let enAttente = 0;
  const vues = new Set<string>();
  for (const p of results) {
    const motif = ecart(p, cible);
    if (motif?.statut) ecartees.push({ p, statut: motif.statut, raison: motif.raison });
    else if (motif) enAttente += 1;
    else if (!vues.has(p.email.toLowerCase())) {
      vues.add(p.email.toLowerCase());
      gardees.push(p);
    }
  }
  return { gardees, ecartees, enAttente };
}

// Range les fiches écartées : hors zone, grosse maison, catégorie exclue, adresse nominative.
function ranger(env: Env, ecartees: { p: Prospect; statut: string; raison: string }[], maintenant: string) {
  return ecartees.map(({ p, statut, raison }) =>
    env.DB.prepare(`UPDATE prospects SET statut = ?, raison = ?, statut_le = ?${statut === 'a_ecrire' ? ", email_statut = 'nominative'" : ''} WHERE id = ? AND statut = 'nouveau'`).bind(
      statut,
      raison,
      maintenant,
      p.id,
    ),
  );
}

const dejaTelecharge = (semaine: string, cible: string) => `lot:${semaine}:${cible}`;

// Les chiffres lus en base pour le plan : par cible sur 60 jours, la semaine écoulée, les rebonds sur 30 jours.
async function chiffres(env: Env, cibles: Record<string, Cible>, r: Reglages, maintenant: number) {
  const il = (jours: number) => new Date(maintenant - jours * JOUR_MS).toISOString();
  const [parCible, global, passee, dernierImport] = await env.DB.batch([
    env.DB.prepare(
      `SELECT cible, SUM(contacte_le >= ?1) AS contactes, SUM(contacte_le >= ?1 AND statut IN ${POSITIFS}) AS positifs, SUM(contacte_le >= ?1 AND statut = 'desinscrit') AS desinscrits,
        SUM(statut = 'a_ecrire') AS aEcrire, SUM(statut = 'nouveau' AND email <> '' AND email_verifie = 0) AS nonVerifiees FROM prospects GROUP BY cible`,
    ).bind(il(60)),
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM prospects WHERE statut = 'a_repondu') AS aTraiter, (SELECT COUNT(*) FROM prospects WHERE statut = 'en_campagne') AS enCampagne,
        (SELECT COUNT(*) FROM prospects WHERE contacte_le >= ?1) AS contactes30, (SELECT COUNT(*) FROM prospects WHERE rebond_le >= ?1) AS rebonds30`,
    ).bind(il(30)),
    env.DB.prepare(
      `SELECT COALESCE(SUM(contacte_le >= ?1), 0) AS contactes, COALESCE(SUM(repondu_le >= ?1), 0) AS reponses, COALESCE(SUM(repondu_le >= ?1 AND statut IN ${POSITIFS}), 0) AS positifs,
        COALESCE(SUM(statut = 'desinscrit' AND statut_le >= ?1), 0) AS desinscrits, COALESCE(SUM(rebond_le >= ?1), 0) AS rebonds,
        COALESCE(SUM(statut = 'maquette' AND statut_le >= ?1), 0) AS maquettes, COALESCE(SUM(statut = 'client' AND statut_le >= ?1), 0) AS clients,
        COALESCE(SUM(cree_le >= ?1), 0) AS trouvees FROM prospects`,
    ).bind(il(7)),
    env.DB.prepare("SELECT valeur FROM etat WHERE cle = 'smartlead_import'"),
  ]);
  const lignes = Object.fromEntries((parCible.results as Record<string, number | string>[]).map((l) => [String(l.cible), l]));
  const g = global.results[0] as { aTraiter: number; enCampagne: number; contactes30: number; rebonds30: number };
  const importe = (dernierImport.results[0] as { valeur: string } | undefined)?.valeur;
  const lots: Record<string, Awaited<ReturnType<typeof lotCible>>> = {};
  const donnees = [];
  for (const cible of Object.values(cibles)) {
    const l = lignes[cible.cle] ?? {};
    const lot = r.cibles.includes(cible.cle) ? await lotCible(env, cible) : null;
    if (lot) lots[cible.cle] = lot;
    donnees.push({
      cle: cible.cle,
      nom: cible.nom,
      stock: lot?.gardees.length ?? 0,
      contactes: Number(l.contactes ?? 0),
      positifs: Number(l.positifs ?? 0),
      desinscrits: Number(l.desinscrits ?? 0),
      aFaire: (await termesAFaire(env, cible)).length,
      aEcrire: Number(l.aEcrire ?? 0),
      nonVerifiees: Number(l.nonVerifiees ?? 0),
    });
  }
  return {
    lots,
    passee: passee.results[0] as Semaine,
    plan: planifier({
      reglages: r,
      cibles: donnees,
      aTraiter: g.aTraiter,
      rebonds: { contactes: g.contactes30, rebonds: g.rebonds30 },
      // Jamais importé : l'outil ne sait pas qui est déjà dans la campagne, l'import passe avant le premier lot.
      importer: !smartleadActif(env) && (!importe || (g.enCampagne > 0 && Date.parse(importe) < maintenant - 7 * JOUR_MS)),
    }),
  };
}

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n.toLocaleString('fr-FR')} ${n > 1 ? motPluriel : mot}`;

// Le point écrit par les règles, quand Claude n'a pas de clé ou ne répond pas.
function texteRegles(plan: Plan, passee: Semaine) {
  const phrases = [];
  phrases.push(
    passee.contactes || passee.reponses
      ? `Ces 7 derniers jours : ${pluriel(passee.contactes, 'prospect contacté', 'prospects contactés')}, ${pluriel(passee.reponses, 'réponse')}${passee.positifs ? ` dont ${passee.positifs} positive${passee.positifs > 1 ? 's' : ''}` : ''}${passee.desinscrits ? `, ${pluriel(passee.desinscrits, 'stop')}` : ''}${passee.rebonds ? `, ${pluriel(passee.rebonds, 'rebond')}` : ''}.`
      : 'Rien n’est parti ces 7 derniers jours.',
  );
  const envois = plan.parCible.filter((c) => c.envoyer > 0);
  phrases.push(
    envois.length
      ? `Cette semaine, je te prépare ${pluriel(plan.prevus, 'fiche')} : ${envois.map((c) => `${c.envoyer} pour « ${c.nom} »`).join(', ')}.`
      : 'Je n’ai aucune fiche prête à envoyer cette semaine.',
  );
  const cherche = plan.parCible.filter((c) => c.chercher);
  if (cherche.length) phrases.push(`Le stock baisse : je relance des recherches pour ${cherche.map((c) => `« ${c.nom} »`).join(' et ')}.`);
  return phrases.join(' ');
}

// Fait le point de la semaine : range les fiches à écarter, calcule le plan, le fait écrire
// par Claude s'il a une clé, et l'enregistre. Rend le point.
export async function faireLePoint(env: Env, cibles: Record<string, Cible>, noter: Noter) {
  const maintenant = Date.now();
  const r = await reglages(env);
  const avant = await chiffres(env, cibles, r, maintenant);
  const aRanger = Object.values(avant.lots).flatMap((lot) => lot.ecartees);
  const iso = new Date(maintenant).toISOString();
  if (aRanger.length) await env.DB.batch(ranger(env, aRanger, iso));
  // Les fiches rangées changent le stock : on relit.
  const { plan, passee } = aRanger.length ? await chiffres(env, cibles, r, maintenant) : avant;

  let texte = '';
  let idee = '';
  let erreur = '';
  if (claudeActif(env)) {
    const mot = await ecrirePoint(env, {
      semaine_passee: passee,
      plan: { volume_prevu: plan.volume, volume_normal: plan.base, fiches_preparees: plan.prevus, cibles: plan.parCible },
      alertes: plan.alertes.map((a) => a.texte),
      cibles_actuelles: Object.values(cibles).map((c) => c.nom),
    }).catch((e: unknown) => {
      erreur = String(e instanceof Error ? e.message : e).slice(0, 200);
      return null;
    });
    if (mot?.texte) {
      texte = mot.texte;
      idee = mot.secteur ? JSON.stringify({ secteur: mot.secteur, pourquoi: mot.pourquoi }) : '';
    }
  }
  const par = texte ? 'claude' : 'regles';
  if (!texte) texte = texteRegles(plan, passee);
  const semaine = semaineDe(new Date(maintenant));
  const point: Point = { semaine, cree_le: iso, plan: { ...plan, passee, par, ...(erreur ? { erreur } : {}) }, texte, idee };
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO points (semaine, cree_le, plan, texte, idee) VALUES (?, ?, ?, ?, ?) ON CONFLICT (semaine) DO UPDATE SET cree_le = excluded.cree_le, plan = excluded.plan, texte = excluded.texte, idee = excluded.idee',
    ).bind(semaine, iso, JSON.stringify(point.plan), texte, idee),
    ecrireEtat(env, 'autonome_besoins', ''),
    noter('succes', `Point de la semaine fait : ${pluriel(plan.prevus, 'fiche prête', 'fiches prêtes')} à envoyer${aRanger.length ? `, ${pluriel(aRanger.length, 'fiche écartée', 'fiches écartées')} du lot (hors zone, grosse maison, adresse nominative…)` : ''}.`),
    ...(erreur ? [noter('erreur', `Point de la semaine : Claude n’a pas répondu (${erreur}), écrit avec les règles.`)] : []),
  ]);
  return point;
}

export async function dernierPoint(env: Env, semaine?: string) {
  const ligne = await env.DB.prepare(`SELECT * FROM points ${semaine ? 'WHERE semaine = ?' : ''} ORDER BY semaine DESC LIMIT 1`)
    .bind(...(semaine ? [semaine] : []))
    .first<{ semaine: string; cree_le: string; plan: string; texte: string; idee: string }>();
  return ligne ? ({ ...ligne, plan: JSON.parse(ligne.plan) } as Point) : null;
}

// À chaque passage de la tâche : le premier passage de la semaine fait le point.
export async function suivreStrategie(env: Env, cibles: Record<string, Cible>, noter: Noter) {
  const r = await reglages(env);
  if (!r.actif) return;
  if (await dernierPoint(env, semaineDe())) return;
  await faireLePoint(env, cibles, noter);
}

// Les cibles qui manquent de fiches (moins de 3 semaines d'envois prêts) : le pilote
// y lance des recherches, plus vite sous une semaine, puis s'arrête quand le stock est revenu.
export async function cherchesAuto(env: Env, cibles: Record<string, Cible>): Promise<{ cle: string; parJour: number }[]> {
  const r = await reglages(env);
  if (!r.actif) return [];
  const memo = await lireEtat(env, 'autonome_besoins');
  if (memo) {
    const { jusqu, besoins } = JSON.parse(memo) as { jusqu: string; besoins?: { cle: string; parJour: number }[] };
    if (Array.isArray(besoins) && Date.parse(jusqu) > Date.now()) return besoins;
  }
  const point = await dernierPoint(env, semaineDe());
  const envoient = r.cibles.filter((cle) => cibles[cle]);
  const volume = point?.plan.volume ?? r.rythme * 5;
  const besoins: { cle: string; parJour: number }[] = [];
  for (const cle of envoient) {
    const part = point?.plan.parCible.find((c) => c.cle === cle)?.envoyer ?? 0;
    const besoin = Math.max(part, Math.round(volume / Math.max(1, envoient.length)));
    const { gardees } = await lotCible(env, cibles[cle]);
    if (gardees.length < SEMAINES_DE_STOCK * besoin) besoins.push({ cle, parJour: gardees.length < besoin ? RECHERCHES_URGENCE : RECHERCHES_PAR_JOUR });
  }
  await ecrireEtat(env, 'autonome_besoins', JSON.stringify({ jusqu: new Date(Date.now() + BESOINS_MS).toISOString(), besoins })).run();
  return besoins;
}

// --- Pages et formulaires ---

function apres(requete: Request, message: string, ancre = '') {
  const url = new URL('/strategie', requete.url);
  url.searchParams.set('message', message);
  return Response.redirect(`${url.toString()}${ancre}`, 303);
}

export async function enregistrerReglages(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const avant = await reglages(env);
  const cibles = await chargerCibles(env);
  const nouveaux = lireReglages(
    JSON.stringify({
      actif: donnees.has('actif') ? donnees.getAll('actif').includes('1') : avant.actif,
      rythme: donnees.has('rythme') ? donnees.get('rythme') : avant.rythme,
      reponses: donnees.has('reponses') ? donnees.get('reponses') : avant.reponses,
      cibles: donnees.has('cibles_envoyees') ? donnees.getAll('cibles').map(String).filter((cle) => cibles[cle]) : avant.cibles,
    }),
  );
  await env.DB.batch([ecrireEtat(env, 'autonome', JSON.stringify(nouveaux)), ecrireEtat(env, 'autonome_besoins', '')]);
  const noter: Noter = (niveau, message) => env.DB.prepare('INSERT INTO journal (le, niveau, message, recherche_id) VALUES (?, ?, ?, NULL)').bind(new Date().toISOString(), niveau, message);
  // Le point se refait tout de suite quand le mode démarre ou que le rythme change.
  if (nouveaux.actif && (!avant.actif || nouveaux.rythme !== avant.rythme || nouveaux.cibles.join() !== avant.cibles.join() || nouveaux.reponses !== avant.reponses)) {
    await faireLePoint(env, cibles, noter);
  }
  const message = nouveaux.actif !== avant.actif ? (nouveaux.actif ? 'Mode autonome lancé : le point de la semaine est prêt' : 'Mode autonome arrêté') : 'Réglages enregistrés';
  return apres(requete, message);
}

export async function refaireLePoint(requete: Request, env: Env) {
  const noter: Noter = (niveau, message) => env.DB.prepare('INSERT INTO journal (le, niveau, message, recherche_id) VALUES (?, ?, ?, NULL)').bind(new Date().toISOString(), niveau, message);
  await faireLePoint(env, await chargerCibles(env), noter);
  return apres(requete, 'Point refait avec les derniers chiffres');
}

// Le lot de la semaine d'une cible : les meilleures fiches, en CSV pour Smartlead.
// Ce clic est la validation de Bastien : les fiches passent en « En campagne ».
export async function telechargerLot(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const cibles = await chargerCibles(env);
  const cible = cibles[String(donnees.get('cible') ?? '')];
  if (!cible) return new Response('Cible inconnue', { status: 400 });
  const nombre = Math.min(2000, Math.max(1, Math.floor(Number(donnees.get('nombre'))) || 1));
  const maintenant = new Date().toISOString();
  const { gardees, ecartees } = await lotCible(env, cible);
  const choisies = gardees.slice(0, nombre);
  const semaine = semaineDe();
  const deja = Number((await lireEtat(env, dejaTelecharge(semaine, cible.cle))) ?? 0);
  // Les autres fiches de la même adresse sont contactées elles aussi.
  const emails = [...new Set(choisies.map((p) => p.email.toLowerCase()))];
  const memesAdresses: D1PreparedStatement[] = [];
  for (let debut = 0; debut < emails.length; debut += 90) {
    const paquet = emails.slice(debut, debut + 90);
    memesAdresses.push(
      env.DB.prepare(
        `UPDATE prospects SET statut = 'en_campagne', statut_le = ?, contacte_le = COALESCE(contacte_le, ?) WHERE statut = 'nouveau' AND lower(email) IN (${paquet.map(() => '?').join(', ')})`,
      ).bind(maintenant, maintenant, ...paquet),
    );
  }
  await env.DB.batch([
    ...ranger(env, ecartees, maintenant),
    ...choisies.map((p) => enCampagne(env, p.id, maintenant)),
    ...memesAdresses,
    ecrireEtat(env, dejaTelecharge(semaine, cible.cle), String(deja + choisies.length)),
    ecrireEtat(env, 'autonome_besoins', ''),
    env.DB.prepare('INSERT INTO journal (le, niveau, message, recherche_id) VALUES (?, ?, ?, NULL)').bind(
      maintenant,
      'succes',
      `Lot « ${cible.nom} » téléchargé : ${pluriel(choisies.length, 'fiche passée', 'fiches passées')} en « En campagne », à importer dans Smartlead.`,
    ),
  ]);
  return reponseCsv(csv(choisies.map(ligneSmartlead)), `smartlead-${cible.cle}-${maintenant.slice(0, 10)}.csv`);
}

type Fiche = { id: string; nom: string; email: string; statut: string };

// L'export d'une campagne Smartlead : chaque adresse de la campagne passe « En campagne »
// si elle ne l'était pas, puis prend ce que Smartlead sait d'elle (réponse, stop, rebond).
export async function importerSmartlead(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const fichier = donnees.get('fichier');
  const texte = fichier && typeof fichier === 'object' && 'text' in fichier ? await (fichier as Blob).text() : String(fichier ?? '');
  const lignes = lireExportSmartlead(texte);
  if (!lignes.length) return apres(requete, 'Aucune adresse lue dans ce fichier : choisis l’export CSV de ta campagne Smartlead', '#import');
  const emails = [...new Set(lignes.map((l) => l.email))];
  const fiches: Fiche[] = [];
  for (let debut = 0; debut < emails.length; debut += 90) {
    const paquet = emails.slice(debut, debut + 90);
    const { results } = await env.DB.prepare(`SELECT id, nom, email, statut FROM prospects WHERE statut NOT IN ('desinscrit', 'client') AND lower(email) IN (${paquet.map(() => '?').join(', ')})`)
      .bind(...paquet)
      .all<Fiche>();
    fiches.push(...results);
  }
  const parEmail = new Map<string, Fiche[]>();
  for (const f of fiches) parEmail.set(f.email.toLowerCase(), [...(parEmail.get(f.email.toLowerCase()) ?? []), f]);

  const maintenant = new Date().toISOString();
  const requetes: D1PreparedStatement[] = [];
  const bilan = { reconnues: 0, enCampagne: 0, reponses: 0, pasInteresses: 0, desinscrits: 0, rebonds: 0 };
  const journal = (niveau: string, message: string) => env.DB.prepare('INSERT INTO journal (le, niveau, message, recherche_id) VALUES (?, ?, ?, NULL)').bind(maintenant, niveau, message);
  const vues = new Set<string>();
  for (const ligne of lignes) {
    if (vues.has(ligne.email)) continue;
    vues.add(ligne.email);
    const concernees = parEmail.get(ligne.email) ?? [];
    if (!concernees.length) continue;
    bilan.reconnues += 1;
    const retour = retourSmartlead(ligne);
    // Les compteurs vont par adresse : deux fiches d'une même adresse comptent une fois.
    const vu = { enCampagne: false, reponses: false, pasInteresses: false, desinscrits: false, rebonds: false };
    for (const f of concernees) {
      // Dans la campagne : elle est contactée, même si son lot n'avait pas été marqué.
      let statut = f.statut;
      if (statut === 'nouveau') {
        requetes.push(env.DB.prepare("UPDATE prospects SET statut = 'en_campagne', statut_le = ?1, contacte_le = COALESCE(contacte_le, ?1) WHERE id = ?2 AND statut = 'nouveau'").bind(maintenant, f.id));
        statut = 'en_campagne';
        vu.enCampagne = true;
      }
      if (retour === 'desinscrit') {
        requetes.push(env.DB.prepare("UPDATE prospects SET statut = 'desinscrit', statut_le = ? WHERE id = ?").bind(maintenant, f.id), journal('info', `${f.nom} : désinscrit dans Smartlead, passé en « Désinscrit ».`));
        vu.desinscrits = true;
      } else if (retour === 'rebond' && ['en_campagne', 'a_verifier'].includes(statut)) {
        requetes.push(
          env.DB.prepare("UPDATE prospects SET statut = 'a_verifier', raison = ?1, statut_le = ?2, rebond_le = COALESCE(rebond_le, ?2) WHERE id = ?3").bind(
            `l’adresse ${f.email} a rebondi dans Smartlead : trouve la bonne avant de réécrire`,
            maintenant,
            f.id,
          ),
          journal('info', `${f.nom} : l’adresse a rebondi, passé en « À vérifier ».`),
        );
        vu.rebonds = true;
      } else if ((retour === 'a_repondu' || retour === 'pas_interesse') && statut === 'en_campagne') {
        requetes.push(
          env.DB.prepare('UPDATE prospects SET statut = ?1, statut_le = ?2, repondu_le = COALESCE(repondu_le, ?2) WHERE id = ?3').bind(retour, maintenant, f.id),
          journal(retour === 'a_repondu' ? 'succes' : 'info', `${f.nom} a répondu dans Smartlead : passé en « ${retour === 'a_repondu' ? 'A répondu' : 'Pas intéressé'} ».`),
        );
        if (retour === 'a_repondu') vu.reponses = true;
        else vu.pasInteresses = true;
      }
    }
    for (const cle of Object.keys(vu) as (keyof typeof vu)[]) if (vu[cle]) bilan[cle] += 1;
  }
  requetes.push(ecrireEtat(env, 'smartlead_import', maintenant), ecrireEtat(env, 'autonome_besoins', ''));
  requetes.push(
    journal(
      'succes',
      `Export Smartlead importé : ${pluriel(bilan.reconnues, 'adresse reconnue', 'adresses reconnues')} sur ${emails.length}${bilan.enCampagne ? `, ${bilan.enCampagne} passée${bilan.enCampagne > 1 ? 's' : ''} en « En campagne »` : ''}.`,
    ),
  );
  await env.DB.batch(requetes);
  const morceaux = [
    `${pluriel(bilan.reconnues, 'adresse reconnue', 'adresses reconnues')} sur ${emails.length}`,
    bilan.enCampagne ? `${bilan.enCampagne} passée${bilan.enCampagne > 1 ? 's' : ''} en campagne` : '',
    bilan.reponses ? pluriel(bilan.reponses, 'réponse') : '',
    bilan.pasInteresses ? `${bilan.pasInteresses} pas intéressé${bilan.pasInteresses > 1 ? 's' : ''}` : '',
    bilan.desinscrits ? pluriel(bilan.desinscrits, 'désinscrit') : '',
    bilan.rebonds ? pluriel(bilan.rebonds, 'rebond') : '',
  ].filter(Boolean);
  return apres(requete, `Import Smartlead : ${morceaux.join(', ')}`, '#import');
}

function dateLongue(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

const NIVEAUX: Record<string, string> = { danger: 'danger', attention: 'attention', info: '' };

export async function pageStrategie(url: URL, env: Env) {
  const [cibles, r] = await Promise.all([chargerCibles(env), reglages(env)]);
  const semaine = semaineDe();
  const point = await dernierPoint(env);
  const actuel = point?.semaine === semaine ? point : null;
  const [historique, telecharges, importe] = await Promise.all([
    env.DB.prepare('SELECT semaine, texte, plan FROM points ORDER BY semaine DESC LIMIT 9').all<{ semaine: string; texte: string; plan: string }>(),
    env.DB.prepare('SELECT cle, valeur FROM etat WHERE cle LIKE ?').bind(`lot:${semaine}:%`).all<{ cle: string; valeur: string }>(),
    lireEtat(env, 'smartlead_import'),
  ]);
  const deja = Object.fromEntries(telecharges.results.map(({ cle, valeur }) => [cle.split(':')[2], Number(valeur)]));
  const stocks: Record<string, number> = {};
  for (const cle of r.cibles) if (cibles[cle]) stocks[cle] = (await lotCible(env, cibles[cle])).gardees.length;

  const etat = `<span class="pastille"><span class="voyant ${r.actif ? '' : 'inactif'}"></span>${r.actif ? 'Mode autonome actif' : 'Mode autonome arrêté'}</span>`;

  const lancer = r.actif
    ? ''
    : `<section class="carte bloc">
      <div class="carte-entete"><div><h2 class="carte-titre">${icone('strategie', 18)}Lance le mode autonome</h2>
        <p class="carte-description">Chaque lundi, je fais le point, je prépare le lot de la semaine pour chaque cible, et je relance des recherches quand il reste moins de ${SEMAINES_DE_STOCK} semaines d’envois prêts. Tu gardes le clic d’envoi : tu télécharges le lot et tu l’importes dans Smartlead.</p></div></div>
      <div class="carte-contenu"><form method="post" action="/strategie/reglages"><input type="hidden" name="actif" value="1"><button class="btn" type="submit">${icone('jouer', 14)}Lancer le mode autonome</button></form></div>
    </section>`;

  const passee = actuel?.plan.passee;
  const chiffresSemaine = passee
    ? `<dl class="chiffres-semaine">${[
        ['Contactés', passee.contactes],
        ['Réponses', passee.reponses],
        ['Positives', passee.positifs],
        ['Stop', passee.desinscrits],
        ['Rebonds', passee.rebonds],
        ['Fiches trouvées', passee.trouvees],
      ]
        .map(([libelle, n]) => `<div><dt>${libelle}</dt><dd>${Number(n).toLocaleString('fr-FR')}</dd></div>`)
        .join('')}</dl>`
    : '';
  const alertes = actuel?.plan.alertes.length
    ? `<ul class="alertes-point">${actuel.plan.alertes
        .map((a) => `<li class="${NIVEAUX[a.niveau] ?? ''}">${a.lien ? `<a href="${echapper(a.lien)}">${echapper(a.texte)}</a>` : echapper(a.texte)}</li>`)
        .join('')}</ul>`
    : '';
  const idee = actuel?.idee ? (JSON.parse(actuel.idee) as { secteur: string; pourquoi: string }) : null;
  const blocIdee = idee
    ? `<div class="idee"><p><strong>Un secteur à tester : ${echapper(idee.secteur)}.</strong> ${echapper(idee.pourquoi)}</p>
        ${claudeActif(env) ? `<form method="post" action="/cibles/proposer"><input type="hidden" name="secteur" value="${echapper(idee.secteur)}"><button class="btn contour petit" type="submit">${icone('cibles', 14)}Préparer cette cible</button></form>` : ''}</div>`
    : '';
  const blocPoint = actuel
    ? `<section class="carte bloc">
      <div class="carte-entete"><div><h2 class="carte-titre">Le point du ${echapper(dateLongue(actuel.semaine))}</h2>
        <p class="carte-description">${actuel.plan.par === 'claude' ? 'Écrit par Claude' : 'Écrit par les règles de l’outil'}, à partir des chiffres du ${echapper(new Date(actuel.cree_le).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}.</p></div>
        <form method="post" action="/strategie/point"><button class="btn fantome petit" type="submit">Refaire le point</button></form></div>
      <div class="carte-contenu"><p class="point-texte">${echapper(actuel.texte)}</p>${chiffresSemaine}${alertes}${blocIdee}</div>
    </section>`
    : r.actif
      ? `<section class="carte bloc"><div class="carte-contenu"><p>Le point de la semaine se fait au prochain passage de la tâche.</p><form method="post" action="/strategie/point"><button class="btn petit" type="submit">Faire le point maintenant</button></form></div></section>`
      : '';

  const lignesLots = r.cibles
    .filter((cle) => cibles[cle])
    .map((cle) => {
      const c = actuel?.plan.parCible.find((p) => p.cle === cle);
      const prevu = c?.envoyer ?? 0;
      const stock = stocks[cle] ?? 0;
      const fait = deja[cle] ?? 0;
      const propose = Math.min(stock, Math.max(0, prevu - fait));
      const taux = c?.taux == null ? '<span class="discret">pas encore</span>' : `${String(c.taux).replace('.', ',')} %`;
      const formulaire = stock
        ? `<form method="post" action="/strategie/lot" class="lot-formulaire" onsubmit="return confirm('Ces fiches passent en « En campagne ». Importe le fichier tout de suite dans la campagne Smartlead de la cible.')">
            <input type="hidden" name="cible" value="${echapper(cle)}">
            <input type="number" name="nombre" value="${propose || Math.min(stock, prevu || stock)}" min="1" max="${stock}" class="court" aria-label="Nombre de fiches">
            <button class="btn petit${propose ? '' : ' contour'}" type="submit">${icone('telecharger', 14)}Télécharger</button>
          </form>`
        : '<span class="discret">Aucune fiche prête</span>';
      return `<tr>
        <td><a class="nom" href="/prospects?cible=${encodeURIComponent(cle)}&amp;statut=nouveau&amp;tri=priorite">${echapper(cibles[cle].nom)}</a>${c?.chercher ? '<div class="discret">le pilote cherche de nouvelles fiches</div>' : ''}</td>
        <td class="chiffre">${prevu}${fait ? `<div class="discret">${fait} téléchargées</div>` : ''}</td>
        <td class="chiffre">${stock}${c?.semaines != null ? `<div class="discret">${String(c.semaines).replace('.', ',')} sem.</div>` : ''}</td>
        <td class="chiffre">${taux}</td>
        <td>${formulaire}</td>
      </tr>`;
    })
    .join('');
  const blocLots = `<section class="carte bloc">
      <div class="carte-entete"><div><h2 class="carte-titre">${icone('telecharger', 18)}Les lots de la semaine</h2>
        ${!importe && !smartleadActif(env) ? '<p class="alerte attention-texte">Avant ton premier lot, importe l’export de ta campagne Smartlead en cours (plus bas) : sinon je ne sais pas qui y est déjà.</p>' : ''}
        <p class="carte-description">Les meilleures fiches d’abord. Déjà écartées : adresses non vérifiées ou nominatives, plus de ${AVIS_MAX} avis Google, hors Alsace, catégories exclues de la cible, adresses déjà contactées. Télécharge, puis importe le fichier dans la campagne Smartlead de la cible.</p></div></div>
      ${lignesLots ? `<div class="tableau"><table><thead><tr><th>Cible</th><th class="chiffre">Prévu</th><th class="chiffre">Prêtes</th><th class="chiffre">Réponses positives</th><th>Lot</th></tr></thead><tbody>${lignesLots}</tbody></table></div>` : '<div class="carte-contenu"><p class="discret">Aucune cible n’envoie : coche-les dans les réglages.</p></div>'}
    </section>`;

  const blocImport = `<section class="carte bloc" id="import">
      <div class="carte-entete"><div><h2 class="carte-titre">${icone('activite', 18)}Les réponses de Smartlead</h2>
        <p class="carte-description">${smartleadActif(env) ? 'Ta clé Smartlead rapatrie les réponses toute seule. L’import reste possible.' : 'Sans l’API de Smartlead, je vois les réponses par son export : dans Smartlead, ouvre la campagne, onglet Leads, bouton Export, puis choisis le fichier ici. Une fois par semaine suffit.'}
        ${importe ? ` Dernier import : ${echapper(new Date(importe).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}.` : ''}</p></div></div>
      <div class="carte-contenu"><form method="post" action="/strategie/import" enctype="multipart/form-data" class="import-formulaire">
        <input type="file" name="fichier" accept=".csv,text/csv" required aria-label="Export CSV de Smartlead">
        <button class="btn contour petit" type="submit">Importer</button>
      </form>
      <p class="aide">Chaque adresse de l’export passe « En campagne » si elle ne l’était pas. Une réponse passe la fiche en « A répondu » (ou « Pas intéressé » quand Smartlead l’a classée ainsi), un stop en « Désinscrit », un rebond en « À vérifier ». Un statut que tu as posé à la main ne bouge pas.</p></div>
    </section>`;

  const casesCibles = Object.values(cibles)
    .map((c) => `<label class="case"><input type="checkbox" name="cibles" value="${echapper(c.cle)}" ${r.cibles.includes(c.cle) ? 'checked' : ''}>${echapper(c.nom)}</label>`)
    .join('');
  const blocReglages = `<form method="post" action="/strategie/reglages" class="carte bloc" id="reglages">
      <div class="carte-entete"><div><h2 class="carte-titre">Réglages</h2><p class="carte-description">Le rythme de tes boîtes dans Smartlead, et les cibles qui ont leur campagne.</p></div></div>
      <div class="carte-contenu formulaire">
        <input type="hidden" name="cibles_envoyees" value="1">
        <div class="ligne">
          <div class="champ"><label for="rythme">Emails par jour dans Smartlead</label><input id="rythme" type="number" name="rythme" value="${r.rythme}" min="1" max="2000">
            <span class="aide">Toutes boîtes comprises : 6 boîtes à 10 par jour, c’est 60. Monte de 5 par boîte et par semaine tant que les rebonds restent sous 2 %.</span></div>
          <div class="champ"><label for="reponses">Ralentir au-delà de</label><input id="reponses" type="number" name="reponses" value="${r.reponses}" min="1" max="999">
            <span class="aide">réponses à traiter. Au-delà, j’envoie moitié moins, pour que les maquettes tiennent en 3 jours ouvrés.</span></div>
        </div>
        <div class="champ"><span>Cibles qui reçoivent un lot chaque semaine</span><div class="cases">${casesCibles}</div>
          <span class="aide">Seulement celles qui ont leur campagne et leur séquence dans Smartlead.</span></div>
        <div class="champ"><label class="case"><input type="hidden" name="actif" value="0"><input type="checkbox" name="actif" value="1" ${r.actif ? 'checked' : ''}>Mode autonome actif</label></div>
        <div><button class="btn" type="submit">Enregistrer</button></div>
      </div>
    </form>`;

  const anciens = historique.results.filter((p) => p.semaine !== actuel?.semaine);
  const blocHistorique = anciens.length
    ? `<section class="carte bloc"><div class="carte-entete"><div><h2 class="carte-titre">Les points précédents</h2></div></div>
      <div class="carte-contenu"><ol class="historique-points">${anciens
        .map((p) => {
          const plan = JSON.parse(p.plan) as Point['plan'];
          return `<li><strong>${echapper(dateLongue(p.semaine))}</strong> · ${pluriel(plan.prevus, 'fiche préparée', 'fiches préparées')} · ${pluriel(plan.passee?.reponses ?? 0, 'réponse')}<p>${echapper(p.texte)}</p></li>`;
        })
        .join('')}</ol></div></section>`
    : '';

  return page(
    'Stratégie',
    `<header class="page-entete">
      <div><h1>Stratégie</h1><div class="sous-titre"><span>Le point de chaque lundi et les lots à envoyer.</span>${etat}</div></div>
    </header>
    ${lancer}${blocPoint}${r.actif || actuel ? blocLots : ''}${blocImport}${blocReglages}${blocHistorique}`,
    'strategie',
  );
}

// Pour le tableau de bord : le point en deux lignes.
export async function resumePoint(env: Env) {
  const r = await reglages(env);
  const point = await dernierPoint(env, semaineDe());
  return { actif: r.actif, point };
}
