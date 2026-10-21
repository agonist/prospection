// Passage d'une fiche analysée à une ligne de la table prospects.

// Statuts que l'import recalcule à chaque passage. Tous les autres sont posés
// à la main dans l'admin et ne sont jamais écrasés par une nouvelle extraction.
export const STATUTS_AUTOMATIQUES = ['nouveau', 'a_verifier', 'plus_tard', 'hors_cible'];

export function identifiant(prospect, cleDoublon) {
  return prospect.placeId || cleDoublon;
}

export function statutInitial({ exclusion, signaux, constat, statut: emailStatut }) {
  if (exclusion) return { statut: 'hors_cible', raison: exclusion };
  if (signaux.injoignable) return { statut: 'a_verifier', raison: 'site injoignable : vérifier à la main avant de dire quoi que ce soit' };
  if (!constat) return { statut: 'plus_tard', raison: 'aucun constat : le site a l’air correct' };
  if (emailStatut === 'absente') return { statut: 'a_verifier', raison: 'pas d’email trouvé : chercher sur la fiche Google ou appeler' };
  if (emailStatut === 'autre_domaine') return { statut: 'a_verifier', raison: 'email générique sur un autre domaine que le site : vérifier que ce n’est pas celui de son agence web' };
  if (emailStatut === 'nominative') return { statut: 'a_verifier', raison: 'email nominatif : écrire à la main depuis Tuta, pas dans Smartlead (règle CNIL)' };
  return { statut: 'nouveau', raison: '' };
}

function sql(valeur) {
  if (valeur == null || valeur === '') return valeur === '' ? "''" : 'NULL';
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? String(valeur) : 'NULL';
  return `'${String(valeur).replace(/'/g, "''")}'`;
}

const DONNEES = [
  'cible',
  'nom',
  'categorie',
  'ville',
  'adresse',
  'telephone',
  'site',
  'fiche_google',
  'note_google',
  'avis_google',
  'recherche',
  'email',
  'email_statut',
  'constat_cle',
  'constat',
  'signaux',
];

// Une instruction par fiche : insère, ou met à jour les données sans toucher
// au statut posé à la main ni à la note.
export function versSql(lignes, maintenant) {
  const automatiques = STATUTS_AUTOMATIQUES.map(sql).join(', ');
  const colonnes = ['id', ...DONNEES, 'raison', 'statut', 'cree_le', 'vu_le', 'statut_le'];
  return lignes
    .map((ligne) => {
      const valeurs = { ...ligne, cree_le: maintenant, vu_le: maintenant, statut_le: maintenant };
      const miseAJour = [
        ...DONNEES.map((colonne) => `${colonne} = excluded.${colonne}`),
        'vu_le = excluded.vu_le',
        `raison = CASE WHEN prospects.statut IN (${automatiques}) THEN excluded.raison ELSE prospects.raison END`,
        `statut_le = CASE WHEN prospects.statut IN (${automatiques}) AND prospects.statut <> excluded.statut THEN excluded.statut_le ELSE prospects.statut_le END`,
        `statut = CASE WHEN prospects.statut IN (${automatiques}) THEN excluded.statut ELSE prospects.statut END`,
      ];
      return `INSERT INTO prospects (${colonnes.join(', ')}) VALUES (${colonnes.map((colonne) => sql(valeurs[colonne])).join(', ')})\n  ON CONFLICT (id) DO UPDATE SET ${miseAJour.join(', ')};`;
    })
    .join('\n');
}

export function versLigne({ id, cible, prospect, signaux = {}, constat, email = '', statut: emailStatut = 'absente', exclusion }) {
  return {
    id,
    cible,
    nom: prospect.nom,
    categorie: prospect.categorie,
    ville: prospect.ville,
    adresse: prospect.adresse,
    telephone: prospect.telephone,
    site: prospect.site,
    fiche_google: prospect.ficheGoogle,
    note_google: prospect.noteGoogle,
    avis_google: prospect.avisGoogle,
    recherche: prospect.recherche,
    email,
    email_statut: emailStatut,
    constat_cle: constat?.cle ?? '',
    constat: constat?.phrase ?? '',
    signaux: JSON.stringify(signaux),
    ...statutInitial({ exclusion, signaux, constat, statut: emailStatut }),
  };
}
