// Serveur MCP : depuis Claude Code, Claude lit les prospects,
// lance des recherches, crée des cibles, range les fiches et règle le pilote.
// Protocole « Streamable HTTP » sans session : chaque POST /mcp porte un message
// JSON-RPC et reçoit sa réponse en JSON. Seulement en local (voir README).
import { CONSTATS } from '../scripts/cibles.mjs';
import { NAF } from '../scripts/naf.mjs';
import { chargerCibles, codeNaf, sauverCible, termesCible, texteBrouillon } from './cibles';
import { claudeActif, depenseDuJour } from './claude';
import { appliquerEmail, enregistrer, selonPreuve } from './enrichir';
import { nomLisible } from './html';
import { lancerCreations, lancerGoogleMaps, pairesAFaire, parametresCreations, termesRecents } from './lancements';
import { lanceesAujourdhui, reglerPilote } from './pilote';
import { NATURES, SCORE, STATUTS, type Prospect, changerStatut, clauses } from './prospects';
import { actionEmail } from './traiter';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const LOCAUX = new Set(['localhost', '127.0.0.1', '[::1]']);
// Recherches Google Maps qu'un seul appel peut lancer.
const TERMES_PAR_APPEL = 50;

const INSTRUCTIONS = `Outil de prospection de C'est bien beau, le studio web de Bas en Alsace : il trouve des petites entreprises (Google Maps, registre des nouvelles entreprises), juge leur site avec Claude et prépare les emails.

Règles à respecter :
- N'invente jamais une adresse email, ne la devine jamais à partir du nom de domaine. enregistrer_email ne prend qu'une adresse lue sur une page (donne son URL exacte) ou donnée par Bas.
- Une adresse nominative (prenom.nom@…) ne part jamais dans Smartlead : la fiche va en « À écrire » et Bas écrit lui-même depuis Tuta. voir_prospect donne le brouillon.
- L'export vers Smartlead reste un clic de Bas dans l'admin. Ne passe une fiche « en_campagne » que si Bas a vraiment écrit.
- Une fiche « desinscrit » ne change plus de statut.
- lancer_recherche dépense du crédit Hubertino ou Apify, lancer_nouvelles_entreprises du crédit Apify, chercher_email du crédit Claude. Annonce ce que tu lances.
- Pas de téléphone : la prospection se fait uniquement par email.`;

class ErreurOutil extends Error {}

type Arguments = Record<string, unknown>;

type Outil = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  executer: (env: Env, args: Arguments, base: string) => Promise<unknown>;
};

const STATUTS_MANUELS = Object.keys(STATUTS).filter((statut) => statut !== 'a_analyser');

function schema(proprietes: Record<string, unknown>, requis: string[] = []) {
  return { type: 'object', properties: proprietes, required: requis, additionalProperties: false };
}
const chaine = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const entier = (description: string, minimum: number, maximum: number) => ({ type: 'integer', description, minimum, maximum });
const listeDe = (description: string) => ({ type: 'array', items: { type: 'string' }, description });

function texte(args: Arguments, cle: string) {
  const valeur = args[cle];
  return typeof valeur === 'string' ? valeur.trim() : '';
}
function nombre(args: Arguments, cle: string, defaut: number, min: number, max: number) {
  const valeur = Number(args[cle]);
  return Number.isFinite(valeur) && args[cle] !== '' && args[cle] != null ? Math.min(max, Math.max(min, Math.round(valeur))) : defaut;
}
function liste(args: Arguments, cle: string): string[] | undefined {
  const valeur = args[cle];
  if (valeur == null) return undefined;
  const brut = Array.isArray(valeur) ? valeur : String(valeur).split('\n');
  return [...new Set(brut.map((v) => String(v).trim()).filter(Boolean))];
}

async function cibleConnue(env: Env, cle: string) {
  const cibles = await chargerCibles(env);
  const cible = cibles[cle];
  if (!cible) throw new ErreurOutil(`Cible inconnue : « ${cle} ». Cibles : ${Object.keys(cibles).join(', ')}.`);
  return cible;
}

async function prospect(env: Env, id: string) {
  const p = await env.DB.prepare(`SELECT *, ${SCORE} AS score FROM prospects WHERE id = ?`).bind(id).first<Prospect>();
  if (!p) throw new ErreurOutil(`Fiche introuvable : « ${id} ».`);
  return p;
}

function resume(p: Prospect, base: string) {
  return {
    id: p.id,
    nom: nomLisible(p.nom),
    cible: p.cible,
    statut: p.statut,
    statut_libelle: STATUTS[p.statut] ?? p.statut,
    ville: p.ville,
    categorie: p.categorie,
    email: p.email,
    email_type: NATURES[p.email_statut] ?? p.email_statut,
    email_verifie: p.email ? p.email_verifie !== 0 : null,
    site: p.site,
    note_google: p.note_google,
    avis_google: p.avis_google,
    constat: p.constat,
    raison: p.raison,
    priorite: p.score == null ? null : Math.min(100, p.score),
    origine: p.origine,
    creation: p.creation || null,
    fiche: `${base}/p/${encodeURIComponent(p.id)}`,
  };
}

// Codes NAF au format « 01.21Z Culture de la vigne » ; refuse un code hors nomenclature.
function codesNaf(lignes: string[]) {
  const codes = lignes.map(codeNaf);
  const inconnus = codes.filter((code) => !(code in NAF));
  if (inconnus.length) throw new ErreurOutil(`Codes NAF inconnus : ${inconnus.join(', ')}. Utilise chercher_codes_naf.`);
  return [...new Set(codes)].map((code) => `${code} ${NAF[code as keyof typeof NAF]}`);
}

function sansAccents(texte: string) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const OUTILS: Outil[] = [
  {
    name: 'tableau_de_bord',
    title: 'Tableau de bord',
    description:
      'Où en est la prospection : fiches par statut et par cible, files à traiter, recherches en cours, état de la tâche et du pilote automatique, dépense Claude du jour. À appeler en premier.',
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
    async executer(env, _args, base) {
      const [cibles, faits, faites, resultats] = await Promise.all([
        chargerCibles(env),
        termesRecents(env),
        lanceesAujourdhui(env),
        env.DB.batch([
          env.DB.prepare('SELECT cible, statut, COUNT(*) AS n FROM prospects GROUP BY cible, statut'),
          env.DB.prepare("SELECT COUNT(*) AS n FROM recherches WHERE statut IN ('en_cours', 'import')"),
          env.DB.prepare("SELECT cle, valeur FROM etat WHERE cle IN ('dernier_passage', 'pilote_pause')"),
        ]),
      ]);
      const [parStatut, enCours, etat] = resultats;
      const valeurs = Object.fromEntries((etat.results as { cle: string; valeur: string }[]).map(({ cle, valeur }) => [cle, valeur]));
      const lignes = parStatut.results as { cible: string; statut: string; n: number }[];
      const total = (statut: string) => lignes.filter((l) => l.statut === statut).reduce((somme, l) => somme + l.n, 0);
      const passage = valeurs.dernier_passage ?? null;
      const pause = valeurs.pilote_pause && Date.parse(valeurs.pilote_pause) > Date.now() ? valeurs.pilote_pause : null;
      return {
        admin: base,
        tache: { active: Boolean(passage && Date.now() - Date.parse(passage) < 5 * 60_000), dernier_passage: passage },
        recherches_en_cours: (enCours.results[0] as { n: number }).n,
        a_faire: {
          pret_pour_smartlead: total('nouveau'),
          a_ecrire_a_la_main: total('a_ecrire'),
          email_a_chercher: total('a_enrichir'),
          a_verifier: total('a_verifier'),
          en_analyse: total('a_analyser'),
          a_repondu: total('a_repondu'),
        },
        par_statut: Object.keys(STATUTS)
          .map((statut) => ({ statut, libelle: STATUTS[statut], n: total(statut) }))
          .filter(({ n }) => n),
        cibles: Object.values(cibles).map((cible) => ({
          cle: cible.cle,
          nom: cible.nom,
          fiches: lignes.filter((l) => l.cible === cible.cle).reduce((somme, l) => somme + l.n, 0),
          recherches_restantes: termesCible(cible).filter(({ terme }) => !faits.has(terme)).length,
          pilote: { recherches_par_jour: cible.pilote ?? 0, lancees_aujourdhui: faites[cible.cle] ?? 0, nouvelles_entreprises: Boolean(cible.piloteSirene) },
        })),
        pilote_en_pause_jusqu_a: pause,
        claude: { actif: claudeActif(env), depense_du_jour_usd: claudeActif(env) ? Number((await depenseDuJour(env)).toFixed(2)) : 0 },
      };
    },
  },
  {
    name: 'chercher_prospects',
    title: 'Chercher des prospects',
    description: 'Liste les fiches qui correspondent aux filtres, les plus prioritaires d’abord pour les files à traiter. Rend un résumé par fiche ; voir_prospect donne le détail.',
    inputSchema: schema({
      cible: chaine('Clé de la cible (voir lister_cibles).'),
      statut: chaine('Statut des fiches.', { enum: Object.keys(STATUTS) }),
      ville: chaine('Ville exacte.'),
      categorie: chaine('Catégorie Google exacte.'),
      origine: chaine('maps (Google Maps), sirene (nouvelles entreprises) ou recent (créées il y a moins d’un an).', { enum: ['maps', 'sirene', 'recent'] }),
      verif: chaine('verifie : adresses lues par l’outil ; non_verifie : adresses vues par Claude sur une page que l’outil ne peut pas relire.', { enum: ['verifie', 'non_verifie'] }),
      q: chaine('Texte cherché dans le nom, l’email, le site et la note.'),
      tri: chaine('priorite ou recent. Par défaut : priorité pour les files à traiter, sinon les plus récentes.', { enum: ['priorite', 'recent'] }),
      limite: entier('Nombre de fiches (25 par défaut).', 1, 100),
      page: entier('Page, à partir de 1.', 1, 1000),
    }),
    annotations: { readOnlyHint: true },
    async executer(env, args, base) {
      const filtres = {
        cible: texte(args, 'cible'),
        statut: texte(args, 'statut'),
        ville: texte(args, 'ville'),
        categorie: texte(args, 'categorie'),
        raison: '',
        q: texte(args, 'q'),
        tri: texte(args, 'tri'),
        origine: texte(args, 'origine'),
        verif: texte(args, 'verif'),
      };
      const limite = nombre(args, 'limite', 25, 1, 100);
      const page = nombre(args, 'page', 1, 1, 1000);
      const { where, valeurs } = clauses(filtres);
      const parPriorite = filtres.tri ? filtres.tri === 'priorite' : ['nouveau', 'a_ecrire', 'a_enrichir', 'a_verifier', 'sans_email'].includes(filtres.statut);
      const [lignes, total] = await env.DB.batch([
        env.DB.prepare(`SELECT *, ${SCORE} AS score FROM prospects ${where} ORDER BY ${parPriorite ? 'score DESC, ' : ''}vu_le DESC, nom LIMIT ? OFFSET ?`).bind(
          ...valeurs,
          limite,
          (page - 1) * limite,
        ),
        env.DB.prepare(`SELECT COUNT(*) AS n FROM prospects ${where}`).bind(...valeurs),
      ]);
      return { total: (total.results[0] as { n: number }).n, page, prospects: (lignes.results as Prospect[]).map((p) => resume(p, base)) };
    },
  },
  {
    name: 'voir_prospect',
    title: 'Voir une fiche',
    description: 'Le détail d’une fiche : coordonnées, avis de Claude sur le site, signaux, note de Bas, dates, et le brouillon d’email quand la fiche est à écrire à la main.',
    inputSchema: schema({ id: chaine('Identifiant de la fiche.') }, ['id']),
    annotations: { readOnlyHint: true },
    async executer(env, args, base) {
      const p = await prospect(env, texte(args, 'id'));
      const cibles = await chargerCibles(env);
      const avis = p.avis ? (JSON.parse(p.avis) as { raisons?: string[]; confiance?: string }) : null;
      return {
        ...resume(p, base),
        adresse: p.adresse,
        telephone: p.telephone,
        fiche_google: p.fiche_google,
        recherche: p.recherche,
        email_source: p.email_source,
        email_propose: p.email_propose,
        avis_claude: p.verdict ? { verdict: p.verdict, qualite: p.qualite, raisons: avis?.raisons ?? [], confiance: avis?.confiance ?? '' } : null,
        signaux: JSON.parse(p.signaux || '{}'),
        note: p.note,
        ajoute_le: p.cree_le,
        vu_le: p.vu_le,
        statut_le: p.statut_le,
        contacte_le: p.contacte_le,
        brouillon: p.statut === 'a_ecrire' && p.email ? { a: p.email, ...texteBrouillon(cibles[p.cible], p) } : null,
      };
    },
  },
  {
    name: 'changer_statut',
    title: 'Changer le statut',
    description:
      'Range une ou plusieurs fiches (100 au plus) dans un statut, avec une note facultative qui remplace la note actuelle. en_campagne seulement si Bas a vraiment écrit ; desinscrit quand la personne ne veut plus d’email. Une fiche désinscrite ne bouge plus.',
    inputSchema: schema(
      {
        ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100, description: 'Identifiants des fiches.' },
        statut: chaine('Nouveau statut.', { enum: STATUTS_MANUELS }),
        note: chaine('Note à enregistrer sur chaque fiche.'),
      },
      ['ids', 'statut'],
    ),
    annotations: { idempotentHint: true },
    async executer(env, args) {
      const statut = texte(args, 'statut');
      if (!STATUTS_MANUELS.includes(statut)) throw new ErreurOutil(`Statut inconnu : « ${statut} ».`);
      const ids = (liste(args, 'ids') ?? []).slice(0, 100);
      if (!ids.length) throw new ErreurOutil('Donne au moins un identifiant.');
      const { results } = await env.DB.prepare(`SELECT id, statut FROM prospects WHERE id IN (${ids.map(() => '?').join(', ')})`)
        .bind(...ids)
        .all<{ id: string; statut: string }>();
      const trouvees = new Map(results.map(({ id, statut }) => [id, statut]));
      const modifiables = ids.filter((id) => trouvees.has(id) && trouvees.get(id) !== 'desinscrit');
      const note = typeof args.note === 'string' ? args.note : null;
      if (modifiables.length) await env.DB.batch(modifiables.map((id) => changerStatut(env, id, statut, note)));
      return {
        statut,
        modifiees: modifiables.length,
        introuvables: ids.filter((id) => !trouvees.has(id)),
        desinscrites_inchangees: ids.filter((id) => trouvees.get(id) === 'desinscrit'),
      };
    },
  },
  {
    name: 'enregistrer_email',
    title: 'Enregistrer un email',
    description:
      'Enregistre l’adresse email d’une fiche et la range (générique ou au nom de l’entreprise : prête pour Smartlead ; nominative : à écrire à la main). N’invente jamais d’adresse : source est l’URL exacte de la page où l’adresse est écrite, ou « Bas » quand Bas l’a donnée. L’outil relit la page : si l’adresse y est, elle est vérifiée ; si la page ne peut pas être relue (Facebook, Instagram, annuaire), elle est utilisée mais marquée non vérifiée ; si la page est lue et que l’adresse n’y est pas, elle reste une proposition à vérifier.',
    inputSchema: schema(
      {
        id: chaine('Identifiant de la fiche.'),
        email: chaine('Adresse email, telle qu’écrite sur la source.'),
        source: chaine('URL exacte de la page où l’adresse est écrite, ou « Bas ».'),
      },
      ['id', 'email', 'source'],
    ),
    annotations: { openWorldHint: true },
    async executer(env, args) {
      const p = await prospect(env, texte(args, 'id'));
      const email = texte(args, 'email').toLowerCase();
      const source = texte(args, 'source');
      const parBas = /^bas\b/i.test(source);
      if (!/^https?:\/\//i.test(source) && !parBas) throw new ErreurOutil('Indique la source de l’adresse : l’URL exacte de la page où elle est écrite, ou « Bas ».');
      if (p.statut === 'desinscrit') throw new ErreurOutil('Cette fiche est désinscrite : son email ne change plus.');
      const maintenant = new Date().toISOString();
      const r = parBas ? appliquerEmail(email, p, 'donné par Bas') : await selonPreuve(email, source, '', p);
      if (!r) throw new ErreurOutil(`« ${email} » n’est pas une adresse email utilisable.`);
      await enregistrer(env, p.id, r, maintenant).run();
      if (!r.email) return { statut: r.statut, message: `${email} n’apparaît pas sur ${source} : gardée comme proposition, Bas la vérifiera.` };
      return {
        statut: r.statut,
        statut_libelle: STATUTS[r.statut],
        email: r.email,
        email_type: NATURES[r.email_statut] ?? r.email_statut,
        verifiee: r.email_verifie !== false,
        raison: r.raison,
      };
    },
  },
  {
    name: 'chercher_email',
    title: 'Chercher l’email sur le web',
    description: 'Demande à Claude (clé API de l’outil) de chercher sur le web l’adresse de contact d’une fiche, comme le fait la tâche pour « Email à chercher ». Dépense du crédit Claude.',
    inputSchema: schema({ id: chaine('Identifiant de la fiche.') }, ['id']),
    annotations: { openWorldHint: true },
    async executer(env, args) {
      if (!claudeActif(env)) throw new ErreurOutil('Aucune clé Claude dans .dev.vars : ajoute OPENROUTER_API_KEY ou ANTHROPIC_API_KEY.');
      const id = texte(args, 'id');
      const resultat = await actionEmail(env, id, 'chercher', '');
      if (resultat instanceof Response) throw new ErreurOutil(await resultat.text());
      const p = await prospect(env, id);
      return { message: resultat, statut: p.statut, email: p.email, email_propose: p.email_propose, email_source: p.email_source };
    },
  },
  {
    name: 'lister_cibles',
    title: 'Lister les cibles',
    description: 'Les cibles de prospection (métiers, communes, codes NAF, exclusions, constats, attentes, réglages du pilote) et le nombre de recherches pas encore faites ces 6 derniers mois.',
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
    async executer(env) {
      const [cibles, faits] = await Promise.all([chargerCibles(env), termesRecents(env)]);
      return Object.values(cibles).map((cible) => ({
        cle: cible.cle,
        nom: cible.nom,
        metiers: cible.metiers,
        communes: cible.communes,
        exclure: cible.exclure.map((motif) => motif.source),
        constats: cible.constats,
        naf: cible.naf,
        departements: cible.departements ?? [],
        attentes: cible.attentes ?? '',
        modele_email: cible.modele || '(modèle par défaut)',
        recherches: { total: termesCible(cible).length, restantes: termesCible(cible).filter(({ terme }) => !faits.has(terme)).length },
        pilote: { recherches_par_jour: cible.pilote ?? 0, nouvelles_entreprises: Boolean(cible.piloteSirene) },
      }));
    },
  },
  {
    name: 'chercher_codes_naf',
    title: 'Chercher des codes NAF',
    description: 'Cherche dans la nomenclature NAF de l’INSEE, par mots du libellé (« photographie », « coiffure ») ou début de code (« 96.02 »). Sert à remplir les codes NAF d’une cible.',
    inputSchema: schema({ mots: chaine('Mots du libellé ou début de code.') }, ['mots']),
    annotations: { readOnlyHint: true },
    async executer(_env, args) {
      const mots = sansAccents(texte(args, 'mots')).split(/\s+/).filter(Boolean);
      if (!mots.length) throw new ErreurOutil('Donne au moins un mot.');
      return Object.entries(NAF)
        .filter(([code, libelle]) => mots.every((mot) => code.toLowerCase().startsWith(mot) || sansAccents(libelle).includes(mot)))
        .slice(0, 40)
        .map(([code, libelle]) => `${code} ${libelle}`);
    },
  },
  {
    name: 'enregistrer_cible',
    title: 'Créer ou modifier une cible',
    description:
      'Crée une cible (sans cle) ou modifie une cible existante (avec sa cle). Pour une modification, les champs absents gardent leur valeur ; le pilote se règle avec regler_pilote. Les communes par défaut sont les villes d’Alsace de l’outil.',
    inputSchema: schema(
      {
        cle: chaine('Clé d’une cible existante à modifier. Absente : nouvelle cible.'),
        nom: chaine('Nom court au pluriel (« Photographes »). Obligatoire pour une nouvelle cible.'),
        metiers: listeDe('Recherches à taper dans Google Maps devant une commune, en minuscules, sans la commune (« photographe de mariage »). Obligatoire pour une nouvelle cible.'),
        communes: listeDe('Communes où chercher.'),
        exclure: listeDe('Expressions régulières (insensibles à la casse) qui écartent une fiche par son nom ou sa catégorie : chaînes, franchises, autres activités. Un simple mot convient.'),
        constats: { type: 'array', items: { type: 'string', enum: Object.keys(CONSTATS) }, description: 'Constats testés sur les sites, du plus au moins important.' },
        naf: listeDe('Codes NAF des nouvelles entreprises (« 74.20Z »), voir chercher_codes_naf.'),
        departements: listeDe('Départements pour les nouvelles entreprises (« 67 »).'),
        attentes: chaine('Ce qu’un bon site doit avoir dans ce métier, en une ou deux phrases. Claude s’en sert pour juger les sites.'),
        modele_email: chaine('Email écrit à la main pour les adresses nominatives : première ligne l’objet, puis le corps, au vouvoiement, signé « Bas ». Variables : {{nom}}, {{recherche}}, {{constat}}, {{ville}}.'),
      },
      [],
    ),
    annotations: { idempotentHint: true },
    async executer(env, args, base) {
      const cle = texte(args, 'cle');
      const actuelle = cle ? (await chargerCibles(env))[cle] : undefined;
      if (cle && !actuelle) throw new ErreurOutil(`Cible inconnue : « ${cle} ». Retire cle pour créer une cible.`);
      const naf = liste(args, 'naf');
      const resultat = await sauverCible(env, {
        cle,
        nom: texte(args, 'nom') || actuelle?.nom || '',
        metiers: liste(args, 'metiers') ?? actuelle?.metiers ?? [],
        communes: liste(args, 'communes'),
        exclure: liste(args, 'exclure'),
        constats: liste(args, 'constats'),
        modele: typeof args.modele_email === 'string' ? args.modele_email : undefined,
        naf: naf && codesNaf(naf),
        attentes: typeof args.attentes === 'string' ? args.attentes.trim() : undefined,
        departements: liste(args, 'departements')?.map((d) => d.toUpperCase()),
      });
      if ('erreur' in resultat) throw new ErreurOutil(resultat.erreur);
      return { cle: resultat.cle, modifiee: Boolean(actuelle), page: `${base}/cibles?cle=${encodeURIComponent(resultat.cle)}` };
    },
  },
  {
    name: 'lancer_recherche',
    title: 'Lancer une recherche Google Maps',
    description: `Lance une extraction Google Maps (sur Hubertino si sa clé est configurée, sinon sur Apify) pour une cible. Sans metiers ni communes, prend les recherches de la cible pas encore faites ces 6 derniers mois. Une recherche déjà faite il y a moins de 6 mois est sautée, sauf avec forcer. ${TERMES_PAR_APPEL} recherches au plus par appel. Dépense du crédit ; la tâche importe et analyse les fiches ensuite.`,
    inputSchema: schema(
      {
        cible: chaine('Clé de la cible.'),
        metiers: listeDe('Métiers à chercher (sinon ceux de la cible).'),
        communes: listeDe('Communes (sinon celles de la cible).'),
        nombre: entier(`Nombre de recherches « métier commune » à lancer (10 par défaut, ${TERMES_PAR_APPEL} au plus).`, 1, TERMES_PAR_APPEL),
        fiches_par_recherche: entier('Fiches Google Maps au plus par recherche (30 par défaut).', 1, 200),
        emails: { type: 'boolean', description: 'Avec Apify seulement : fait aussi extraire les emails des sites (plus cher). Hubertino les donne toujours.' },
        forcer: { type: 'boolean', description: 'Refait les recherches déjà faites ces 6 derniers mois.' },
      },
      ['cible'],
    ),
    annotations: { openWorldHint: true },
    async executer(env, args) {
      const cible = await cibleConnue(env, texte(args, 'cible'));
      const metiers = liste(args, 'metiers') ?? cible.metiers;
      const communes = liste(args, 'communes') ?? cible.communes;
      const { demandees, aFaire } = await pairesAFaire(env, metiers, communes, args.forcer === true);
      if (!demandees) throw new ErreurOutil('Donne au moins un métier et une commune.');
      const paires = aFaire.slice(0, nombre(args, 'nombre', 10, 1, TERMES_PAR_APPEL));
      if (!paires.length) throw new ErreurOutil(`Les ${demandees} recherches demandées ont toutes été faites il y a moins de 6 mois. Change de métiers ou de communes, ou passe forcer.`);
      const max = nombre(args, 'fiches_par_recherche', 30, 1, 200);
      const id = await lancerGoogleMaps(env, cible.cle, paires, max, { contacts: args.emails === true, sautes: demandees - aFaire.length });
      return {
        recherche: id,
        lancees: paires.map(({ metier, commune }) => `${metier} ${commune}`),
        deja_faites: demandees - aFaire.length,
        restantes: aFaire.length - paires.length,
        fiches_par_recherche: max,
      };
    },
  },
  {
    name: 'lancer_nouvelles_entreprises',
    title: 'Chercher les nouvelles entreprises',
    description: 'Cherche dans le registre Sirene les entreprises créées ces derniers jours, par codes NAF et départements (ceux de la cible par défaut). Dépense du crédit Apify ; les fiches arrivent avec le constat « pas encore de site ».',
    inputSchema: schema(
      {
        cible: chaine('Clé de la cible.'),
        jours: entier('Entreprises créées ces N derniers jours (30 par défaut).', 1, 365),
        naf: listeDe('Codes NAF (sinon ceux de la cible).'),
        departements: listeDe('Départements (sinon ceux de la cible).'),
        max: entier('Entreprises au plus (300 par défaut).', 1, 2000),
      },
      ['cible'],
    ),
    annotations: { openWorldHint: true },
    async executer(env, args) {
      const cible = await cibleConnue(env, texte(args, 'cible'));
      const { codes, depts } = parametresCreations(liste(args, 'naf') ?? cible.naf, liste(args, 'departements') ?? cible.departements ?? []);
      if (!codes.length) throw new ErreurOutil('Aucun code NAF : donne naf, ou ajoute des codes à la cible avec enregistrer_cible.');
      const jours = nombre(args, 'jours', 30, 1, 365);
      const max = nombre(args, 'max', 300, 1, 2000);
      const id = await lancerCreations(env, cible, { codes, depts, jours, max });
      return { recherche: id, codes, departements: depts.length ? depts : cible.departements, jours, max };
    },
  },
  {
    name: 'regler_pilote',
    title: 'Régler le pilote automatique',
    description:
      'Le pilote lance seul, tant que l’outil tourne, les recherches pas encore faites d’une cible (30 fiches chacune, jusqu’au nombre par jour choisi) et, une fois par semaine, la recherche des nouvelles entreprises. 0 et false l’arrêtent pour cette cible. Les champs absents gardent leur valeur.',
    inputSchema: schema(
      {
        cible: chaine('Clé de la cible.'),
        recherches_par_jour: entier('Recherches Google Maps par jour (0 : arrêt).', 0, 200),
        nouvelles_entreprises: { type: 'boolean', description: 'Cherche chaque semaine les entreprises créées (il faut des codes NAF sur la cible).' },
      },
      ['cible'],
    ),
    annotations: { idempotentHint: true },
    async executer(env, args) {
      const cible = await cibleConnue(env, texte(args, 'cible'));
      const pilote = nombre(args, 'recherches_par_jour', cible.pilote ?? 0, 0, 200);
      const piloteSirene = typeof args.nouvelles_entreprises === 'boolean' ? args.nouvelles_entreprises : Boolean(cible.piloteSirene);
      if (piloteSirene && !cible.naf.length) throw new ErreurOutil('La cible n’a pas de code NAF : ajoute-les avec enregistrer_cible avant d’activer les nouvelles entreprises.');
      await reglerPilote(env, cible.cle, { pilote, piloteSirene }).run();
      return { cible: cible.cle, recherches_par_jour: pilote, nouvelles_entreprises: piloteSirene };
    },
  },
  {
    name: 'journal',
    title: 'Journal',
    description: 'Les derniers messages de la tâche (imports, analyses, erreurs) et les dernières recherches lancées avec leur état.',
    inputSchema: schema({ limite: entier('Nombre de messages (20 par défaut).', 1, 100) }),
    annotations: { readOnlyHint: true },
    async executer(env, args) {
      const [messages, recherches] = await env.DB.batch([
        env.DB.prepare('SELECT le, niveau, message FROM journal ORDER BY id DESC LIMIT ?').bind(nombre(args, 'limite', 20, 1, 100)),
        env.DB.prepare('SELECT id, cible, source, statut, fiches, importees, auto, erreur, cree_le, fini_le FROM recherches ORDER BY id DESC LIMIT 10'),
      ]);
      return {
        messages: messages.results,
        recherches: (recherches.results as Record<string, unknown>[]).map((r) => ({ ...r, auto: Boolean(r.auto) })),
      };
    },
  },
];

type Message = { jsonrpc?: unknown; id?: string | number | null; method?: unknown; params?: Record<string, unknown> };

function resultat(id: Message['id'], valeur: unknown) {
  return { jsonrpc: '2.0', id, result: valeur };
}

function erreur(id: Message['id'] | null, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function traiterMessage(m: Message, env: Env, base: string) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return erreur(null, -32600, 'Requête JSON-RPC invalide');
  // Une réponse du client, ou une notification : rien à renvoyer.
  if (typeof m.method !== 'string') return 'id' in m && ('result' in m || 'error' in m) ? null : erreur(m.id ?? null, -32600, 'Requête JSON-RPC invalide');
  if (!('id' in m) || m.id === undefined) return null;
  const params = m.params ?? {};
  switch (m.method) {
    case 'initialize': {
      const demandee = String(params.protocolVersion ?? '');
      return resultat(m.id, {
        protocolVersion: VERSIONS.includes(demandee) ? demandee : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'prospection', title: 'Prospection C’est bien beau', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return resultat(m.id, {});
    case 'tools/list':
      return resultat(m.id, { tools: OUTILS.map(({ executer: _executer, ...outil }) => outil) });
    case 'tools/call': {
      const outil = OUTILS.find((o) => o.name === params.name);
      if (!outil) return erreur(m.id, -32602, `Outil inconnu : ${String(params.name)}`);
      const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Arguments) : {};
      try {
        const sortie = await outil.executer(env, args, base);
        return resultat(m.id, { content: [{ type: 'text', text: JSON.stringify(sortie, null, 2) }] });
      } catch (e) {
        const texte = e instanceof ErreurOutil ? e.message : `Erreur : ${String(e).slice(0, 500)}`;
        return resultat(m.id, { content: [{ type: 'text', text: texte }], isError: true });
      }
    }
    default:
      return erreur(m.id, -32601, `Méthode inconnue : ${m.method}`);
  }
}

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });
}

function locale(adresse: string) {
  try {
    return LOCAUX.has(new URL(adresse).hostname);
  } catch {
    return false;
  }
}

export async function mcp(requete: Request, env: Env) {
  const url = new URL(requete.url);
  // Contre le « DNS rebinding » : seul un programme local, ou une page servie en local, peut parler au serveur.
  if (!LOCAUX.has(url.hostname)) return new Response('Serveur MCP accessible en local seulement', { status: 403 });
  const origine = requete.headers.get('origin');
  if (origine && !locale(origine)) return new Response('Origine refusée', { status: 403 });
  if (requete.method !== 'POST') return new Response('Méthode non prise en charge', { status: 405, headers: { allow: 'POST' } });
  const version = requete.headers.get('mcp-protocol-version');
  if (version && !VERSIONS.includes(version)) return json(erreur(null, -32600, `Version du protocole non prise en charge : ${version}`), 400);

  let corps: unknown;
  try {
    corps = await requete.json();
  } catch {
    return json(erreur(null, -32700, 'JSON illisible'), 400);
  }
  const messages = (Array.isArray(corps) ? corps : [corps]) as Message[];
  const reponses = (await Promise.all(messages.map((m) => traiterMessage(m, env, url.origin)))).filter(Boolean);
  if (!reponses.length) return new Response(null, { status: 202 });
  return json(Array.isArray(corps) ? reponses : reponses[0]);
}
