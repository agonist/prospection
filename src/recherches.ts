import { claudeActif, depenseDuJour, modele } from './claude';
import { type Cible, DEPARTEMENTS_DEFAUT, barre, chargerCibles, normaliserTerme, optionsCibles, termesCible } from './cibles';
import { echapper, icone, page } from './html';
import { estHubertino, hubertinoActif } from './hubertino';
import { lancerCreations, lancerGoogleMaps, pairesAFaire, parametresCreations, termesRecents } from './lancements';
import { FICHES_PAR_RECHERCHE_PILOTE, lanceesAujourdhui, pilotees, reglerPilote } from './pilote';

const ETATS: Record<string, string> = {
  en_cours: 'Extraction en cours',
  import: 'Import en cours',
  terminee: 'Terminée',
  echec: 'Échec',
};

type Recherche = {
  id: number;
  run_id: string;
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

function fournisseur(r: Pick<Recherche, 'run_id'>) {
  return estHubertino(r.run_id) ? 'Hubertino' : 'Apify';
}

function progression(r: Recherche) {
  if (r.statut === 'en_cours') {
    return r.apify_statut
      ? `<span class="discret">${fournisseur(r)} ${r.apify_statut === 'RUNNING' ? 'en cours' : r.apify_statut.toLowerCase()} · ${r.apify_fiches} fiches trouvées</span>`
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
  const depuis =
    secondes < 90
      ? `il y a ${secondes} s`
      : secondes < 90 * 60
        ? `il y a ${Math.round(secondes / 60)} min`
        : secondes < 36 * 3600
          ? `il y a ${Math.round(secondes / 3600)} h`
          : `il y a ${Math.round(secondes / 86400)} jours`;
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
    const libelle = r.statut === 'en_cours' ? `Extraction ${fournisseur(r)} en cours` : (ETATS[r.statut] ?? r.statut);
    return `<span class="badge badge-${classe}">${echapper(libelle)}</span>`;
  };
  const lignes = (recherches.results as Recherche[])
    .map((r) => {
      const termes = JSON.parse(r.termes) as string[];
      if (r.source === 'sirene') termes.unshift('Sirene :');
      return `<tr>
        <td class="discret">${new Date(r.cree_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td class="nom">${echapper(cibles[r.cible]?.nom ?? r.cible)}</td>
        <td><div class="serre description">${echapper(termes.slice(0, 3).join(', '))}${termes.length > 3 ? ` <span class="discret">et ${termes.length - 3} autres</span>` : ''}</div></td>
        <td>${etat(r)}${r.erreur ? `<div class="erreur discret">${echapper(r.erreur)}</div>` : ''}</td>
        <td>${progression(r)}</td>
      </tr>`;
    })
    .join('');

  const lignesJournal = (journal.results as { le: string; niveau: string; message: string }[])
    .map((j) => `<li class="journal-${echapper(j.niveau)}"><time>${new Date(j.le).toLocaleTimeString('fr-FR')}</time><span>${echapper(j.message)}</span></li>`)
    .join('');

  const faitesAujourdhui = await lanceesAujourdhui(env);
  const actives = pilotees(cibles);
  const lignesPilote = Object.values(cibles)
    .map((c) => {
      const reste = termesCible(c).filter(({ terme }) => !faits.has(terme)).length;
      const parJour = c.pilote ?? 0;
      return `<tr>
        <td class="nom">${echapper(c.nom)}</td>
        <td><input type="number" class="court" name="pilote_${echapper(c.cle)}" value="${parJour}" min="0" max="200" aria-label="Recherches Google Maps par jour pour ${echapper(c.nom)}"></td>
        <td>${
          c.naf.length
            ? `<label class="case"><input type="checkbox" name="sirene_${echapper(c.cle)}" value="1" ${c.piloteSirene ? 'checked' : ''}><span>${echapper(c.naf.map((ligne) => ligne.split(/\s+/)[0]).join(', '))} · ${echapper((c.departements ?? []).join(', '))}</span></label>`
            : `<span class="discret">Pas de code NAF (<a href="/cibles?cle=${encodeURIComponent(c.cle)}">en ajouter</a>)</span>`
        }</td>
        <td class="chiffre">${parJour ? `${faitesAujourdhui[c.cle] ?? 0} / ${parJour}` : '<span class="discret">–</span>'}</td>
        <td>${reste ? `${reste} recherche${reste > 1 ? 's' : ''}${parJour ? `<div class="discret">environ ${Math.ceil(reste / parJour)} jour${Math.ceil(reste / parJour) > 1 ? 's' : ''}</div>` : ''}` : '<span class="discret">tout est fait</span>'}</td>
      </tr>`;
    })
    .join('');

  return page(
    'Recherches',
    `<header class="page-entete">
      <div><h1>Recherches</h1><p>Lance une extraction Google Maps ou cherche les entreprises tout juste créées, et suis l’avancement.</p></div>
    </header>
    <form method="post" action="/pilote" class="carte bloc">
      <div class="carte-entete"><div><h2 class="carte-titre">${icone('jouer')}Pilote automatique <span class="badge ${actives.length ? 'badge-nouveau' : ''}">${actives.length ? `Actif sur ${actives.length} cible${actives.length > 1 ? 's' : ''}` : 'Arrêté'}</span></h2>
        <p class="carte-description">Il lance seul les recherches pas encore faites, une extraction à la fois, ${FICHES_PAR_RECHERCHE_PILOTE} fiches au plus par recherche, puis l’analyse et la recherche d’email suivent. Il tourne tant que la tâche tourne.</p></div>
        <button type="submit" class="btn petit">Enregistrer</button></div>
      <div class="tableau" style="margin-top: 12px"><table><thead><tr><th>Cible</th><th>Google Maps, recherches par jour</th><th>Nouvelles entreprises chaque semaine</th><th class="chiffre">Aujourd’hui</th><th>Reste à chercher</th></tr></thead><tbody>${lignesPilote}</tbody></table></div>
    </form>
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
          ${
            hubertinoActif(env)
              ? '<p class="aide">Google Maps passe par Hubertino : l’email trouvé sur le site de chaque entreprise est compris dans le prix.</p>'
              : `<label class="case"><input type="checkbox" name="contacts" value="1">
            <span><strong>Extraire aussi les emails avec Apify</strong>Option payante. Inutile en général : l’outil lit déjà les sites, et Claude cherche les emails manquants.</span></label>`
          }
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
            <div class="champ"><label for="departements">Départements</label><input id="departements" type="text" name="departements" value="${echapper((cible?.departements?.length ? cible.departements : DEPARTEMENTS_DEFAUT).join(', '))}" required></div>
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
  if (donnees.get('source') === 'sirene') return lancerNouvelles(requete, env, cibles[nomCible], lignes('naf'), String(donnees.get('departements') ?? ''), donnees);
  const metiers = lignes('metiers');
  const communes = lignes('communes');
  const max = Math.min(200, Math.max(1, Number(donnees.get('max')) || 30));
  if (!metiers.length || !communes.length) return new Response('Métiers et communes obligatoires', { status: 400 });

  const { demandees, aFaire: paires } = await pairesAFaire(env, metiers, communes, donnees.get('forcer') === '1');
  const sautes = demandees - paires.length;
  if (!paires.length) {
    return page(
      'Déjà fait',
      `<a class="retour" href="/recherches?cible=${encodeURIComponent(nomCible)}">${icone('retour')}Recherches</a>
      <div class="alerte attention"><p>Ces ${demandees} recherches ont toutes été faites il y a moins de 6 mois, rien n’a été lancé. Ajoute d’autres communes, change de métier, ou coche « Refaire les recherches déjà faites ».</p></div>`,
      'recherches',
    );
  }
  try {
    await lancerGoogleMaps(env, nomCible, paires, max, { contacts: donnees.get('contacts') === '1', sautes });
  } catch (erreur) {
    return page(
      'Erreur',
      `<a class="retour" href="/recherches">${icone('retour')}Recherches</a><div class="alerte danger"><p>${echapper(String(erreur))}</p></div>`,
      'recherches',
    );
  }
  return Response.redirect(new URL(`/recherches?message=${encodeURIComponent(`Recherche lancée : ${paires.length} recherches sur Google Maps`)}`, requete.url).toString(), 303);
}

async function lancerNouvelles(requete: Request, env: Env, cible: Cible, naf: string[], departements: string, donnees: FormData) {
  const nomCible = cible.cle;
  const { codes, depts } = parametresCreations(naf, departements);
  const jours = Math.min(365, Math.max(1, Number(donnees.get('jours')) || 30));
  const max = Math.min(2000, Math.max(1, Number(donnees.get('max')) || 300));
  if (!codes.length || !depts.length) return new Response('Codes NAF (ex. 01.21Z) et départements obligatoires', { status: 400 });
  try {
    await lancerCreations(env, cible, { codes, depts, jours, max });
  } catch (erreur) {
    return page(
      'Erreur',
      `<a class="retour" href="/recherches">${icone('retour')}Recherches</a><div class="alerte danger"><p>${echapper(String(erreur))}</p></div>`,
      'recherches',
    );
  }
  return Response.redirect(new URL(`/recherches?cible=${encodeURIComponent(nomCible)}&message=${encodeURIComponent('Recherche des nouvelles entreprises lancée')}`, requete.url).toString(), 303);
}

export async function enregistrerPilote(requete: Request, env: Env) {
  const donnees = await requete.formData();
  const cibles = await chargerCibles(env);
  await env.DB.batch(
    Object.keys(cibles).map((cle) => reglerPilote(env, cle, { pilote: Number(donnees.get(`pilote_${cle}`)) || 0, piloteSirene: donnees.get(`sirene_${cle}`) === '1' })),
  );
  const actives = pilotees(await chargerCibles(env));
  return Response.redirect(
    new URL(`/recherches?message=${encodeURIComponent(actives.length ? `Pilote automatique actif sur ${actives.length} cible${actives.length > 1 ? 's' : ''}` : 'Pilote automatique arrêté')}`, requete.url).toString(),
    303,
  );
}
