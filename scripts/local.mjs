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
const cle = readFileSync(vars, 'utf8').match(/^APIFY_TOKEN=(.*)$/m)?.[1]?.trim();
if (!cle) {
  console.error('Ajoute ta clé API Apify dans le fichier .dev.vars (ligne APIFY_TOKEN=…), puis relance `pnpm local`.');
  console.error('Elle se trouve sur console.apify.com → Settings → API & Integrations.');
  process.exit(1);
}

execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'prospection', '--local'], { cwd: racine, stdio: ['ignore', 'ignore', 'inherit'] });

const worker = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--test-scheduled'], { cwd: racine, stdio: ['ignore', 'pipe', 'inherit'] });

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

// Attend que le Worker réponde, puis déclenche la tâche toutes les 10 secondes :
// en local, pas de limite Cloudflare, autant aller vite.
async function passage() {
  await fetch(`http://localhost:${PORT}/__scheduled?cron=*+*+*+*+*`).catch(() => {});
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
  passage();
  setInterval(passage, 10_000);
}, 2_000);
