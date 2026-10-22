import { CIBLES, CONSTATS } from './cibles.mjs';

const RESEAUX_SOCIAUX = ['facebook.com', 'fb.com', 'instagram.com', 'linktr.ee'];
const ANNUAIRES = [
  'pagesjaunes.fr',
  'doctolib.fr',
  'resalib.fr',
  'medoucine.com',
  'therapeutes.com',
  'planity.com',
  'crenolib.fr',
  'annuaire-therapeutes.com',
  'habitatpresto.com',
  'travaux.com',
  'starofservice.com',
  'societe.com',
  'mappy.com',
];

// Adresses qui désignent une fonction et non une personne : la CNIL autorise
// la prospection B2B sans consentement sur ce type d'adresse.
const LOCAUX_GENERIQUES = new Set([
  'contact',
  'contacts',
  'info',
  'infos',
  'information',
  'informations',
  'bonjour',
  'hello',
  'accueil',
  'reception',
  'reservation',
  'reservations',
  'resa',
  'booking',
  'commande',
  'commandes',
  'boutique',
  'shop',
  'vente',
  'ventes',
  'devis',
  'atelier',
  'cabinet',
  'secretariat',
  'administration',
  'admin',
  'office',
  'bureau',
  'mail',
  'email',
  'courrier',
  'domaine',
  'cave',
  'caveau',
  'vins',
  'vin',
  'degustation',
  'entreprise',
  'societe',
  'sarl',
]);

const EXTENSIONS_IMAGES = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js)$/i;
const DOMAINES_TECHNIQUES = /(sentry|wixpress|@example\.|@domain\.|@email\.com$|yourdomain|votredomaine|@exemple\.)/i;

export function hote(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function correspond(host, liste) {
  return liste.some((domaine) => host === domaine || host.endsWith(`.${domaine}`));
}

const WEBMAILS = ['gmail.com', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'neuf.fr', 'laposte.net', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'live.fr', 'yahoo.fr', 'yahoo.com', 'icloud.com', 'aol.com', 'bbox.fr', 'numericable.fr'];

// Réseau social ou annuaire : rien à télécharger, le constat est déjà connu.
export function estPlateforme(site) {
  return correspond(hote(site), [...RESEAUX_SOCIAUX, ...ANNUAIRES]);
}

// Accepte un export Apify (Google Maps Scraper) ou Outscraper.
export function normaliser(fiche) {
  const emails = [
    ...(Array.isArray(fiche.emails) ? fiche.emails : []),
    fiche.email,
    fiche.email_1,
    fiche.email_2,
    fiche.email_3,
  ].filter(Boolean);
  let site = fiche.website ?? fiche.site ?? '';
  if (site && !/^https?:\/\//i.test(site)) site = `https://${site}`;
  return {
    placeId: fiche.placeId ?? fiche.place_id ?? fiche.google_id ?? '',
    nom: (fiche.title ?? fiche.name ?? '').trim(),
    categorie: fiche.categoryName ?? fiche.category ?? fiche.type ?? '',
    ville: fiche.city ?? fiche.ville ?? '',
    site,
    adresse: fiche.address ?? fiche.full_address ?? '',
    telephone: fiche.phone ?? fiche.phoneUnformatted ?? '',
    ficheGoogle: fiche.url ?? fiche.location_link ?? '',
    noteGoogle: fiche.totalScore ?? fiche.rating ?? null,
    avisGoogle: fiche.reviewsCount ?? fiche.reviews ?? null,
    recherche: fiche.searchString ?? fiche.query ?? '',
    ferme: Boolean(fiche.permanentlyClosed || fiche.business_status === 'CLOSED_PERMANENTLY'),
    emails,
  };
}

export function exclusion(prospect, cible) {
  if (!prospect.nom) return 'fiche sans nom';
  if (prospect.ferme) return 'fermé définitivement';
  const texte = `${prospect.nom} ${prospect.categorie}`;
  const motif = cible.exclure.find((regle) => regle.test(texte));
  return motif ? `hors cible : « ${texte.match(motif)[0]} »` : null;
}

export function cleDoublon(prospect) {
  const host = hote(prospect.site);
  if (host && !correspond(host, [...RESEAUX_SOCIAUX, ...ANNUAIRES])) return host;
  return `${prospect.nom.toLowerCase()}|${prospect.ville.toLowerCase()}`;
}

export function extraireEmails(html) {
  const trouves = new Set();
  const texte = html
    .replace(/\s*(?:&#64;|&#x40;|\[at\]|\(at\))\s*/gi, '@')
    .replace(/\s*(?:&#46;|\[dot\]|\(dot\))\s*/gi, '.');
  for (const [, email] of texte.matchAll(/mailto:([^"'?\s>]+)/gi)) trouves.add(decodeURIComponent(email));
  for (const [email] of texte.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) trouves.add(email);
  return [...trouves]
    .map((email) => email.toLowerCase().replace(/^\.+|\.+$/g, ''))
    .filter((email) => !EXTENSIONS_IMAGES.test(email) && !DOMAINES_TECHNIQUES.test(email));
}

export function estGenerique(email) {
  const local = email.split('@')[0].replace(/[0-9]+$/, '');
  return LOCAUX_GENERIQUES.has(local);
}

// Mots de métier : une adresse qui en contient un désigne l'entreprise.
const MOTS_METIER = /menuis|plomb|electri|couverture|couvreur|charpent|carrel|peintur|peintre|macon|batiment|renov|chauffag|sanitaire|toiture|zinguer|isolation|ebenist|serrur|parquet|platr|facade|jardin|paysag|naturo|sophro|osteo|kinesio|reflexo|hypno|massage|masseu|therap|bienetre|yoga|soin|vignob|viticul|vigneron|domaine|cave|vins?$|^ets$|^etablissement|^sarl|^eurl|^sas$|^scea|^earl|^gaec|^entreprise|^societe|^groupe|^atelier|^cabinet|^maison|^studio|^agence/;

// Prénoms courants : une adresse qui en contient un désigne une personne.
const PRENOMS = new Set(
  `jean pierre michel philippe alain nicolas christophe patrick daniel bernard eric laurent frederic stephane david olivier thierry pascal
  sebastien julien thomas christian jacques francois didier dominique gerard yves vincent fabrice bruno franck serge jerome guillaume
  antoine alexandre maxime mathieu matthieu romain florian kevin anthony benjamin cedric arnaud lionel ludovic gilles herve marc paul
  andre rene claude louis luc joel denis remi sylvain emmanuel gregory hugo lucas leo theo nathan quentin adrien damien yannick loic
  marie nathalie isabelle sylvie catherine francoise martine christine sandrine valerie veronique sophie celine stephanie christelle
  laurence anne julie aurelie caroline emilie claire camille sarah laura pauline elodie audrey melanie marion lucie chloe manon emma lea
  helene agnes brigitte monique nicole patricia corinne florence muriel karine virginie delphine severine sabrina vanessa alice clara
  charlotte juliette amandine jessica marine morgane elise eva louise jeanne anais justine ophelie margaux estelle beatrice odile
  josiane chantal annie evelyne mireille jacqueline danielle genevieve fabienne myriam carole cecile magali gaelle solene`.split(/\s+/),
);

function mots(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

// Les mots qui identifient l'entreprise : ceux de son nom et de son domaine.
function motsEntreprise(nom, site) {
  const domaine = hote(site).replace(/\.[a-z]+$/, '');
  return new Set([...mots(nom), ...mots(domaine)].filter((mot) => mot.length >= 4));
}

// generique (contact@…), entreprise (menuiserie.dupont@…) ou nominative (claire.martin@…).
export function natureEmail(email, nom = '', site = '') {
  if (estGenerique(email)) return 'generique';
  const local = mots(email.split('@')[0]);
  if (local.some((mot) => PRENOMS.has(mot))) return 'nominative';
  if (/^[a-z][._-][a-z]+$/.test(email.split('@')[0])) return 'nominative'; // c.martin@
  const entreprise = motsEntreprise(nom, site);
  if (local.some((mot) => MOTS_METIER.test(mot) || (mot.length >= 4 && entreprise.has(mot)))) return 'entreprise';
  return 'nominative';
}

const ADRESSE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Garde la meilleure adresse de l'entreprise, de préférence sur le domaine du site.
// Une adresse générique ou au nom de l'entreprise peut partir dans Smartlead ;
// une adresse nominative s'écrit à la main.
export function choisirEmail(emails, site, nom = '') {
  // Apify ou une page peuvent renvoyer autre chose qu'une adresse (« mailto: » vide, texte…).
  const valides = emails.filter((email) => typeof email === 'string' && ADRESSE.test(email.trim()));
  const uniques = [...new Set(valides.map((email) => email.trim().toLowerCase()))];
  const host = hote(site);
  const entreprise = motsEntreprise(nom, site);
  const avecNature = uniques.map((email) => ({ email, nature: natureEmail(email, nom, site), domaine: email.split('@')[1] }));
  const rang = ({ nature, domaine }) => {
    const surLeDomaine = host && domaine === host;
    // Un autre domaine qui reprend le nom de l'entreprise est le sien (domaine-dupont.com, dupont-vins.fr).
    const domaineAElle = surLeDomaine || mots(domaine.replace(/\.[a-z]+$/, '')).some((mot) => mot.length >= 4 && entreprise.has(mot));
    const webmail = WEBMAILS.includes(domaine);
    if (nature === 'nominative') return 9;
    const base = nature === 'generique' ? 0 : 1;
    if (surLeDomaine) return base;
    if (domaineAElle || webmail || !host) return 2 + base;
    return 6 + base; // peut-être l'agence qui a fait le site
  };
  const tries = avecNature.sort((a, b) => rang(a) - rang(b));
  const meilleure = tries[0];
  if (!meilleure) return { email: '', statut: 'absente' };
  const r = rang(meilleure);
  if (r === 9) return { email: meilleure.email, statut: 'nominative' };
  if (r >= 6) return { email: meilleure.email, statut: 'autre_domaine' };
  return { email: meilleure.email, statut: meilleure.nature };
}

export function liensUtiles(html, base) {
  const liens = new Set();
  for (const [, href] of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    if (!/contact|mentions|legal|impressum|qui-sommes|a-propos/i.test(href)) continue;
    try {
      const url = new URL(href, base);
      if (hote(url.href) === hote(base)) liens.add(url.href);
    } catch {
      // lien mal formé, on l'ignore
    }
  }
  return [...liens].slice(0, 3);
}

// Ne regarde que la page d'accueil : chaque signal doit se vérifier à l'oeil en
// moins d'une minute, sinon le constat ne part pas dans l'email.
export function auditer({ site, urlFinale, html, anneeCourante = new Date().getFullYear() }) {
  const host = hote(site);
  if (!site) return { pasDeSite: true };
  if (correspond(host, RESEAUX_SOCIAUX)) return { reseauSocial: true };
  if (correspond(host, ANNUAIRES)) return { annuaire: true };
  if (html == null) return { injoignable: true };

  const bas = html.toLowerCase();
  const signaux = {
    pasHttps: (urlFinale ?? site).startsWith('http://'),
    pasMobile: !/<meta[^>]+name=["']viewport["']/i.test(html),
    pasDeBoutique: !/(boutique|panier|e-?shop|ajouter au panier|add.to.cart|woocommerce|shopify|commander (nos|mes|les) vins|vente en ligne)/i.test(bas),
    pasDeDegustation: !/(d[ée]gustation[^<]{0,80}r[ée]serv|r[ée]serv[^<]{0,80}d[ée]gustation|calendly|r[ée]server une visite)/i.test(bas),
    pasAllemand: !/(hreflang=["']de|lang=["']de|\/de\/|deutsch|willkommen)/i.test(bas),
    pasDeRendezVous: !/(prendre rendez-vous|prendre rdv|r[ée]server (une|un|votre) (s[ée]ance|consultation|soin|rendez-vous)|doctolib|resalib|planity|crenolib|calendly|medoucine|agenda en ligne)/i.test(bas),
    pasDeTarifs: !/(tarif|prix|€|&euro;|euros)/i.test(bas),
    pasDeDevis: !/(devis|<form)/i.test(bas),
    pasDeRealisations: !/(r[ée]alisations|chantiers|galerie|portfolio|nos travaux|avant[ /-]apr[èe]s)/i.test(bas),
  };

  const annees = [...bas.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/g)].map(([, annee]) => Number(annee));
  if (annees.length) {
    const derniere = Math.max(...annees);
    if (derniere <= anneeCourante - 4) signaux.vieuxCopyright = derniere;
  }
  return signaux;
}

/** @type {[RegExp, string][]} */
const TECHNIQUES = [
  [/wix\.com|wixstatic/i, 'Wix'],
  [/jimdo/i, 'Jimdo'],
  [/squarespace/i, 'Squarespace'],
  [/wp-content/i, 'WordPress'],
  [/e-monsite/i, 'e-monsite'],
  [/webself/i, 'Webself'],
  [/shopify/i, 'Shopify'],
  [/jquery[.-]1\./i, 'jQuery 1.x (ancien)'],
  [/<table[^>]+width=/i, 'mise en page en tableaux (ancienne)'],
  [/\.swf\b|<embed/i, 'Flash ou <embed> (obsolète)'],
  [/<frameset|<frame\s/i, 'cadres (frameset, obsolète)'],
];

// Ce que Claude lit d'une page d'accueil : le texte visible et quelques
// indices techniques, sans le HTML complet (trop long et coûteux).
export function extrairePage(html, url) {
  const meta = (nom) => html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${nom}["'][^>]*content=["']([^"']*)`, 'i'))?.[1]?.trim() ?? '';
  const decoder = (texte) =>
    texte
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;|&rsquo;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&eacute;/g, 'é')
      .replace(/&egrave;/g, 'è')
      .replace(/&agrave;/g, 'à')
      .replace(/&#\d+;|&[a-z]+;/g, ' ');
  const liens = [...html.matchAll(/<a\s[^>]*>([\s\S]*?)<\/a>/gi)]
    .map(([, texte]) => decoder(texte.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
    .filter((texte) => texte && texte.length <= 40);
  const texte = decoder(
    html
      .replace(/<(head|script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|p|div|h[1-6]|li|section|article|header|footer|tr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  /** @type {string[]} */
  const indices = [];
  const generateur = meta('generator');
  if (generateur) indices.push(`générateur : ${generateur}`);
  for (const [motif, nom] of TECHNIQUES) {
    if (motif.test(html)) indices.push(nom);
  }
  return {
    url,
    titre: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim(),
    description: meta('description'),
    liens: [...new Set(liens)].slice(0, 40),
    indices,
    poidsKo: Math.round(html.length / 1024),
    texte: texte.slice(0, 6000),
  };
}

export function choisirConstat(signaux, cible) {
  const cle = cible.constats.find((nom) => signaux[nom]);
  if (!cle) return null;
  return { cle, phrase: CONSTATS[cle].replace('{annee}', String(signaux[cle])) };
}

export function versCsv(lignes, colonnes) {
  const echapper = (valeur) => {
    const texte = String(valeur ?? '');
    return /[",\n;]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
  };
  return [colonnes.join(','), ...lignes.map((ligne) => colonnes.map((colonne) => echapper(ligne[colonne])).join(','))].join('\n') + '\n';
}

export function cible(nom) {
  const trouvee = CIBLES[nom];
  if (!trouvee) throw new Error(`Cible inconnue : ${nom}. Choix possibles : ${Object.keys(CIBLES).join(', ')}`);
  return trouvee;
}
