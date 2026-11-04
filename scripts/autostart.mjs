#!/usr/bin/env node
// Démarrage automatique sur Mac : l'outil se lance à l'ouverture de session et
// redémarre seul s'il s'arrête. `pnpm autostart` l'installe, `pnpm autostart off` l'enlève.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';

const ETIQUETTE = 'fr.cestbienbeau.prospection';
const racine = join(import.meta.dirname, '..');
const agents = join(homedir(), 'Library', 'LaunchAgents');
const fichier = join(agents, `${ETIQUETTE}.plist`);
const journal = join(homedir(), 'Library', 'Logs', 'prospection.log');
const domaine = `gui/${userInfo().uid}`;

if (process.platform !== 'darwin') {
  console.error('Le démarrage automatique est prévu pour macOS. Ailleurs, lance `pnpm local` toi-même.');
  process.exit(1);
}

const echapper = (texte) => texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const arreter = () => {
  try {
    execFileSync('launchctl', ['bootout', domaine, fichier], { stdio: 'ignore' });
  } catch {
    // Pas encore chargé : rien à arrêter.
  }
};

if (process.argv[2] === 'off') {
  arreter();
  if (existsSync(fichier)) rmSync(fichier);
  console.log('Démarrage automatique enlevé. L’outil ne se lancera plus tout seul : `pnpm local` pour le lancer à la main.');
  process.exit(0);
}

// launchd démarre avec un PATH minimal : on lui donne celui du terminal, pour trouver npx.
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${ETIQUETTE}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${echapper(process.execPath)}</string>
    <string>${echapper(join(racine, 'scripts', 'local.mjs'))}</string>
  </array>
  <key>WorkingDirectory</key><string>${echapper(racine)}</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${echapper(process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin')}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>${echapper(journal)}</string>
  <key>StandardErrorPath</key><string>${echapper(journal)}</string>
</dict>
</plist>
`;

mkdirSync(agents, { recursive: true });
mkdirSync(join(homedir(), 'Library', 'Logs'), { recursive: true });
arreter();
writeFileSync(fichier, plist);
execFileSync('launchctl', ['bootstrap', domaine, fichier], { stdio: 'inherit' });
console.log('C’est fait : l’outil tourne et se relancera à chaque démarrage du Mac.');
console.log('Admin : http://localhost:8787 · journal : ~/Library/Logs/prospection.log');
console.log('Pour l’enlever : pnpm autostart off');
