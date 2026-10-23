// Page d'accueil : ce qu'il y a à faire aujourd'hui et où en est la prospection.
import { DELAI_TERMES_MS, chargerCibles, termesCible } from './cibles';
import { budget, claudeActif, depenseDuJour } from './claude';
import { echapper, icone, page } from './html';

const JOURS = 14;
const REPONSES = "('a_repondu', 'maquette', 'client')";

type ParCible = { cible: string; n: number; prets: number; ecrire: number; enrichir: number; verifier: number; contactes: number; reponses: number; clients: number };

function nombre(n: number) {
  return n.toLocaleString('fr-FR');
}

function pourcent(valeur: number, total: number) {
  return total ? `${Math.round((valeur / total) * 100)} %` : '–';
}

// Les 14 derniers jours, du plus ancien à aujourd'hui (jours UTC, comme les dates en base).
function derniersJours() {
  const aujourdhui = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  return Array.from({ length: JOURS }, (_, i) => new Date(aujourdhui - (JOURS - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

// Histogramme d'une seule série : barres fines, info-bulle au survol de la colonne entière.
function histogramme(titre: string, unite: string, valeurs: Map<string, number>) {
  const jours = derniersJours();
  const max = Math.max(1, ...jours.map((j) => valeurs.get(j) ?? 0));
  const total = jours.reduce((somme, j) => somme + (valeurs.get(j) ?? 0), 0);
  const colonnes = jours
    .map((j) => {
      const n = valeurs.get(j) ?? 0;
      const libelle = new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
      return `<div class="colonne" data-info="${echapper(`${libelle} · ${n} ${unite}`)}" aria-label="${echapper(`${libelle} : ${n} ${unite}`)}"><i style="height: ${n ? Math.max(4, Math.round((n / max) * 100)) : 0}%"></i></div>`;
    })
    .join('');
  const debut = new Date(`${jours[0]}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `<div class="histogramme">
    <div class="histogramme-entete"><span>${titre}</span><strong>${nombre(total)}</strong></div>
    <div class="colonnes" role="img" aria-label="${echapper(`${titre} : ${total} ${unite} sur ${JOURS} jours`)}">${colonnes}</div>
    <div class="histogramme-axe"><span>${debut}</span><span>aujourd’hui</span></div>
  </div>`;
}

// Barres horizontales étiquetées : l'entonnoir et les avis de Claude.
function barres(lignes: { libelle: string; n: number; detail?: string; href?: string }[], max: number) {
  return `<ol class="barres">${lignes
    .map(({ libelle, n, detail, href }) => {
      const largeur = max ? Math.max(n ? 1 : 0, Math.round((n / max) * 100)) : 0;
      const nom = href ? `<a href="${echapper(href)}">${echapper(libelle)}</a>` : echapper(libelle);
      return `<li><div class="barres-texte"><span>${nom}</span><span><strong>${nombre(n)}</strong>${detail ? ` <em>${echapper(detail)}</em>` : ''}</span></div><div class="barres-piste"><i style="width: ${largeur}%"></i></div></li>`;
    })
    .join('')}</ol>`;
}

export async function tableau(env: Env) {
  const depuis = derniersJours()[0];
  const [cibles, resultats] = await Promise.all([
    chargerCibles(env),
    env.DB.batch([
      env.DB.prepare('SELECT statut, COUNT(*) AS n FROM prospects GROUP BY statut'),
      env.DB.prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(statut <> 'a_analyser'), 0) AS analyses, COALESCE(SUM(constat <> ''), 0) AS constats,
          COALESCE(SUM(contacte_le IS NOT NULL), 0) AS contactes, COALESCE(SUM(statut IN ${REPONSES}), 0) AS reponses, COALESCE(SUM(statut = 'client'), 0) AS clients FROM prospects`,
      ),
      env.DB.prepare(
        `SELECT cible, COUNT(*) AS n, SUM(statut = 'nouveau') AS prets, SUM(statut = 'a_ecrire') AS ecrire, SUM(statut = 'a_enrichir') AS enrichir, SUM(statut = 'a_verifier') AS verifier,
          SUM(contacte_le IS NOT NULL) AS contactes, SUM(statut IN ${REPONSES}) AS reponses, SUM(statut = 'client') AS clients FROM prospects GROUP BY cible`,
      ),
      env.DB.prepare('SELECT terme FROM termes WHERE lance_le > ?').bind(new Date(Date.now() - DELAI_TERMES_MS).toISOString()),
      env.DB.prepare('SELECT substr(cree_le, 1, 10) AS jour, COUNT(*) AS n FROM prospects WHERE cree_le >= ? GROUP BY jour').bind(depuis),
      env.DB.prepare('SELECT substr(contacte_le, 1, 10) AS jour, COUNT(*) AS n FROM prospects WHERE contacte_le >= ? GROUP BY jour').bind(depuis),
      env.DB.prepare("SELECT verdict, COUNT(*) AS n, ROUND(AVG(qualite), 1) AS qualite FROM prospects WHERE verdict <> '' GROUP BY verdict"),
      env.DB.prepare('SELECT * FROM journal ORDER BY id DESC LIMIT 8'),
      env.DB.prepare("SELECT (SELECT COUNT(*) FROM recherches WHERE statut IN ('en_cours', 'import')) AS recherches, (SELECT valeur FROM etat WHERE cle = 'dernier_passage') AS passage"),
    ]),
  ]);
  const [parStatut, entonnoir, parCible, couverts, trouves, contactes, verdicts, journal, travail] = resultats;

  const statuts = Object.fromEntries((parStatut.results as { statut: string; n: number }[]).map(({ statut, n }) => [statut, n]));
  const compte = (statut: string) => statuts[statut] ?? 0;
  const e = entonnoir.results[0] as { total: number; analyses: number; constats: number; contactes: number; reponses: number; clients: number };
  const { recherches, passage } = travail.results[0] as { recherches: number; passage: string | null };
  const faits = new Set((couverts.results as { terme: string }[]).map(({ terme }) => terme));
  const parJour = (r: D1Result) => new Map((r.results as { jour: string; n: number }[]).map(({ jour, n }) => [jour, n]));

  const claude = claudeActif(env);
  const depense = claude ? await depenseDuJour(env) : 0;
  const euros = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const actif = passage && Date.now() - Date.parse(passage) < 5 * 60_000;
  const etat = `<span class="pastille"><span class="voyant ${actif ? '' : 'inactif'}"></span>${
    actif
      ? recherches || compte('a_analyser') || (claude && compte('a_enrichir'))
        ? [
            recherches ? `${recherches} recherche${recherches > 1 ? 's' : ''} en cours` : '',
            compte('a_analyser') ? `${nombre(compte('a_analyser'))} sites à analyser` : '',
            claude && compte('a_enrichir') ? `${nombre(compte('a_enrichir'))} emails à chercher` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        : 'Tâche active, rien en attente'
      : 'Tâche à l’arrêt'
  }</span>`;

  const aFaire = [
    { statut: 'nouveau', titre: 'Prêts pour Smartlead', texte: 'Adresse générique ou au nom de l’entreprise. À exporter en campagne.', icone: 'telecharger' as const, action: 'Exporter', href: '/prospects?statut=nouveau' },
    { statut: 'a_ecrire', titre: 'À écrire à la main', texte: 'Adresse nominative : un email écrit depuis Tuta, un par un.', icone: 'email' as const, action: 'Écrire', href: '/traiter?statut=a_ecrire' },
    {
      statut: 'a_enrichir',
      titre: 'Email à chercher',
      texte: claude ? 'Pas d’email sur le site : Claude le cherche sur le web, tout seul.' : 'Pas d’email sur le site. Ajoute une clé OpenRouter pour que Claude le cherche.',
      icone: 'recherches' as const,
      action: 'Chercher',
      href: '/traiter?statut=a_enrichir',
    },
    { statut: 'a_verifier', titre: 'À vérifier', texte: 'Un email à confirmer ou corriger, un site injoignable ou un doute de Claude.', icone: 'activite' as const, action: 'Vérifier', href: '/traiter?statut=a_verifier' },
  ]
    .map((t) => {
      const n = compte(t.statut);
      return `<div class="carte a-faire ${n ? '' : 'vide'}">
        <div class="a-faire-icone a-faire-${t.statut}">${icone(t.icone, 18)}</div>
        <div class="a-faire-chiffre"><strong>${nombre(n)}</strong><span>${t.titre}</span></div>
        <p>${t.texte}</p>
        <div class="a-faire-actions">${
          n ? `<a class="btn petit" href="${t.href}">${icone('jouer', 14)}${t.action}</a><a class="btn fantome petit" href="/prospects?statut=${t.statut}">Voir la liste</a>` : '<span class="discret">Rien pour l’instant</span>'
        }</div>
      </div>`;
    })
    .join('');

  const etapes = [
    { libelle: 'Trouvés sur Google Maps', n: e.total, href: '/prospects' },
    { libelle: 'Analysés', n: e.analyses },
    { libelle: 'Avec une raison d’écrire', n: e.constats },
    { libelle: 'Contactés', n: e.contactes, href: '/prospects?statut=en_campagne' },
    { libelle: 'Ont répondu', n: e.reponses, href: '/prospects?statut=a_repondu' },
    { libelle: 'Clients', n: e.clients, href: '/prospects?statut=client' },
  ].map((etape, i, liste) => ({ ...etape, detail: i ? `${pourcent(etape.n, liste[i - 1].n)} de l’étape précédente` : '' }));

  const avis = verdicts.results as { verdict: string; n: number; qualite: number }[];
  const totalAvis = avis.reduce((somme, { n }) => somme + n, 0);
  const LIBELLES_AVIS: Record<string, string> = { faible: 'Site faible ou absent', moyen: 'Site moyen', bon: 'Site déjà bon', hors_cible: 'Hors cible' };
  const lignesAvis = Object.entries(LIBELLES_AVIS).map(([verdict, libelle]) => {
    const ligne = avis.find((a) => a.verdict === verdict);
    return { libelle, n: ligne?.n ?? 0, detail: ligne ? `${pourcent(ligne.n, totalAvis)} · qualité ${String(ligne.qualite).replace('.', ',')}/10` : '' };
  });

  const chiffres = Object.fromEntries((parCible.results as ParCible[]).map((c) => [c.cible, c]));
  const rangees = Object.values(cibles)
    .map((c) => {
      const n = chiffres[c.cle];
      const termes = termesCible(c);
      const couvertes = termes.filter(({ terme }) => faits.has(terme)).length;
      const part = termes.length ? Math.round((couvertes / termes.length) * 100) : 0;
      const lien = (statut: string, valeur = 0) => (valeur ? `<a href="/prospects?cible=${encodeURIComponent(c.cle)}&amp;statut=${statut}">${nombre(valeur)}</a>` : '<span class="discret">0</span>');
      return `<tr>
        <td><a class="nom" href="/prospects?cible=${encodeURIComponent(c.cle)}">${echapper(c.nom)}</a></td>
        <td class="chiffre">${nombre(n?.n ?? 0)}</td>
        <td class="chiffre">${lien('nouveau', n?.prets)}</td>
        <td class="chiffre">${lien('a_ecrire', n?.ecrire)}</td>
        <td class="chiffre">${lien('a_enrichir', n?.enrichir)}</td>
        <td class="chiffre">${nombre(n?.contactes ?? 0)}</td>
        <td class="chiffre">${nombre(n?.reponses ?? 0)}</td>
        <td class="chiffre">${nombre(n?.clients ?? 0)}</td>
        <td><a class="couverture" href="/recherches?cible=${encodeURIComponent(c.cle)}" title="${couvertes} recherches faites sur ${termes.length}"><span class="piste"><i style="width: ${part}%"></i></span>${part} %</a></td>
      </tr>`;
    })
    .join('');

  const lignesJournal = (journal.results as { le: string; niveau: string; message: string }[])
    .map((j) => `<li class="journal-${echapper(j.niveau)}"><time>${new Date(j.le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time><span>${echapper(j.message)}</span></li>`)
    .join('');

  const bienvenue = `<section class="carte bienvenue">
      <div class="carte-contenu">
        <h2 class="carte-titre">${icone('cibles', 18)}Première recherche</h2>
        <p class="carte-description">Choisis une cible, lance une recherche Google Maps et les fiches arrivent ici, analysées et triées.</p>
        <a class="btn" href="/recherches">${icone('recherches')}Lancer une recherche</a>
      </div>
    </section>`;

  return page(
    'Tableau de bord',
    `<header class="page-entete">
      <div><p class="surtitre">${echapper(date.charAt(0).toUpperCase() + date.slice(1))}</p><h1>Tableau de bord</h1>${etat}${
        claude
          ? `<a class="pastille" href="/recherches"><span class="voyant ${depense >= budget(env) ? 'arret' : 'inactif'}"></span>Claude : ${euros(depense)} sur ${euros(budget(env))} aujourd’hui${depense >= budget(env) ? ', budget atteint' : ''}</a>`
          : ''
      }</div>
      <form class="recherche-globale" method="get" action="/prospects" role="search">
        ${icone('recherches')}<input type="search" name="q" placeholder="Nom, email, site, note…" aria-label="Rechercher un prospect"><kbd>/</kbd>
      </form>
    </header>
    ${e.total ? '' : bienvenue}
    <section class="a-faire-grille">${aFaire}</section>
    <div class="grille tableau-de-bord">
      <section class="carte">
        <div class="carte-entete"><div><h2 class="carte-titre">Entonnoir</h2><p class="carte-description">Du premier passage sur Google Maps jusqu’au devis signé.</p></div></div>
        <div class="carte-contenu">${barres(etapes, e.total)}</div>
      </section>
      <section class="carte">
        <div class="carte-entete"><div><h2 class="carte-titre">Les ${JOURS} derniers jours</h2><p class="carte-description">Survole une barre pour le détail du jour.</p></div></div>
        <div class="carte-contenu activite">
          ${histogramme('Fiches trouvées', 'fiches', parJour(trouves))}
          ${histogramme('Prospects contactés', 'contactés', parJour(contactes))}
        </div>
      </section>
    </div>
    <section class="carte bloc">
      <div class="carte-entete"><div><h2 class="carte-titre">Par cible</h2><p class="carte-description">La couverture compte les recherches métier × commune faites ces 6 derniers mois.</p></div><a class="btn contour petit" href="/cibles">${icone('cibles', 14)}Gérer les cibles</a></div>
      <div class="tableau"><table>
        <thead><tr><th>Cible</th><th class="chiffre">Fiches</th><th class="chiffre">Prêts</th><th class="chiffre">À écrire</th><th class="chiffre">Email à chercher</th><th class="chiffre">Contactés</th><th class="chiffre">Réponses</th><th class="chiffre">Clients</th><th>Couverture</th></tr></thead>
        <tbody>${rangees}</tbody>
      </table></div>
    </section>
    <div class="grille tableau-de-bord">
      <section class="carte">
        <div class="carte-entete"><div><h2 class="carte-titre">Avis de Claude</h2><p class="carte-description">${totalAvis ? `${nombre(totalAvis)} sites jugés. Un site faible est une bonne occasion d’écrire.` : 'Aucun site jugé pour l’instant. Ajoute OPENROUTER_API_KEY ou ANTHROPIC_API_KEY dans .dev.vars pour que Claude juge chaque site.'}</p></div></div>
        <div class="carte-contenu">${barres(lignesAvis, totalAvis)}</div>
      </section>
      <section class="carte">
        <div class="carte-entete"><div><h2 class="carte-titre">Dernières nouvelles</h2><p class="carte-description">Ce que la tâche planifiée vient de faire.</p></div><a class="btn fantome petit" href="/recherches">Tout voir</a></div>
        <div class="carte-contenu">${lignesJournal ? `<ol class="journal">${lignesJournal}</ol>` : '<p class="discret">Le journal est vide pour l’instant.</p>'}</div>
      </section>
    </div>`,
    'tableau',
  );
}
