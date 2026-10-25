import { lancer, lancerSirene } from './apify';
import { claudeActif, depenseDuJour, modele } from './claude';
import { DELAI_TERMES_MS, barre, chargerCibles, codeNaf, normaliserTerme, optionsCibles, termesCible } from './cibles';
import { echapper, icone, page } from './html';

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
  source: string;
  statut: string;
  fiches: number;
  importees: number;
  erreur: string;
  cree_le: string;
};

function dollars(montant: number) {
  return `${montant.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

function jour(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// Les recherches « métier commune » lancées ces 6 derniers mois, avec leur date.
async function termesRecents(env: Env) {
  const { results } = await env.DB.prepare('SELECT terme, lance_le FROM termes WHERE lance_le > ?')
    .bind(new Date(Date.now() - DELAI_TERMES_MS).toISOString())
    .all<{ terme: string; lance_le: string }>();
  return new Map(results.map(({ terme, lance_le }) => [terme, lance_le]));
}

function progression(r: Recherche) {
  if (r.statut === 'en_cours') {
    return r.apify_statut
      ? `<span class="discret">Apify ${r.apify_statut === 'RUNNING' ? 'en cours' : r.apify_statut.toLowerCase()} · ${r.apify_fiches} fiches trouvées</span>`
      : '<span class="discret">En attente du premier passage</span>';
  }
  if (!r.fiches) return '';
  return barre(r.importees, r.fiches, `${r.importees} / ${r.fiches}`);
}

// La tâche passe au moins chaque minute : au-delà de 3 minutes sans passage, elle ne tourne plus.
function etatTache(dernier: string | undefined, travail: boolean) {
  if (!dernier) {
    return `<p class="etat-tache"><span class="voyant ${travail ? 'arret' : 'inactif'}"></span>La tâche automatique n’est encore jamais passée.</p><p class="discret">En local, elle tourne tant que <code>pnpm local</code> est ouvert.</p>`;
  }
  const secondes = Math.round((Date.now() - new Date(dernier).getTime()) / 1000);
  const depuis = secondes < 90 ? `il y a ${secondes} s` : `il y a ${Math.round(secondes / 60)} min`;
  if (secondes > 180) {
    return `<p class="etat-tache erreur"><span class="voyant arret"></span>Dernier passage de la tâche ${depuis} : elle ne tourne plus.</p><p class="discret">En local, relance <code>pnpm local</code>.</p>`;
  }
  return `<p class="etat-tache"><span class="voyant"></span>Dernier passage de la tâche ${depuis}.</p>`;
}

export async function pageRecherches(url: URL, env: Env) {
  const cibles = await chargerCibles(env);
  const cible = cibles[url.searchParams.get('cible') ?? ''] ?? Object.values(cibles)[0];
  const nomCible = cible?.cle ?? '';
  const faits = await termesRecents(env);
  // Une commune est faite quand tous les métiers de la cible y ont été cherchés.
  const termes = cible ? termesCible(cible) : [];
  const aFaire = termes.filter(({ terme }) => !faits.has(terme));
  const restantes = [...new Set(aFaire.map(({ commune }) => commune))];
  const communesFaites = (cible?.communes ?? []).map((commune) => ({
    commune,
    le: restantes.includes(commune) ? undefined : faits.get(normaliserTerme(`${cible.metiers[0]} ${commune}`)),
  }));
  const dejaFaites = communesFaites.filter(({ le }) => le);
  const MAX_DEFAUT = 30;
  const [recherches, enAnalyse, passage, journal] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM recherches ORDER BY id DESC LIMIT 30'),
    env.DB.prepare("SELECT COUNT(*) AS n FROM prospects WHERE statut = 'a_analyser'"),
    env.DB.prepare("SELECT valeur FROM etat WHERE cle = 'dernier_passage'"),
    env.DB.prepare('SELECT * FROM journal ORDER BY id DESC LIMIT 60'),
  ]);
  const attente = (enAnalyse.results[0] as { n: number }).n;
  const depense = claudeActif(env) ? await depenseDuJour(env) : 0;
  const dernier = (passage.results[0] as { valeur: string } | undefined)?.valeur;
  const enCours = (recherches.results as Recherche[]).some((r) => r.statut === 'en_cours' || r.statut === 'import');
  const travail = enCours || attente > 0;

  const etat = (r: Recherche) => {
    const classe = { en_cours: 'a_analyser', import: 'a_analyser', terminee: 'nouveau', echec: 'desinscrit' }[r.statut] ?? '';
    return `<span class="badge badge-${classe}">${echapper(ETATS[r.statut] ?? r.statut)}</span>`;
  };
  const lignes = (recherches.results as Recherche[])
    .map((r) => {
      const termes = JSON.parse(r.termes) as string[];
      if (r.source === 'sirene') termes.unshift('Sirene :');
      return `<tr>
        <td class="discret">${new Date(r.cree_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td class="nom">${echapper(cibles[r.cible]?.nom ?? r.cible)}</td>
        <td class="tronque">${echapper(termes.slice(0, 3).join(', '))}${termes.length > 3 ? ` <span class="discret">et ${termes.length - 3} autres</span>` : ''}</td>
        <td>${etat(r)}${r.erreur ? `<div class="erreur discret">${echapper(r.erreur)}</div>` : ''}</td>
        <td>${progression(r)}</td>
      </tr>`;
    })
    .join('');

  const lignesJournal = (journal.results as { le: string; niveau: string; message: string }[])
    .map((j) => `<li class="journal-${echapper(j.niveau)}"><time>${new Date(j.le).toLocaleTimeString('fr-FR')}</time><span>${echapper(j.message)}</span></li>`)
    .join('');

  return page(
    'Recherches',
    `<header class="page-entete">
      <div><h1>Recherches</h1><p>Lance une extraction Google Maps ou cherche les entreprises tout juste créées, et suis l’avancement.</p></div>
    </header>
    <div class="grille deux-colonnes">
      <form method="post" action="/recherches" class="carte">
        <div class="carte-entete"><div><h2 class="carte-titre">Nouvelle recherche</h2><p class="carte-description">Chaque métier est cherché dans chaque commune sur Google Maps.</p></div></div>
        <div class="carte-contenu formulaire">
          <div class="champ"><label for="cible">Cible</label>
            <select id="cible" name="cible" onchange="location.search = '?cible=' + this.value">${optionsCibles(cibles, nomCible)}</select></div>
          ${
            termes.length
              ? `<div class="alerte"><p><strong>${aFaire.length} recherches à faire sur ${termes.length}</strong> pour cette cible, soit jusqu’à ${aFaire.length * MAX_DEFAUT} fiches avec ${MAX_DEFAUT} fiches par recherche. Les recherches déjà faites sont sautées au lancement.</p></div>`
              : ''
          }
          <div class="ligne">
            <div class="champ"><label for="metiers">Métiers</label>
              <textarea id="metiers" name="metiers" rows="9" required>${echapper((cible?.metiers ?? []).join('\n'))}</textarea>
              <span class="aide">Un par ligne.</span></div>
            <div class="champ"><label for="communes">Communes</label>
              <textarea id="communes" name="communes" rows="9" required>${echapper(restantes.join('\n'))}</textarea>
              <span class="aide">Une par ligne. Celles qui restent à faire (<a href="/cibles?cle=${encodeURIComponent(nomCible)}">modifier la cible</a>).</span></div>
          </div>
          ${
            dejaFaites.length
              ? `<p class="aide">Déjà faites ces 6 derniers mois pour tous les métiers, ${dejaFaites.length} communes sur ${communesFaites.length} : ${dejaFaites.map(({ commune, le }) => `${echapper(commune)} (${jour(le!)})`).join(', ')}.</p>`
              : ''
          }
          <div class="champ"><label for="max">Fiches maximum par recherche</label>
            <input id="max" type="number" name="max" value="${MAX_DEFAUT}" min="1" max="200" required></div>
          <label class="case"><input type="checkbox" name="contacts" value="1">
            <span><strong>Extraire aussi les emails avec Apify</strong>Option payante. Inutile en général : l’outil lit déjà les sites, et Claude cherche les emails manquants.</span></label>
          <label class="case"><input type="checkbox" name="forcer" value="1">
            <span><strong>Refaire les recherches déjà faites</strong>Par défaut, une recherche lancée il y a moins de 6 mois est sautée pour ne pas payer deux fois.</span></label>
          <div><button type="submit" class="btn">${icone('recherches')}Lancer la recherche</button></div>
        </div>
      </form>
      <section class="carte">
        <div class="carte-entete"><div><h2 class="carte-titre">${icone('activite')}Activité</h2>
          <p class="carte-description">${travail ? 'Mise à jour automatique toutes les 10 secondes.' : 'Rien en cours.'}</p></div></div>
        <div class="carte-contenu grille">
          ${etatTache(dernier, travail)}
          ${
            claudeActif(env)
              ? `<p class="etat-tache"><span class="voyant"></span>Claude juge chaque site (${echapper(modele(env))}) <span class="discret">· ${dollars(depense)} aujourd’hui</span></p>`
              : '<p class="etat-tache"><span class="voyant inactif"></span>Claude ne juge pas les sites : ajoute <code>OPENROUTER_API_KEY</code> ou <code>ANTHROPIC_API_KEY</code> dans <code>.dev.vars</code>.</p>'
          }
          ${attente ? barre(0, 1, `${attente} sites en attente d’analyse`) : '<p class="discret">Aucun site en attente d’analyse.</p>'}
          ${lignesJournal ? `<ol class="journal">${lignesJournal}</ol>` : '<p class="discret">Le journal est vide pour l’instant.</p>'}
        </div>
      </section>
    </div>
    <form method="post" action="/recherches" class="carte" style="margin-top: 16px">
      <input type="hidden" name="source" value="sirene">
      <input type="hidden" name="cible" value="${echapper(nomCible)}">
      <div class="carte-entete"><div><h2 class="carte-titre">Nouvelles entreprises</h2><p class="carte-description">Les entreprises tout juste créées dans le registre Sirene, pour ${echapper(cible?.nom ?? '')}. Souvent pas encore de site : l’email part avec un angle « félicitations pour le lancement ».</p></div></div>
      <div class="carte-contenu formulaire">
        <div class="ligne">
          <div class="champ"><label for="naf">Codes d’activité (NAF)</label>
            <textarea id="naf" name="naf" rows="6" required>${echapper((cible?.naf ?? []).join('\n'))}</textarea>
            <span class="aide">Code puis libellé, un par ligne (<a href="/cibles?cle=${encodeURIComponent(nomCible)}">modifier la cible</a>).</span></div>
          <div class="grille">
            <div class="champ"><label for="departements">Départements</label><input id="departements" type="text" name="departements" value="67, 68" required></div>
            <div class="champ"><label for="jours">Créées ces derniers jours</label><input id="jours" type="number" name="jours" value="30" min="1" max="365" required></div>
            <div class="champ"><label for="max-sirene">Entreprises maximum</label><input id="max-sirene" type="number" name="max" value="300" min="1" max="2000" required></div>
          </div>
        </div>
        <p class="aide">Gratuit chez Apify hors consommation de la plateforme. Une clé INSEE gratuite (<code>INSEE_API_KEY</code>) rend la recherche plus complète.</p>
        <div><button type="submit" class="btn">${icone('recherches')}Chercher les nouvelles entreprises</button></div>
      </div>
    </form>
    <section class="carte" style="margin-top: 16px">
      <div class="carte-entete"><h2 class="carte-titre">Recherches lancées</h2></div>
      <div class="carte-contenu" style="padding: 12px 0 0">
      ${lignes ? `<div class="tableau"><table><thead><tr><th>Lancée le</th><th>Cible</th><th>Recherches</th><th>État</th><th>Progression</th></tr></thead><tbody>${lignes}</tbody></table></div>` : '<div class="vide"><strong>Aucune recherche pour l’instant</strong>Remplis le formulaire pour lancer la première.</div>'}
      </div>
    </section>`,
    'recherches',
    travail ? '<meta http-equiv="refresh" content="10">' : '',
  );
}

export async function lancerRecherche(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const nomCible = String(donnees.get('cible') ?? '');
  const cibles = await chargerCibles(env);
  if (!(nomCible in cibles)) return new Response('Cible inconnue', { status: 400 });
  const lignes = (champ: string) =>
    String(donnees.get(champ) ?? '')
      .split('\n')
      .map((ligne) => ligne.trim())
      .filter(Boolean);
  if (donnees.get('source') === 'sirene') return lancerNouvelles(requete, env, nomCible, lignes('naf'), String(donnees.get('departements') ?? ''), donnees);
  const metiers = lignes('metiers');
  const communes = lignes('communes');
  const max = Math.min(200, Math.max(1, Number(donnees.get('max')) || 30));
  if (!metiers.length || !communes.length) return new Response('Métiers et communes obligatoires', { status: 400 });

  const demandes = [
    ...new Map(communes.flatMap((commune) => metiers.map((metier) => [normaliserTerme(`${metier} ${commune}`), `${metier} ${commune}`] as const))).entries(),
  ];
  const faits = donnees.get('forcer') === '1' ? new Map<string, string>() : await termesRecents(env);
  const termes = demandes.filter(([cle]) => !faits.has(cle)).map(([, terme]) => terme);
  const sautes = demandes.length - termes.length;
  if (!termes.length) {
    return page(
      'Déjà fait',
      `<a class="retour" href="/recherches?cible=${encodeURIComponent(nomCible)}">${icone('retour')}Recherches</a>
      <div class="alerte attention"><p>Ces ${demandes.length} recherches ont toutes été faites il y a moins de 6 mois, rien n’a été lancé. Ajoute d’autres communes, change de métier, ou coche « Refaire les recherches déjà faites ».</p></div>`,
      'recherches',
    );
  }
  try {
    const contacts = donnees.get('contacts') === '1';
    const { runId, datasetId } = await lancer(env, termes, max, contacts);
    const maintenant = new Date().toISOString();
    const { meta } = await env.DB.prepare('INSERT INTO recherches (cible, termes, run_id, dataset_id, cree_le) VALUES (?, ?, ?, ?, ?)')
      .bind(nomCible, JSON.stringify(termes), runId, datasetId, maintenant)
      .run();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO journal (le, niveau, message, recherche_id) VALUES (?, ?, ?, ?)').bind(
        maintenant,
        'info',
        `Recherche n°${meta.last_row_id} lancée sur Apify : ${termes.length} recherches, ${max} fiches maximum chacune${contacts ? ', avec extraction des emails' : ''}${sautes ? `. ${sautes} déjà faites il y a moins de 6 mois, sautées` : ''}.`,
        meta.last_row_id,
      ),
      env.DB.prepare(
        `INSERT INTO termes (terme, cible, recherche_id, lance_le) SELECT value, ?, ?, ? FROM json_each(?) WHERE true
          ON CONFLICT (terme) DO UPDATE SET cible = excluded.cible, recherche_id = excluded.recherche_id, lance_le = excluded.lance_le`,
      ).bind(nomCible, meta.last_row_id, maintenant, JSON.stringify(termes.map(normaliserTerme))),
    ]);
  } catch (erreur) {
    return page(
      'Erreur',
      `<a class="retour" href="/recherches">${icone('retour')}Recherches</a><div class="alerte danger"><p>${echapper(String(erreur))}</p></div>`,
      'recherches',
    );
  }
  return Response.redirect(new URL(`/recherches?message=${encodeURIComponent(`Recherche lancée : ${termes.length} recherches sur Google Maps`)}`, requete.url).toString(), 303);
}

async function lancerNouvelles(requete: Request, env: Env, nomCible: string, naf: string[], departements: string, donnees: FormData) {
  const codes = [...new Set(naf.map(codeNaf).filter((code) => /^\d{2}\.\d{2}[A-Z]$/.test(code)))];
  const depts = [...new Set(departements.split(/[\s,;]+/).map((d) => d.trim().toUpperCase()).filter(Boolean))];
  const jours = Math.min(365, Math.max(1, Number(donnees.get('jours')) || 30));
  const max = Math.min(2000, Math.max(1, Number(donnees.get('max')) || 300));
  if (!codes.length || !depts.length) return new Response('Codes NAF (ex. 01.21Z) et départements obligatoires', { status: 400 });
  try {
    const { runId, datasetId } = await lancerSirene(env, { departements: depts, naf: codes, jours, max });
    const maintenant = new Date().toISOString();
    const { meta } = await env.DB.prepare("INSERT INTO recherches (cible, termes, run_id, dataset_id, cree_le, source) VALUES (?, ?, ?, ?, ?, 'sirene')")
      .bind(nomCible, JSON.stringify([...codes, `${jours} jours`, depts.join(', ')]), runId, datasetId, maintenant)
      .run();
    await env.DB.prepare('INSERT INTO journal (le, niveau, message, recherche_id) VALUES (?, ?, ?, ?)')
      .bind(maintenant, 'info', `Recherche n°${meta.last_row_id} lancée sur Apify : entreprises créées ces ${jours} derniers jours (${codes.join(', ')}) dans le ${depts.join(', ')}.`, meta.last_row_id)
      .run();
  } catch (erreur) {
    return page(
      'Erreur',
      `<a class="retour" href="/recherches">${icone('retour')}Recherches</a><div class="alerte danger"><p>${echapper(String(erreur))}</p></div>`,
      'recherches',
    );
  }
  return Response.redirect(new URL(`/recherches?cible=${encodeURIComponent(nomCible)}&message=${encodeURIComponent('Recherche des nouvelles entreprises lancée')}`, requete.url).toString(), 303);
}
