import { utilisateur } from './access';
import { brouillon, chargerCibles, enregistrerCible, optionsCibles, pageCibles } from './cibles';
import { echapper, icone, page } from './html';
import { lancerRecherche, pageRecherches } from './recherches';
import { tache } from './taches';

export const STATUTS: Record<string, string> = {
  a_analyser: 'En analyse',
  nouveau: 'Prêt à contacter',
  a_ecrire: 'À écrire',
  a_appeler: 'À appeler',
  a_verifier: 'À vérifier',
  plus_tard: 'Plus tard',
  hors_cible: 'Hors cible',
  en_campagne: 'En campagne',
  a_repondu: 'A répondu',
  maquette: 'Maquette envoyée',
  client: 'Client',
  pas_interesse: 'Pas intéressé',
  desinscrit: 'Désinscrit',
};

const NATURES: Record<string, string> = {
  generique: 'adresse générique',
  entreprise: 'adresse au nom de l’entreprise',
  nominative: 'adresse nominative',
  autre_domaine: 'adresse sur un autre domaine',
};

const PAR_PAGE = 100;
const TROIS_ANS_MS = 3 * 365 * 24 * 60 * 60 * 1000;
// Statuts qu'on efface au bout de 3 ans sans nouvelle (recommandation CNIL pour la prospection).
const PURGEABLES = ['a_analyser', 'nouveau', 'a_verifier', 'a_ecrire', 'a_appeler', 'plus_tard', 'hors_cible', 'en_campagne', 'pas_interesse'];

type Prospect = {
  id: string;
  cible: string;
  nom: string;
  categorie: string;
  ville: string;
  adresse: string;
  telephone: string;
  site: string;
  fiche_google: string;
  note_google: number | null;
  avis_google: number | null;
  recherche: string;
  email: string;
  email_statut: string;
  constat_cle: string;
  constat: string;
  signaux: string;
  raison: string;
  statut: string;
  note: string;
  cree_le: string;
  vu_le: string;
  statut_le: string;
  contacte_le: string | null;
};

type Filtres = { cible: string; statut: string; ville: string; categorie: string; raison: string; q: string };

// Statuts que « Réanalyser » renvoie en analyse.
const REANALYSABLES = ['a_verifier', 'a_ecrire', 'a_appeler', 'plus_tard'];

function lireFiltres(url: URL): Filtres {
  return {
    cible: url.searchParams.get('cible') ?? '',
    statut: url.searchParams.get('statut') ?? '',
    ville: url.searchParams.get('ville') ?? '',
    categorie: url.searchParams.get('categorie') ?? '',
    raison: url.searchParams.get('raison') ?? '',
    q: url.searchParams.get('q') ?? '',
  };
}

function clauses(filtres: Filtres, sansStatut = false) {
  const conditions: string[] = [];
  const valeurs: string[] = [];
  if (filtres.cible) {
    conditions.push('cible = ?');
    valeurs.push(filtres.cible);
  }
  if (filtres.statut && !sansStatut) {
    conditions.push('statut = ?');
    valeurs.push(filtres.statut);
  }
  if (filtres.ville) {
    conditions.push('ville = ?');
    valeurs.push(filtres.ville);
  }
  if (filtres.categorie) {
    conditions.push('categorie = ?');
    valeurs.push(filtres.categorie);
  }
  if (filtres.raison && !sansStatut) {
    conditions.push('raison = ?');
    valeurs.push(filtres.raison);
  }
  if (filtres.q) {
    conditions.push('(nom LIKE ? OR email LIKE ? OR site LIKE ? OR note LIKE ?)');
    const motif = `%${filtres.q}%`;
    valeurs.push(motif, motif, motif, motif);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', valeurs };
}

function lienFiltres(filtres: Partial<Filtres>, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries({ ...filtres, ...extra })) if (valeur) params.set(cle, valeur);
  const texte = params.toString();
  return texte ? `/?${texte}` : '/';
}

function badge(statut: string) {
  return `<span class="badge badge-${echapper(statut)}">${echapper(STATUTS[statut] ?? statut)}</span>`;
}

function date(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

// Colonne email : bouton « Écrire » pour une adresse nominative, téléphone à défaut d'email.
function contact(p: Prospect, cibles: Awaited<ReturnType<typeof chargerCibles>>) {
  if (p.statut === 'a_ecrire' && p.email) {
    return `<a class="btn contour petit" href="${echapper(brouillon(cibles[p.cible], p))}" onclick="fetch('/p/${encodeURIComponent(p.id)}/ecrit', { method: 'POST', keepalive: true })">${icone('email', 14)}Écrire</a><div class="discret">${echapper(p.email)}</div>`;
  }
  if (p.email) return echapper(p.email);
  if (p.telephone) return `<a class="avec-icone" href="tel:${echapper(p.telephone)}">${icone('telephone', 14)}${echapper(p.telephone)}</a>`;
  return '<span class="discret">aucun</span>';
}

async function liste(url: URL, env: Env) {
  const filtres = lireFiltres(url);
  const numero = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const { where, valeurs } = clauses(filtres);
  const sansStatut = clauses(filtres, true);

  const cibles = await chargerCibles(env);
  const parCible = filtres.cible ? 'WHERE cible = ?' : '';
  const sansRaison = clauses({ ...filtres, raison: '' });
  const [lignes, total, parStatut, villes, categories, parRaison, aPurger, travail] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM prospects ${where} ORDER BY vu_le DESC, nom LIMIT ? OFFSET ?`).bind(...valeurs, PAR_PAGE, (numero - 1) * PAR_PAGE),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM prospects ${where}`).bind(...valeurs),
    env.DB.prepare(`SELECT statut, COUNT(*) AS n FROM prospects ${sansStatut.where} GROUP BY statut`).bind(...sansStatut.valeurs),
    env.DB.prepare(`SELECT ville, COUNT(*) AS n FROM prospects ${filtres.cible ? 'WHERE cible = ?' : ''} GROUP BY ville ORDER BY ville`).bind(...(filtres.cible ? [filtres.cible] : [])),
    env.DB.prepare(`SELECT categorie, COUNT(*) AS n FROM prospects ${parCible} GROUP BY categorie ORDER BY n DESC LIMIT 80`).bind(...(filtres.cible ? [filtres.cible] : [])),
    env.DB.prepare(`SELECT raison, COUNT(*) AS n FROM prospects ${sansRaison.where} GROUP BY raison ORDER BY n DESC LIMIT 20`).bind(...sansRaison.valeurs),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM prospects WHERE statut IN (${PURGEABLES.map(() => '?').join(', ')}) AND statut_le < ? AND vu_le < ?`,
    ).bind(...PURGEABLES, new Date(Date.now() - TROIS_ANS_MS).toISOString(), new Date(Date.now() - TROIS_ANS_MS).toISOString()),
    env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM recherches WHERE statut IN ('en_cours', 'import')) AS recherches, (SELECT COUNT(*) FROM prospects WHERE statut = 'a_analyser') AS analyses",
    ),
  ]);
  const enCours = travail.results[0] as { recherches: number; analyses: number };

  const prospects = lignes.results as Prospect[];
  const nombre = (total.results[0] as { n: number }).n;
  const compteStatuts = Object.fromEntries((parStatut.results as { statut: string; n: number }[]).map(({ statut, n }) => [statut, n]));
  const toutStatut = Object.values(compteStatuts).reduce((somme, n) => somme + n, 0);
  const purge = (aPurger.results[0] as { n: number }).n;

  const onglets = [
    `<a href="${lienFiltres({ ...filtres, statut: '' })}" class="${filtres.statut ? '' : 'actif'}">Tous <em>${toutStatut}</em></a>`,
    ...Object.entries(STATUTS)
      .filter(([statut]) => compteStatuts[statut] || filtres.statut === statut)
      .map(
        ([statut, libelle]) =>
          `<a href="${lienFiltres({ ...filtres, statut })}" class="${filtres.statut === statut ? 'actif' : ''}">${libelle} <em>${compteStatuts[statut] ?? 0}</em></a>`,
      ),
  ].join('');

  const raisons = (parRaison.results as { raison: string; n: number }[]).filter(({ raison }) => raison);
  const motifs =
    filtres.statut && raisons.length > 1
      ? `<nav class="motifs">${[
          `<a href="${lienFiltres({ ...filtres, raison: '' })}" class="${filtres.raison ? '' : 'actif'}">Toutes les raisons</a>`,
          ...raisons.map(
            ({ raison, n }) =>
              `<a href="${lienFiltres({ ...filtres, raison })}" class="${filtres.raison === raison ? 'actif' : ''}">${echapper(raison.split(' : ')[0])}<em>${n}</em></a>`,
          ),
        ].join('')}</nav>`
      : '';
  const reanalysable = REANALYSABLES.includes(filtres.statut) && nombre > 0;

  const stat = (statut: string, libelle: string) =>
    `<a class="carte stat" href="${lienFiltres({ ...filtres, statut })}"><span>${libelle}</span><strong>${compteStatuts[statut] ?? 0}</strong></a>`;

  const optionsCategories = (categories.results as { categorie: string; n: number }[])
    .filter(({ categorie }) => categorie)
    .map(({ categorie, n }) => `<option value="${echapper(categorie)}" ${filtres.categorie === categorie ? 'selected' : ''}>${echapper(categorie)} (${n})</option>`)
    .join('');
  const optionsVilles = (villes.results as { ville: string; n: number }[])
    .filter(({ ville }) => ville)
    .map(({ ville, n }) => `<option value="${echapper(ville)}" ${filtres.ville === ville ? 'selected' : ''}>${echapper(ville)} (${n})</option>`)
    .join('');

  const rangees = prospects
    .map(
      (p) => `<tr>
        <td><a href="/p/${encodeURIComponent(p.id)}" class="nom">${echapper(p.nom)}</a><div class="discret">${[cibles[p.cible]?.nom ?? p.cible, p.categorie, p.ville].filter(Boolean).map(echapper).join(' · ')}</div></td>
        <td>${badge(p.statut)}</td>
        <td class="tronque">${
          p.raison && ['a_verifier', 'a_ecrire', 'a_appeler'].includes(p.statut)
            ? `${echapper(p.raison.split(' : ')[0])}${p.constat ? `<div class="discret">${echapper(p.constat)}</div>` : ''}`
            : echapper(p.constat || p.raison)
        }</td>
        <td>${contact(p, cibles)}</td>
        <td>${p.site ? `<a href="${echapper(p.site)}" target="_blank" rel="noreferrer" class="lien-site">${echapper(p.site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}${icone('externe', 12)}</a>` : '<span class="discret">aucun</span>'}</td>
        <td class="discret">${date(p.vu_le)}</td>
      </tr>`,
    )
    .join('');

  const pages = Math.ceil(nombre / PAR_PAGE);
  const pagination =
    pages > 1
      ? `<nav class="pagination"><span>Page ${numero} sur ${pages} · ${nombre} prospects</span><span class="actions-entete">${numero > 1 ? `<a class="btn contour petit" href="${lienFiltres(filtres, { page: String(numero - 1) })}">Précédents</a>` : ''}${numero < pages ? `<a class="btn contour petit" href="${lienFiltres(filtres, { page: String(numero + 1) })}">Suivants</a>` : ''}</span></nav>`
      : '';

  const exportable = filtres.statut === 'nouveau' && nombre > 0;
  const champsCaches = Object.entries(filtres)
    .map(([cle, valeur]) => `<input type="hidden" name="${cle}" value="${echapper(valeur)}">`)
    .join('');

  return page(
    'Prospects',
    `<header class="page-entete">
      <div><h1>Prospects</h1><p>Tous les établissements trouvés, avec leur constat et leur statut.</p></div>
      <div class="actions-entete"><a href="/recherches" class="btn">${icone('plus')}Nouvelle recherche</a></div>
    </header>
    ${purge ? `<form class="alerte attention" method="post" action="/purger" onsubmit="return confirm('Effacer définitivement ${purge} prospects ?')"><p>${purge} prospects n’ont pas bougé depuis 3 ans. La CNIL recommande de les effacer.</p><button type="submit" class="btn contour petit">${icone('poubelle', 14)}Effacer</button></form>` : ''}
    ${
      enCours.recherches || enCours.analyses
        ? `<div class="alerte"><span class="voyant"></span><p>${enCours.recherches ? `${enCours.recherches} recherche${enCours.recherches > 1 ? 's' : ''} en cours. ` : ''}${enCours.analyses ? `${enCours.analyses} sites en attente d’analyse.` : ''}</p><a class="btn contour petit" href="/recherches">${icone('activite', 14)}Voir l’avancement</a></div>`
        : ''
    }
    <section class="stats">
      ${stat('nouveau', 'Prêts pour Smartlead')}${stat('a_ecrire', 'À écrire à la main')}${stat('a_appeler', 'À appeler')}${stat('a_verifier', 'À vérifier')}${stat('en_campagne', 'En campagne')}
    </section>
    <form class="outils" method="get" action="/">
      <select name="cible" onchange="this.form.submit()"><option value="">Toutes les cibles</option>${optionsCibles(cibles, filtres.cible)}</select>
      <select name="categorie" onchange="this.form.submit()"><option value="">Toutes les catégories</option>${optionsCategories}</select>
      <select name="ville" onchange="this.form.submit()"><option value="">Toutes les communes</option>${optionsVilles}</select>
      <input type="hidden" name="statut" value="${echapper(filtres.statut)}">
      <input type="search" name="q" value="${echapper(filtres.q)}" placeholder="Chercher un nom, un email, un site, une note…">
      <button type="submit" class="btn contour">${icone('recherches')}Chercher</button>
    </form>
    <nav class="onglets">${onglets}</nav>
    ${motifs}
    ${
      reanalysable
        ? `<form class="alerte" method="post" action="/reanalyser">${champsCaches}
            <p>${filtres.statut === 'a_ecrire' ? 'Le bouton « Écrire » ouvre l’email prérempli et passe la fiche en « En campagne ». ' : ''}${filtres.statut === 'a_appeler' ? 'Pas d’email trouvé, mais un numéro : clique dessus pour appeler. ' : ''}Si les règles d’analyse ont changé, tu peux repasser ces ${nombre} fiches à l’analyse.</p>
            <button type="submit" class="btn contour petit">${icone('activite', 14)}Réanalyser</button>
          </form>`
        : ''
    }
    ${
      exportable
        ? `<form class="alerte succes" method="post" action="/export">${champsCaches}
            <p><strong>${nombre} prospects prêts.</strong> L’export ne prend que les adresses génériques, sans les désinscrits.</p>
            <label class="case"><input type="checkbox" name="marquer" value="1" checked><span>Les passer en « En campagne »</span></label>
            <button type="submit" class="btn">${icone('telecharger')}Exporter pour Smartlead</button>
          </form>`
        : ''
    }
    <div class="carte">
    ${
      prospects.length
        ? `<div class="tableau"><table><thead><tr><th>Établissement</th><th>Statut</th><th>Constat ou raison</th><th>Contact</th><th>Site</th><th>Vu le</th></tr></thead><tbody>${rangees}</tbody></table></div>`
        : '<div class="vide"><strong>Aucun prospect ici</strong>Lance une <a href="/recherches">nouvelle recherche</a> pour remplir la base.</div>'
    }
    ${pagination}
    </div>`,
  );
}

async function fiche(id: string, env: Env, enregistre: boolean) {
  const [p, cibles] = await Promise.all([env.DB.prepare('SELECT * FROM prospects WHERE id = ?').bind(id).first<Prospect>(), chargerCibles(env)]);
  if (!p) return new Response('Prospect introuvable', { status: 404 });
  const signaux = Object.entries(JSON.parse(p.signaux || '{}') as Record<string, unknown>)
    .filter(([, valeur]) => valeur)
    .map(([cle, valeur]) => `<li>${echapper(cle)}${typeof valeur === 'number' ? ` ${valeur}` : ''}</li>`)
    .join('');
  const boutons = Object.entries(STATUTS)
    .map(([statut, libelle]) => `<button type="submit" name="statut" value="${statut}" class="${p.statut === statut ? 'actif' : ''}">${libelle}</button>`)
    .join('');
  const ligne = (libelle: string, valeur: string) => (valeur ? `<dt>${libelle}</dt><dd>${valeur}</dd>` : '');
  const lienExterne = (href: string, texte: string) =>
    `<a href="${echapper(href)}" target="_blank" rel="noreferrer" class="avec-icone">${echapper(texte)}${icone('externe', 12)}</a>`;

  return page(
    p.nom,
    `<a class="retour" href="/?cible=${encodeURIComponent(p.cible)}">${icone('retour')}Prospects</a>
    <header class="page-entete">
      <div><h1>${echapper(p.nom)}</h1><p class="avec-icone">${icone('lieu', 14)}${echapper(p.adresse || p.ville)} · ${echapper(cibles[p.cible]?.nom ?? p.cible)}</p></div>
      ${badge(p.statut)}
    </header>
    ${enregistre ? `<div class="alerte succes"><p>Enregistré.</p></div>` : ''}
    <div class="grille deux-colonnes">
      <div class="grille">
        ${
          p.constat || p.raison
            ? `<section class="carte"><div class="carte-entete"><div><h2 class="carte-titre">${p.constat ? 'Constat pour l’email' : 'À regarder'}</h2><p class="carte-description">${p.constat ? 'La phrase qui suit « j’ai remarqué que » dans l’email 1.' : 'Pourquoi cette fiche n’est pas prête.'}</p></div></div>
                <div class="carte-contenu"><p class="constat">${echapper(p.constat || p.raison)}</p></div></section>`
            : ''
        }
        <section class="carte"><div class="carte-entete"><h2 class="carte-titre">Coordonnées</h2></div>
          <div class="carte-contenu"><dl>
            ${ligne('Email', p.email ? `${p.statut === 'a_ecrire' ? contact(p, cibles) : `<span class="avec-icone">${icone('email', 14)}${echapper(p.email)}</span>`} <span class="discret">${echapper(NATURES[p.email_statut] ?? p.email_statut)}</span>` : '<span class="discret">aucun</span>')}
            ${ligne('Téléphone', p.telephone ? `<a class="avec-icone" href="tel:${echapper(p.telephone)}">${icone('telephone', 14)}${echapper(p.telephone)}</a>` : '')}
            ${ligne('Site', p.site ? lienExterne(p.site, p.site.replace(/^https?:\/\//, '')) : '<span class="discret">aucun</span>')}
            ${ligne('Fiche Google', p.fiche_google ? `${lienExterne(p.fiche_google, 'Ouvrir')}${p.note_google ? ` <span class="discret">· ${p.note_google} ★ (${p.avis_google ?? 0} avis)</span>` : ''}` : '')}
            ${ligne('Catégorie', echapper(p.categorie))}
            ${ligne('Recherche', echapper(p.recherche))}
          </dl></div></section>
        <section class="carte"><div class="carte-entete"><h2 class="carte-titre">Analyse du site</h2></div>
          <div class="carte-contenu"><dl>
            ${ligne('Signaux', signaux ? `<ul class="puces">${signaux}</ul>` : '<span class="discret">aucun</span>')}
            ${ligne('Ajouté le', date(p.cree_le))}
            ${ligne('Vu le', date(p.vu_le))}
            ${ligne('Statut depuis le', date(p.statut_le))}
            ${ligne('Contacté le', date(p.contacte_le))}
          </dl></div></section>
      </div>
      <form method="post" action="/p/${encodeURIComponent(p.id)}" class="carte">
        <div class="carte-entete"><div><h2 class="carte-titre">Suivi</h2><p class="carte-description">Un clic change le statut.</p></div></div>
        <div class="carte-contenu formulaire">
          <div class="statuts">${boutons}</div>
          <div class="champ"><label for="note">Note</label>
            <textarea id="note" name="note" rows="7" placeholder="Appel, réponse, idée de maquette…">${echapper(p.note)}</textarea></div>
          <div><button type="submit" name="statut" value="${echapper(p.statut)}" class="btn">Enregistrer la note</button></div>
        </div>
      </form>
    </div>`,
  );
}

async function modifier(id: string, requete: Request, env: Env) {
  const donnees = await requete.formData();
  const statut = String(donnees.get('statut') ?? '');
  const note = donnees.get('note');
  if (!(statut in STATUTS)) return new Response('Statut inconnu', { status: 400 });
  const maintenant = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE prospects SET
      statut_le = CASE WHEN statut <> ?1 THEN ?2 ELSE statut_le END,
      contacte_le = CASE WHEN ?1 = 'en_campagne' AND contacte_le IS NULL THEN ?2 ELSE contacte_le END,
      statut = ?1,
      note = COALESCE(?3, note)
    WHERE id = ?4`,
  )
    .bind(statut, maintenant, note == null ? null : String(note), id)
    .run();
  return Response.redirect(new URL(`/p/${encodeURIComponent(id)}?ok=1`, requete.url).toString(), 303);
}

const COLONNES_SMARTLEAD = ['email', 'first_name', 'company_name', 'salutation', 'recherche', 'constat', 'source', 'site', 'telephone', 'ville'];

function csv(lignes: Record<string, unknown>[]) {
  const champ = (valeur: unknown) => {
    const texte = String(valeur ?? '');
    return /[",\n;]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
  };
  return [COLONNES_SMARTLEAD.join(','), ...lignes.map((ligne) => COLONNES_SMARTLEAD.map((colonne) => champ(ligne[colonne])).join(','))].join('\n') + '\n';
}

async function exporter(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const filtres: Filtres = {
    cible: String(donnees.get('cible') ?? ''),
    statut: 'nouveau',
    ville: String(donnees.get('ville') ?? ''),
    categorie: String(donnees.get('categorie') ?? ''),
    raison: '',
    q: String(donnees.get('q') ?? ''),
  };
  const { where, valeurs } = clauses(filtres);
  // Une adresse désinscrite ne repart jamais, même si elle apparaît sur une autre fiche.
  const selection = `${where} AND email_statut IN ('generique', 'entreprise') AND email <> ''
    AND email NOT IN (SELECT email FROM prospects WHERE statut = 'desinscrit' AND email <> '')`;
  const { results } = await env.DB.prepare(`SELECT * FROM prospects ${selection} ORDER BY vu_le DESC`)
    .bind(...valeurs)
    .all<Prospect>();

  if (donnees.get('marquer') && results.length) {
    const maintenant = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE prospects SET statut = 'en_campagne', statut_le = ?, contacte_le = COALESCE(contacte_le, ?) ${selection}`,
    )
      .bind(maintenant, maintenant, ...valeurs)
      .run();
  }

  const corps = csv(
    results.map((p) => ({
      email: p.email,
      first_name: '',
      company_name: p.nom,
      salutation: 'Bonjour,',
      recherche: p.recherche,
      constat: p.constat,
      source: 'votre fiche Google',
      site: p.site,
      telephone: p.telephone,
      ville: p.ville,
    })),
  );
  const nom = `smartlead-${filtres.cible || 'tout'}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(corps, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${nom}"` },
  });
}

async function reanalyser(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const filtres = Object.fromEntries(['cible', 'statut', 'ville', 'categorie', 'raison', 'q'].map((cle) => [cle, String(donnees.get(cle) ?? '')])) as Filtres;
  if (!REANALYSABLES.includes(filtres.statut)) return new Response('Statut non réanalysable', { status: 400 });
  const { where, valeurs } = clauses(filtres);
  await env.DB.prepare(`UPDATE prospects SET statut = 'a_analyser' ${where}`).bind(...valeurs).run();
  return Response.redirect(new URL('/recherches', requete.url).toString(), 303);
}

async function purger(requete: Request, env: Env) {
  const limite = new Date(Date.now() - TROIS_ANS_MS).toISOString();
  await env.DB.prepare(`DELETE FROM prospects WHERE statut IN (${PURGEABLES.map(() => '?').join(', ')}) AND statut_le < ? AND vu_le < ?`)
    .bind(...PURGEABLES, limite, limite)
    .run();
  return Response.redirect(new URL('/', requete.url).toString(), 303);
}

export default {
  async fetch(requete, env): Promise<Response> {
    if (!(await utilisateur(requete, env))) return new Response('Accès refusé', { status: 403 });

    const url = new URL(requete.url);
    if (requete.method === 'POST') {
      // Les formulaires ne sont acceptés que depuis l'admin elle-même.
      const origine = requete.headers.get('origin');
      if (origine && origine !== url.origin) return new Response('Origine refusée', { status: 403 });
    }

    const ecrit = url.pathname.match(/^\/p\/(.+)\/ecrit$/);
    if (ecrit && requete.method === 'POST') {
      const maintenant = new Date().toISOString();
      await env.DB.prepare(
        "UPDATE prospects SET statut = 'en_campagne', statut_le = ?, contacte_le = COALESCE(contacte_le, ?) WHERE id = ? AND statut = 'a_ecrire'",
      )
        .bind(maintenant, maintenant, decodeURIComponent(ecrit[1]))
        .run();
      return new Response(null, { status: 204 });
    }
    const fichePath = url.pathname.match(/^\/p\/(.+)$/);
    if (fichePath) {
      const id = decodeURIComponent(fichePath[1]);
      if (requete.method === 'POST') return modifier(id, requete, env);
      return fiche(id, env, url.searchParams.has('ok'));
    }
    if (url.pathname === '/' && requete.method === 'GET') return liste(url, env);
    if (url.pathname === '/recherches' && requete.method === 'GET') return pageRecherches(url, env);
    if (url.pathname === '/recherches' && requete.method === 'POST') return lancerRecherche(requete, env);
    if (url.pathname === '/cibles' && requete.method === 'GET') return pageCibles(url, env);
    if (url.pathname === '/cibles' && requete.method === 'POST') return enregistrerCible(requete, env);
    if (url.pathname === '/export' && requete.method === 'POST') return exporter(requete, env);
    if (url.pathname === '/reanalyser' && requete.method === 'POST') return reanalyser(requete, env);
    if (url.pathname === '/purger' && requete.method === 'POST') return purger(requete, env);
    return new Response('Page introuvable', { status: 404 });
  },

  async scheduled(_evenement, env) {
    await tache(env);
  },
} satisfies ExportedHandler<Env>;
