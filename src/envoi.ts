// Ce qui part dans Smartlead : le choix des fiches, le fichier CSV, et le marquage
// « En campagne ». Partagé par l'export de la liste, l'envoi par l'API et les lots
// de la semaine du mode autonome.
import { RAISONS } from '../scripts/base.mjs';
import { nomCourt, natureEmail } from '../scripts/lib.mjs';
import { type Filtres, type Prospect, clauses } from './prospects';

export const COLONNES_SMARTLEAD = ['email', 'first_name', 'company_name', 'salutation', 'recherche', 'constat', 'source', 'site', 'telephone', 'ville'];

export function csv(lignes: Record<string, unknown>[]) {
  const champ = (valeur: unknown) => {
    const texte = String(valeur ?? '');
    return /[",\n;]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
  };
  return [COLONNES_SMARTLEAD.join(','), ...lignes.map((ligne) => COLONNES_SMARTLEAD.map((colonne) => champ(ligne[colonne])).join(','))].join('\n') + '\n';
}

export const sourceEnvoi = (p: Pick<Prospect, 'origine'>) => (p.origine === 'sirene' ? 'le registre des entreprises' : 'votre fiche Google');

// Une ligne du fichier pour Smartlead. Le nom est raccourci pour se lire dans l'objet :
// « Une petite idée pour Domaine Schmitt », pas « EARL Domaine SCHMITT Vigneron, Alsace ».
export function ligneSmartlead(p: Prospect) {
  return {
    email: p.email,
    first_name: '',
    company_name: nomCourt(p.nom),
    salutation: 'Bonjour,',
    recherche: p.recherche,
    constat: p.constat,
    source: sourceEnvoi(p),
    site: p.site,
    telephone: p.telephone,
    ville: p.ville,
  };
}

// Une adresse déjà contactée, désinscrite ou rejetée à l'envoi ne repart jamais,
// même si elle apparaît sur une autre fiche.
export const DEJA_PARTIES = `lower(email) NOT IN (SELECT lower(email) FROM prospects WHERE email <> '' AND (statut = 'desinscrit' OR contacte_le IS NOT NULL OR rebond_le IS NOT NULL))`;

// Seules les adresses génériques ou au nom de l'entreprise partent.
export function selectionEnvoi(filtres: Filtres) {
  const { where, valeurs } = clauses(filtres);
  return {
    selection: `${where} AND email_statut IN ('generique', 'entreprise') AND email <> '' AND ${DEJA_PARTIES}`,
    valeurs,
  };
}

// Une adresse classée « au nom de l'entreprise » avant que la règle des prénoms ne
// s'affine (gilbert.eber@…) est revue au moment de partir : nominative, elle passe
// en « À écrire » et ne part pas (règle CNIL).
export function sansNominatives(env: Env, fiches: Prospect[], maintenant: string) {
  const nominatives = fiches.filter((p) => p.email_statut === 'entreprise' && natureEmail(p.email, p.nom, p.site) === 'nominative');
  const ecartees = new Set(nominatives.map((p) => p.id));
  return {
    gardees: fiches.filter((p) => !ecartees.has(p.id)),
    requetes: nominatives.map((p) =>
      env.DB.prepare("UPDATE prospects SET statut = 'a_ecrire', email_statut = 'nominative', raison = ?, statut_le = ? WHERE id = ? AND statut = 'nouveau'").bind(RAISONS.ecrire, maintenant, p.id),
    ),
  };
}

export const enCampagne = (env: Env, id: string, maintenant: string) =>
  env.DB.prepare("UPDATE prospects SET statut = 'en_campagne', statut_le = ?1, contacte_le = COALESCE(contacte_le, ?1) WHERE id = ?2 AND statut = 'nouveau'").bind(maintenant, id);

export function reponseCsv(corps: string, nom: string) {
  return new Response(corps, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${nom}"` },
  });
}
