// Une entrée par campagne Smartlead. Les constats sont testés dans l'ordre :
// le premier qui se vérifie part dans la colonne `constat` de l'email 1.
// Chaque phrase doit se lire après « En regardant, j'ai remarqué que ».

export const CONSTATS = {
  pasDeSite: "vous n'avez pas encore de site, seulement une fiche Google",
  reseauSocial: "vous n'avez pas encore de site, seulement une page Facebook ou Instagram",
  annuaire: "vous n'avez pas encore de site à vous, seulement un profil sur un annuaire",
  pasHttps: "votre site affiche « Non sécurisé » dans le navigateur",
  pasMobile: "votre site ne s'affiche pas en entier sur téléphone",
  pasDeBoutique: 'on ne peut pas commander vos vins sur votre site',
  pasDeDegustation: 'on ne peut pas réserver une dégustation depuis votre site',
  pasAllemand: "votre site n'existe qu'en français, alors que beaucoup de vos visiteurs viennent d'Allemagne",
  pasDeRendezVous: 'on ne peut pas prendre rendez-vous depuis votre site',
  pasDeTarifs: 'vos tarifs ne sont pas indiqués sur votre site',
  pasDeDevis: 'on ne peut pas demander un devis depuis votre site',
  pasDeRealisations: 'votre site ne montre pas de photos de vos chantiers',
  vieuxCopyright: "votre site n'a pas l'air d'avoir été mis à jour depuis {annee}",
};

export const CIBLES = {
  vin: {
    nom: 'Domaines viticoles',
    recherche: 'domaine viticole',
    // Villages de la route des vins d'Alsace, du nord au sud.
    communes: [
      'Marlenheim', 'Wolxheim', 'Molsheim', 'Rosheim', 'Obernai', 'Barr', 'Mittelbergheim', 'Andlau', 'Itterswiller',
      'Dambach-la-Ville', 'Scherwiller', 'Châtenois', 'Bergheim', 'Ribeauvillé', 'Hunawihr', 'Riquewihr', 'Kaysersberg',
      'Ammerschwihr', 'Turckheim', 'Eguisheim', 'Pfaffenheim', 'Rouffach', 'Guebwiller', 'Thann',
    ],
    exclure: [/coop[ée]rative/i, /\bcave (vinicole|de)\b/i, /n[ée]goce/i, /\bcaviste\b/i, /\bbar\b/i],
    constats: [
      'pasDeSite',
      'reseauSocial',
      'pasDeBoutique',
      'pasMobile',
      'pasHttps',
      'pasAllemand',
      'pasDeDegustation',
      'vieuxCopyright',
    ],
  },
  'bien-etre': {
    nom: 'Bien-être',
    recherche: 'naturopathe',
    communes: ['Strasbourg', 'Colmar', 'Mulhouse', 'Haguenau', 'Sélestat', 'Obernai', 'Molsheim', 'Saverne'],
    exclure: [/\bspa\b/i, /institut de beaut[ée]/i, /\bh[ôo]pital\b/i, /\bclinique\b/i],
    constats: [
      'pasDeSite',
      'reseauSocial',
      'annuaire',
      'pasDeRendezVous',
      'pasMobile',
      'pasHttps',
      'pasDeTarifs',
      'vieuxCopyright',
    ],
  },
  artisan: {
    nom: 'Artisans du bâtiment',
    recherche: 'menuisier',
    communes: ['Strasbourg', 'Colmar', 'Mulhouse', 'Haguenau', 'Sélestat', 'Obernai', 'Molsheim', 'Saverne'],
    exclure: [/leroy merlin/i, /castorama/i, /brico/i, /\bpoint p\b/i, /lapeyre/i, /franchis/i],
    constats: [
      'pasDeSite',
      'reseauSocial',
      'annuaire',
      'pasMobile',
      'pasDeDevis',
      'pasDeRealisations',
      'pasHttps',
      'vieuxCopyright',
    ],
  },
};
