import { utilisateur } from './access';
import { chargerCibles, enregistrerCible, optionsCibles, pageCibles, proposerCibleFormulaire } from './cibles';
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
  requeteFiltres,
  CLES_FILTRES,
  ORIGINES,
  etiquetteRecente,
  dateCourte,
  lienSite,
  motif,
  siteCourt,
  GROUPES_STATUTS,
  VERIFICATIONS,
  nonVerifiee,
} from './prospects';
import { echapper, icone, nomLisible, page } from './html';
import { enregistrerPilote, lancerRecherche, pageRecherches } from './recherches';
import { tache } from './taches';
import { tableau } from './tableau';
import { actionEmail, pageTraiter, sourceLien, traiter, trouverEmail } from './traiter';
import { claudeActif } from './claude';
import { mcp } from './mcp';
import { ENVOI_MAX, type Lead, campagnes, envoyerLeads, etatCampagne, smartleadActif } from './smartlead';

// Redirige après une action, avec un message affiché en bas de l'écran.
function apres(requete: Request, chemin: string, message: string) {
  const url = new URL(chemin.startsWith('/') && !chemin.startsWith('//') ? chemin : '/prospects', requete.url);
  url.searchParams.set('message', message);
  return Response.redirect(url.toString(), 303);
}

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
  const sansVerif = clauses({ ...filtres, verif: 'non_verifie' });
  const [lignes, total, parStatut, villes, categories, parRaison, aPurger, travail, aVerifier] = await env.DB.batch([
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
    env.DB.prepare(`SELECT COUNT(*) AS n FROM prospects ${sansVerif.where}`).bind(...sansVerif.valeurs),
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

  const rempli = (valeur: string) => (valeur ? 'rempli' : '');
  const optionsCategories = (categories.results as { categorie: string; n: number }[])
    .filter(({ categorie }) => categorie)
    .map(({ categorie, n }) => `<option value="${echapper(categorie)}" ${filtres.categorie === categorie ? 'selected' : ''}>${echapper(categorie)} (${n})</option>`)
    .join('');
  const optionsVilles = (villes.results as { ville: string; n: number }[])
    .filter(({ ville }) => ville)
    .map(({ ville, n }) => `<option value="${echapper(ville)}" ${filtres.ville === ville ? 'selected' : ''}>${echapper(ville)} (${n})</option>`)
    .join('');
  const filtre = filtres.cible || filtres.categorie || filtres.ville || filtres.origine || filtres.verif || filtres.q;
  // Le filtre des adresses non vérifiées n'apparaît que là où il y en a.
  const nonVerifiees = (aVerifier.results[0] as { n: number }).n;
  const choixVerif =
    nonVerifiees || filtres.verif
      ? `<select name="verif" class="${rempli(filtres.verif)}" onchange="this.form.submit()" aria-label="Vérification de l’adresse"><option value="">Toutes les adresses</option>${Object.entries(VERIFICATIONS)
          .map(([cle, libelle]) => `<option value="${cle}" ${filtres.verif === cle ? 'selected' : ''}>${libelle}${cle === 'non_verifie' ? ` (${nonVerifiees})` : ''}</option>`)
          .join('')}</select>`
      : '';

  const rangees = prospects
    .map(
      (p) => `<tr>
        <td class="case-ligne"><input type="checkbox" name="ids" value="${echapper(p.id)}" form="lot" aria-label="Choisir ${echapper(p.nom)}"></td>
        <td class="col-etab"><div class="ligne-nom"><a href="/p/${encodeURIComponent(p.id)}" class="nom" title="${echapper(p.nom)}">${echapper(nomLisible(p.nom))}</a>${etiquetteRecente(p)}</div><span class="discret une-ligne">${[p.categorie, p.ville].filter(Boolean).map(echapper).join(' · ') || echapper(cibles[p.cible]?.nom ?? p.cible)}</span></td>
        <td class="col-statut">${badge(p.statut)}</td>
        <td class="col-priorite">${priorite(p.score)}</td>
        <td class="col-constat">${motif(p)}</td>
        <td class="col-contact">${contact(p, cibles)}</td>
        <td class="col-site">${p.site ? lienSite(p.site) : '<span class="discret">pas de site</span>'}${p.verdict ? `<div>${verdict(p)}</div>` : ''}</td>
        <td class="col-vu discret" title="${echapper(date(p.vu_le))}">${dateCourte(p.vu_le)}</td>
      </tr>`,
    )
    .join('');

  const pages = Math.ceil(nombre / PAR_PAGE);
  const pagination =
    pages > 1
      ? `<nav class="pagination"><span>Page ${numero} sur ${pages}</span><span class="actions-entete">${numero > 1 ? `<a class="btn contour petit" href="${lienFiltres(filtres, { page: String(numero - 1) })}">Précédents</a>` : ''}${numero < pages ? `<a class="btn contour petit" href="${lienFiltres(filtres, { page: String(numero + 1) })}">Suivants</a>` : ''}</span></nav>`
      : '';

  const exportable = filtres.statut === 'nouveau' && nombre > 0;
  const champsCaches = Object.entries(filtres)
    .map(([cle, valeur]) => `<input type="hidden" name="${cle}" value="${echapper(valeur)}">`)
    .join('');
  const compte = `${nombre} prospect${nombre > 1 ? 's' : ''}${filtres.statut ? ` <em>· ${echapper(STATUTS[filtres.statut] ?? filtres.statut)}</em>` : ''}`;

  // Avec la clé Smartlead et une campagne choisie pour la cible, les fiches partent en un clic.
  const branchees = filtres.cible ? [cibles[filtres.cible]].filter(Boolean) : Object.values(cibles);
  const avecCampagne = branchees.some((c) => c.smartlead || c.smartleadCreation);
  const exportCsv = `<button type="submit" formaction="/export" name="marquer" value="1" class="btn ${smartleadActif(env) && avecCampagne ? 'fantome' : ''} petit">${icone('telecharger', 14)}Exporter en CSV</button>`;
  const envoi =
    smartleadActif(env) && avecCampagne
      ? `<form class="alerte succes" method="post" action="/smartlead/envoyer">${champsCaches}
          <p><strong>${nombre} prospects prêts.</strong> Les plus prioritaires partent dans la campagne Smartlead de leur cible. Seules les adresses génériques partent, jamais les désinscrits.</p>
          <label class="envoi-nombre">Envoyer <input type="number" name="nombre" value="${Math.min(nombre, 50)}" min="1" max="${Math.min(nombre, ENVOI_MAX)}" class="court" aria-label="Nombre de fiches"> fiches</label>
          <button type="submit" class="btn petit" onclick="return confirm('Envoyer ' + this.form.nombre.value + ' fiches dans Smartlead ?')">${icone('email', 14)}Envoyer dans Smartlead</button>
          ${exportCsv}
        </form>`
      : `<form class="alerte succes" method="post" action="/export">${champsCaches}
          <p><strong>${nombre} prospects prêts.</strong> L’export ne prend que les adresses génériques, sans les désinscrits, et les passe en « En campagne ».${
            smartleadActif(env)
              ? ` Pour les envoyer en un clic, choisis la campagne Smartlead de ${filtres.cible ? 'cette cible' : 'chaque cible'} dans <a href="/cibles${filtres.cible ? `?cle=${encodeURIComponent(filtres.cible)}` : ''}">Cibles</a>.`
              : ''
          }</p>
          ${exportCsv}
        </form>`;

  return page(
    'Prospects',
    `<header class="page-entete">
      <div><h1>Prospects</h1><p>Tous les établissements trouvés, avec leur constat et leur statut.</p></div>
      <div class="actions-entete">${
        TRAITABLES.includes(filtres.statut) && nombre
          ? `<a href="/recherches" class="btn contour">${icone('plus')}Nouvelle recherche</a><a href="/traiter?${requeteFiltres(filtres)}" class="btn">${icone('jouer')}Traiter ces ${nombre} fiches</a>`
          : `<a href="/recherches" class="btn">${icone('plus')}Nouvelle recherche</a>`
      }</div>
    </header>
    ${purge ? `<form class="alerte attention" method="post" action="/purger" onsubmit="return confirm('Effacer définitivement ${purge} prospects ?')"><p>${purge} prospects n’ont pas bougé depuis 3 ans. La CNIL recommande de les effacer.</p><button type="submit" class="btn contour petit">${icone('poubelle', 14)}Effacer</button></form>` : ''}
    ${
      enCours.recherches || enCours.analyses
        ? `<div class="alerte"><span class="voyant"></span><p>${enCours.recherches ? `${enCours.recherches} recherche${enCours.recherches > 1 ? 's' : ''} en cours. ` : ''}${enCours.analyses ? `${enCours.analyses} sites en attente d’analyse.` : ''}</p><a class="btn contour petit" href="/recherches">${icone('activite', 14)}Voir l’avancement</a></div>`
        : ''
    }
    <nav class="onglets" aria-label="Statuts">${onglets}</nav>
    <div class="barre-filtres">
      <form class="filtres" id="filtres" method="get" action="/prospects" role="search">
        <div class="champ-recherche">${icone('recherches', 15)}<input type="search" name="q" value="${echapper(filtres.q)}" placeholder="Chercher un nom, un email, un site, une note…" aria-label="Chercher"><kbd>/</kbd></div>
        <select name="cible" class="${rempli(filtres.cible)}" onchange="this.form.submit()" aria-label="Cible"><option value="">Toutes les cibles</option>${optionsCibles(cibles, filtres.cible)}</select>
        <select name="categorie" class="${rempli(filtres.categorie)}" onchange="this.form.submit()" aria-label="Catégorie"><option value="">Toutes les catégories</option>${optionsCategories}</select>
        <select name="ville" class="${rempli(filtres.ville)}" onchange="this.form.submit()" aria-label="Commune"><option value="">Toutes les communes</option>${optionsVilles}</select>
        <select name="origine" class="${rempli(filtres.origine)}" onchange="this.form.submit()" aria-label="Source"><option value="">Toutes les sources</option>${Object.entries(ORIGINES)
          .map(([cle, libelle]) => `<option value="${cle}" ${filtres.origine === cle ? 'selected' : ''}>${libelle}</option>`)
          .join('')}</select>
        ${choixVerif}
        <input type="hidden" name="statut" value="${echapper(filtres.statut)}">
        ${filtre ? `<a class="effacer" href="${lienFiltres({ statut: filtres.statut })}">Effacer les filtres</a>` : ''}
      </form>
      ${motifs}
    </div>
    ${
      reanalysable
        ? `<form class="alerte" method="post" action="/reanalyser">${champsCaches}
            <p>${filtres.statut === 'a_ecrire' ? 'Le bouton « Écrire » ouvre l’email prérempli et passe la fiche en « En campagne ». ' : ''}${filtres.statut === 'a_enrichir' ? 'Pas d’email sur le site : Claude le cherche sur le web tout seul, quelques fiches par minute. ' : ''}Si les règles d’analyse ont changé, tu peux repasser ces ${nombre} fiches à l’analyse.</p>
            <button type="submit" class="btn fantome petit">${icone('activite', 14)}Réanalyser</button>
          </form>`
        : ''
    }
    ${exportable ? envoi : ''}
    <div class="carte">
      <form id="lot" method="post" action="/lot" class="entete-liste">
        <input type="hidden" name="retour" value="${echapper(lienFiltres(filtres, numero > 1 ? { page: String(numero) } : {}))}">
        <span class="compte" id="compte-lot" data-total="${echapper(compte)}">${compte}</span>
        <div class="actions-lot" hidden>
          <select name="statut" required aria-label="Nouveau statut"><option value="">Passer en…</option>${Object.entries(STATUTS)
            .filter(([statut]) => statut !== 'a_analyser')
            .map(([statut, libelle]) => `<option value="${statut}">${libelle}</option>`)
            .join('')}</select>
          <button type="submit" class="btn petit">Appliquer</button>
        </div>
        <label class="tri"><span>Trier</span><select name="tri" form="filtres" onchange="this.form.submit()"><option value="priorite" ${parPriorite ? 'selected' : ''}>Par priorité</option><option value="recent" ${parPriorite ? '' : 'selected'}>Plus récents</option></select></label>
      </form>
      ${
        prospects.length
          ? `<div class="tableau"><table class="liste"><thead><tr><th class="case-ligne col-case"><input type="checkbox" aria-label="Tout choisir" onclick="document.querySelectorAll('input[name=ids]').forEach((c) => (c.checked = this.checked)); majLot()"></th><th class="col-etab">Établissement</th><th class="col-statut">Statut</th><th class="col-priorite" title="Priorité sur 100 : constat, avis Google, contact">Prio.</th><th class="col-constat">Constat</th><th class="col-contact">Email</th><th class="col-site">Site</th><th class="col-vu">Vu le</th></tr></thead><tbody>${rangees}</tbody></table></div>`
          : `<div class="vide"><strong>Aucun prospect ici</strong>${filtre ? `Aucune fiche ne correspond à ces filtres. <a href="${lienFiltres({ statut: filtres.statut })}">Les effacer</a>.` : 'Lance une <a href="/recherches">nouvelle recherche</a> pour remplir la base.'}</div>`
      }
      ${pagination}
    </div>
    <script>
      function majLot() {
        const n = document.querySelectorAll('input[name=ids]:checked').length;
        const compte = document.getElementById('compte-lot');
        compte.innerHTML = n ? n + (n > 1 ? ' fiches choisies' : ' fiche choisie') : compte.dataset.total;
        document.querySelector('.actions-lot').hidden = !n;
      }
      document.addEventListener('change', (e) => e.target.name === 'ids' && majLot());
    </script>`,
  );
}

async function fiche(id: string, env: Env, enregistre: boolean) {
  const [p, cibles] = await Promise.all([env.DB.prepare('SELECT * FROM prospects WHERE id = ?').bind(id).first<Prospect>(), chargerCibles(env)]);
  if (!p) return new Response('Prospect introuvable', { status: 404 });
  const signaux = Object.entries(JSON.parse(p.signaux || '{}') as Record<string, unknown>)
    .filter(([, valeur]) => valeur)
    .map(([cle, valeur]) => `<li>${echapper(cle)}${typeof valeur === 'number' ? ` ${valeur}` : ''}</li>`)
    .join('');
  const boutons = GROUPES_STATUTS.map(
    ([groupe, statuts]) =>
      `<div class="groupe-statuts"><span>${groupe}</span><div class="statuts">${statuts
        .map((statut) => `<button type="submit" name="statut" value="${statut}" class="${p.statut === statut ? 'actif' : ''}">${STATUTS[statut]}</button>`)
        .join('')}</div></div>`,
  ).join('');
  const ligne = (libelle: string, valeur: string) => (valeur ? `<dt>${libelle}</dt><dd>${valeur}</dd>` : '');
  const lienExterne = (href: string, texte: string) =>
    `<a href="${echapper(href)}" target="_blank" rel="noreferrer" class="lien-site" title="${echapper(href)}"><span>${echapper(texte)}</span>${icone('externe', 12)}</a>`;

  return page(
    p.nom,
    `<a class="retour" href="/prospects?cible=${encodeURIComponent(p.cible)}">${icone('retour')}Prospects</a>
    <header class="page-entete">
      <div><div class="titre-ligne"><h1>${echapper(nomLisible(p.nom))}</h1>${badge(p.statut)}${etiquetteRecente(p)}</div>
        <div class="sous-titre"><span class="avec-icone">${icone('lieu', 14)}${echapper(p.adresse || p.ville)}</span><span>${echapper([p.categorie, cibles[p.cible]?.nom ?? p.cible].filter(Boolean).join(' · '))}</span>${p.note_google ? `<span>${String(p.note_google).replace('.', ',')} ★ · ${p.avis_google ?? 0} avis</span>` : ''}</div></div>
      <div class="actions-entete">${p.site ? `<a class="btn contour petit" href="${echapper(p.site)}" target="_blank" rel="noreferrer">${icone('site', 14)}${echapper(siteCourt(p.site))}</a>` : ''}${p.fiche_google ? `<a class="btn contour petit" href="${echapper(p.fiche_google)}" target="_blank" rel="noreferrer">${icone('lieu', 14)}Fiche Google</a>` : ''}</div>
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
            ${ligne('Email', p.email ? `${p.statut === 'a_ecrire' ? contact(p, cibles) : `<span class="avec-icone">${icone('email', 14)}${echapper(p.email)}</span>${nonVerifiee(p)}`} <span class="discret">${echapper(NATURES[p.email_statut] ?? p.email_statut)}${p.email_source ? ` · ${sourceLien(p.email_source)}` : ''}</span>` : '<span class="discret">aucun</span>')}
            ${ligne('Proposé par Claude', p.email_propose ? `<strong>${echapper(p.email_propose)}</strong> <span class="discret">· ${sourceLien(p.email_source)}</span>` : '')}
            ${ligne('Téléphone', echapper(p.telephone))}
            ${ligne('Site', p.site ? lienExterne(p.site, p.site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')) : '<span class="discret">pas de site</span>')}
            
            ${ligne('Catégorie', echapper(p.categorie))}
            ${ligne('Source', p.origine === 'sirene' ? `Registre des entreprises${p.creation ? `, créée le ${date(p.creation)}` : ''}` : '')}
            ${ligne('Recherche', echapper(p.recherche))}
          </dl></div></section>
        ${
          ['nouveau', 'a_ecrire', 'en_campagne', 'a_repondu', 'maquette', 'client', 'desinscrit'].includes(p.statut)
            ? ''
            : `<form class="carte" method="post" action="/p/${encodeURIComponent(p.id)}/email"><div class="carte-entete"><div><h2 class="carte-titre">Email</h2><p class="carte-description">Une adresse saisie ici range la fiche toute seule.</p></div></div>
                <div class="carte-contenu formulaire">${trouverEmail(p)}<div class="actions-traiter">${
                  p.email_propose ? `<button type="submit" name="action" value="valider" class="btn">Utiliser ${echapper(p.email_propose)}</button>` : ''
                }${claudeActif(env) ? `<button type="submit" name="action" value="chercher" class="btn contour" onclick="setTimeout(() => { this.disabled = true; this.textContent = 'Claude cherche sur le web…'; })">${icone('recherches', 14)}Chercher avec Claude</button>` : ''}</div></div></form>`
        }
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
          <div class="groupes-statuts">${boutons}</div>
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

// Les filtres de la liste, repris par l'export et l'envoi : seulement les fiches prêtes.
function filtresEnvoi(donnees: FormData): Filtres {
  return {
    cible: String(donnees.get('cible') ?? ''),
    statut: 'nouveau',
    ville: String(donnees.get('ville') ?? ''),
    categorie: String(donnees.get('categorie') ?? ''),
    raison: '',
    tri: '',
    q: String(donnees.get('q') ?? ''),
    origine: String(donnees.get('origine') ?? ''),
    verif: String(donnees.get('verif') ?? ''),
  };
}

// Seules les adresses génériques ou au nom de l'entreprise partent. Une adresse
// désinscrite ne repart jamais, même si elle apparaît sur une autre fiche.
function selectionEnvoi(filtres: Filtres) {
  const { where, valeurs } = clauses(filtres);
  return {
    selection: `${where} AND email_statut IN ('generique', 'entreprise') AND email <> ''
    AND lower(email) NOT IN (SELECT lower(email) FROM prospects WHERE statut = 'desinscrit' AND email <> '')`,
    valeurs,
  };
}

const sourceEnvoi = (p: Pick<Prospect, 'origine'>) => (p.origine === 'sirene' ? 'le registre des entreprises' : 'votre fiche Google');

async function exporter(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const filtres = filtresEnvoi(donnees);
  const { selection, valeurs } = selectionEnvoi(filtres);
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
      company_name: nomLisible(p.nom),
      salutation: 'Bonjour,',
      recherche: p.recherche,
      constat: p.constat,
      source: sourceEnvoi(p),
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

// Envoie les fiches prêtes les plus prioritaires dans la campagne Smartlead de leur
// cible. Les nouvelles entreprises vont dans la campagne « nouvelles entreprises »,
// et ne partent pas si la cible n'en a pas.
async function envoyerSmartlead(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const filtres = filtresEnvoi(donnees);
  const retour = lienFiltres(filtres);
  if (!smartleadActif(env)) return apres(requete, retour, 'Ajoute SMARTLEAD_API_KEY dans .dev.vars pour envoyer dans Smartlead.');
  const voulu = Math.min(ENVOI_MAX, Math.max(1, Math.floor(Number(donnees.get('nombre'))) || 50));
  const cibles = await chargerCibles(env);
  const { selection, valeurs } = selectionEnvoi(filtres);
  const { results } = await env.DB.prepare(`SELECT *, ${SCORE} AS score FROM prospects ${selection} ORDER BY score DESC, vu_le DESC`)
    .bind(...valeurs)
    .all<Prospect>();

  const campagneDe = (p: Prospect) => (p.origine === 'sirene' ? cibles[p.cible]?.smartleadCreation : cibles[p.cible]?.smartlead) ?? '';
  const parCampagne = new Map<string, Prospect[]>();
  const vus = new Set<string>();
  let sansCampagne = 0;
  let choisies = 0;
  for (const p of results) {
    const campagne = campagneDe(p);
    if (!campagne) {
      sansCampagne += 1;
      continue;
    }
    if (choisies >= voulu || vus.has(p.email.toLowerCase())) continue;
    vus.add(p.email.toLowerCase());
    parCampagne.set(campagne, [...(parCampagne.get(campagne) ?? []), p]);
    choisies += 1;
  }
  if (!choisies) {
    return apres(requete, retour, sansCampagne ? 'Aucune campagne Smartlead pour ces fiches : choisis-la dans Cibles.' : 'Aucune fiche prête à envoyer.');
  }

  const lead = (p: Prospect): Lead => ({
    email: p.email,
    first_name: '',
    last_name: '',
    company_name: nomLisible(p.nom),
    website: p.site,
    location: p.ville,
    phone_number: p.telephone,
    custom_fields: { salutation: 'Bonjour,', recherche: p.recherche, constat: p.constat, source: sourceEnvoi(p), ville: p.ville },
  });
  const noms = await campagnes(env).catch(() => []);
  const maintenant = new Date().toISOString();
  const requetes: D1PreparedStatement[] = [];
  const journal = (niveau: string, message: string) =>
    env.DB.prepare('INSERT INTO journal (le, niveau, message, recherche_id) VALUES (?, ?, ?, NULL)').bind(maintenant, niveau, message);
  const morceaux: string[] = [];
  let envoyes = 0;
  let refuses = 0;
  for (const [campagne, fiches] of parCampagne) {
    const bilan = await envoyerLeads(env, campagne, fiches.map(lead));
    const infos = noms.find((c) => c.id === campagne);
    const nom = infos ? `« ${infos.nom} »` : `n°${campagne}`;
    const partis = new Set(bilan.envoyes.map((email) => email.toLowerCase()));
    const refus = new Set(bilan.refuses.map((email) => email.toLowerCase()));
    for (const p of fiches) {
      const email = p.email.toLowerCase();
      if (partis.has(email)) {
        requetes.push(
          env.DB.prepare("UPDATE prospects SET statut = 'en_campagne', statut_le = ?1, contacte_le = COALESCE(contacte_le, ?1) WHERE id = ?2 AND statut = 'nouveau'").bind(maintenant, p.id),
        );
      } else if (refus.has(email)) {
        // Désinscrite ou bloquée chez Smartlead : on ne la propose plus.
        requetes.push(env.DB.prepare("UPDATE prospects SET statut = 'desinscrit', statut_le = ? WHERE lower(email) = ? AND statut NOT IN ('desinscrit', 'client')").bind(maintenant, email));
      }
    }
    envoyes += partis.size;
    refuses += refus.size;
    const details = [bilan.deja ? `${bilan.deja} déjà dedans` : '', bilan.invalides ? `${bilan.invalides} adresses jugées invalides par Smartlead` : ''].filter(Boolean).join(', ');
    if (partis.size) {
      requetes.push(journal('succes', `Smartlead : ${partis.size} fiche${partis.size > 1 ? 's' : ''} envoyée${partis.size > 1 ? 's' : ''} dans la campagne ${nom}${details ? ` (${details})` : ''}.`));
      if (infos && infos.statut.toUpperCase() !== 'ACTIVE') morceaux.push(`la campagne ${nom} est ${etatCampagne(infos.statut)} : les emails partiront quand tu la lanceras dans Smartlead`);
    }
    if (refus.size) requetes.push(journal('info', `Smartlead : ${refus.size} adresse${refus.size > 1 ? 's' : ''} refusée${refus.size > 1 ? 's' : ''} (désinscrite${refus.size > 1 ? 's' : ''} ou bloquée${refus.size > 1 ? 's' : ''} chez Smartlead), passée${refus.size > 1 ? 's' : ''} en « Désinscrit ».`));
    if (bilan.erreur) {
      requetes.push(journal('erreur', `Smartlead, campagne ${nom} : ${bilan.erreur}`));
      morceaux.push(`envoi arrêté pour la campagne ${nom} : ${bilan.erreur}`);
    }
  }
  if (requetes.length) await env.DB.batch(requetes);
  const message = [
    `${envoyes} fiche${envoyes > 1 ? 's' : ''} envoyée${envoyes > 1 ? 's' : ''} dans Smartlead`,
    refuses ? `${refuses} refusée${refuses > 1 ? 's' : ''} par Smartlead (désinscrite${refuses > 1 ? 's' : ''} chez lui)` : '',
    ...morceaux,
  ]
    .filter(Boolean)
    .join(' ; ');
  return apres(requete, retour, message);
}

async function lot(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const statut = String(donnees.get('statut') ?? '');
  const ids = donnees.getAll('ids').map(String).slice(0, 100);
  if (!(statut in STATUTS) || statut === 'a_analyser') return new Response('Statut inconnu', { status: 400 });
  if (ids.length) await env.DB.batch(ids.map((id) => changerStatut(env, id, statut, null)));
  return apres(requete, String(donnees.get('retour') ?? '/prospects'), `${ids.length} fiche${ids.length > 1 ? 's' : ''} passée${ids.length > 1 ? 's' : ''} en « ${STATUTS[statut]} »`);
}

async function reanalyser(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const filtres = Object.fromEntries(CLES_FILTRES.map((cle) => [cle, String(donnees.get(cle) ?? '')])) as Filtres;
  if (!REANALYSABLES.includes(filtres.statut)) return new Response('Statut non réanalysable', { status: 400 });
  const { where, valeurs } = clauses(filtres);
  const { meta } = await env.DB.prepare(`UPDATE prospects SET statut = 'a_analyser' ${where}`).bind(...valeurs).run();
  return apres(requete, '/recherches', `${meta.changes} fiches renvoyées à l’analyse`);
}

async function purger(requete: Request, env: Env) {
  const limite = new Date(Date.now() - TROIS_ANS_MS).toISOString();
  await env.DB.prepare(`DELETE FROM prospects WHERE statut IN (${PURGEABLES.map(() => '?').join(', ')}) AND statut_le < ? AND vu_le < ?`)
    .bind(...PURGEABLES, limite, limite)
    .run();
  return apres(requete, '/prospects', 'Prospects de plus de 3 ans effacés');
}

export default {
  async fetch(requete, env): Promise<Response> {
    if (!(await utilisateur(requete, env))) return new Response('Accès refusé', { status: 403 });

    const url = new URL(requete.url);
    // Serveur MCP pour Claude Code : il vérifie lui-même l'origine des requêtes.
    if (url.pathname === '/mcp') return mcp(requete, env);
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
    const email = url.pathname.match(/^\/p\/(.+)\/email$/);
    if (email && requete.method === 'POST') {
      const id = decodeURIComponent(email[1]);
      const donnees = await requete.formData();
      const resultat = await actionEmail(env, id, String(donnees.get('action') ?? 'email'), String(donnees.get('email') ?? ''));
      if (resultat instanceof Response) return resultat;
      return apres(requete, `/p/${encodeURIComponent(id)}`, resultat);
    }
    const fichePath = url.pathname.match(/^\/p\/(.+)$/);
    if (fichePath) {
      const id = decodeURIComponent(fichePath[1]);
      if (requete.method === 'POST') return modifier(id, requete, env);
      return fiche(id, env, url.searchParams.has('ok'));
    }
    if (url.pathname === '/' && requete.method === 'GET') {
      // Les anciens liens filtrés (/?statut=…) mènent toujours à la liste.
      if (url.search && !url.searchParams.has('message')) return Response.redirect(new URL(`/prospects${url.search}`, url).toString(), 301);
      return tableau(env);
    }
    if (url.pathname === '/prospects' && requete.method === 'GET') return liste(url, env);
    if (url.pathname === '/recherches' && requete.method === 'GET') return pageRecherches(url, env);
    if (url.pathname === '/recherches' && requete.method === 'POST') return lancerRecherche(requete, env);
    if (url.pathname === '/pilote' && requete.method === 'POST') return enregistrerPilote(requete, env);
    if (url.pathname === '/cibles' && requete.method === 'GET') return pageCibles(url, env);
    if (url.pathname === '/cibles' && requete.method === 'POST') return enregistrerCible(requete, env);
    if (url.pathname === '/cibles/proposer' && requete.method === 'POST') return proposerCibleFormulaire(requete, env);
    if (url.pathname === '/export' && requete.method === 'POST') return exporter(requete, env);
    if (url.pathname === '/smartlead/envoyer' && requete.method === 'POST') return envoyerSmartlead(requete, env);
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
