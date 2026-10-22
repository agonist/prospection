// Ce qui est partagé par la liste, la fiche et le mode traitement.
import { brouillon, type chargerCibles } from './cibles';
import { echapper, icone } from './html';

export const STATUTS: Record<string, string> = {
  a_analyser: 'En analyse',
  nouveau: 'Prêt à contacter',
  a_ecrire: 'À écrire',
  a_appeler: 'À appeler',
  a_verifier: 'À vérifier',
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
export const PURGEABLES = ['a_analyser', 'nouveau', 'a_verifier', 'a_ecrire', 'a_appeler', 'plus_tard', 'hors_cible', 'en_campagne', 'pas_interesse'];

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
};

export type Filtres = { cible: string; statut: string; ville: string; categorie: string; raison: string; q: string; tri: string };

// Statuts que « Réanalyser » renvoie en analyse.
export const REANALYSABLES = ['nouveau', 'a_verifier', 'a_ecrire', 'a_appeler', 'plus_tard'];

export function lireFiltres(url: URL): Filtres {
  return {
    cible: url.searchParams.get('cible') ?? '',
    statut: url.searchParams.get('statut') ?? '',
    ville: url.searchParams.get('ville') ?? '',
    categorie: url.searchParams.get('categorie') ?? '',
    raison: url.searchParams.get('raison') ?? '',
    tri: url.searchParams.get('tri') ?? '',
    q: url.searchParams.get('q') ?? '',
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

// Colonne email : bouton « Écrire » pour une adresse nominative, téléphone à défaut d'email.
export function contact(p: Prospect, cibles: Awaited<ReturnType<typeof chargerCibles>>) {
  if (p.statut === 'a_ecrire' && p.email) {
    return `<a class="btn contour petit" href="${echapper(brouillon(cibles[p.cible], p))}" onclick="fetch('/p/${encodeURIComponent(p.id)}/ecrit', { method: 'POST', keepalive: true })">${icone('email', 14)}Écrire</a><div class="discret">${echapper(p.email)}</div>`;
  }
  if (p.email) return echapper(p.email);
  if (p.telephone) return `<a class="avec-icone" href="tel:${echapper(p.telephone)}">${icone('telephone', 14)}${echapper(p.telephone)}</a>`;
  return '<span class="discret">aucun</span>';
}


// Priorité sur 100 : une entreprise bien installée (beaucoup d'avis, bonne note)
// avec une présence en ligne faible est le meilleur prospect.
export const SCORE = `(CASE WHEN constat_cle IN ('pasDeSite', 'reseauSocial', 'annuaire') THEN 40 WHEN constat_cle <> '' THEN 20 ELSE 0 END
  + MIN(COALESCE(avis_google, 0), 60) / 2
  + CASE WHEN note_google >= 4.5 THEN 10 WHEN note_google >= 4 THEN 5 ELSE 0 END
  + CASE WHEN email_statut IN ('generique', 'entreprise') THEN 15 WHEN email <> '' THEN 10 WHEN telephone <> '' THEN 5 ELSE 0 END
  + CASE verdict WHEN 'faible' THEN 10 WHEN 'moyen' THEN 0 WHEN 'bon' THEN -20 ELSE 0 END)`;

// Files qu'on traite une fiche à la fois, triées par priorité.
export const TRAITABLES = ['nouveau', 'a_ecrire', 'a_appeler', 'a_verifier'];

export function priorite(score: number | undefined) {
  if (score == null) return '';
  const niveau = score >= 60 ? 'haute' : score >= 35 ? 'moyenne' : 'basse';
  return `<span class="priorite priorite-${niveau}" title="Priorité sur 100 : constat, avis Google, contact">${score}</span>`;
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
