// Règles de statut partagées par l'import et l'analyse.

// Statuts que l'outil recalcule à chaque passage. Tous les autres sont posés
// à la main dans l'admin et ne sont jamais écrasés par une nouvelle recherche.
export const STATUTS_AUTOMATIQUES = ['a_analyser', 'nouveau', 'a_verifier', 'plus_tard', 'hors_cible'];

export function identifiant(prospect, cleDoublon) {
  return prospect.placeId || cleDoublon;
}

export function statutApresAnalyse({ signaux, constat, statut: emailStatut }) {
  if (signaux.injoignable) return { statut: 'a_verifier', raison: 'site injoignable : vérifier à la main avant de dire quoi que ce soit' };
  if (!constat) return { statut: 'plus_tard', raison: 'aucun constat : le site a l’air correct' };
  if (emailStatut === 'absente') return { statut: 'a_verifier', raison: 'pas d’email trouvé : chercher sur la fiche Google ou appeler' };
  if (emailStatut === 'autre_domaine') return { statut: 'a_verifier', raison: 'email générique sur un autre domaine que le site : vérifier que ce n’est pas celui de son agence web' };
  if (emailStatut === 'nominative') return { statut: 'a_verifier', raison: 'email nominatif : écrire à la main depuis Tuta, pas dans Smartlead (règle CNIL)' };
  return { statut: 'nouveau', raison: '' };
}
