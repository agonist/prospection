#!/usr/bin/env node
// Lance l'admin sur http://localhost:8787 et déclenche la tâche planifiée toutes
// les minutes, comme le ferait Cloudflare une fois en ligne.
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

const worker = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--test-scheduled'], { cwd: racine, stdio: ['ignore', 'ignore', 'inherit'] });
process.on('SIGINT', () => {
  worker.kill('SIGINT');
  process.exit(0);
});

// Attend que le Worker réponde, puis déclenche la tâche toutes les minutes.
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
  passage();
  setInterval(passage, 60_000);
}, 2_000);
