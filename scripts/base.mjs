// Règles de statut partagées par l'import et l'analyse.

// Statuts que l'outil recalcule à chaque passage. Tous les autres sont posés
// à la main dans l'admin et ne sont jamais écrasés par une nouvelle recherche.
export const STATUTS_AUTOMATIQUES = ['a_analyser', 'nouveau', 'a_verifier', 'a_ecrire', 'a_appeler', 'plus_tard', 'hors_cible'];

export function identifiant(prospect, cleDoublon) {
  return prospect.placeId || cleDoublon;
}

export const RAISONS = {
  injoignable: 'site injoignable : vérifier à la main avant de dire quoi que ce soit',
  autreDomaine: 'adresse sur un autre domaine que le site : vérifier que ce n’est pas celle de son agence web',
  sansContact: 'ni email ni téléphone trouvés',
  appeler: 'pas d’email trouvé : appeler',
  ecrire: 'adresse nominative : écrire à la main, pas dans Smartlead (règle CNIL)',
};

export function statutApresAnalyse({ signaux, constat, statut: emailStatut }, telephone = '') {
  if (signaux.injoignable) return { statut: 'a_verifier', raison: RAISONS.injoignable };
  if (!constat) return { statut: 'plus_tard', raison: 'aucun constat : le site a l’air correct' };
  if (emailStatut === 'absente') return telephone ? { statut: 'a_appeler', raison: RAISONS.appeler } : { statut: 'a_verifier', raison: RAISONS.sansContact };
  if (emailStatut === 'autre_domaine') return { statut: 'a_verifier', raison: RAISONS.autreDomaine };
  if (emailStatut === 'nominative') return { statut: 'a_ecrire', raison: RAISONS.ecrire };
  return { statut: 'nouveau', raison: '' };
}
