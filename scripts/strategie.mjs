// Le cerveau du mode autonome : combien envoyer cette semaine, à quelles cibles,
// quand relancer des recherches, et ce qu'il faut signaler à Bastien.
// Que des calculs sur des chiffres déjà lus en base : rien ici n'écrit ni n'appelle le réseau.
import { RAISONS } from './base.mjs';
import { exclusion, lireCsv, natureEmail } from './lib.mjs';

export const JOURS_OUVRES = 5;
// En dessous de 3 semaines d'envois prêts, le pilote relance des recherches.
export const SEMAINES_DE_STOCK = 3;
// Les grosses maisons (des centaines d'avis Google) ont presque toujours une agence.
export const AVIS_MAX = 350;
// Recherches « métier commune » lancées par jour quand une cible manque de fiches.
export const RECHERCHES_PAR_JOUR = 10;

// rythme : emails par jour dans Smartlead (6 boîtes × 10 au départ).
// reponses : au-delà de ce nombre de réponses à traiter, les envois ralentissent.
// cibles : celles qui ont leur campagne dans Smartlead et reçoivent un lot chaque semaine.
export const REGLAGES_DEFAUT = { actif: false, rythme: 60, reponses: 5, cibles: ['vin'] };

/**
 * @typedef {{ actif: boolean, rythme: number, reponses: number, cibles: string[] }} Reglages
 * @typedef {{ cle: string, nom: string, stock: number, contactes: number, positifs: number, desinscrits: number, aFaire: number, aEcrire: number, nonVerifiees: number }} ChiffresCible
 * @typedef {{ niveau: 'danger' | 'attention' | 'info', texte: string, lien?: string }} Alerte
 * @typedef {{ cle: string, nom: string, envoie: boolean, envoyer: number, stock: number, semaines: number | null, chercher: boolean, epuisee: boolean, contactes: number, positifs: number, taux: number | null }} PlanCible
 */

/** @param {string} texte @returns {Reglages} */
export function lireReglages(texte) {
  let brut = {};
  try {
    brut = JSON.parse(texte || '{}') ?? {};
  } catch {
    brut = {};
  }
  const entier = (valeur, defaut, max) => {
    const n = Math.round(Number(valeur));
    return Number.isFinite(n) && n >= 0 ? Math.min(max, n) : defaut;
  };
  return {
    actif: Boolean(brut.actif),
    rythme: entier(brut.rythme, REGLAGES_DEFAUT.rythme, 2000) || REGLAGES_DEFAUT.rythme,
    reponses: entier(brut.reponses, REGLAGES_DEFAUT.reponses, 999) || REGLAGES_DEFAUT.reponses,
    cibles: Array.isArray(brut.cibles) ? brut.cibles.map(String) : REGLAGES_DEFAUT.cibles,
  };
}

// Lundi de la semaine, à l'heure de Paris : « 2026-11-02 ».
export function semaineDe(date = new Date()) {
  const morceaux = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const jour = Date.UTC(Number(morceaux.year), Number(morceaux.month) - 1, Number(morceaux.day));
  const recul = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(morceaux.weekday);
  return new Date(jour - recul * 86_400_000).toISOString().slice(0, 10);
}

// Pourquoi une fiche « Prêt à contacter » ne part pas dans le lot de la semaine.
// null : elle part. { statut: null } : elle attend Bastien (adresse non vérifiée).
// Sinon le statut à lui donner et sa raison, comme je le faisais à la main.
export function ecart(p, cible) {
  if (p.email_verifie === 0) return { statut: null, raison: 'adresse non vérifiée' };
  if (natureEmail(p.email, p.nom, p.site) === 'nominative') return { statut: 'a_ecrire', raison: RAISONS.ecrire };
  const hors = cible ? exclusion({ nom: p.nom, categorie: p.categorie ?? '' }, cible) : null;
  if (hors) return { statut: 'hors_cible', raison: hors };
  if ((p.avis_google ?? 0) > AVIS_MAX) return { statut: 'hors_cible', raison: `grosse maison : ${p.avis_google} avis Google, elle a sûrement déjà une agence` };
  const departements = cible?.departements?.length ? cible.departements : ['67', '68'];
  const postal = String(p.adresse ?? '').match(/\b(\d{5})\b/)?.[1];
  if (postal && !departements.some((d) => postal.startsWith(String(d)))) return { statut: 'hors_cible', raison: `hors zone : code postal ${postal}` };
  return null;
}

// Répartit le volume de la semaine entre les cibles qui envoient. Chaque cible pèse
// selon ses réponses positives (a priori : 1 sur 30, soit environ 3 %), garde à peu
// près `plancher` du volume pour continuer à apprendre, et ne reçoit jamais plus que
// son stock : le reste va aux autres.
/** @param {number} volume @param {{ cle: string, stock: number, contactes?: number, positifs?: number }[]} cibles @returns {Record<string, number>} */
export function repartir(volume, cibles, plancher = 0.2) {
  const parts = Object.fromEntries(cibles.map((c) => [c.cle, 0]));
  let reste = Math.max(0, Math.floor(volume));
  let ouvertes = cibles.filter((c) => c.stock > 0);
  while (reste > 0 && ouvertes.length) {
    const poids = ouvertes.map((c) => ((c.positifs ?? 0) + 1) / ((c.contactes ?? 0) + 30));
    const total = poids.reduce((a, b) => a + b, 0);
    const minimum = Math.min(plancher, 1 / ouvertes.length);
    const releves = poids.map((p) => Math.max(minimum, p / total));
    const somme = releves.reduce((a, b) => a + b, 0);
    const voulues = releves.map((p) => (reste * p) / somme);
    const entieres = voulues.map(Math.floor);
    let manque = reste - entieres.reduce((a, b) => a + b, 0);
    for (const [, i] of voulues.map((v, i) => [v - entieres[i], i]).sort((a, b) => b[0] - a[0])) {
      if (manque <= 0) break;
      entieres[i] += 1;
      manque -= 1;
    }
    let donne = 0;
    ouvertes.forEach((c, i) => {
      const n = Math.min(entieres[i], c.stock - parts[c.cle]);
      parts[c.cle] += n;
      donne += n;
    });
    reste -= donne;
    ouvertes = ouvertes.filter((c) => parts[c.cle] < c.stock);
    if (!donne) break;
  }
  return parts;
}

const taux = (n, sur) => (sur ? n / sur : 0);
const pourcent = (valeur) => `${Math.round(valeur * 100)} %`;
const pluriel = (n, mot, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;

/**
 * Le plan de la semaine.
 * @param {{ reglages: Reglages, cibles: ChiffresCible[], aTraiter: number, rebonds?: { contactes: number, rebonds: number }, importer?: boolean }} donnees
 * @returns {{ volume: number, base: number, prevus: number, parCible: PlanCible[], alertes: Alerte[] }}
 * donnees.reglages : { rythme, reponses, cibles }
 * donnees.cibles : [{ cle, nom, stock, contactes, positifs, desinscrits, aFaire, aEcrire, nonVerifiees }]
 *   (contactes, positifs, desinscrits : sur les 60 derniers jours ; aFaire : recherches pas encore faites)
 * donnees.aTraiter : fiches « A répondu » qui attendent Bastien
 * donnees.rebonds : { contactes, rebonds } sur les 30 derniers jours
 * donnees.importer : true quand des fiches sont en campagne et que l'export Smartlead n'a pas été importé depuis une semaine
 */
export function planifier(donnees) {
  const { reglages } = donnees;
  const alertes = [];
  const base = reglages.rythme * JOURS_OUVRES;
  let volume = base;

  if (donnees.aTraiter >= reglages.reponses) {
    volume = Math.round(volume / 2);
    alertes.push({
      niveau: 'attention',
      texte: `Tu as ${pluriel(donnees.aTraiter, 'réponse')} à traiter : j'envoie moitié moins cette semaine, pour que tu tiennes les 3 jours ouvrés des maquettes.`,
      lien: '/prospects?statut=a_repondu',
    });
  }
  const rebond = taux(donnees.rebonds?.rebonds ?? 0, donnees.rebonds?.contactes ?? 0);
  if ((donnees.rebonds?.contactes ?? 0) >= 30 && rebond > 0.03) {
    volume = Math.min(volume, Math.round(base / 2));
    alertes.push({
      niveau: 'danger',
      texte: `${pourcent(rebond)} des adresses ont rebondi ces 30 derniers jours (au-delà de 3 %, tes boîtes s'abîment) : j'envoie moitié moins. Regarde les rebonds dans Smartlead.`,
    });
  }

  const envoient = donnees.cibles.filter((c) => reglages.cibles.includes(c.cle));
  const parts = repartir(volume, envoient);
  const parCible = donnees.cibles.map((c) => {
    const envoie = reglages.cibles.includes(c.cle);
    const envoyer = envoie ? (parts[c.cle] ?? 0) : 0;
    // Le besoin d'une cible : sa part, ou une part égale quand elle n'a plus de stock.
    const besoin = envoie ? Math.max(envoyer, Math.round(volume / Math.max(1, envoient.length))) : 0;
    const chercher = envoie && c.stock < SEMAINES_DE_STOCK * besoin;
    return {
      cle: c.cle,
      nom: c.nom,
      envoie,
      envoyer,
      stock: c.stock,
      semaines: besoin ? Math.floor((c.stock / besoin) * 10) / 10 : null,
      chercher: chercher && c.aFaire > 0,
      epuisee: chercher && c.aFaire === 0,
      contactes: c.contactes,
      positifs: c.positifs,
      taux: c.contactes ? Math.round(taux(c.positifs, c.contactes) * 1000) / 10 : null,
    };
  });
  const prevus = parCible.reduce((somme, c) => somme + c.envoyer, 0);

  if (!envoient.length) {
    alertes.push({ niveau: 'attention', texte: 'Aucune cible n’envoie : coche, plus bas, celles qui ont leur campagne dans Smartlead.', lien: '#reglages' });
  } else if (prevus < volume) {
    const cherche = parCible.some((c) => c.chercher);
    alertes.push({
      niveau: 'attention',
      texte: `Pas assez de fiches prêtes : ${prevus} cette semaine au lieu de ${volume}.${cherche ? ' Le pilote relance des recherches.' : ''}`,
    });
  }
  for (const c of parCible.filter((c) => c.epuisee)) {
    alertes.push({
      niveau: 'attention',
      texte: `Plus rien à chercher pour « ${c.nom} » : ajoute des communes ou des métiers à la cible, ou teste un nouveau secteur.`,
      lien: `/cibles?cle=${encodeURIComponent(c.cle)}`,
    });
  }
  for (const c of donnees.cibles) {
    if (c.contactes >= 50 && taux(c.desinscrits, c.contactes) > 0.05) {
      alertes.push({ niveau: 'attention', texte: `Beaucoup de « stop » pour « ${c.nom} » (${pourcent(taux(c.desinscrits, c.contactes))}) : le message ou la cible collent mal.` });
    }
  }
  const aEcrire = donnees.cibles.reduce((somme, c) => somme + (c.aEcrire ?? 0), 0);
  const nonVerifiees = donnees.cibles.reduce((somme, c) => somme + (c.nonVerifiees ?? 0), 0);
  if (donnees.importer) {
    alertes.push({ niveau: 'info', texte: 'Importe l’export de ta campagne Smartlead : c’est comme ça que je vois les réponses, les « stop » et les rebonds.', lien: '#import' });
  }
  if (donnees.aTraiter && donnees.aTraiter < reglages.reponses) {
    alertes.push({ niveau: 'info', texte: `${pluriel(donnees.aTraiter, 'réponse')} à traiter.`, lien: '/prospects?statut=a_repondu' });
  }
  if (aEcrire) alertes.push({ niveau: 'info', texte: `${pluriel(aEcrire, 'adresse nominative', 'adresses nominatives')} à écrire à la main, les meilleures d’abord.`, lien: '/traiter?statut=a_ecrire' });
  if (nonVerifiees) {
    alertes.push({
      niveau: 'info',
      texte: `${pluriel(nonVerifiees, 'adresse non vérifiée', 'adresses non vérifiées')} attend${nonVerifiees > 1 ? 'ent' : ''} ton œil avant de partir.`,
      lien: '/prospects?statut=nouveau&verif=non_verifie',
    });
  }
  return { volume, base, prevus, parCible, alertes };
}

const cleColonne = (nom) => sansAccents(String(nom)).replace(/[^a-z0-9]/g, '');
const sansAccents = (texte) => texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const oui = (valeur) => /^(true|1|yes|oui)$/i.test(String(valeur ?? '').trim());

// L'export d'une campagne Smartlead (bouton « Export » de la liste des leads) :
// une ligne par adresse, avec ce que Smartlead sait d'elle. Les noms de colonnes
// varient un peu selon l'écran : on les lit sans casse ni ponctuation.
export function lireExportSmartlead(texte) {
  return lireCsv(texte)
    .map((ligne) => {
      const champs = Object.fromEntries(Object.entries(ligne).map(([cle, valeur]) => [cleColonne(cle), String(valeur ?? '').trim()]));
      const valeur = (...noms) => noms.map((nom) => champs[nom]).find((v) => v) ?? '';
      const statut = valeur('status', 'leadstatus').toUpperCase();
      const categorie = sansAccents(valeur('category', 'leadcategory', 'categoryname'));
      return {
        email: valeur('email', 'leademail', 'emailaddress').toLowerCase(),
        desinscrit: oui(valeur('isunsubscribed', 'unsubscribed')),
        repondu: Number(valeur('replycount', 'replies', 'repliedcount')) > 0 || oui(valeur('isreplied', 'replied')),
        rebond: oui(valeur('isbounced', 'bounced')) || Number(valeur('bouncecount')) > 0 || /bounce|rebond/.test(categorie) || /BOUNCE|BLOCKED/.test(statut),
        categorie,
      };
    })
    .filter((ligne) => ligne.email.includes('@'));
}

// Ce que devient la fiche d'une ligne de l'export : null quand rien ne change
// (le prospect est dans la campagne, sans réponse, ou en absence du bureau).
export function retourSmartlead(ligne) {
  if (ligne.desinscrit || /do not contact|ne pas contacter|unsubscri|desinscri/.test(ligne.categorie)) return 'desinscrit';
  if (ligne.rebond) return 'rebond';
  if (/not interested|pas interesse/.test(ligne.categorie)) return 'pas_interesse';
  if (/out of office|absen/.test(ligne.categorie)) return null;
  if (ligne.repondu || /interested|meeting|information|interesse|rendez-vous/.test(ligne.categorie)) return 'a_repondu';
  return null;
}
