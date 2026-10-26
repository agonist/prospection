// Pilote automatique : lance seul les recherches des cibles qui l'ont activé,
// une extraction à la fois, sans dépasser le nombre de recherches par jour choisi.
import type { Cible } from './cibles';
import { lancerCreations, lancerGoogleMaps, termesAFaire } from './lancements';

export const FICHES_PAR_RECHERCHE_PILOTE = 30;
// Recherches regroupées dans une même extraction.
const PAR_LANCEMENT = 10;
const JOUR_MS = 86_400_000;
const HEURE_MS = 3_600_000;

// Recherches Google Maps lancées par le pilote depuis minuit (UTC), par cible.
export async function lanceesAujourdhui(env: Env) {
  const minuit = new Date().toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    "SELECT cible, SUM(json_array_length(termes)) AS n FROM recherches WHERE auto = 1 AND source = 'maps' AND statut <> 'echec' AND cree_le >= ? GROUP BY cible",
  )
    .bind(minuit)
    .all<{ cible: string; n: number }>();
  return Object.fromEntries(results.map(({ cible, n }) => [cible, n]));
}

export function pilotees(cibles: Record<string, Cible>) {
  return Object.values(cibles).filter((c) => (c.pilote ?? 0) > 0 || (c.piloteSirene && c.naf.length));
}

// Nouvelles entreprises : une fois par semaine, sur les jours écoulés depuis la dernière recherche réussie.
async function creationsAFaire(env: Env, cible: Cible) {
  const derniere = await env.DB.prepare(
    "SELECT MAX(cree_le) AS tentee, MAX(CASE WHEN statut <> 'echec' THEN cree_le END) AS reussie FROM recherches WHERE cible = ? AND source = 'sirene'",
  )
    .bind(cible.cle)
    .first<{ tentee: string | null; reussie: string | null }>();
  const maintenant = Date.now();
  if (derniere?.tentee && Date.parse(derniere.tentee) > maintenant - JOUR_MS) return 0;
  if (derniere?.reussie && Date.parse(derniere.reussie) > maintenant - 7 * JOUR_MS) return 0;
  return derniere?.reussie ? Math.min(30, Math.ceil((maintenant - Date.parse(derniere.reussie)) / JOUR_MS) + 1) : 8;
}

// Rend vrai si une extraction a été lancée.
export async function piloter(env: Env, cibles: Record<string, Cible>, noter: (niveau: 'info' | 'erreur', message: string) => D1PreparedStatement) {
  const actives = pilotees(cibles);
  if (!actives.length) return false;
  // Après une erreur, une heure de pause : pas de relance en boucle (crédit épuisé, clé invalide…).
  const [pause, derniere] = await env.DB.batch([
    env.DB.prepare("SELECT valeur FROM etat WHERE cle = 'pilote_pause'"),
    env.DB.prepare('SELECT statut, fini_le FROM recherches WHERE auto = 1 ORDER BY id DESC LIMIT 1'),
  ]);
  const reprise = (pause.results[0] as { valeur: string } | undefined)?.valeur;
  if (reprise && Date.parse(reprise) > Date.now()) return false;
  const echec = derniere.results[0] as { statut: string; fini_le: string | null } | undefined;
  if (echec?.statut === 'echec' && echec.fini_le && Date.parse(echec.fini_le) > Date.now() - HEURE_MS) return false;

  try {
    for (const cible of actives.filter((c) => c.piloteSirene && c.naf.length)) {
      const jours = await creationsAFaire(env, cible);
      if (!jours) continue;
      await lancerCreations(env, cible, { codes: cible.naf.map((ligne) => ligne.split(/\s+/)[0]), depts: cible.departements ?? [], jours, max: 500, auto: true });
      return true;
    }
    const faites = await lanceesAujourdhui(env);
    for (const cible of actives.filter((c) => (c.pilote ?? 0) > 0)) {
      const reste = (cible.pilote ?? 0) - (faites[cible.cle] ?? 0);
      if (reste <= 0) continue;
      const termes = (await termesAFaire(env, cible)).slice(0, Math.min(reste, PAR_LANCEMENT));
      if (!termes.length) continue;
      await lancerGoogleMaps(env, cible.cle, termes, FICHES_PAR_RECHERCHE_PILOTE, { auto: true });
      return true;
    }
  } catch (erreur) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO etat (cle, valeur) VALUES ('pilote_pause', ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur").bind(
        new Date(Date.now() + HEURE_MS).toISOString(),
      ),
      noter('erreur', `Pilote automatique : ${String(erreur).slice(0, 300)}. Nouvel essai dans une heure.`),
    ]);
  }
  return false;
}

// Règle le pilote d'une cible, depuis l'admin ou depuis Claude.
export function reglerPilote(env: Env, cible: string, reglage: { pilote: number; piloteSirene: boolean }) {
  return env.DB.prepare('UPDATE cibles SET pilote = ?, pilote_sirene = ? WHERE cle = ?').bind(
    Math.min(200, Math.max(0, Math.round(reglage.pilote) || 0)),
    reglage.piloteSirene ? 1 : 0,
    cible,
  );
}
