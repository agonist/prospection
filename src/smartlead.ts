// Smartlead (smartlead.ai), quand SMARTLEAD_API_KEY est renseignée : les fiches
// prêtes partent dans la campagne de leur cible quand Bas clique, et la tâche
// planifiée rapatrie les réponses et les désinscriptions.
// API : https://api.smartlead.ai/reference (clé passée en paramètre api_key).
import { demandeStop, lireCsv } from '../scripts/lib.mjs';
import type { Cible } from './cibles';

// Une synchronisation toutes les 15 minutes, plus tôt s'il reste des réponses à lire.
const INTERVALLE_MS = 15 * 60_000;
const REPRISE_MS = 60_000;
// Réponses lues par passage : Smartlead limite à environ 10 requêtes toutes les 2 secondes.
const REPONSES_PAR_PASSAGE = 8;
// Smartlead prend 400 leads au plus par requête.
const LEADS_PAR_REQUETE = 100;
export const ENVOI_MAX = 400;

export function smartleadActif(env: Env) {
  return Boolean(env.SMARTLEAD_API_KEY);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function appeler(env: Env, chemin: string, init: RequestInit = {}, essai = 0): Promise<Response> {
  const cle = env.SMARTLEAD_API_KEY;
  if (!cle) throw new Error('Clé Smartlead manquante : ajouter SMARTLEAD_API_KEY dans .dev.vars.');
  const url = new URL(`${String(env.SMARTLEAD_API || 'https://server.smartlead.ai/api/v1').replace(/\/$/, '')}${chemin}`);
  url.searchParams.set('api_key', cle);
  let reponse: Response;
  try {
    reponse = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init.headers } });
  } catch (erreur) {
    // L'adresse appelée contient la clé : elle ne doit pas finir dans le journal.
    throw new Error(`Smartlead ne répond pas (${String(erreur).split(cle).join('…').slice(0, 150)})`);
  }
  if (reponse.status === 429 && essai < 2) {
    await pause(2500);
    return appeler(env, chemin, init, essai + 1);
  }
  if (reponse.status === 401 || reponse.status === 403) throw new Error('Smartlead refuse la clé : vérifier SMARTLEAD_API_KEY (Smartlead → Settings → API Key).');
  if (!reponse.ok) throw new Error(`Smartlead a répondu ${reponse.status} : ${(await reponse.text()).split(cle).join('…').slice(0, 200)}`);
  return reponse;
}

export type Campagne = { id: string; nom: string; statut: string };

const ETATS: Record<string, string> = {
  ACTIVE: 'active',
  PAUSED: 'en pause',
  STOPPED: 'arrêtée',
  DRAFTED: 'en brouillon',
  ARCHIVED: 'archivée',
  COMPLETED: 'terminée',
};

export function etatCampagne(statut: string) {
  return ETATS[statut.toUpperCase()] ?? statut.toLowerCase();
}

export async function campagnes(env: Env): Promise<Campagne[]> {
  const corps = (await (await appeler(env, '/campaigns/')).json()) as unknown;
  const liste = (Array.isArray(corps) ? corps : ((corps as { campaigns?: unknown; data?: unknown })?.campaigns ?? (corps as { data?: unknown })?.data ?? [])) as Record<string, unknown>[];
  return (Array.isArray(liste) ? liste : [])
    .filter((c) => c && c.id != null && String(c.status ?? '').toUpperCase() !== 'ARCHIVED')
    .map((c) => ({ id: String(c.id), nom: String(c.name ?? `Campagne ${c.id}`), statut: String(c.status ?? '') }));
}

export type Lead = {
  email: string;
  first_name: string;
  last_name: string;
  company_name: string;
  website: string;
  location: string;
  phone_number: string;
  // Variables de la séquence : {{recherche}}, {{constat}}, {{source}}, {{salutation}}.
  custom_fields: Record<string, string>;
};

export type Envoi = {
  // Adresses parties dans la campagne (y compris celles qui y étaient déjà).
  envoyes: string[];
  // Adresses que Smartlead refuse : désinscrites ou bloquées chez lui.
  refuses: string[];
  ajoutes: number | null;
  deja: number;
  invalides: number;
  erreur: string;
};

function nombre(valeur: unknown) {
  const n = Number(Array.isArray(valeur) ? valeur.length : valeur);
  return Number.isFinite(n) ? n : 0;
}

// Ajoute les leads à la campagne, par lots. S'arrête au premier lot refusé :
// les lots déjà partis restent comptés.
export async function envoyerLeads(env: Env, campagne: string, leads: Lead[]): Promise<Envoi> {
  const bilan: Envoi = { envoyes: [], refuses: [], ajoutes: null, deja: 0, invalides: 0, erreur: '' };
  for (let debut = 0; debut < leads.length; debut += LEADS_PAR_REQUETE) {
    const lot = leads.slice(debut, debut + LEADS_PAR_REQUETE);
    let corps: Record<string, unknown>;
    try {
      const reponse = await appeler(env, `/campaigns/${encodeURIComponent(campagne)}/leads`, {
        method: 'POST',
        body: JSON.stringify({
          lead_list: lot,
          // Smartlead écarte lui aussi ses désinscrits, ses adresses bloquées et ses rebonds connus.
          settings: { ignore_global_block_list: false, ignore_unsubscribe_list: false, ignore_community_bounce_list: false, ignore_duplicate_leads_in_other_campaign: false },
        }),
      });
      corps = ((await reponse.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    } catch (erreur) {
      bilan.erreur = String(erreur instanceof Error ? erreur.message : erreur);
      break;
    }
    const refuses = new Set(
      Object.entries(corps)
        .filter(([cle, valeur]) => /unsubscri|block/i.test(cle) && Array.isArray(valeur))
        .flatMap(([, valeur]) => (valeur as unknown[]).map((v) => String(typeof v === 'string' ? v : ((v as { email?: string })?.email ?? '')).toLowerCase()))
        .filter(Boolean),
    );
    for (const lead of lot) (refuses.has(lead.email.toLowerCase()) ? bilan.refuses : bilan.envoyes).push(lead.email);
    if ('upload_count' in corps) bilan.ajoutes = (bilan.ajoutes ?? 0) + nombre(corps.upload_count);
    bilan.deja += nombre(corps.already_added_to_campaign);
    bilan.invalides += nombre(corps.invalid_email_count);
  }
  return bilan;
}

const vrai = (valeur: unknown) => /^(true|1|yes|oui)$/i.test(String(valeur ?? '').trim());

type Message = { type?: string; email_body?: string; body?: string; text?: string };

// La dernière réponse du prospect dans la campagne, ou null si on ne peut pas la lire.
async function derniereReponse(env: Env, campagne: string, lead: string) {
  const corps = (await (await appeler(env, `/campaigns/${encodeURIComponent(campagne)}/leads/${encodeURIComponent(lead)}/message-history`)).json()) as unknown;
  const historique = (Array.isArray(corps) ? corps : ((corps as { history?: unknown })?.history ?? [])) as Message[];
  const reponses = (Array.isArray(historique) ? historique : []).filter((m) => /repl/i.test(String(m?.type ?? '')));
  const derniere = reponses.at(-1);
  return derniere ? String(derniere.email_body ?? derniere.body ?? derniere.text ?? '') : null;
}

type Fiche = { id: string; nom: string; email: string; statut: string };
type Noter = (niveau: 'info' | 'succes' | 'erreur', message: string) => D1PreparedStatement;

// Rapatrie, pour chaque campagne branchée sur une cible, les désinscriptions et les réponses.
// Une désinscription passe toutes les fiches de cette adresse en « Désinscrit » (sauf un client).
// Une réponse passe la fiche « En campagne » en « A répondu », ou en « Désinscrit » si elle dit stop.
export async function synchroniser(env: Env, cibles: Record<string, Cible>, noter: Noter) {
  if (!smartleadActif(env)) return;
  const ids = [...new Set(Object.values(cibles).flatMap((c) => [c.smartlead ?? '', c.smartleadCreation ?? '']).filter(Boolean))];
  if (!ids.length) return;
  const prochaine = await env.DB.prepare("SELECT valeur FROM etat WHERE cle = 'smartlead_prochaine'").first<{ valeur: string }>();
  if (prochaine && Date.parse(prochaine.valeur) > Date.now()) return;
  const planifier = (ms: number) =>
    env.DB.prepare("INSERT INTO etat (cle, valeur) VALUES ('smartlead_prochaine', ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur").bind(new Date(Date.now() + ms).toISOString());
  // Posé d'abord : une erreur ne relance pas la synchronisation à chaque passage.
  await planifier(INTERVALLE_MS).run();

  const desinscrits = new Set<string>();
  const repondus: { email: string; campagne: string; lead: string }[] = [];
  for (const campagne of ids) {
    const lignes = lireCsv(await (await appeler(env, `/campaigns/${encodeURIComponent(campagne)}/leads-export`)).text()) as Record<string, string>[];
    for (const ligne of lignes) {
      const email = String(ligne.email ?? '').trim().toLowerCase();
      if (!email) continue;
      if (vrai(ligne.is_unsubscribed)) desinscrits.add(email);
      else if (Number(ligne.reply_count) > 0) repondus.push({ email, campagne, lead: String(ligne.id ?? '') });
    }
  }
  const emails = [...new Set([...desinscrits, ...repondus.map((r) => r.email)])];
  if (!emails.length) return;

  // Les fiches concernées, par paquets (D1 accepte 100 valeurs par requête).
  const fiches: Fiche[] = [];
  for (let debut = 0; debut < emails.length; debut += 90) {
    const paquet = emails.slice(debut, debut + 90);
    const { results } = await env.DB.prepare(`SELECT id, nom, email, statut FROM prospects WHERE statut NOT IN ('desinscrit', 'client') AND lower(email) IN (${paquet.map(() => '?').join(', ')})`)
      .bind(...paquet)
      .all<Fiche>();
    fiches.push(...results);
  }
  const parEmail = new Map<string, Fiche[]>();
  for (const fiche of fiches) parEmail.set(fiche.email.toLowerCase(), [...(parEmail.get(fiche.email.toLowerCase()) ?? []), fiche]);

  const maintenant = new Date().toISOString();
  const changer = (fiche: Fiche, statut: string) =>
    env.DB.prepare(
      "UPDATE prospects SET statut = ?1, statut_le = ?2, repondu_le = CASE WHEN ?1 = 'a_repondu' THEN COALESCE(repondu_le, ?2) ELSE repondu_le END WHERE id = ?3 AND statut = ?4",
    ).bind(statut, maintenant, fiche.id, fiche.statut);
  const requetes: D1PreparedStatement[] = [];
  const passees = new Set<string>();

  for (const email of desinscrits) {
    for (const fiche of parEmail.get(email) ?? []) {
      passees.add(fiche.id);
      requetes.push(changer(fiche, 'desinscrit'), noter('info', `${fiche.nom} : désinscrit dans Smartlead, passé en « Désinscrit ».`));
    }
  }

  // Seules les fiches encore « En campagne » changent : un statut posé à la main reste.
  const aLire = repondus.filter(
    (r, index) => repondus.findIndex((autre) => autre.email === r.email) === index && (parEmail.get(r.email) ?? []).some((f) => f.statut === 'en_campagne' && !passees.has(f.id)),
  );
  const lues = aLire.slice(0, REPONSES_PAR_PASSAGE);
  for (const reponse of lues) {
    // Une réponse « stop » vaut désinscription. Si on ne peut pas la lire, la fiche
    // passe en « A répondu » et Bas la lit dans Smartlead.
    let stop = false;
    if (reponse.lead) stop = demandeStop((await derniereReponse(env, reponse.campagne, reponse.lead).catch(() => null)) ?? '');
    const concernees = (parEmail.get(reponse.email) ?? []).filter((f) => (stop || f.statut === 'en_campagne') && !passees.has(f.id));
    for (const fiche of concernees) {
      passees.add(fiche.id);
      requetes.push(
        changer(fiche, stop ? 'desinscrit' : 'a_repondu'),
        noter(stop ? 'info' : 'succes', stop ? `${fiche.nom} a répondu « stop » : passé en « Désinscrit ».` : `${fiche.nom} a répondu dans Smartlead : passé en « A répondu ».`),
      );
    }
  }
  if (aLire.length > lues.length) requetes.push(planifier(REPRISE_MS));
  if (requetes.length) await env.DB.batch(requetes);
}
