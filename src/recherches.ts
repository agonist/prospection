import { CIBLES } from '../scripts/cibles.mjs';
import { lancer } from './apify';
import { echapper, page } from './html';

const ETATS: Record<string, string> = {
  en_cours: 'Extraction Apify en cours',
  import: 'Import en cours',
  terminee: 'Terminée',
  echec: 'Échec',
};

type Recherche = {
  id: number;
  apify_statut: string;
  apify_fiches: number;
  cible: string;
  termes: string;
  statut: string;
  fiches: number;
  importees: number;
  erreur: string;
  cree_le: string;
};

function progression(r: Recherche) {
  if (r.statut === 'en_cours') return r.apify_statut ? `Apify ${r.apify_statut === 'RUNNING' ? 'en cours' : r.apify_statut.toLowerCase()} : ${r.apify_fiches} fiches trouvées` : 'en attente du premier passage';
  if (!r.fiches) return '';
  const pourcentage = Math.round((r.importees / r.fiches) * 100);
  return `<progress value="${r.importees}" max="${r.fiches}"></progress> ${r.importees} / ${r.fiches} importées (${pourcentage} %)`;
}

// La tâche passe toutes les minutes : au-delà de 3 minutes sans passage, elle ne tourne plus.
function etatTache(dernier: string | undefined, travail: boolean) {
  if (!dernier) return `<p class="${travail ? 'erreur' : 'discret'}">La tâche automatique n’est encore jamais passée. En local, elle tourne tant que <code>pnpm local</code> est ouvert.</p>`;
  const secondes = Math.round((Date.now() - new Date(dernier).getTime()) / 1000);
  const depuis = secondes < 90 ? `il y a ${secondes} s` : `il y a ${Math.round(secondes / 60)} min`;
  if (secondes > 180) return `<p class="erreur">Dernier passage de la tâche ${depuis} : elle ne tourne plus. En local, relance <code>pnpm local</code>.</p>`;
  return `<p>Dernier passage de la tâche ${depuis}.</p>`;
}

export async function pageRecherches(url: URL, env: Env) {
  const nomCible = url.searchParams.get('cible') || 'vin';
  const cible = CIBLES[nomCible as keyof typeof CIBLES] ?? CIBLES.vin;
  const [recherches, enAnalyse, passage, journal] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM recherches ORDER BY id DESC LIMIT 30'),
    env.DB.prepare("SELECT COUNT(*) AS n FROM prospects WHERE statut = 'a_analyser'"),
    env.DB.prepare("SELECT valeur FROM etat WHERE cle = 'dernier_passage'"),
    env.DB.prepare('SELECT * FROM journal ORDER BY id DESC LIMIT 60'),
  ]);
  const attente = (enAnalyse.results[0] as { n: number }).n;
  const dernier = (passage.results[0] as { valeur: string } | undefined)?.valeur;
  const enCours = (recherches.results as Recherche[]).some((r) => r.statut === 'en_cours' || r.statut === 'import');
  const travail = enCours || attente > 0;

  const optionsCibles = Object.entries(CIBLES)
    .map(([cle, { nom }]) => `<option value="${cle}" ${cle === nomCible ? 'selected' : ''}>${echapper(nom)}</option>`)
    .join('');
  const lignes = (recherches.results as Recherche[])
    .map((r) => {
      const termes = JSON.parse(r.termes) as string[];
      return `<tr>
        <td class="discret">${new Date(r.cree_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td>${echapper(CIBLES[r.cible as keyof typeof CIBLES]?.nom ?? r.cible)}</td>
        <td>${echapper(termes.slice(0, 3).join(', '))}${termes.length > 3 ? ` <span class="discret">et ${termes.length - 3} autres</span>` : ''}</td>
        <td>${echapper(ETATS[r.statut] ?? r.statut)}${r.erreur ? `<div class="erreur">${echapper(r.erreur)}</div>` : ''}</td>
        <td>${progression(r)}</td>
      </tr>`;
    })
    .join('');

  const lignesJournal = (journal.results as { le: string; niveau: string; message: string }[])
    .map(
      (j) =>
        `<li class="journal-${echapper(j.niveau)}"><time>${new Date(j.le).toLocaleTimeString('fr-FR')}</time> ${echapper(j.message)}</li>`,
    )
    .join('');

  return page(
    'Recherches',
    `${travail ? '<meta http-equiv="refresh" content="10">' : ''}
    <p><a href="/">← Prospects</a></p>
    <section class="activite">
      <h2>Activité</h2>
      ${etatTache(dernier, travail)}
      <p>${attente ? `${attente} sites en attente d’analyse.` : 'Aucun site en attente d’analyse.'}</p>
      ${travail ? '<p class="discret">Cette page se met à jour toute seule toutes les 10 secondes.</p>' : ''}
      ${lignesJournal ? `<ol class="journal">${lignesJournal}</ol>` : '<p class="discret">Le journal est vide pour l’instant.</p>'}
    </section>
    <header class="entete"><h1>Nouvelle recherche</h1></header>
    <form method="post" action="/recherches" class="recherche">
      <label>Cible
        <select name="cible" onchange="location.search = '?cible=' + this.value">${optionsCibles}</select>
      </label>
      <label>Métier recherché
        <input type="text" name="metier" value="${echapper(cible.recherche)}" required>
      </label>
      <label>Communes, une par ligne
        <textarea name="communes" rows="10" required>${echapper(cible.communes.join('\n'))}</textarea>
      </label>
      <label>Fiches maximum par commune
        <input type="number" name="max" value="30" min="1" max="200" required>
      </label>
      <label class="case"><input type="checkbox" name="contacts" value="1" checked> Extraire les emails avec Apify (option payante « contacts enrichment », quelques dollars pour 1 000 fiches)</label>
      <p class="discret">Chaque ligne devient une recherche Google Maps « métier commune ». L’extraction prend quelques minutes, puis chaque site est analysé automatiquement.</p>
      <button type="submit">Lancer la recherche</button>
    </form>
    <h2>Recherches lancées</h2>
    ${lignes ? `<table><thead><tr><th>Lancée le</th><th>Cible</th><th>Recherches</th><th>État</th><th>Fiches</th></tr></thead><tbody>${lignes}</tbody></table>` : '<p class="vide">Aucune recherche pour l’instant.</p>'}`,
  );
}

export async function lancerRecherche(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const nomCible = String(donnees.get('cible') ?? '');
  if (!(nomCible in CIBLES)) return new Response('Cible inconnue', { status: 400 });
  const metier = String(donnees.get('metier') ?? '').trim();
  const communes = String(donnees.get('communes') ?? '')
    .split('\n')
    .map((commune) => commune.trim())
    .filter(Boolean);
  const max = Math.min(200, Math.max(1, Number(donnees.get('max')) || 30));
  if (!metier || !communes.length) return new Response('Métier et communes obligatoires', { status: 400 });

  const termes = [...new Set(communes.map((commune) => `${metier} ${commune}`))];
  try {
    const contacts = donnees.get('contacts') === '1';
    const { runId, datasetId } = await lancer(env, termes, max, contacts);
    const maintenant = new Date().toISOString();
    const { meta } = await env.DB.prepare('INSERT INTO recherches (cible, termes, run_id, dataset_id, cree_le) VALUES (?, ?, ?, ?, ?)')
      .bind(nomCible, JSON.stringify(termes), runId, datasetId, maintenant)
      .run();
    await env.DB.prepare('INSERT INTO journal (le, niveau, message, recherche_id) VALUES (?, ?, ?, ?)')
      .bind(maintenant, 'info', `Recherche n°${meta.last_row_id} lancée sur Apify : ${termes.length} recherches, ${max} fiches maximum chacune${contacts ? ', avec extraction des emails' : ''}.`, meta.last_row_id)
      .run();
  } catch (erreur) {
    return page('Erreur', `<p><a href="/recherches">← Recherches</a></p><p class="alerte">${echapper(String(erreur))}</p>`);
  }
  return Response.redirect(new URL('/recherches', requete.url).toString(), 303);
}
