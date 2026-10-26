#!/usr/bin/env node
// Lance l'admin sur http://localhost:8787 et déclenche la tâche planifiée
// régulièrement, comme le ferait Cloudflare une fois en ligne.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const racine = join(import.meta.dirname, '..');
const vars = join(racine, '.dev.vars');
const PORT = 8787;

if (!existsSync(vars)) writeFileSync(vars, readFileSync(join(racine, '.dev.vars.exemple')));
const contenu = readFileSync(vars, 'utf8');
const cle = (nom) => contenu.match(new RegExp(`^${nom}=(.*)$`, 'm'))?.[1]?.trim();
if (!cle('APIFY_TOKEN') && !cle('HUBERTINO_API_KEY')) {
  console.error('Ajoute ta clé API Apify (ligne APIFY_TOKEN=…) ou Hubertino (ligne HUBERTINO_API_KEY=…) dans le fichier .dev.vars, puis relance `pnpm local`.');
  console.error('Apify : console.apify.com → Settings → API & Integrations. Hubertino : hubertino.com → Settings → API.');
  process.exit(1);
}

execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'prospection', '--local'], { cwd: racine, stdio: ['ignore', 'ignore', 'inherit'] });

const worker = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--test-scheduled', '--var', 'IMPORT_PAR_PASSAGE:200', '--var', 'ANALYSES_PAR_PASSAGE:30'], { cwd: racine, stdio: ['ignore', 'pipe', 'inherit'] });

// N'affiche que le journal de la tâche, pas le bruit de wrangler.
let reste = '';
worker.stdout.on('data', (morceau) => {
  const lignes = (reste + morceau.toString()).split('\n');
  reste = lignes.pop();
  for (const ligne of lignes) {
    const propre = ligne.replace(/\x1b\[[0-9;]*m/g, '');
    const indice = propre.indexOf('[prospection] ');
    if (indice >= 0) console.log(`${new Date().toLocaleTimeString('fr-FR')}  ${propre.slice(indice + 14)}`);
  }
});
worker.on('exit', (code) => {
  if (arret) return;
  console.error(`Le serveur local s'est arrêté (code ${code}).`);
  process.exit(1);
});
let arret = false;
process.on('SIGINT', () => {
  arret = true;
  worker.kill('SIGINT');
  process.exit(0);
});

// Attend que le Worker réponde, puis enchaîne les passages de la tâche sans
// pause (2 s quand il n'y a rien à faire) : en local, pas de limite Cloudflare.
async function passage() {
  const debut = Date.now();
  await fetch(`http://localhost:${PORT}/__scheduled?cron=*+*+*+*+*`).catch(() => {});
  return Date.now() - debut;
}
async function boucle() {
  for (;;) {
    const duree = await passage();
    if (duree < 1_000) await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}
const attente = setInterval(async () => {
  try {
    await fetch(`http://localhost:${PORT}/`);
  } catch {
    return;
  }
  clearInterval(attente);
  console.log(`Admin prête sur http://localhost:${PORT} (Ctrl+C pour arrêter).`);
  console.log('Le journal de la tâche s’affiche ici, et sur la page Recherches de l’admin.');
  boucle();
}, 2_000);
