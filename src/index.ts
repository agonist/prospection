import { utilisateur } from './access';
import { chargerCibles, enregistrerCible, optionsCibles, pageCibles } from './cibles';
import {
  NATURES,
  PAR_PAGE,
  PURGEABLES,
  REANALYSABLES,
  STATUTS,
  TROIS_ANS_MS,
  type Filtres,
  type Prospect,
  SCORE,
  TRAITABLES,
  badge,
  changerStatut,
  clauses,
  priorite,
  verdict,
  avisDetaille,
  contact,
  date,
  lienFiltres,
  lireFiltres,
} from './prospects';
import { echapper, icone, page } from './html';
import { lancerRecherche, pageRecherches } from './recherches';
import { tache } from './taches';
import { pageTraiter, traiter } from './traiter';

async function liste(url: URL, env: Env) {
  const filtres = lireFiltres(url);
  const numero = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const { where, valeurs } = clauses(filtres);
  const sansStatut = clauses(filtres, true);

  const cibles = await chargerCibles(env);
  // Les files à traiter se lisent par priorité, le reste du plus récent au plus ancien.
  const parPriorite = filtres.tri ? filtres.tri === 'priorite' : TRAITABLES.includes(filtres.statut);
  const parCible = filtres.cible ? 'WHERE cible = ?' : '';
  const sansRaison = clauses({ ...filtres, raison: '' });
  const [lignes, total, parStatut, villes, categories, parRaison, aPurger, travail] = await env.DB.batch([
    env.DB.prepare(`SELECT *, ${SCORE} AS score FROM prospects ${where} ORDER BY ${parPriorite ? 'score DESC, ' : ''}vu_le DESC, nom LIMIT ? OFFSET ?`).bind(...valeurs, PAR_PAGE, (numero - 1) * PAR_PAGE),
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
        <td class="case-ligne"><input type="checkbox" name="ids" value="${echapper(p.id)}" form="lot" aria-label="Choisir ${echapper(p.nom)}"></td>
        <td><a href="/p/${encodeURIComponent(p.id)}" class="nom">${echapper(p.nom)}</a><div class="discret">${[cibles[p.cible]?.nom ?? p.cible, p.categorie, p.ville].filter(Boolean).map(echapper).join(' · ')}</div></td>
        <td>${badge(p.statut)}</td>
        <td>${priorite(p.score)}</td>
        <td class="tronque">${
          p.raison && ['a_verifier', 'a_ecrire', 'a_appeler'].includes(p.statut)
            ? `${echapper(p.raison.split(' : ')[0])}${p.constat ? `<div class="discret">${echapper(p.constat)}</div>` : ''}`
            : echapper(p.constat || p.raison)
        }${p.verdict ? `<div>${verdict(p)}</div>` : ''}</td>
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
      <div class="actions-entete">${
        TRAITABLES.includes(filtres.statut) && nombre
          ? `<a href="/traiter${lienFiltres(filtres).slice(1)}" class="btn">${icone('jouer')}Traiter ces ${nombre} fiches</a><a href="/recherches" class="btn contour">${icone('plus')}Nouvelle recherche</a>`
          : `<a href="/recherches" class="btn">${icone('plus')}Nouvelle recherche</a>`
      }</div>
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
      <select name="tri" onchange="this.form.submit()"><option value="priorite" ${parPriorite ? 'selected' : ''}>Par priorité</option><option value="recent" ${parPriorite ? '' : 'selected'}>Plus récents</option></select>
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
        ? `<form id="lot" method="post" action="/lot" class="barre-lot">
            <input type="hidden" name="retour" value="${echapper(lienFiltres(filtres, numero > 1 ? { page: String(numero) } : {}))}">
            <span class="discret" id="compte-lot">Coche des fiches pour changer leur statut d’un coup.</span>
            <select name="statut" required><option value="">Passer en…</option>${Object.entries(STATUTS)
              .filter(([statut]) => statut !== 'a_analyser')
              .map(([statut, libelle]) => `<option value="${statut}">${libelle}</option>`)
              .join('')}</select>
            <button type="submit" class="btn contour petit">Appliquer</button>
          </form>
          <script>
            function majLot() {
              const n = document.querySelectorAll('input[name=ids]:checked').length;
              document.getElementById('compte-lot').textContent = n ? n + (n > 1 ? ' fiches choisies' : ' fiche choisie') : 'Coche des fiches pour changer leur statut d’un coup.';
            }
            document.addEventListener('change', (e) => e.target.name === 'ids' && majLot());
          </script>`
        : ''
    }
    ${
      prospects.length
        ? `<div class="tableau"><table><thead><tr><th class="case-ligne"><input type="checkbox" aria-label="Tout choisir" onclick="document.querySelectorAll('input[name=ids]').forEach((c) => (c.checked = this.checked)); majLot()"></th><th>Établissement</th><th>Statut</th><th>Priorité</th><th>Constat ou raison</th><th>Contact</th><th>Site</th><th>Vu le</th></tr></thead><tbody>${rangees}</tbody></table></div>`
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
        ${
          p.verdict
            ? `<section class="carte"><div class="carte-entete"><div><h2 class="carte-titre">Avis de Claude sur le site</h2><p class="carte-description">D’après le texte et la structure de la page d’accueil.</p></div></div>
                <div class="carte-contenu">${avisDetaille(p)}</div></section>`
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
  await changerStatut(env, id, statut, note == null ? null : String(note)).run();
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
    tri: '',
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

async function lot(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const statut = String(donnees.get('statut') ?? '');
  const ids = donnees.getAll('ids').map(String).slice(0, 100);
  if (!(statut in STATUTS) || statut === 'a_analyser') return new Response('Statut inconnu', { status: 400 });
  if (ids.length) await env.DB.batch(ids.map((id) => changerStatut(env, id, statut, null)));
  const retour = String(donnees.get('retour') ?? '/');
  return Response.redirect(new URL(retour.startsWith('/') && !retour.startsWith('//') ? retour : '/', requete.url).toString(), 303);
}

async function reanalyser(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const filtres = Object.fromEntries(['cible', 'statut', 'ville', 'categorie', 'raison', 'q', 'tri'].map((cle) => [cle, String(donnees.get(cle) ?? '')])) as Filtres;
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
    if (url.pathname === '/lot' && requete.method === 'POST') return lot(requete, env);
    if (url.pathname === '/traiter' && requete.method === 'GET') return pageTraiter(url, env);
    if (url.pathname === '/traiter' && requete.method === 'POST') return traiter(requete, env);
    if (url.pathname === '/reanalyser' && requete.method === 'POST') return reanalyser(requete, env);
    if (url.pathname === '/purger' && requete.method === 'POST') return purger(requete, env);
    return new Response('Page introuvable', { status: 404 });
  },

  async scheduled(_evenement, env) {
    await tache(env);
  },
} satisfies ExportedHandler<Env>;
