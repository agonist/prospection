import { utilisateur } from './access';
import { CIBLES } from '../scripts/cibles.mjs';
import { echapper, page } from './html';
import { lancerRecherche, pageRecherches } from './recherches';
import { tache } from './taches';

export const STATUTS: Record<string, string> = {
  a_analyser: 'En analyse',
  nouveau: 'Prêt à contacter',
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

const PAR_PAGE = 100;
const TROIS_ANS_MS = 3 * 365 * 24 * 60 * 60 * 1000;
// Statuts qu'on efface au bout de 3 ans sans nouvelle (recommandation CNIL pour la prospection).
const PURGEABLES = ['a_analyser', 'nouveau', 'a_verifier', 'plus_tard', 'hors_cible', 'en_campagne', 'pas_interesse'];

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

type Filtres = { cible: string; statut: string; ville: string; q: string };

function lireFiltres(url: URL): Filtres {
  return {
    cible: url.searchParams.get('cible') ?? '',
    statut: url.searchParams.get('statut') ?? '',
    ville: url.searchParams.get('ville') ?? '',
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

async function liste(url: URL, env: Env) {
  const filtres = lireFiltres(url);
  const numero = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const { where, valeurs } = clauses(filtres);
  const sansStatut = clauses(filtres, true);

  const [lignes, total, parStatut, villes, aPurger, travail] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM prospects ${where} ORDER BY vu_le DESC, nom LIMIT ? OFFSET ?`).bind(...valeurs, PAR_PAGE, (numero - 1) * PAR_PAGE),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM prospects ${where}`).bind(...valeurs),
    env.DB.prepare(`SELECT statut, COUNT(*) AS n FROM prospects ${sansStatut.where} GROUP BY statut`).bind(...sansStatut.valeurs),
    env.DB.prepare(`SELECT ville, COUNT(*) AS n FROM prospects ${filtres.cible ? 'WHERE cible = ?' : ''} GROUP BY ville ORDER BY ville`).bind(...(filtres.cible ? [filtres.cible] : [])),
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
    `<a href="${lienFiltres({ ...filtres, statut: '' })}" class="${filtres.statut ? '' : 'actif'}">Tous <span>${toutStatut}</span></a>`,
    ...Object.entries(STATUTS).map(
      ([statut, libelle]) =>
        `<a href="${lienFiltres({ ...filtres, statut })}" class="${filtres.statut === statut ? 'actif' : ''}">${libelle} <span>${compteStatuts[statut] ?? 0}</span></a>`,
    ),
  ].join('');

  const optionsCibles = Object.entries(CIBLES)
    .map(([cle, { nom }]) => `<option value="${cle}" ${filtres.cible === cle ? 'selected' : ''}>${echapper(nom)}</option>`)
    .join('');
  const optionsVilles = (villes.results as { ville: string; n: number }[])
    .filter(({ ville }) => ville)
    .map(({ ville, n }) => `<option value="${echapper(ville)}" ${filtres.ville === ville ? 'selected' : ''}>${echapper(ville)} (${n})</option>`)
    .join('');

  const rangees = prospects
    .map(
      (p) => `<tr>
        <td><a href="/p/${encodeURIComponent(p.id)}">${echapper(p.nom)}</a><div class="discret">${echapper(CIBLES[p.cible as keyof typeof CIBLES]?.nom ?? p.cible)}</div></td>
        <td>${echapper(p.ville)}</td>
        <td>${badge(p.statut)}</td>
        <td>${echapper(p.constat || p.raison)}</td>
        <td>${echapper(p.email)}</td>
        <td>${p.site ? `<a href="${echapper(p.site)}" target="_blank" rel="noreferrer">${echapper(p.site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : '<span class="discret">aucun</span>'}</td>
        <td class="discret">${date(p.vu_le)}</td>
      </tr>`,
    )
    .join('');

  const pages = Math.ceil(nombre / PAR_PAGE);
  const pagination =
    pages > 1
      ? `<nav class="pagination">${numero > 1 ? `<a href="${lienFiltres(filtres, { page: String(numero - 1) })}">← Précédents</a>` : ''}<span>Page ${numero} sur ${pages}</span>${numero < pages ? `<a href="${lienFiltres(filtres, { page: String(numero + 1) })}">Suivants →</a>` : ''}</nav>`
      : '';

  const exportable = filtres.statut === 'nouveau' && nombre > 0;
  const champsCaches = Object.entries(filtres)
    .map(([cle, valeur]) => `<input type="hidden" name="${cle}" value="${echapper(valeur)}">`)
    .join('');

  return page(
    'Prospects',
    `<header class="entete">
      <h1>Prospects <a href="/recherches" class="bouton">Nouvelle recherche</a></h1>
      <form class="filtres" method="get" action="/">
        <select name="cible" onchange="this.form.submit()"><option value="">Toutes les cibles</option>${optionsCibles}</select>
        <select name="ville" onchange="this.form.submit()"><option value="">Toutes les communes</option>${optionsVilles}</select>
        <input type="hidden" name="statut" value="${echapper(filtres.statut)}">
        <input type="search" name="q" value="${echapper(filtres.q)}" placeholder="Nom, email, site, note">
        <button type="submit">Chercher</button>
      </form>
    </header>
    ${purge ? `<form class="alerte" method="post" action="/purger" onsubmit="return confirm('Effacer définitivement ${purge} prospects ?')"><p>${purge} prospects n’ont pas bougé depuis 3 ans. La CNIL recommande de les effacer.</p><button type="submit">Effacer</button></form>` : ''}
    ${
      enCours.recherches || enCours.analyses
        ? `<p class="export">${enCours.recherches ? `${enCours.recherches} recherche${enCours.recherches > 1 ? 's' : ''} en cours. ` : ''}${enCours.analyses ? `${enCours.analyses} sites en attente d’analyse. ` : ''}<a href="/recherches">Voir l’avancement</a></p>`
        : ''
    }
    <nav class="onglets">${onglets}</nav>
    ${
      exportable
        ? `<form class="export" method="post" action="/export">${champsCaches}
            <p>${nombre} prospects prêts. L’export ne prend que les adresses génériques, sans les désinscrits.</p>
            <label><input type="checkbox" name="marquer" value="1" checked> Les passer en « En campagne »</label>
            <button type="submit">Exporter pour Smartlead</button>
          </form>`
        : ''
    }
    ${
      prospects.length
        ? `<table><thead><tr><th>Établissement</th><th>Commune</th><th>Statut</th><th>Constat ou raison</th><th>Email</th><th>Site</th><th>Vu le</th></tr></thead><tbody>${rangees}</tbody></table>`
        : '<p class="vide">Aucun prospect ici. Lance une <a href="/recherches">nouvelle recherche</a>.</p>'
    }
    ${pagination}`,
  );
}

async function fiche(id: string, env: Env, enregistre: boolean) {
  const p = await env.DB.prepare('SELECT * FROM prospects WHERE id = ?').bind(id).first<Prospect>();
  if (!p) return new Response('Prospect introuvable', { status: 404 });
  const signaux = Object.entries(JSON.parse(p.signaux || '{}') as Record<string, unknown>)
    .filter(([, valeur]) => valeur)
    .map(([cle, valeur]) => `<li>${echapper(cle)}${typeof valeur === 'number' ? ` (${valeur})` : ''}</li>`)
    .join('');
  const boutons = Object.entries(STATUTS)
    .map(([statut, libelle]) => `<button type="submit" name="statut" value="${statut}" class="${p.statut === statut ? 'actif' : ''}">${libelle}</button>`)
    .join('');
  const ligne = (libelle: string, valeur: string) => (valeur ? `<dt>${libelle}</dt><dd>${valeur}</dd>` : '');

  return page(
    p.nom,
    `<p><a href="/?cible=${encodeURIComponent(p.cible)}">← Prospects</a></p>
    <header class="entete"><h1>${echapper(p.nom)}</h1>${badge(p.statut)}</header>
    ${enregistre ? '<p class="succes">Enregistré.</p>' : ''}
    <div class="fiche">
      <dl>
        ${ligne('Cible', echapper(CIBLES[p.cible as keyof typeof CIBLES]?.nom ?? p.cible))}
        ${ligne('Catégorie Google', echapper(p.categorie))}
        ${ligne('Adresse', echapper(p.adresse || p.ville))}
        ${ligne('Téléphone', p.telephone ? `<a href="tel:${echapper(p.telephone)}">${echapper(p.telephone)}</a>` : '')}
        ${ligne('Email', p.email ? `${echapper(p.email)} <span class="discret">(${echapper(p.email_statut)})</span>` : '')}
        ${ligne('Site', p.site ? `<a href="${echapper(p.site)}" target="_blank" rel="noreferrer">${echapper(p.site)}</a>` : 'aucun')}
        ${ligne('Fiche Google', p.fiche_google ? `<a href="${echapper(p.fiche_google)}" target="_blank" rel="noreferrer">ouvrir</a>${p.note_google ? ` · ${p.note_google} ★ (${p.avis_google ?? 0} avis)` : ''}` : '')}
        ${ligne('Recherche', echapper(p.recherche))}
        ${ligne('Constat', echapper(p.constat))}
        ${ligne('Raison', echapper(p.raison))}
        ${ligne('Signaux', signaux ? `<ul class="signaux">${signaux}</ul>` : '')}
        ${ligne('Ajouté le', date(p.cree_le))}
        ${ligne('Vu le', date(p.vu_le))}
        ${ligne('Statut depuis le', date(p.statut_le))}
        ${ligne('Contacté le', date(p.contacte_le))}
      </dl>
      <form method="post" action="/p/${encodeURIComponent(p.id)}" class="actions">
        <h2>Statut</h2>
        <div class="statuts">${boutons}</div>
        <h2>Note</h2>
        <textarea name="note" rows="6" placeholder="Appel, réponse, idée de maquette…">${echapper(p.note)}</textarea>
        <button type="submit" name="statut" value="${echapper(p.statut)}" class="principal">Enregistrer la note</button>
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
    q: String(donnees.get('q') ?? ''),
  };
  const { where, valeurs } = clauses(filtres);
  // Une adresse désinscrite ne repart jamais, même si elle apparaît sur une autre fiche.
  const selection = `${where} AND email_statut = 'generique' AND email <> ''
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

    const fichePath = url.pathname.match(/^\/p\/(.+)$/);
    if (fichePath) {
      const id = decodeURIComponent(fichePath[1]);
      if (requete.method === 'POST') return modifier(id, requete, env);
      return fiche(id, env, url.searchParams.has('ok'));
    }
    if (url.pathname === '/' && requete.method === 'GET') return liste(url, env);
    if (url.pathname === '/recherches' && requete.method === 'GET') return pageRecherches(url, env);
    if (url.pathname === '/recherches' && requete.method === 'POST') return lancerRecherche(requete, env);
    if (url.pathname === '/export' && requete.method === 'POST') return exporter(requete, env);
    if (url.pathname === '/purger' && requete.method === 'POST') return purger(requete, env);
    return new Response('Page introuvable', { status: 404 });
  },

  async scheduled(_evenement, env) {
    await tache(env);
  },
} satisfies ExportedHandler<Env>;
