// Mode traitement : une fiche à la fois, la plus prioritaire d'abord, avec des
// raccourcis clavier pour vider une file (à écrire, email à chercher, à vérifier…).
import { brouillon, chargerCibles } from './cibles';
import { claudeActif } from './claude';
import { type AEnrichir, appliquerEmail, enregistrer, enrichir, LIBELLES_RESULTAT } from './enrichir';
import { echapper, icone, nomLisible, page } from './html';
import {
  NATURES,
  SCORE,
  STATUTS,
  TRAITABLES,
  type Prospect,
  avisDetaille,
  badge,
  changerStatut,
  clauses,
  liensRecherche,
  lienFiltres,
  lireFiltres,
  requeteFiltres,
  priorite,
  CLES_FILTRES,
  etiquetteRecente,
} from './prospects';
import { statutSelonEmail } from '../scripts/base.mjs';

type Action = { valeur: string; libelle: string; style?: string };

// Ce qu'on attend de Bas dans chaque file, en une phrase.
const CONSIGNES: Record<string, string> = {
  nouveau: 'Adresse générique ou au nom de l’entreprise : la fiche part dans Smartlead à l’export. Vérifie juste que le constat tient.',
  a_ecrire: 'Adresse nominative : la CNIL demande un email écrit à la main. « Écrire » ouvre le brouillon prérempli.',
  a_enrichir: 'Pas d’email sur le site. Claude le cherche tout seul sur le web, quelques fiches par minute. Tu peux aussi le trouver toi-même et le coller ici.',
  a_verifier: 'Quelque chose cloche : la raison est en orange. Le plus souvent il manque un bon email : colle-le, valide celui proposé, ou demande à Claude de chercher.',
  sans_email: 'Ni le site ni le web ne donnent d’email. Cherche à la main si la fiche en vaut la peine, sinon laisse-la de côté.',
};

const SANS_CLAUDE = 'Pas d’email sur le site. Ajoute OPENROUTER_API_KEY dans .dev.vars pour que Claude le cherche tout seul. En attendant, les liens ci-dessous aident à le trouver.';

// « passer » garde la fiche telle quelle et passe à la suivante.
function actions(p: Prospect, claude: boolean): Action[] {
  const chercher = (libelle: string) => (claude ? [{ valeur: 'chercher', libelle, style: 'contour' }] : []);
  switch (p.statut) {
    case 'nouveau':
      return [
        { valeur: 'passer', libelle: 'Bon pour Smartlead' },
        { valeur: 'a_ecrire', libelle: 'Plutôt écrire à la main', style: 'contour' },
        { valeur: 'hors_cible', libelle: 'Pas pour nous', style: 'contour' },
      ];
    case 'a_ecrire':
      return [
        { valeur: 'ecrire', libelle: 'Écrire' },
        { valeur: 'pas_interesse', libelle: 'Pas pour nous', style: 'contour' },
        { valeur: 'passer', libelle: 'Plus tard', style: 'fantome' },
      ];
    case 'a_verifier':
      return [
        ...(p.email_propose ? [{ valeur: 'valider', libelle: `Utiliser ${p.email_propose}` }] : []),
        ...(p.email ? [{ valeur: 'garder', libelle: `Garder ${p.email}`, style: p.email_propose ? 'contour' : '' }] : []),
        ...chercher('Chercher l’email avec Claude'),
        { valeur: 'hors_cible', libelle: 'Pas pour nous', style: 'contour' },
        { valeur: 'passer', libelle: 'Plus tard', style: 'fantome' },
      ];
    case 'sans_email':
      return [...chercher('Chercher encore avec Claude'), { valeur: 'plus_tard', libelle: 'Laisser de côté', style: 'contour' }, { valeur: 'passer', libelle: 'Plus tard', style: 'fantome' }];
    default:
      return [...chercher('Chercher maintenant avec Claude'), { valeur: 'hors_cible', libelle: 'Pas pour nous', style: 'contour' }, { valeur: 'passer', libelle: 'Plus tard', style: 'fantome' }];
  }
}

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

export function sourceLien(source: string) {
  if (!/^https?:\/\//.test(source)) return echapper(source || 'source inconnue');
  return `<a href="${echapper(source)}" target="_blank" rel="noreferrer">lu sur ${echapper(new URL(source).hostname.replace(/^www\./, ''))}</a>`;
}

// Chercher l'email soi-même : liens tout prêts et un champ pour coller l'adresse.
export function trouverEmail(p: Prospect) {
  return `<div class="trouver-email">
    <strong>Trouver l’email soi-même</strong>
    <div class="liens-recherche">${liensRecherche(p)}</div>
    <div class="ligne-email">
      <input type="email" name="email" placeholder="contact@…" aria-label="Email trouvé" autocomplete="off"
        onkeydown="if (event.key === 'Enter') { event.preventDefault(); this.nextElementSibling.click(); }">
      <button type="submit" name="action" value="email" class="btn contour">${icone('valide', 14)}Enregistrer l’email</button>
    </div>
    <p class="discret">Générique ou au nom de l’entreprise : la fiche passe en « Prêt à contacter ». Nominative : en « À écrire ».</p>
  </div>`;
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
  const claude = claudeActif(env);
  const liste = actions(p, claude);
  const boutons = liste
    .map(({ valeur, libelle, style }, index) => {
      const touche = `<kbd>${index + 1}</kbd>`;
      if (valeur === 'ecrire') {
        return `<a class="btn" data-touche="${index + 1}" href="${echapper(brouillon(cible, p))}"
          onclick="fetch('/p/${encodeURIComponent(p.id)}/ecrit', { method: 'POST', keepalive: true }); setTimeout(() => location.assign(${echapper(JSON.stringify(suivanteUrl))}), 800)">${icone('email', 14)}${libelle}${touche}</a>`;
      }
      const attente = valeur === 'chercher' ? ` onclick="setTimeout(() => { this.disabled = true; this.textContent = 'Claude cherche sur le web…'; })"` : '';
      return `<button type="submit" name="action" value="${valeur}" class="btn ${style ?? ''}" data-touche="${index + 1}"${attente}>${valeur === 'chercher' ? icone('recherches', 14) : ''}${echapper(libelle)}${touche}</button>`;
    })
    .join('');

  const apercu = p.site
    ? `<div class="apercu"><div class="apercu-barre"><span class="tronque" title="${echapper(p.site)}">${echapper(p.site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</span><a href="${echapper(p.site)}" target="_blank" rel="noreferrer" class="btn contour petit">${icone('externe', 14)}Ouvrir</a></div>
        <iframe src="${echapper(p.site)}" sandbox="allow-scripts" loading="lazy" referrerpolicy="no-referrer" title="Aperçu du site"></iframe>
        <p class="discret">Page blanche ? Certains sites refusent l’aperçu : ouvre-le dans un onglet.</p></div>`
    : '';

  return page(
    `Traiter · ${nomLisible(p.nom)}`,
    `${retour}
    <header class="page-entete">
      <div><div class="titre-ligne"><h1>${echapper(nomLisible(p.nom))}</h1>${badge(p.statut)}${etiquetteRecente(p)}</div>
        <div class="sous-titre"><span>${[p.categorie, p.ville, cible?.nom ?? p.cible].filter(Boolean).map(echapper).join(' · ')}</span>${p.note_google ? `<span>${String(p.note_google).replace('.', ',')} ★ · ${p.avis_google ?? 0} avis</span>` : ''}</div></div>
      <div class="actions-entete">${priorite(p.score)}<span class="discret">${restantes} restante${restantes > 1 ? 's' : ''} dans la file</span></div>
    </header>
    <div class="traiter${p.site ? '' : ' sans-site'}">
      <form method="post" action="/traiter" class="carte" id="traitement">${champs}
        <div class="carte-contenu formulaire">
          <p class="consigne">${icone('activite', 14)}${p.statut === 'a_enrichir' && !claude ? SANS_CLAUDE : (CONSIGNES[p.statut] ?? '')}</p>
          ${p.raison && p.statut !== 'a_enrichir' ? `<div class="alerte attention"><p>${echapper(p.raison)}</p></div>` : ''}
          <div class="actions-traiter">${boutons}</div>
          ${p.constat ? `<div><span class="discret">J’ai remarqué que…</span><p class="constat">${echapper(p.constat)}</p></div>` : ''}
          ${avisDetaille(p)}
          <dl>
            ${ligne('Email', p.email ? `<strong>${echapper(p.email)}</strong> <span class="discret">${echapper(NATURES[p.email_statut] ?? p.email_statut)}${p.email_source ? ` · ${sourceLien(p.email_source)}` : ''}</span>` : '<span class="discret">aucun</span>')}
            ${ligne('Proposé par Claude', p.email_propose ? `<strong>${echapper(p.email_propose)}</strong> <span class="discret">· ${sourceLien(p.email_source)}</span>` : '')}
            ${p.site ? '' : ligne('Site', '<span class="discret">pas de site</span>')}
            ${ligne('Adresse', echapper(p.adresse))}
            ${ligne('Recherche', echapper(p.recherche))}
            ${ligne('Fiche', `<a href="/p/${encodeURIComponent(p.id)}">Fiche complète</a>${p.fiche_google ? ` · <a href="${echapper(p.fiche_google)}" target="_blank" rel="noreferrer">Google</a>` : ''}`)}
          </dl>
          ${p.statut === 'nouveau' || p.statut === 'a_ecrire' ? '' : trouverEmail(p)}
          <div class="champ"><label for="note">Note</label><textarea id="note" name="note" rows="3" placeholder="Ce qui s’est dit, une idée de maquette…">${echapper(p.note)}</textarea></div>
          <p class="discret">Raccourcis : les chiffres 1 à ${liste.length} (hors des champs).</p>
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

// Trouver, saisir ou valider l'email d'une fiche. Rend le message à afficher.
export async function actionEmail(env: Env, id: string, action: string, emailSaisi: string): Promise<string | Response> {
  const maintenant = new Date().toISOString();
  const p = await env.DB.prepare('SELECT * FROM prospects WHERE id = ?').bind(id).first<Prospect>();
  if (!p) return new Response('Fiche introuvable', { status: 404 });
  if (action === 'chercher') {
    try {
      const r = await enrichir(env, p as AEnrichir);
      await enregistrer(env, id, r, maintenant).run();
      return `${p.nom} : ${LIBELLES_RESULTAT[r.statut] ?? r.statut}${r.email ? ` (${r.email})` : r.email_propose ? ` (proposé : ${r.email_propose})` : ''}`;
    } catch (erreur) {
      return `La recherche a échoué : ${String(erreur).slice(0, 150)}`;
    }
  } else if (action === 'garder') {
    // Bas a vérifié l'adresse : une adresse sur un autre domaine devient celle de l'entreprise.
    const nature = p.email_statut === 'autre_domaine' ? 'entreprise' : p.email_statut;
    const { statut, raison } = statutSelonEmail(nature);
    await env.DB.prepare('UPDATE prospects SET email_statut = ?, statut = ?, raison = ?, statut_le = ?, email_propose = ? WHERE id = ?')
      .bind(nature, statut, raison, maintenant, '', id)
      .run();
    return `${p.email} gardé`;
  } else {
    const email = action === 'valider' ? p.email_propose : emailSaisi;
    const source = action === 'valider' ? p.email_source : 'saisi à la main';
    const r = appliquerEmail(email.trim().toLowerCase(), p, source);
    if (!r) {
      return `« ${email} » n’est pas une adresse email`;
    } else {
      // Une adresse vérifiée à la main n'a pas à repasser par « à vérifier ».
      const sure = r.statut === 'a_verifier' ? { ...r, ...statutSelonEmail('entreprise'), email_statut: 'entreprise' } : r;
      await enregistrer(env, id, sure, maintenant).run();
      return `${sure.email} enregistré : ${STATUTS[sure.statut]}`;
    }
  }
}

export async function traiter(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const url = new URL(requete.url);
  for (const cle of CLES_FILTRES) url.searchParams.set(cle, String(donnees.get(cle) ?? ''));
  const id = String(donnees.get('id') ?? '');
  const action = String(donnees.get('action') ?? '');
  const note = donnees.get('note') == null ? null : String(donnees.get('note'));
  const sauf = lireSauf(String(donnees.get('sauf') ?? ''));
  const maintenant = new Date().toISOString();
  let message = '';

  if (['email', 'valider', 'garder', 'chercher'].includes(action)) {
    if (note != null) await env.DB.prepare('UPDATE prospects SET note = ? WHERE id = ?').bind(note, id).run();
    const resultat = await actionEmail(env, id, action, String(donnees.get('email') ?? ''));
    if (resultat instanceof Response) return resultat;
    message = resultat;
  } else if (action === 'passer') {
    await env.DB.prepare('UPDATE prospects SET note = COALESCE(?, note) WHERE id = ?').bind(note, id).run();
    sauf.push(id);
  } else if (action in STATUTS && action !== 'a_analyser') {
    await changerStatut(env, id, action, note).run();
  } else {
    return new Response('Action inconnue', { status: 400 });
  }
  const suite = new URL(adresse(url, sauf), requete.url);
  if (message) suite.searchParams.set('message', message);
  return Response.redirect(suite.toString(), 303);
}
