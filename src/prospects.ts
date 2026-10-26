// Ce qui est partagé par la liste, la fiche et le mode traitement.
import { brouillon, type chargerCibles } from './cibles';
import { RAISONS } from '../scripts/base.mjs';
import { echapper, icone } from './html';

export const STATUTS: Record<string, string> = {
  a_analyser: 'En analyse',
  nouveau: 'Prêt à contacter',
  a_ecrire: 'À écrire',
  a_enrichir: 'Email à chercher',
  a_verifier: 'À vérifier',
  sans_email: 'Sans email',
  plus_tard: 'Plus tard',
  hors_cible: 'Hors cible',
  en_campagne: 'En campagne',
  a_repondu: 'A répondu',
  maquette: 'Maquette envoyée',
  client: 'Client',
  pas_interesse: 'Pas intéressé',
  desinscrit: 'Désinscrit',
};

export const NATURES: Record<string, string> = {
  generique: 'adresse générique',
  entreprise: 'adresse au nom de l’entreprise',
  nominative: 'adresse nominative',
  autre_domaine: 'adresse sur un autre domaine',
};

export const PAR_PAGE = 100;
export const TROIS_ANS_MS = 3 * 365 * 24 * 60 * 60 * 1000;
// Statuts qu'on efface au bout de 3 ans sans nouvelle (recommandation CNIL pour la prospection).
export const PURGEABLES = ['a_analyser', 'nouveau', 'a_verifier', 'a_ecrire', 'a_enrichir', 'sans_email', 'plus_tard', 'hors_cible', 'en_campagne', 'pas_interesse'];

export type Prospect = {
  id: string;
  cible: string;
  nom: string;
  categorie: string;
  ville: string;
  adresse: string;
  telephone: string;
  site: string;
  fiche_google: string;
  note_google: number | null;
  avis_google: number | null;
  recherche: string;
  email: string;
  email_statut: string;
  email_source: string;
  email_propose: string;
  origine: string;
  creation: string;
  constat_cle: string;
  constat: string;
  signaux: string;
  raison: string;
  statut: string;
  note: string;
  cree_le: string;
  vu_le: string;
  statut_le: string;
  contacte_le: string | null;
  score?: number;
  verdict: string;
  qualite: number | null;
  avis: string;
  email_verifie: number;
};

export type Filtres = { cible: string; statut: string; ville: string; categorie: string; raison: string; q: string; tri: string; origine: string; verif: string };

export const CLES_FILTRES = ['cible', 'statut', 'ville', 'categorie', 'raison', 'q', 'tri', 'origine', 'verif'] as const;

// Adresse lue par l'outil, ou seulement vue par Claude sur une page qu'on ne peut pas relire.
export const VERIFICATIONS: Record<string, string> = { verifie: 'Adresses vérifiées', non_verifie: 'Adresses non vérifiées' };

export const ORIGINES: Record<string, string> = { maps: 'Google Maps', sirene: 'Nouvelles entreprises', recent: 'Récentes' };

const UN_AN_MS = 365 * 24 * 60 * 60 * 1000;

// Récente : créée dans l'année d'après le registre, ou sur Google sans site et avec très peu d'avis.
const RECENTE = "(creation >= ? OR (origine = 'maps' AND site = '' AND COALESCE(avis_google, 0) <= 5))";

export function estRecente(p: Pick<Prospect, 'creation' | 'origine' | 'site' | 'avis_google'>) {
  if (p.creation) return Date.parse(p.creation) >= Date.now() - UN_AN_MS;
  return p.origine === 'maps' && !p.site && (p.avis_google ?? 0) <= 5;
}

export function etiquetteRecente(p: Pick<Prospect, 'creation' | 'origine' | 'site' | 'avis_google'>) {
  if (!estRecente(p)) return '';
  const titre = p.creation ? `Créée le ${new Date(p.creation).toLocaleDateString('fr-FR')}` : 'Pas de site et très peu d’avis Google : sans doute une entreprise récente';
  const creee = new Date(p.creation);
  const mois = creee.toLocaleDateString('fr-FR', creee.getFullYear() === new Date().getFullYear() ? { month: 'short' } : { month: 'short', year: 'numeric' });
  return `<span class="etiquette-recente" title="${echapper(titre)}">${p.creation ? `Créée en ${mois}` : 'Récente'}</span>`;
}

// Statuts que « Réanalyser » renvoie en analyse.
export const REANALYSABLES = ['nouveau', 'a_verifier', 'a_ecrire', 'a_enrichir', 'sans_email', 'plus_tard'];

export function lireFiltres(url: URL): Filtres {
  return {
    cible: url.searchParams.get('cible') ?? '',
    statut: url.searchParams.get('statut') ?? '',
    ville: url.searchParams.get('ville') ?? '',
    categorie: url.searchParams.get('categorie') ?? '',
    raison: url.searchParams.get('raison') ?? '',
    tri: url.searchParams.get('tri') ?? '',
    q: url.searchParams.get('q') ?? '',
    origine: url.searchParams.get('origine') ?? '',
    verif: url.searchParams.get('verif') ?? '',
  };
}

export function clauses(filtres: Filtres, sansStatut = false) {
  const conditions: string[] = [];
  const valeurs: string[] = [];
  if (filtres.cible) {
    conditions.push('cible = ?');
    valeurs.push(filtres.cible);
  }
  if (filtres.statut && !sansStatut) {
    conditions.push('statut = ?');
    valeurs.push(filtres.statut);
  }
  if (filtres.ville) {
    conditions.push('ville = ?');
    valeurs.push(filtres.ville);
  }
  if (filtres.categorie) {
    conditions.push('categorie = ?');
    valeurs.push(filtres.categorie);
  }
  if (filtres.raison && !sansStatut) {
    conditions.push('raison = ?');
    valeurs.push(filtres.raison);
  }
  if (filtres.verif in VERIFICATIONS) {
    conditions.push(`email <> '' AND email_verifie = ${filtres.verif === 'verifie' ? 1 : 0}`);
  }
  if (filtres.origine === 'recent') {
    conditions.push(RECENTE);
    valeurs.push(new Date(Date.now() - UN_AN_MS).toISOString().slice(0, 10));
  } else if (filtres.origine) {
    conditions.push('origine = ?');
    valeurs.push(filtres.origine);
  }
  if (filtres.q) {
    conditions.push('(nom LIKE ? OR email LIKE ? OR site LIKE ? OR note LIKE ?)');
    const motif = `%${filtres.q}%`;
    valeurs.push(motif, motif, motif, motif);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', valeurs };
}

export function lienFiltres(filtres: Partial<Filtres>, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries({ ...filtres, ...extra })) if (valeur) params.set(cle, valeur);
  const texte = params.toString();
  return texte ? `/prospects?${texte}` : '/prospects';
}

// Les filtres en paramètres d'adresse, pour une autre page (le mode traitement).
export function requeteFiltres(filtres: Partial<Filtres>) {
  return lienFiltres(filtres).split('?')[1] ?? '';
}

export function badge(statut: string) {
  return `<span class="badge badge-${echapper(statut)}">${echapper(STATUTS[statut] ?? statut)}</span>`;
}

export function date(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

// « 25 oct. » cette année, « 25 oct. 2025 » avant.
export function dateCourte(iso: string | null) {
  if (!iso) return '';
  const jour = new Date(iso);
  const memeAnnee = jour.getFullYear() === new Date().getFullYear();
  return jour.toLocaleDateString('fr-FR', memeAnnee ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

const RESEAUX: Record<string, string> = {
  'facebook.com': 'Page Facebook',
  'fb.com': 'Page Facebook',
  'instagram.com': 'Instagram',
  'linktr.ee': 'Linktree',
  'linkedin.com': 'LinkedIn',
  'pagesjaunes.fr': 'Pages Jaunes',
};

// Le site en quelques mots : le domaine, ou le réseau social quand le « site » n'en est pas un.
export function siteCourt(url: string) {
  try {
    const hote = new URL(url).hostname.replace(/^www\./, '');
    const reseau = Object.keys(RESEAUX).find((domaine) => hote === domaine || hote.endsWith(`.${domaine}`));
    return reseau ? RESEAUX[reseau] : hote;
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '');
  }
}

export function lienSite(url: string) {
  return `<a href="${echapper(url)}" target="_blank" rel="noreferrer" class="lien-site" title="${echapper(url)}"><span>${echapper(siteCourt(url))}</span>${icone('externe', 12)}</a>`;
}

// Ce qui reste à lire dans la liste : le constat, et la raison seulement quand le statut ne la dit pas déjà.
export function motif(p: Pick<Prospect, 'statut' | 'raison' | 'constat'>) {
  const raison = p.raison.split(' : ')[0];
  if (p.raison === RAISONS.enCours) return `<span class="raison-en-cours">${echapper(p.raison)}</span>${p.constat ? `<div class="discret serre">${echapper(p.constat)}</div>` : ''}`;
  if (p.statut === 'a_verifier' && p.raison) {
    return `<div class="raison serre" title="${echapper(p.raison)}">${echapper(raison)}</div>${p.constat ? `<div class="discret une-ligne" title="${echapper(p.constat)}">${echapper(p.constat)}</div>` : ''}`;
  }
  const texte = p.constat || (['a_ecrire', 'a_enrichir', 'sans_email'].includes(p.statut) ? '' : p.raison);
  return texte ? `<div class="serre" title="${echapper(texte)}">${echapper(texte)}</div>` : '';
}

// Adresse vue par Claude sur une page que l'outil ne peut pas relire : lien vers cette page.
export function nonVerifiee(p: Pick<Prospect, 'email' | 'email_verifie' | 'email_source'>) {
  if (!p.email || p.email_verifie !== 0) return '';
  const titre = `Vue par Claude sur ${p.email_source}, page que l’outil ne peut pas relire`;
  return /^https?:\/\//i.test(p.email_source)
    ? `<a class="non-verifiee" href="${echapper(p.email_source)}" target="_blank" rel="noreferrer" title="${echapper(titre)}">non vérifiée</a>`
    : `<span class="non-verifiee" title="${echapper(titre)}">non vérifiée</span>`;
}

// Colonne email : l'adresse, avec un bouton « Écrire » quand elle est nominative.
export function contact(p: Prospect, cibles: Awaited<ReturnType<typeof chargerCibles>>) {
  const adresse = (email: string, classe = '') => `<span class="une-ligne ${classe}" title="${echapper(email)}">${echapper(email)}</span>`;
  if (p.statut === 'a_ecrire' && p.email) {
    return `<div class="contact">${adresse(p.email)}${nonVerifiee(p)}<a class="btn contour mini" href="${echapper(brouillon(cibles[p.cible], p))}" onclick="fetch('/p/${encodeURIComponent(p.id)}/ecrit', { method: 'POST', keepalive: true })">${icone('email', 13)}Écrire</a></div>`;
  }
  if (p.email) return `${adresse(p.email)}${nonVerifiee(p)}`;
  if (p.email_propose) return adresse(`proposé : ${p.email_propose}`, 'discret');
  return '<span class="discret">aucun email</span>';
}

// Les statuts regroupés pour les boutons de la fiche.
export const GROUPES_STATUTS: [string, string[]][] = [
  ['À traiter', ['nouveau', 'a_ecrire', 'a_enrichir', 'a_verifier', 'sans_email', 'a_analyser']],
  ['Contactés', ['en_campagne', 'a_repondu', 'maquette', 'client']],
  ['Écartés', ['plus_tard', 'hors_cible', 'pas_interesse', 'desinscrit']],
];


// Liens pour chercher soi-même l'email d'une fiche.
export function liensRecherche(p: Pick<Prospect, 'nom' | 'ville' | 'site' | 'fiche_google'>) {
  const externe = (href: string, texte: string) =>
    `<a class="btn contour petit" href="${echapper(href)}" target="_blank" rel="noreferrer">${echapper(texte)}${icone('externe', 12)}</a>`;
  const q = encodeURIComponent;
  return [
    p.site ? externe(p.site, 'Son site') : '',
    externe(`https://www.google.com/search?q=${q(`"${p.nom}" ${p.ville} email`)}`, 'Google'),
    externe(`https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui=${q(p.nom)}&ou=${q(p.ville)}`, 'Pages Jaunes'),
    externe(`https://www.facebook.com/search/top?q=${q(`${p.nom} ${p.ville}`)}`, 'Facebook'),
    p.fiche_google ? externe(p.fiche_google, 'Fiche Google') : '',
  ].join('');
}

// Priorité sur 100 : une entreprise bien installée (beaucoup d'avis, bonne note)
// avec une présence en ligne faible est le meilleur prospect.
export const SCORE = `(CASE WHEN constat_cle IN ('pasDeSite', 'reseauSocial', 'annuaire', 'creation') THEN 40 WHEN constat_cle <> '' THEN 20 ELSE 0 END
  + MIN(COALESCE(avis_google, 0), 60) / 2
  + CASE WHEN note_google >= 4.5 THEN 10 WHEN note_google >= 4 THEN 5 ELSE 0 END
  + CASE WHEN email_statut IN ('generique', 'entreprise') THEN 15 WHEN email <> '' THEN 10 ELSE 0 END
  + CASE verdict WHEN 'faible' THEN 10 WHEN 'moyen' THEN 0 WHEN 'bon' THEN -20 ELSE 0 END)`;

// Files qu'on traite une fiche à la fois, triées par priorité.
export const TRAITABLES = ['nouveau', 'a_ecrire', 'a_enrichir', 'a_verifier', 'sans_email'];

export function priorite(score: number | undefined) {
  if (score == null) return '';
  const niveau = score >= 60 ? 'haute' : score >= 35 ? 'moyenne' : 'basse';
  return `<span class="priorite priorite-${niveau}" title="Priorité sur 100 : constat, avis Google, contact">${Math.min(100, score)}</span>`;
}

// Change le statut (et la note) d'une fiche, en gardant les dates à jour.
export function changerStatut(env: Env, id: string, statut: string, note: string | null) {
  return env.DB.prepare(
    `UPDATE prospects SET
      statut_le = CASE WHEN statut <> ?1 THEN ?2 ELSE statut_le END,
      contacte_le = CASE WHEN ?1 = 'en_campagne' AND contacte_le IS NULL THEN ?2 ELSE contacte_le END,
      statut = ?1,
      note = COALESCE(?3, note)
    WHERE id = ?4`,
  ).bind(statut, new Date().toISOString(), note, id);
}

const VERDICTS: Record<string, string> = { bon: 'Site bon', moyen: 'Site moyen', faible: 'Site faible', hors_cible: 'Hors cible' };

// L'avis de Claude en une pastille : « Site faible 3/10 ».
export function verdict(p: Pick<Prospect, 'verdict' | 'qualite'>) {
  if (!p.verdict) return '';
  return `<span class="verdict verdict-${echapper(p.verdict)}" title="Avis de Claude sur le site">${VERDICTS[p.verdict] ?? echapper(p.verdict)}${p.qualite ? ` ${p.qualite}/10` : ''}</span>`;
}

// Le détail de l'avis : raisons et confiance.
export function avisDetaille(p: Pick<Prospect, 'verdict' | 'qualite' | 'avis'>) {
  if (!p.verdict || !p.avis) return '';
  const { raisons = [], confiance = '' } = JSON.parse(p.avis) as { raisons?: string[]; confiance?: string };
  return `<div class="avis">${verdict(p)}${confiance && confiance !== 'haute' ? ` <span class="discret">confiance ${echapper(confiance)}</span>` : ''}
    <ul>${raisons.map((raison) => `<li>${echapper(raison)}</li>`).join('')}</ul></div>`;
}
