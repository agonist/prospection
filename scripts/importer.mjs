#!/usr/bin/env node
// Analyse un export Google Maps (Apify ou Outscraper) et l'enregistre dans la base.
// Usage : pnpm importer --cible vin --entree donnees/vin-barr.json [--local]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { identifiant, versLigne, versSql } from './base.mjs';
import {
  auditer,
  choisirConstat,
  choisirEmail,
  cible as trouverCible,
  cleDoublon,
  estPlateforme,
  exclusion,
  extraireEmails,
  liensUtiles,
  normaliser,
} from './lib.mjs';

const { values } = parseArgs({
  options: {
    cible: { type: 'string' },
    entree: { type: 'string' },
    local: { type: 'boolean', default: false },
    'sans-base': { type: 'boolean', default: false },
    limite: { type: 'string' },
    paralleles: { type: 'string', default: '6' },
  },
});

if (!values.cible || !values.entree) {
  console.error('Usage : pnpm importer --cible <vin|bien-etre|artisan> --entree <export.json> [--local] [--sans-base] [--limite 50]');
  process.exit(1);
}

const cible = trouverCible(values.cible);
const TIMEOUT_MS = 10_000;
const NAVIGATEUR = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

async function telecharger(url) {
  try {
    const reponse = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': NAVIGATEUR, 'accept-language': 'fr-FR,fr;q=0.9' },
    });
    if (!reponse.ok) return null;
    const type = reponse.headers.get('content-type') ?? '';
    if (!type.includes('html')) return null;
    return { url: reponse.url, html: await reponse.text() };
  } catch {
    return null;
  }
}

async function analyser(prospect) {
  const accueil = prospect.site && !estPlateforme(prospect.site) ? await telecharger(prospect.site) : null;
  const emails = [...prospect.emails];
  if (accueil) {
    emails.push(...extraireEmails(accueil.html));
    for (const lien of liensUtiles(accueil.html, accueil.url)) {
      const page = await telecharger(lien);
      if (page) emails.push(...extraireEmails(page.html));
    }
  }
  const signaux = auditer({ site: prospect.site, urlFinale: accueil?.url, html: accueil?.html ?? null });
  return { signaux, constat: choisirConstat(signaux, cible), ...choisirEmail(emails, prospect.site) };
}

async function parLots(elements, taille, traitement) {
  const resultats = [];
  let suivant = 0;
  let faits = 0;
  async function ouvrier() {
    while (suivant < elements.length) {
      const index = suivant++;
      resultats[index] = await traitement(elements[index]);
      process.stderr.write(`\r${++faits}/${elements.length} sites analysés`);
    }
  }
  await Promise.all(Array.from({ length: taille }, ouvrier));
  if (elements.length) process.stderr.write('\n');
  return resultats;
}

const brut = JSON.parse(readFileSync(values.entree, 'utf8'));
const fiches = (Array.isArray(brut) ? brut : brut.data ?? brut.items ?? []).flat().map(normaliser);

const parId = new Map();
for (const prospect of fiches) {
  if (!prospect.nom) continue;
  if (!prospect.recherche) prospect.recherche = `${cible.recherche} ${prospect.ville}`.trim();
  const id = identifiant(prospect, cleDoublon(prospect));
  if (!parId.has(id)) parId.set(id, prospect);
}

const lignes = [];
const aAnalyser = [];
for (const [id, prospect] of parId) {
  const raison = exclusion(prospect, cible);
  if (raison) lignes.push(versLigne({ id, cible: values.cible, prospect, exclusion: raison }));
  else aAnalyser.push([id, prospect]);
}

const limite = values.limite ? Number(values.limite) : aAnalyser.length;
const analyses = await parLots(aAnalyser.slice(0, limite), Number(values.paralleles), ([, prospect]) => analyser(prospect));
analyses.forEach((analyse, index) => {
  const [id, prospect] = aAnalyser[index];
  lignes.push(versLigne({ id, cible: values.cible, prospect, ...analyse }));
});

const fichierSql = values.entree.replace(/\.json$/i, '') + '.sql';
writeFileSync(fichierSql, versSql(lignes, new Date().toISOString()) + '\n');

const compte = Object.groupBy(lignes, (ligne) => ligne.statut);
console.log(`${cible.nom} : ${fiches.length} fiches, ${parId.size} établissements uniques.`);
for (const statut of ['nouveau', 'a_verifier', 'plus_tard', 'hors_cible']) console.log(`  ${statut.padEnd(11)} ${compte[statut]?.length ?? 0}`);
console.log('(Ces statuts ne remplacent pas ceux que tu as déjà posés à la main.)');

if (values['sans-base']) {
  console.log(`SQL écrit dans ${fichierSql}, rien envoyé.`);
} else {
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'prospection', values.local ? '--local' : '--remote', '--file', fichierSql, '-y'], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  console.log(`Base ${values.local ? 'locale' : 'en ligne'} à jour : ${lignes.length} fiches enregistrées.`);
}
