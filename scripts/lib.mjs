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

// Garde la meilleure adresse générique, de préférence sur le domaine du site.
export function choisirEmail(emails, site) {
  const uniques = [...new Set(emails.map((email) => email.toLowerCase()))];
  const host = hote(site);
  const generiques = uniques.filter(estGenerique);
  const surLeDomaine = generiques.find((email) => host && email.endsWith(`@${host}`));
  if (surLeDomaine) return { email: surLeDomaine, statut: 'generique' };
  // Une adresse générique d'un autre domaine peut être celle de l'agence qui a fait le site.
  const surUnWebmail = generiques.find((email) => WEBMAILS.includes(email.split('@')[1]));
  if (surUnWebmail) return { email: surUnWebmail, statut: 'generique' };
  if (generiques.length) return { email: generiques[0], statut: host ? 'autre_domaine' : 'generique' };
  if (uniques.length) return { email: uniques[0], statut: 'nominative' };
  return { email: '', statut: 'absente' };
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
