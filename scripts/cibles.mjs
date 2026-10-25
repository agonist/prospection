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

// Email écrit à la main aux adresses nominatives (pas de Smartlead pour elles).
// La première ligne est l'objet. {{nom}}, {{recherche}}, {{constat}} et {{ville}}
// sont remplacés par les données du prospect. Modifiable par cible dans l'admin.
export const MODELE_EMAIL = `{{nom}}, une remarque sur votre présence en ligne
Bonjour,

En cherchant « {{recherche}} » sur Google, je suis tombé sur votre fiche. En regardant, j'ai remarqué que {{constat}}.

Je fais des sites pour les entreprises d'Alsace (C'est bien beau). Si ça vous parle, je peux vous montrer en deux minutes ce que ça donnerait pour vous, sans engagement.

Bonne journée,
Bas`;

// Entreprises tout juste créées (registre Sirene) : elles n'ont souvent ni site ni
// fiche Google, d'où un autre angle que « je suis tombé sur votre fiche ».
export const CONSTAT_CREATION = "vous n'avez pas encore de site internet";

export const MODELE_CREATION = `{{nom}}, félicitations pour le lancement
Bonjour,

J'ai vu passer la création de {{nom}} à {{ville}}, félicitations ! En cherchant, j'ai remarqué que {{constat}}.

Je fais des sites pour les entreprises d'Alsace (C'est bien beau). Les premiers mois, un site simple aide beaucoup à se faire connaître : si ça vous parle, je peux vous montrer en deux minutes ce que ça donnerait pour vous, sans engagement.

Bonne journée,
Bas`;

// À augmenter quand on ajoute des métiers ou des communes ci-dessous : au
// lancement suivant, l'admin les ajoute aux cibles existantes, sans rien retirer
// de ce qui a été modifié à la main.
export const VERSION_CIBLES = 3;

// Villes et bourgs d'Alsace de plus de 5 000 habitants environ, du nord au sud.
const VILLES = [
  'Wissembourg', 'Haguenau', 'Bischwiller', 'Brumath', 'Saverne', 'Schiltigheim', 'Bischheim', 'Hoenheim', 'Strasbourg',
  'Lingolsheim', 'Ostwald', 'Illkirch-Graffenstaden', 'Geispolsheim', 'Molsheim', 'Obernai', 'Erstein', 'Benfeld', 'Sélestat',
  'Ribeauvillé', 'Colmar', 'Wintzenheim', 'Ensisheim', 'Guebwiller', 'Soultz-Haut-Rhin', 'Cernay', 'Thann', 'Wittenheim',
  'Kingersheim', 'Mulhouse', 'Illzach', 'Rixheim', 'Riedisheim', 'Saint-Louis', 'Huningue', 'Altkirch',
];

export const CIBLES = {
  vin: {
    nom: 'Domaines viticoles',
    metiers: ['domaine viticole', 'vigneron'],
    // Codes d'activité (NAF) des nouvelles entreprises à chercher dans le registre Sirene.
    naf: ['01.21Z Culture de la vigne', '11.02B Vinification'],
    // Villages de la route des vins d'Alsace, du nord au sud.
    communes: [
      'Marlenheim', 'Wolxheim', 'Molsheim', 'Rosheim', 'Obernai', 'Barr', 'Mittelbergheim', 'Andlau', 'Itterswiller',
      'Dambach-la-Ville', 'Scherwiller', 'Châtenois', 'Bergheim', 'Ribeauvillé', 'Hunawihr', 'Riquewihr', 'Kaysersberg',
      'Ammerschwihr', 'Turckheim', 'Eguisheim', 'Pfaffenheim', 'Rouffach', 'Guebwiller', 'Thann',
      'Bergbieten', 'Dahlenheim', 'Traenheim', 'Dorlisheim', 'Mutzig', 'Boersch', 'Ottrott', 'Heiligenstein', 'Blienschwiller',
      'Nothalten', 'Epfig', 'Orschwiller', 'Kintzheim', 'Saint-Hippolyte', 'Rodern', 'Rorschwihr', 'Zellenberg', 'Beblenheim',
      'Mittelwihr', 'Bennwihr', 'Sigolsheim', 'Kientzheim', 'Katzenthal', 'Niedermorschwihr', 'Ingersheim', 'Wintzenheim',
      'Wettolsheim', 'Husseren-les-Châteaux', 'Voegtlinshoffen', 'Gueberschwihr', 'Westhalten', 'Soultzmatt', 'Orschwihr',
      'Bergholtz', 'Wuenheim', 'Cernay',
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
    naf: ['96.04Z Entretien corporel', '96.02B Soins de beauté', '86.90F Santé humaine non classée ailleurs'],
    metiers: ['naturopathe', 'sophrologue', 'ostéopathe', 'kinésiologue', 'réflexologue', 'hypnothérapeute', 'masseur bien-être'],
    communes: VILLES,
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
    naf: [
      '43.32A Menuiserie bois et PVC',
      '43.22A Plomberie',
      '43.21A Électricité',
      '43.91B Couverture',
      '43.91A Charpente',
      '43.33Z Revêtement des sols et des murs',
      '43.34Z Peinture et vitrerie',
      '43.99C Maçonnerie générale',
    ],
    metiers: ['menuisier', 'plombier', 'électricien', 'couvreur', 'charpentier', 'carreleur', 'peintre en bâtiment', 'maçon'],
    communes: VILLES,
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
