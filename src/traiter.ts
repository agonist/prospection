// Mode traitement : une fiche à la fois, la plus prioritaire d'abord, avec des
// raccourcis clavier pour vider une file (à écrire, à appeler, à vérifier…).
import { brouillon, chargerCibles } from './cibles';
import { echapper, icone, page } from './html';
import { SCORE, STATUTS, TRAITABLES, type Prospect, avisDetaille, badge, changerStatut, clauses, lienFiltres, lireFiltres, requeteFiltres, priorite } from './prospects';

type Action = { valeur: string; libelle: string; style?: string };

// « passer » garde la fiche telle quelle ; « sans_reponse » note l'appel puis passe.
const ACTIONS: Record<string, Action[]> = {
  nouveau: [
    { valeur: 'passer', libelle: 'Bon pour Smartlead' },
    { valeur: 'a_ecrire', libelle: 'Plutôt écrire à la main', style: 'contour' },
    { valeur: 'hors_cible', libelle: 'Pas pour nous', style: 'contour' },
  ],
  a_ecrire: [
    { valeur: 'ecrire', libelle: 'Écrire' },
    { valeur: 'pas_interesse', libelle: 'Pas pour nous', style: 'contour' },
    { valeur: 'passer', libelle: 'Plus tard', style: 'fantome' },
  ],
  a_appeler: [
    { valeur: 'a_repondu', libelle: 'Intéressé' },
    { valeur: 'pas_interesse', libelle: 'Pas intéressé', style: 'contour' },
    { valeur: 'sans_reponse', libelle: 'Pas de réponse', style: 'contour' },
    { valeur: 'passer', libelle: 'Plus tard', style: 'fantome' },
  ],
  a_verifier: [
    { valeur: 'nouveau', libelle: 'OK pour Smartlead' },
    { valeur: 'a_ecrire', libelle: 'À écrire', style: 'contour' },
    { valeur: 'a_appeler', libelle: 'À appeler', style: 'contour' },
    { valeur: 'hors_cible', libelle: 'Pas pour nous', style: 'contour' },
    { valeur: 'passer', libelle: 'Plus tard', style: 'fantome' },
  ],
};

// Les fiches passées pendant la séance, gardées dans l'adresse (D1 limite le nombre de paramètres).
function lireSauf(valeur: string | null) {
  return (valeur ?? '').split(',').filter(Boolean).slice(-80);
}

function adresse(url: URL, sauf: string[]) {
  const filtres = lireFiltres(url);
  const params = new URLSearchParams(requeteFiltres(filtres));
  if (sauf.length) params.set('sauf', sauf.join(','));
  return `/traiter?${params}`;
}

export async function pageTraiter(url: URL, env: Env) {
  const filtres = lireFiltres(url);
  if (!TRAITABLES.includes(filtres.statut)) return Response.redirect(new URL('/prospects', url).toString(), 303);
  const sauf = lireSauf(url.searchParams.get('sauf'));
  const { where, valeurs } = clauses(filtres);
  const exclus = sauf.length ? ` AND id NOT IN (${sauf.map(() => '?').join(', ')})` : '';
  const [cibles, [suivante, reste]] = await Promise.all([
    chargerCibles(env),
    env.DB.batch([
      env.DB.prepare(`SELECT *, ${SCORE} AS score FROM prospects ${where}${exclus} ORDER BY score DESC, vu_le DESC LIMIT 1`).bind(...valeurs, ...sauf),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM prospects ${where}${exclus}`).bind(...valeurs, ...sauf),
    ]),
  ]);
  const p = suivante.results[0] as Prospect | undefined;
  const restantes = (reste.results[0] as { n: number }).n;
  const retour = `<a class="retour" href="${echapper(lienFiltres(filtres))}">${icone('retour')}${echapper(STATUTS[filtres.statut])}</a>`;

  if (!p) {
    return page(
      'File vide',
      `${retour}<div class="carte"><div class="vide"><strong>Plus rien à traiter ici</strong>${sauf.length ? `${sauf.length} fiches gardées pour plus tard. <a href="${echapper(adresse(url, []))}">Les reprendre</a>.` : 'Bravo.'}</div></div>`,
    );
  }

  const cible = cibles[p.cible];
  const ligne = (libelle: string, valeur: string) => (valeur ? `<dt>${libelle}</dt><dd>${valeur}</dd>` : '');
  const champs = Object.entries({ ...filtres, sauf: sauf.join(','), id: p.id })
    .map(([cle, valeur]) => `<input type="hidden" name="${cle}" value="${echapper(valeur)}">`)
    .join('');
  const suivanteUrl = adresse(url, sauf);
  const boutons = (ACTIONS[filtres.statut] ?? [])
    .map(({ valeur, libelle, style }, index) => {
      const touche = `<kbd>${index + 1}</kbd>`;
      if (valeur === 'ecrire') {
        return `<a class="btn" data-touche="${index + 1}" href="${echapper(brouillon(cible, p))}"
          onclick="fetch('/p/${encodeURIComponent(p.id)}/ecrit', { method: 'POST', keepalive: true }); setTimeout(() => location.assign(${echapper(JSON.stringify(suivanteUrl))}), 800)">${icone('email', 14)}${libelle}${touche}</a>`;
      }
      return `<button type="submit" name="action" value="${valeur}" class="btn ${style ?? ''}" data-touche="${index + 1}">${libelle}${touche}</button>`;
    })
    .join('');

  const apercu = p.site
    ? `<div class="apercu"><div class="apercu-barre"><span class="tronque">${echapper(p.site.replace(/^https?:\/\//, ''))}</span><a href="${echapper(p.site)}" target="_blank" rel="noreferrer" class="btn contour petit">${icone('externe', 14)}Ouvrir</a></div>
        <iframe src="${echapper(p.site)}" sandbox="allow-scripts" loading="lazy" referrerpolicy="no-referrer" title="Aperçu du site"></iframe>
        <p class="discret">Page blanche ? Certains sites refusent l’aperçu : ouvre-le dans un onglet.</p></div>`
    : `<div class="apercu vide"><strong>Pas de site</strong>${p.fiche_google ? `<a href="${echapper(p.fiche_google)}" target="_blank" rel="noreferrer">Voir la fiche Google</a>` : ''}</div>`;

  return page(
    `Traiter · ${p.nom}`,
    `${retour}
    <header class="page-entete">
      <div><h1>${echapper(p.nom)}</h1><p>${[cible?.nom ?? p.cible, p.categorie, p.ville].filter(Boolean).map(echapper).join(' · ')}${p.note_google ? ` · ${p.note_google} ★ (${p.avis_google ?? 0} avis)` : ''}</p></div>
      <div class="actions-entete">${badge(p.statut)}${priorite(p.score)}<span class="discret">${restantes} restante${restantes > 1 ? 's' : ''}</span></div>
    </header>
    <div class="traiter">
      <form method="post" action="/traiter" class="carte" id="traitement">${champs}
        <div class="carte-contenu formulaire">
          ${p.constat ? `<div><span class="discret">J’ai remarqué que…</span><p class="constat">${echapper(p.constat)}</p></div>` : ''}
          ${p.raison ? `<div class="alerte attention"><p>${echapper(p.raison)}</p></div>` : ''}
          ${avisDetaille(p)}
          <dl>
            ${ligne('Email', p.email ? `${echapper(p.email)} <span class="discret">${echapper(p.email_statut)}</span>` : '<span class="discret">aucun</span>')}
            ${ligne('Téléphone', p.telephone ? `<a class="avec-icone gros" href="tel:${echapper(p.telephone)}">${icone('telephone', 16)}${echapper(p.telephone)}</a>` : '')}
            ${ligne('Adresse', echapper(p.adresse))}
            ${ligne('Recherche', echapper(p.recherche))}
            ${ligne('Fiche', `<a href="/p/${encodeURIComponent(p.id)}">Fiche complète</a>${p.fiche_google ? ` · <a href="${echapper(p.fiche_google)}" target="_blank" rel="noreferrer">Google</a>` : ''}`)}
          </dl>
          <div class="champ"><label for="note">Note</label><textarea id="note" name="note" rows="3" placeholder="Ce qui s’est dit, une idée de maquette…">${echapper(p.note)}</textarea></div>
          <div class="actions-traiter">${boutons}</div>
          <p class="discret">Raccourcis : les chiffres 1 à ${(ACTIONS[filtres.statut] ?? []).length} (hors de la note).</p>
        </div>
      </form>
      ${apercu}
    </div>
    <script>
      document.addEventListener('keydown', (e) => {
        if (e.target.closest('textarea, input, select') || e.metaKey || e.ctrlKey || e.altKey) return;
        const bouton = document.querySelector('[data-touche="' + e.key + '"]');
        if (bouton) { e.preventDefault(); bouton.click(); }
      });
    </script>`,
  );
}

export async function traiter(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const url = new URL(requete.url);
  for (const cle of ['cible', 'statut', 'ville', 'categorie', 'raison', 'q', 'tri']) url.searchParams.set(cle, String(donnees.get(cle) ?? ''));
  const id = String(donnees.get('id') ?? '');
  const action = String(donnees.get('action') ?? '');
  const note = donnees.get('note') == null ? null : String(donnees.get('note'));
  const sauf = lireSauf(String(donnees.get('sauf') ?? ''));

  if (action === 'passer' || action === 'sans_reponse') {
    const jour = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
    const texte = action === 'sans_reponse' ? [note?.trim(), `Appel sans réponse le ${jour}.`].filter(Boolean).join('\n') : note;
    await env.DB.prepare('UPDATE prospects SET note = COALESCE(?, note) WHERE id = ?').bind(texte, id).run();
    sauf.push(id);
  } else if (action in STATUTS && action !== 'a_analyser') {
    await changerStatut(env, id, action, note).run();
  } else {
    return new Response('Action inconnue', { status: 400 });
  }
  return Response.redirect(new URL(adresse(url, sauf), requete.url).toString(), 303);
}
