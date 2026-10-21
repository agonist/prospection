// Les cibles (métier, communes, exclusions, ordre des constats) sont gardées en
// base pour être modifiables dans l'admin. scripts/cibles.mjs donne les valeurs
// de départ, insérées au premier chargement.
import { CIBLES, CONSTATS, MODELE_EMAIL, VERSION_CIBLES } from '../scripts/cibles.mjs';
import { echapper, icone, page } from './html';

export type Cible = {
  cle: string;
  nom: string;
  metiers: string[];
  communes: string[];
  exclure: RegExp[];
  constats: string[];
  modele?: string;
};

type Ligne = { cle: string; nom: string; metiers: string; communes: string; exclure: string; constats: string; modele: string };

// Une recherche déjà faite depuis moins de 6 mois n'est pas relancée.
export const DELAI_TERMES_MS = 183 * 24 * 60 * 60 * 1000;

export function normaliserTerme(terme: string) {
  return terme.toLowerCase().replace(/\s+/g, ' ').trim();
}

function versCible(ligne: Ligne): Cible {
  return {
    cle: ligne.cle,
    nom: ligne.nom,
    metiers: JSON.parse(ligne.metiers),
    communes: JSON.parse(ligne.communes),
    exclure: (JSON.parse(ligne.exclure) as string[]).map((motif) => new RegExp(motif, 'i')),
    constats: JSON.parse(ligne.constats),
    modele: ligne.modele,
  };
}

function insertion(env: Env, cle: string, cible: Omit<Cible, 'cle'>) {
  return env.DB.prepare(
    `INSERT INTO cibles (cle, nom, recherche, metiers, communes, exclure, constats, modele, modifie_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (cle) DO UPDATE SET nom = excluded.nom, recherche = excluded.recherche, metiers = excluded.metiers, communes = excluded.communes,
        exclure = excluded.exclure, constats = excluded.constats, modele = excluded.modele, modifie_le = excluded.modifie_le`,
  ).bind(
    cle,
    cible.nom,
    cible.metiers[0] ?? '',
    JSON.stringify(cible.metiers),
    JSON.stringify(cible.communes),
    JSON.stringify(cible.exclure.map((motif) => motif.source)),
    JSON.stringify(cible.constats),
    cible.modele ?? '',
    new Date().toISOString(),
  );
}

function unir<T>(existants: T[], ajouts: T[], cle: (valeur: T) => string = String) {
  const vus = new Set(existants.map(cle));
  return [...existants, ...ajouts.filter((valeur) => !vus.has(cle(valeur)))];
}

// Charge les cibles. Au premier lancement, ou quand scripts/cibles.mjs a une
// version plus récente, ajoute les cibles, métiers, communes et exclusions
// manquants, sans retirer ce qui a été modifié dans l'admin.
export async function chargerCibles(env: Env): Promise<Record<string, Cible>> {
  const [lignes, version] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM cibles ORDER BY rowid'),
    env.DB.prepare("SELECT valeur FROM etat WHERE cle = 'version_cibles'"),
  ]);
  const cibles = Object.fromEntries((lignes.results as Ligne[]).map((ligne) => [ligne.cle, versCible(ligne)]));
  if (Number((version.results[0] as { valeur: string } | undefined)?.valeur ?? 0) >= VERSION_CIBLES) return cibles;

  const defauts = Object.entries(CIBLES) as [string, Omit<Cible, 'cle'>][];
  for (const [cle, defaut] of defauts) {
    const actuelle = cibles[cle];
    cibles[cle] = actuelle
      ? {
          ...actuelle,
          metiers: unir(actuelle.metiers, defaut.metiers, normaliserTerme),
          communes: unir(actuelle.communes, defaut.communes, normaliserTerme),
          exclure: unir(actuelle.exclure, defaut.exclure, (motif) => motif.source),
        }
      : { cle, ...defaut };
  }
  await env.DB.batch([
    ...defauts.map(([cle]) => insertion(env, cle, cibles[cle])),
    env.DB.prepare("INSERT INTO etat (cle, valeur) VALUES ('version_cibles', ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur").bind(
      String(VERSION_CIBLES),
    ),
  ]);
  // Les cibles par défaut d'abord, dans leur ordre, puis celles créées dans l'admin.
  return Object.fromEntries([...defauts.map(([cle]) => cle), ...Object.keys(cibles)].map((cle) => [cle, cibles[cle]]));
}

// Lien mailto: avec l'email du modèle rempli pour ce prospect.
export function brouillon(cible: Cible | undefined, p: { email: string; nom: string; recherche: string; constat: string; ville: string }) {
  const remplir = (texte: string) =>
    texte.replace(/\{\{(nom|recherche|constat|ville)\}\}/g, (_, champ: 'nom' | 'recherche' | 'constat' | 'ville') => p[champ] ?? '');
  const [objet, ...corps] = remplir(cible?.modele || MODELE_EMAIL).split('\n');
  return `mailto:${p.email}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps.join('\n').trim())}`;
}

// Les recherches « métier commune » d'une cible.
export function termesCible(cible: Pick<Cible, 'metiers' | 'communes'>) {
  return cible.communes.flatMap((commune) => cible.metiers.map((metier) => ({ commune, metier, terme: normaliserTerme(`${metier} ${commune}`) })));
}

export function optionsCibles(cibles: Record<string, Cible>, choisie: string) {
  return Object.values(cibles)
    .map(({ cle, nom }) => `<option value="${echapper(cle)}" ${cle === choisie ? 'selected' : ''}>${echapper(nom)}</option>`)
    .join('');
}

function lignes(texte: unknown) {
  return [...new Set(String(texte ?? '').split('\n').map((ligne) => ligne.trim()).filter(Boolean))];
}

function cleDepuisNom(nom: string) {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function pageCibles(url: URL, env: Env, erreur = '') {
  const cibles = await chargerCibles(env);
  const [parCible, couverts] = await env.DB.batch([
    env.DB.prepare("SELECT cible, COUNT(*) AS n, SUM(statut = 'nouveau') AS prets, SUM(statut = 'client') AS clients FROM prospects GROUP BY cible"),
    env.DB.prepare('SELECT terme FROM termes WHERE lance_le > ?').bind(new Date(Date.now() - DELAI_TERMES_MS).toISOString()),
  ]);
  const chiffres = Object.fromEntries((parCible.results as { cible: string; n: number; prets: number; clients: number }[]).map((c) => [c.cible, c]));
  const faits = new Set((couverts.results as { terme: string }[]).map(({ terme }) => terme));

  const choisie = url.searchParams.get('cle') ?? '';
  const nouvelle = url.searchParams.has('nouvelle');
  const cible: Cible = cibles[choisie] ?? { cle: '', nom: '', metiers: [], communes: [], exclure: [], constats: ['pasDeSite', 'reseauSocial', 'annuaire', 'pasMobile', 'pasHttps', 'vieuxCopyright'] };

  const rangees = Object.values(cibles)
    .map((c) => {
      const termes = termesCible(c);
      const couvertes = termes.filter(({ terme }) => faits.has(terme)).length;
      const n = chiffres[c.cle];
      return `<tr>
        <td><a class="nom" href="/cibles?cle=${encodeURIComponent(c.cle)}">${echapper(c.nom)}</a><div class="discret tronque">${echapper(c.metiers.join(', '))}</div></td>
        <td>${n?.n ?? 0}<div class="discret">${n?.prets ?? 0} prêts · ${n?.clients ?? 0} clients</div></td>
        <td>${barre(couvertes, termes.length, `${couvertes} / ${termes.length} recherches`)}<div class="discret">${c.metiers.length} métiers × ${c.communes.length} communes</div></td>
        <td class="actions-ligne"><a class="btn contour petit" href="/?cible=${encodeURIComponent(c.cle)}">Prospects</a><a class="btn petit" href="/recherches?cible=${encodeURIComponent(c.cle)}">${icone('recherches', 14)}Rechercher</a></td>
      </tr>`;
    })
    .join('');

  const constats = Object.entries(CONSTATS)
    .map(([cle, phrase]) => {
      const rang = cible.constats.indexOf(cle);
      return `<tr>
        <td><input type="number" name="ordre_${cle}" value="${rang >= 0 ? rang + 1 : ''}" min="1" max="99" aria-label="Priorité" class="court"></td>
        <td>« ${echapper(phrase.replace('{annee}', '2019'))} »</td>
      </tr>`;
    })
    .join('');

  const formulaire =
    choisie || nouvelle
      ? `<form method="post" action="/cibles" class="carte" style="margin-top: 16px">
      <div class="carte-entete"><div><h2 class="carte-titre">${choisie ? `Modifier « ${echapper(cible.nom)} »` : 'Nouvelle cible'}</h2>
        <p class="carte-description">Une cible regroupe un métier, ses communes et les constats qui comptent pour lui.</p></div></div>
      <div class="carte-contenu formulaire">
        <input type="hidden" name="cle" value="${echapper(cible.cle)}">
        <div class="champ"><label for="nom">Nom</label><input id="nom" type="text" name="nom" value="${echapper(cible.nom)}" placeholder="Restaurants" required></div>
        <div class="ligne">
          <div class="champ"><label for="metiers">Métiers cherchés sur Google Maps</label><textarea id="metiers" name="metiers" rows="10" placeholder="restaurant&#10;pizzeria" required>${echapper(cible.metiers.join('\n'))}</textarea>
            <span class="aide">Un par ligne. Chaque métier est cherché dans chaque commune.</span></div>
          <div class="champ"><label for="communes">Communes</label><textarea id="communes" name="communes" rows="10">${echapper(cible.communes.join('\n'))}</textarea><span class="aide">Une par ligne.</span></div>
        </div>
        <div class="ligne">
          <div class="champ"><label for="exclure">Mots qui excluent une fiche</label><textarea id="exclure" name="exclure" rows="10" placeholder="franchise">${echapper(cible.exclure.map((motif) => motif.source).join('\n'))}</textarea>
            <span class="aide">Un par ligne, cherché dans le nom et la catégorie Google. Les expressions régulières marchent aussi.</span></div>
          <div></div>
        </div>
        <div class="champ"><label for="modele">Email écrit à la main</label>
          <textarea id="modele" name="modele" rows="11">${echapper(cible.modele || MODELE_EMAIL)}</textarea>
          <span class="aide">Pour les adresses nominatives, qui ne partent pas dans Smartlead. Première ligne : l’objet. {{nom}}, {{recherche}}, {{constat}} et {{ville}} sont remplacés.</span></div>
        <div class="champ"><label>Constats, par priorité</label>
          <span class="aide">Le premier constat vrai pour un site part dans l’email. Laisse vide pour ne pas utiliser un constat.</span>
          <div class="tableau"><table class="compact"><thead><tr><th>Priorité</th><th>Phrase après « j’ai remarqué que »</th></tr></thead><tbody>${constats}</tbody></table></div></div>
        <div><button type="submit" class="btn">Enregistrer</button></div>
      </div>
    </form>`
      : '';

  return page(
    'Cibles',
    `<header class="page-entete">
      <div><h1>Cibles</h1><p>Les métiers que tu prospectes, et ce qu’il reste à couvrir.</p></div>
      <div class="actions-entete"><a href="/cibles?nouvelle" class="btn">${icone('plus')}Nouvelle cible</a></div>
    </header>
    ${erreur ? `<div class="alerte danger"><p>${echapper(erreur)}</p></div>` : ''}
    <div class="carte"><div class="tableau"><table><thead><tr><th>Cible</th><th>Prospects</th><th>Faites ces 6 derniers mois</th><th></th></tr></thead><tbody>${rangees}</tbody></table></div></div>
    ${formulaire}`,
    'cibles',
  );
}

export function barre(valeur: number, max: number, texte: string) {
  const pourcentage = max ? Math.round((valeur / max) * 100) : 0;
  return `<div class="progression"><div class="piste"><i style="width: ${pourcentage}%"></i></div><span class="discret">${texte}</span></div>`;
}

// Le modèle par défaut n'est pas recopié : il suit ainsi ses mises à jour.
function modeleEnvoye(valeur: unknown) {
  const texte = String(valeur ?? '').replace(/\r\n/g, '\n').trim();
  return texte === MODELE_EMAIL ? '' : texte;
}

export async function enregistrerCible(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const nom = String(donnees.get('nom') ?? '').trim();
  const metiers = lignes(donnees.get('metiers'));
  let cle = String(donnees.get('cle') ?? '');
  if (!cle) {
    // Nouvelle cible : une clé tirée du nom, sans écraser une cible existante.
    const existantes = await chargerCibles(env);
    const base = cleDepuisNom(nom) || 'cible';
    cle = base;
    for (let n = 2; cle in existantes; n++) cle = `${base}-${n}`;
  }
  if (!nom || !metiers.length) return pageCibles(new URL(requete.url), env, 'Le nom et le métier sont obligatoires.');

  const exclure: RegExp[] = [];
  for (const motif of lignes(donnees.get('exclure'))) {
    try {
      exclure.push(new RegExp(motif, 'i'));
    } catch {
      return pageCibles(new URL(requete.url), env, `« ${motif} » n’est pas une expression valide.`);
    }
  }
  const constats = Object.keys(CONSTATS)
    .map((constat) => ({ constat, rang: Number(donnees.get(`ordre_${constat}`)) }))
    .filter(({ rang }) => rang > 0)
    .sort((a, b) => a.rang - b.rang)
    .map(({ constat }) => constat);

  await insertion(env, cle, { nom, metiers, communes: lignes(donnees.get('communes')), exclure, constats, modele: modeleEnvoye(donnees.get('modele')) }).run();
  return Response.redirect(new URL(`/cibles?cle=${encodeURIComponent(cle)}`, requete.url).toString(), 303);
}
