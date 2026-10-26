// Fiches sans email : Claude cherche l'adresse sur le web, puis on la relit dans
// la page qu'il cite. Une adresse sans source, ou absente d'une page qu'on a pu
// lire, est sans doute devinée : elle attend une validation à la main. Une page
// qu'on ne peut pas relire (Facebook, Instagram, annuaires) ne prouve rien dans
// un sens ni dans l'autre : l'adresse est utilisée, marquée « non vérifiée ».
import { RAISONS, statutSelonEmail } from '../scripts/base.mjs';
import { choisirEmail, estPlateforme, extraireEmails } from '../scripts/lib.mjs';
import { telecharger } from '../scripts/analyse.mjs';
import { chercherEmail, claudeActif } from './claude';
import { SCORE } from './prospects';

const ENRICHIS_PAR_PASSAGE = 3;
// Marque les fiches en cours, pour qu'un passage suivant ne lance pas la même recherche.
const EN_COURS = RAISONS.enCours;
const BLOCAGE_MS = 10 * 60_000;

export type AEnrichir = { id: string; nom: string; categorie: string; ville: string; adresse: string; site: string; telephone: string; email: string };

export type Resultat = { statut: string; raison: string; email: string; email_statut: string; email_source: string; email_propose: string; email_verifie?: boolean };

// Une adresse connue (trouvée sur le web ou saisie à la main) range la fiche comme à l'analyse.
export function appliquerEmail(email: string, p: Pick<AEnrichir, 'site' | 'nom'>, source: string, verifiee = true): Resultat | null {
  const choix = choisirEmail([email], p.site, p.nom) as { email: string; statut: string };
  if (!choix.email) return null;
  const { statut, raison } = statutSelonEmail(choix.statut);
  return { statut, raison, email: choix.email, email_statut: choix.statut, email_source: source, email_propose: '', email_verifie: verifiee };
}

// « lue » : l'adresse est dans la preuve citée ou dans la page source.
// « illisible » : la page ne peut pas être relue (réseau social, annuaire, erreur).
// « absente » : pas de source, ou une page lue où l'adresse n'apparaît pas.
export async function preuveEmail(email: string, source: string, preuve: string): Promise<'lue' | 'illisible' | 'absente'> {
  if (preuve.toLowerCase().includes(email)) return 'lue';
  if (!/^https?:\/\//i.test(source)) return 'absente';
  if (estPlateforme(source)) return 'illisible';
  const page = await telecharger(source);
  if (!page) return 'illisible';
  return extraireEmails(page.html).includes(email) ? 'lue' : 'absente';
}

// Range une adresse trouvée par Claude (ou donnée par Claude via MCP) selon sa preuve.
export async function selonPreuve(email: string, source: string, preuve: string, p: Pick<AEnrichir, 'site' | 'nom'>): Promise<Resultat | null> {
  const etat = await preuveEmail(email, source, preuve);
  if (etat === 'absente') return { statut: 'a_verifier', raison: RAISONS.propose, email: '', email_statut: '', email_source: source, email_propose: email };
  return appliquerEmail(email, p, source, etat === 'lue');
}

export async function enrichir(env: Env, p: AEnrichir): Promise<Resultat> {
  const trouvaille = await chercherEmail(env, p);
  const rien: Resultat = p.email
    ? { statut: 'a_verifier', raison: 'Claude n’a pas trouvé d’autre adresse sur le web', email: '', email_statut: '', email_source: '', email_propose: '' }
    : { statut: 'sans_email', raison: RAISONS.introuvable, email: '', email_statut: '', email_source: '', email_propose: '' };
  // Une adresse sans page source n'est jamais gardée, même comme proposition.
  if (!trouvaille || (!trouvaille.source && !trouvaille.preuve.toLowerCase().includes(trouvaille.email))) return rien;
  return (await selonPreuve(trouvaille.email, trouvaille.source, trouvaille.preuve, p)) ?? rien;
}

// Un email vide dans le résultat garde celui de la fiche.
export function enregistrer(env: Env, id: string, r: Resultat, maintenant: string) {
  return env.DB.prepare(
    `UPDATE prospects SET statut = ?1, raison = ?2, statut_le = ?3,
      email = CASE WHEN ?4 <> '' THEN ?4 ELSE email END,
      email_statut = CASE WHEN ?4 <> '' THEN ?5 ELSE email_statut END,
      email_verifie = CASE WHEN ?4 <> '' THEN ?9 ELSE email_verifie END,
      email_source = ?6, email_propose = ?7
    WHERE id = ?8`,
  ).bind(r.statut, r.raison, maintenant, r.email, r.email_statut, r.email_source, r.email_propose, id, r.email_verifie === false ? 0 : 1);
}

// Les propositions faites avant l'assouplissement des règles sont relues une fois :
// celles d'un réseau social ou d'une page injoignable passent en « Prêt » (non vérifiées).
const ANCIENNE_RAISON = 'Claude propose une adresse sans avoir pu la retrouver dans la page citée : vérifie la source';

export async function reprendrePropositions(env: Env, maintenant: string) {
  const { results } = await env.DB.prepare(
    "SELECT id, nom, site, email_propose, email_source FROM prospects WHERE statut = 'a_verifier' AND raison = ? AND email_propose <> '' LIMIT 5",
  )
    .bind(ANCIENNE_RAISON)
    .all<{ id: string; nom: string; site: string; email_propose: string; email_source: string }>();
  if (!results.length) return;
  const resultats = await Promise.all(results.map((p) => selonPreuve(p.email_propose, p.email_source, '', p)));
  await env.DB.batch(
    results.map((p, index) =>
      enregistrer(env, p.id, resultats[index] ?? { statut: 'a_verifier', raison: RAISONS.propose, email: '', email_statut: '', email_source: p.email_source, email_propose: p.email_propose }, maintenant),
    ),
  );
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
      const detail = r.email
        ? ` (${r.email}, ${r.email_verifie === false ? 'vu par Claude sur' : 'lu sur'} ${r.email_source}${r.email_verifie === false ? ', non vérifié' : ''})`
        : r.email_propose
          ? ` (Claude propose ${r.email_propose}, absent de la page citée)`
          : '';
      return [enregistrer(env, p.id, r, maintenant), noter(r.email ? 'succes' : 'info', `${p.nom} : ${LIBELLES_RESULTAT[r.statut] ?? r.statut}${detail}.`)];
    }),
  );
}
