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
  cible: string;
  termes: string;
  statut: string;
  fiches: number;
  importees: number;
  erreur: string;
  cree_le: string;
};

export async function pageRecherches(url: URL, env: Env) {
  const nomCible = url.searchParams.get('cible') || 'vin';
  const cible = CIBLES[nomCible as keyof typeof CIBLES] ?? CIBLES.vin;
  const [recherches, enAnalyse] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM recherches ORDER BY id DESC LIMIT 30'),
    env.DB.prepare("SELECT COUNT(*) AS n FROM prospects WHERE statut = 'a_analyser'"),
  ]);
  const attente = (enAnalyse.results[0] as { n: number }).n;

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
        <td>${echapper(ETATS[r.statut] ?? r.statut)}${r.erreur ? `<div class="discret">${echapper(r.erreur)}</div>` : ''}</td>
        <td>${r.fiches ? `${r.importees} / ${r.fiches}` : ''}</td>
      </tr>`;
    })
    .join('');

  return page(
    'Recherches',
    `<p><a href="/">← Prospects</a></p>
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
      <p class="discret">Chaque ligne devient une recherche Google Maps « métier commune ». L’extraction prend quelques minutes, puis chaque site est analysé automatiquement, environ 8 par minute.</p>
      <button type="submit">Lancer la recherche</button>
    </form>
    <h2>Recherches lancées</h2>
    ${attente ? `<p>${attente} prospects en attente d’analyse.</p>` : ''}
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
    const { runId, datasetId } = await lancer(env, termes, max);
    await env.DB.prepare('INSERT INTO recherches (cible, termes, run_id, dataset_id, cree_le) VALUES (?, ?, ?, ?, ?)')
      .bind(nomCible, JSON.stringify(termes), runId, datasetId, new Date().toISOString())
      .run();
  } catch (erreur) {
    return page('Erreur', `<p><a href="/recherches">← Recherches</a></p><p class="alerte">${echapper(String(erreur))}</p>`);
  }
  return Response.redirect(new URL('/recherches', requete.url).toString(), 303);
}
