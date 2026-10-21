// Les cibles (métier, communes, exclusions, ordre des constats) sont gardées en
// base pour être modifiables dans l'admin. scripts/cibles.mjs donne les valeurs
// de départ, insérées au premier chargement.
import { CIBLES, CONSTATS } from '../scripts/cibles.mjs';
import { echapper, icone, page } from './html';

export type Cible = {
  cle: string;
  nom: string;
  recherche: string;
  communes: string[];
  exclure: RegExp[];
  constats: string[];
};

type Ligne = { cle: string; nom: string; recherche: string; communes: string; exclure: string; constats: string };

// Une recherche déjà faite depuis moins de 6 mois n'est pas relancée.
export const DELAI_TERMES_MS = 183 * 24 * 60 * 60 * 1000;

export function normaliserTerme(terme: string) {
  return terme.toLowerCase().replace(/\s+/g, ' ').trim();
}

function versCible(ligne: Ligne): Cible {
  return {
    cle: ligne.cle,
    nom: ligne.nom,
    recherche: ligne.recherche,
    communes: JSON.parse(ligne.communes),
    exclure: (JSON.parse(ligne.exclure) as string[]).map((motif) => new RegExp(motif, 'i')),
    constats: JSON.parse(ligne.constats),
  };
}

function insertion(env: Env, cle: string, cible: Omit<Cible, 'cle'>) {
  return env.DB.prepare(
    `INSERT INTO cibles (cle, nom, recherche, communes, exclure, constats, modifie_le) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (cle) DO UPDATE SET nom = excluded.nom, recherche = excluded.recherche, communes = excluded.communes,
        exclure = excluded.exclure, constats = excluded.constats, modifie_le = excluded.modifie_le`,
  ).bind(
    cle,
    cible.nom,
    cible.recherche,
    JSON.stringify(cible.communes),
    JSON.stringify(cible.exclure.map((motif) => motif.source)),
    JSON.stringify(cible.constats),
    new Date().toISOString(),
  );
}

export async function chargerCibles(env: Env): Promise<Record<string, Cible>> {
  const { results } = await env.DB.prepare('SELECT * FROM cibles ORDER BY rowid').all<Ligne>();
  if (results.length) return Object.fromEntries(results.map((ligne) => [ligne.cle, versCible(ligne)]));
  const defauts = Object.entries(CIBLES) as [string, Omit<Cible, 'cle'>][];
  await env.DB.batch(defauts.map(([cle, cible]) => insertion(env, cle, cible)));
  return Object.fromEntries(defauts.map(([cle, cible]) => [cle, { cle, ...cible }]));
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
  const cible: Cible = cibles[choisie] ?? { cle: '', nom: '', recherche: '', communes: [], exclure: [], constats: ['pasDeSite', 'reseauSocial', 'annuaire', 'pasMobile', 'pasHttps', 'vieuxCopyright'] };

  const rangees = Object.values(cibles)
    .map((c) => {
      const couvertes = c.communes.filter((commune) => faits.has(normaliserTerme(`${c.recherche} ${commune}`))).length;
      const n = chiffres[c.cle];
      return `<tr>
        <td><a class="nom" href="/cibles?cle=${encodeURIComponent(c.cle)}">${echapper(c.nom)}</a><div class="discret">${echapper(c.recherche)}</div></td>
        <td>${n?.n ?? 0}<div class="discret">${n?.prets ?? 0} prêts · ${n?.clients ?? 0} clients</div></td>
        <td>${barre(couvertes, c.communes.length, `${couvertes} / ${c.communes.length} communes`)}</td>
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
        <div class="ligne">
          <div class="champ"><label for="nom">Nom</label><input id="nom" type="text" name="nom" value="${echapper(cible.nom)}" placeholder="Restaurants" required></div>
          <div class="champ"><label for="recherche">Métier recherché sur Google Maps</label><input id="recherche" type="text" name="recherche" value="${echapper(cible.recherche)}" placeholder="restaurant" required></div>
        </div>
        <div class="ligne">
          <div class="champ"><label for="communes">Communes</label><textarea id="communes" name="communes" rows="10">${echapper(cible.communes.join('\n'))}</textarea><span class="aide">Une par ligne.</span></div>
          <div class="champ"><label for="exclure">Mots qui excluent une fiche</label><textarea id="exclure" name="exclure" rows="10" placeholder="franchise">${echapper(cible.exclure.map((motif) => motif.source).join('\n'))}</textarea>
            <span class="aide">Un par ligne, cherché dans le nom et la catégorie Google. Les expressions régulières marchent aussi.</span></div>
        </div>
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
    <div class="carte"><div class="tableau"><table><thead><tr><th>Cible</th><th>Prospects</th><th>Couverture (6 derniers mois)</th><th></th></tr></thead><tbody>${rangees}</tbody></table></div></div>
    ${formulaire}`,
    'cibles',
  );
}

export function barre(valeur: number, max: number, texte: string) {
  const pourcentage = max ? Math.round((valeur / max) * 100) : 0;
  return `<div class="progression"><div class="piste"><i style="width: ${pourcentage}%"></i></div><span class="discret">${texte}</span></div>`;
}

export async function enregistrerCible(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const nom = String(donnees.get('nom') ?? '').trim();
  const recherche = String(donnees.get('recherche') ?? '').trim();
  let cle = String(donnees.get('cle') ?? '');
  if (!cle) {
    // Nouvelle cible : une clé tirée du nom, sans écraser une cible existante.
    const existantes = await chargerCibles(env);
    const base = cleDepuisNom(nom) || 'cible';
    cle = base;
    for (let n = 2; cle in existantes; n++) cle = `${base}-${n}`;
  }
  if (!nom || !recherche) return pageCibles(new URL(requete.url), env, 'Le nom et le métier sont obligatoires.');

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

  await insertion(env, cle, { nom, recherche, communes: lignes(donnees.get('communes')), exclure, constats }).run();
  return Response.redirect(new URL(`/cibles?cle=${encodeURIComponent(cle)}`, requete.url).toString(), 303);
}
