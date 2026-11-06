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
  pasAllemand: "votre site n'a pas de version en allemand, alors que beaucoup de vos visiteurs viennent d'Allemagne",
  pasDeRendezVous: 'on ne peut pas prendre rendez-vous depuis votre site',
  pasDeTarifs: 'vos tarifs ne sont pas indiqués sur votre site',
  pasDeDevis: 'on ne peut pas demander un devis depuis votre site',
  pasDeRealisations: 'votre site ne montre pas de photos de vos chantiers',
  vieuxCopyright: "votre site n'a pas l'air d'avoir été mis à jour depuis {annee}",
};

// Email écrit à la main aux adresses nominatives (pas de Smartlead pour elles).
// La première ligne est l'objet. {{nom}}, {{recherche}}, {{constat}} et {{ville}}
// sont remplacés par les données du prospect. Modifiable par cible dans l'admin.
// Le modèle ne cite pas le constat : les règles qui le trouvent se trompent trop
// souvent pour l'affirmer au prospect. Il sert à trier les fiches.
export const MODELE_EMAIL = `Une petite idée pour {{nom}}
Bonjour,

En cherchant « {{recherche}} » sur Google, je suis tombé sur votre fiche.

Je m'appelle Bastien et je fais des sites pour les entreprises d'Alsace (C'est bien beau). Si ça vous tente, je vous prépare gratuitement une page d'accueil à votre nom, pour que vous voyiez ce que ça donnerait. Vous la recevez par lien sous 3 jours ouvrés.

Sans engagement, et si ce n'est pas le moment, aucun souci.

Belle journée,
Bastien`;

// Entreprises tout juste créées (registre Sirene) : elles n'ont souvent ni site ni
// fiche Google, d'où un autre angle que « je suis tombé sur votre fiche ».
export const CONSTAT_CREATION = "vous n'avez pas encore de site internet";

export const MODELE_CREATION = `Félicitations pour le lancement de {{nom}}
Bonjour,

J'ai vu passer la création de {{nom}} à {{ville}}, félicitations !

Je m'appelle Bastien et je fais des sites pour les entreprises d'Alsace (C'est bien beau). Les premiers mois, un site simple aide à se faire connaître. Si ça vous tente, je vous prépare gratuitement une page d'accueil à votre nom, pour que vous voyiez ce que ça donnerait. Vous la recevez par lien sous 3 jours ouvrés.

Sans engagement, et si ce n'est pas le moment, aucun souci.

Belle journée,
Bastien`;

// À augmenter quand on ajoute des métiers ou des communes ci-dessous : au
// lancement suivant, l'admin les ajoute aux cibles existantes, sans rien retirer
// de ce qui a été modifié à la main.
export const VERSION_CIBLES = 8;

// Villes et bourgs d'Alsace de plus de 5 000 habitants environ, du nord au sud.
export const VILLES = [
  'Wissembourg', 'Haguenau', 'Bischwiller', 'Brumath', 'Saverne', 'Schiltigheim', 'Bischheim', 'Hoenheim', 'Strasbourg',
  'Lingolsheim', 'Ostwald', 'Illkirch-Graffenstaden', 'Geispolsheim', 'Molsheim', 'Obernai', 'Erstein', 'Benfeld', 'Sélestat',
  'Ribeauvillé', 'Colmar', 'Wintzenheim', 'Ensisheim', 'Guebwiller', 'Soultz-Haut-Rhin', 'Cernay', 'Thann', 'Wittenheim',
  'Kingersheim', 'Mulhouse', 'Illzach', 'Rixheim', 'Riedisheim', 'Saint-Louis', 'Huningue', 'Altkirch',
];

// Bourgs de 2 500 à 5 000 habitants environ, où beaucoup d'artisans ont leur atelier.
export const BOURGS = [
  'Lauterbourg', 'Seltz', 'Soultz-sous-Forêts', 'Niederbronn-les-Bains', 'Reichshoffen', 'Ingwiller', 'Bouxwiller', 'Val-de-Moder',
  'Sarre-Union', 'Hochfelden', 'Truchtersheim', 'Drusenheim', 'Gambsheim', 'La Wantzenau', 'Vendenheim', 'Eckbolsheim', 'Wasselonne',
  'Marlenheim', 'Mutzig', 'Schirmeck', 'Rosheim', 'Fegersheim', 'Eschau', 'Barr', 'Villé', 'Marckolsheim', 'Rhinau',
  'Sainte-Marie-aux-Mines', 'Kaysersberg Vignoble', 'Horbourg-Wihr', 'Neuf-Brisach', 'Munster', 'Rouffach', 'Bollwiller', 'Wittelsheim',
  'Pfastatt', 'Sausheim', 'Ottmarsheim', 'Habsheim', 'Brunstatt-Didenheim', 'Masevaux-Niederbruck', 'Dannemarie', 'Sierentz',
  'Blotzheim', 'Ferrette',
];

export const CIBLES = {
  vin: {
    nom: 'Domaines viticoles',
    metiers: ['domaine viticole', 'vigneron', 'viticulteur'],
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
      // Ajoutés ensuite : le nord (Wissembourg), la Couronne d'Or, le piémont de Barr et le sud vers Thann.
      'Cleebourg', 'Rott', 'Steinseltz', 'Oberhoffen-lès-Wissembourg',
      'Westhoffen', 'Balbronn', 'Wangen', 'Nordheim', 'Kirchheim', 'Odratzheim', 'Scharrachbergheim-Irmstett', 'Soultz-les-Bains',
      'Avolsheim', 'Ergersheim', 'Rosenwiller', 'Bischoffsheim', 'Bernardswiller', 'Goxwiller', 'Gertwiller', 'Zellwiller',
      'Stotzheim', 'Eichhoffen', 'Bourgheim', 'Saint-Pierre', 'Reichsfeld', 'Bernardvillé', 'Dieffenthal',
      'Ostheim', 'Colmar', 'Obermorschwihr', 'Hattstatt', 'Herrlisheim-près-Colmar', 'Soultz-Haut-Rhin', 'Bergholtz-Zell',
      'Berrwiller', 'Hartmannswiller', 'Wattwiller', 'Uffholtz', 'Steinbach', 'Leimbach', 'Vieux-Thann',
    ],
    exclure: [
      /coop[ée]rative/i, /\bcave (vinicole|de)\b/i, /cave des vignerons/i, /n[ée]goce/i, /\bcaviste\b/i, /\bbar\b/i,
      // Catégories Google qui ne sont pas un domaine (testées en fin de texte : c'est la catégorie).
      /(h[ôo]tel|restaurant( fran[çc]ais)?|g[îi]te|maison de vacances|r[ée]sidence h[ôo]teli[èe]re|location|circuit de randonn[ée]e|salle de r[ée]ception)$/i,
      // Grandes maisons et caves coopératives : elles ont déjà une équipe ou une agence.
      /\b(hugel|trimbach|weinbach|josmeyer|ostertag|bestheim|wolfberger|dopff|sparr|willm)\b/i,
      /zind[- ]humbrecht/i, /marcel deiss/i, /rolly[- ]gassmann/i, /l[ée]on beyer/i, /kuentz[- ]bas/i, /arthur metz/i, /lucien albrecht/i, /\bmur[ée](\s|$)/i,
    ],
    // Ce qu'un bon site doit avoir dans ce métier : Claude s'en sert pour juger les sites.
    attentes: 'Une boutique en ligne ou au moins la liste des vins avec leurs prix, la réservation d’une dégustation ou d’une visite, les horaires du caveau, une version en allemand pour les touristes, de vraies photos du domaine.',
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
    attentes: 'La prise de rendez-vous en ligne, les tarifs des séances, la présentation de la praticienne ou du praticien et de sa formation, le déroulé d’une séance, l’adresse et l’accès.',
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
    metiers: [
      'menuisier', 'plombier', 'électricien', 'couvreur', 'charpentier', 'carreleur', 'peintre en bâtiment', 'maçon',
      'chauffagiste', 'plaquiste', 'façadier', 'métallier', 'paysagiste',
    ],
    communes: [...VILLES, ...BOURGS],
    exclure: [
      /leroy merlin/i, /castorama/i, /brico/i, /\bpoint p\b/i, /lapeyre/i, /franchis/i,
      // Réseaux de fenêtres en franchise et groupes : ils ont leur site national.
      /art (et|&) fen[êe]tres/i, /\btryba\b/i, /\bk ?par ?k\b/i, /lorenove/i, /r[ée]noval/i, /monsieur store/i, /\bgroupe\b/i,
      // Grands réseaux du chauffage et de l'énergie, jardineries.
      /\b(engie|dalkia|proxiserve|idex|effy|hellio|edf)\b/i, /\b(jardiland|truffaut|botanic|gamm vert|point vert|villaverde)\b/i,
      // Catégories Google qui ne sont pas un artisan du bâtiment (testées en fin de texte : c'est la catégorie).
      /(scierie|entreprise de pompes fun[èe]bres|entrepreneur sp[ée]cialis[ée] en t[ôo]lerie|chaudronnerie|service de sablage|service de serrurerie d'urgence|site d'entreprise|jardinerie|fleuriste)$/i,
    ],
    attentes: 'Des photos de chantiers réalisés, une demande de devis en ligne, la zone d’intervention, les certifications (RGE, Qualibat…), les avis clients, un numéro et un email visibles.',
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
