// Fiches sans email : Claude cherche l'adresse sur le web, puis on vérifie
// qu'elle apparaît vraiment dans la page qu'il cite. Une adresse non prouvée
// n'est jamais utilisée telle quelle : elle attend une validation à la main.
import { RAISONS, statutSelonEmail } from '../scripts/base.mjs';
import { choisirEmail, extraireEmails } from '../scripts/lib.mjs';
import { telecharger } from '../scripts/analyse.mjs';
import { chercherEmail, claudeActif } from './claude';
import { SCORE } from './prospects';

const ENRICHIS_PAR_PASSAGE = 3;
// Marque les fiches en cours, pour qu'un passage suivant ne lance pas la même recherche.
const EN_COURS = RAISONS.enCours;
const BLOCAGE_MS = 10 * 60_000;

export type AEnrichir = { id: string; nom: string; categorie: string; ville: string; adresse: string; site: string; telephone: string; email: string };

export type Resultat = { statut: string; raison: string; email: string; email_statut: string; email_source: string; email_propose: string };

// Une adresse connue (trouvée sur le web ou saisie à la main) range la fiche comme à l'analyse.
export function appliquerEmail(email: string, p: Pick<AEnrichir, 'site' | 'nom'>, source: string): Resultat | null {
  const choix = choisirEmail([email], p.site, p.nom) as { email: string; statut: string };
  if (!choix.email) return null;
  const { statut, raison } = statutSelonEmail(choix.statut);
  return { statut, raison, email: choix.email, email_statut: choix.statut, email_source: source, email_propose: '' };
}

// L'adresse figure dans la preuve citée, ou dans la page source elle-même.
export async function prouvee(email: string, source: string, preuve: string) {
  if (preuve.toLowerCase().includes(email)) return true;
  if (!/^https?:\/\//.test(source)) return false;
  const page = await telecharger(source);
  return Boolean(page && extraireEmails(page.html).includes(email));
}

export async function enrichir(env: Env, p: AEnrichir): Promise<Resultat> {
  const trouvaille = await chercherEmail(env, p);
  if (!trouvaille) {
    return p.email
      ? { statut: 'a_verifier', raison: 'Claude n’a pas trouvé d’autre adresse sur le web', email: '', email_statut: '', email_source: '', email_propose: '' }
      : { statut: 'sans_email', raison: RAISONS.introuvable, email: '', email_statut: '', email_source: '', email_propose: '' };
  }
  if (!(await prouvee(trouvaille.email, trouvaille.source, trouvaille.preuve))) {
    return { statut: 'a_verifier', raison: RAISONS.propose, email: '', email_statut: '', email_source: trouvaille.source, email_propose: trouvaille.email };
  }
  return (
    appliquerEmail(trouvaille.email, p, trouvaille.source) ?? { statut: 'sans_email', raison: RAISONS.introuvable, email: '', email_statut: '', email_source: '', email_propose: '' }
  );
}

// Un email vide dans le résultat garde celui de la fiche.
export function enregistrer(env: Env, id: string, r: Resultat, maintenant: string) {
  return env.DB.prepare(
    `UPDATE prospects SET statut = ?1, raison = ?2, statut_le = ?3,
      email = CASE WHEN ?4 <> '' THEN ?4 ELSE email END,
      email_statut = CASE WHEN ?4 <> '' THEN ?5 ELSE email_statut END,
      email_source = ?6, email_propose = ?7
    WHERE id = ?8`,
  ).bind(r.statut, r.raison, maintenant, r.email, r.email_statut, r.email_source, r.email_propose, id);
}

export const LIBELLES_RESULTAT: Record<string, string> = {
  nouveau: 'email trouvé, prêt pour Smartlead',
  a_ecrire: 'email nominatif trouvé, à écrire à la main',
  a_verifier: 'à vérifier',
  sans_email: 'aucun email trouvé',
};

export async function enrichirLot(env: Env, maintenant: string, noter: (niveau: 'info' | 'succes' | 'erreur', message: string) => D1PreparedStatement) {
  if (!claudeActif(env)) return;
  const libere = new Date(Date.now() - BLOCAGE_MS).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT id, nom, categorie, ville, adresse, site, telephone, email FROM prospects
      WHERE statut = 'a_enrichir' AND (raison <> ? OR statut_le < ?) ORDER BY ${SCORE} DESC LIMIT ?`,
  )
    .bind(EN_COURS, libere, ENRICHIS_PAR_PASSAGE)
    .all<AEnrichir>();
  if (!results.length) return;
  await env.DB.batch(results.map((p) => env.DB.prepare('UPDATE prospects SET raison = ?, statut_le = ? WHERE id = ?').bind(EN_COURS, maintenant, p.id)));

  const resultats = await Promise.all(results.map((p) => enrichir(env, p).catch((erreur: unknown) => String(erreur).slice(0, 200))));
  await env.DB.batch(
    results.flatMap((p, index) => {
      const r = resultats[index];
      if (typeof r === 'string') {
        return [
          env.DB.prepare("UPDATE prospects SET statut = 'a_verifier', raison = ?, statut_le = ? WHERE id = ?").bind(`erreur pendant la recherche d’email : ${r}`, maintenant, p.id),
          noter('erreur', `${p.nom} : la recherche d’email a échoué (${r}), passé en « à vérifier ».`),
        ];
      }
      const detail = r.email ? ` (${r.email}, lu sur ${r.email_source})` : r.email_propose ? ` (Claude propose ${r.email_propose}, non prouvé)` : '';
      return [enregistrer(env, p.id, r, maintenant), noter(r.email ? 'succes' : 'info', `${p.nom} : ${LIBELLES_RESULTAT[r.statut] ?? r.statut}${detail}.`)];
    }),
  );
}
