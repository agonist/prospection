// Règles de statut partagées par l'import et l'analyse.

// Statuts que l'outil recalcule à chaque passage. Tous les autres sont posés
// à la main dans l'admin et ne sont jamais écrasés par une nouvelle recherche.
export const STATUTS_AUTOMATIQUES = ['a_analyser', 'nouveau', 'a_verifier', 'a_ecrire', 'a_enrichir', 'sans_email', 'plus_tard', 'hors_cible'];

export function identifiant(prospect, cleDoublon) {
  return prospect.placeId || cleDoublon;
}

export const RAISONS = {
  injoignable: 'site injoignable : vérifier à la main avant de dire quoi que ce soit',
  autreDomaine: 'adresse sur un autre domaine que le site : vérifier que ce n’est pas celle de son agence web',
  enrichir: 'pas d’email sur le site : Claude le cherche sur le web',
  introuvable: 'aucun email trouvé, ni sur le site ni sur le web',
  propose: 'Claude propose une adresse absente de la page citée : sans doute devinée, vérifie la source',
  ecrire: 'adresse nominative : écrire à la main, pas dans Smartlead (règle CNIL)',
  // Marque une fiche dont l'email est en train d'être cherché.
  enCours: 'Claude cherche l’email sur le web…',
};

// Où va une fiche selon la nature de son email.
export function statutSelonEmail(emailStatut) {
  if (emailStatut === 'absente') return { statut: 'a_enrichir', raison: RAISONS.enrichir };
  if (emailStatut === 'autre_domaine') return { statut: 'a_verifier', raison: RAISONS.autreDomaine };
  if (emailStatut === 'nominative') return { statut: 'a_ecrire', raison: RAISONS.ecrire };
  return { statut: 'nouveau', raison: '' };
}

export function statutApresAnalyse({ signaux, constat, statut: emailStatut }) {
  if (signaux.injoignable) return { statut: 'a_verifier', raison: RAISONS.injoignable };
  if (!constat) return { statut: 'plus_tard', raison: 'aucun constat : le site a l’air correct' };
  return statutSelonEmail(emailStatut);
}
