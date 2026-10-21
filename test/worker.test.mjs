// Teste le Worker de bout en bout : recherche lancée depuis l'admin, Apify
// simulé par un serveur local, import puis analyse par la tâche planifiée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const racine = join(import.meta.dirname, '..');
const PORT_WORKER = 8797;

function demarrerFauxApify(fiches) {
  const appels = { runs: [], etat: 0 };
  const serveur = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const json = (corps, entetes = {}) => {
      res.writeHead(200, { 'content-type': 'application/json', ...entetes });
      res.end(JSON.stringify(corps));
    };
    if (req.method === 'POST' && url.pathname === '/v2/acts/compass~crawler-google-places/runs') {
      let corps = '';
      req.on('data', (morceau) => (corps += morceau));
      req.on('end', () => {
        appels.runs.push({ auth: req.headers.authorization, entree: JSON.parse(corps) });
        json({ data: { id: 'run1', defaultDatasetId: 'ds1' } });
      });
      return;
    }
    if (url.pathname === '/v2/actor-runs/run1') {
      appels.etat += 1;
      return json({ data: { status: appels.etat === 1 ? 'RUNNING' : 'SUCCEEDED' } });
    }
    if (url.pathname === '/v2/datasets/ds1/items') {
      const debut = Number(url.searchParams.get('offset'));
      const fin = debut + Number(url.searchParams.get('limit'));
      return json(fiches.slice(debut, fin), { 'x-apify-pagination-total': String(fiches.length) });
    }
    if (url.pathname === '/site-a/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<html><a href="/site-a/contact">Contact</a><p>Nos vins</p> © 2014</html>');
    }
    if (url.pathname === '/site-a/contact') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<a href="mailto:contact@127.0.0.1">écrire</a>');
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => serveur.listen(0, '127.0.0.1', () => resolve({ serveur, appels, port: serveur.address().port })));
}

async function attendre(url) {
  for (let essai = 0; essai < 60; essai++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('Le Worker ne démarre pas');
}

test('une recherche lancée depuis l’admin finit en prospects analysés', { timeout: 120_000 }, async () => {
  const fiches = [
    { placeId: 'A', title: 'Domaine A', city: 'Barr', searchString: 'domaine viticole Barr' },
    { placeId: 'B', title: 'Domaine B', city: 'Andlau', emails: ['contact@domaine-b.fr'] },
    { placeId: 'C', title: 'Cave coopérative de Barr', city: 'Barr' },
  ];
  const apifyFinal = await demarrerFauxApify(fiches);
  fiches[0].website = `http://127.0.0.1:${apifyFinal.port}/site-a/`;

  const persistance = mkdtempSync(join(tmpdir(), 'prospection-d1-'));
  const vars = join(persistance, '.dev.vars');
  writeFileSync(vars, `ACCESS_DESACTIVE=1\nAPIFY_TOKEN=jeton-test\nAPIFY_API=http://127.0.0.1:${apifyFinal.port}\n`);
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'prospection', '--local', '--persist-to', persistance], { cwd: racine, stdio: 'ignore' });
  const worker = spawn('npx', ['wrangler', 'dev', '--port', String(PORT_WORKER), '--test-scheduled', '--persist-to', persistance, '--env-file', vars], {
    cwd: racine,
    stdio: 'ignore',
    detached: true,
  });

  try {
    const admin = `http://127.0.0.1:${PORT_WORKER}`;
    await attendre(admin);

    const lancement = await fetch(`${admin}/recherches`, {
      method: 'POST',
      body: new URLSearchParams({ cible: 'vin', metier: 'domaine viticole', communes: 'Barr\nAndlau\n', max: '20' }),
      redirect: 'manual',
    });
    assert.equal(lancement.status, 303);
    assert.equal(apifyFinal.appels.runs[0].auth, 'Bearer jeton-test');
    assert.deepEqual(apifyFinal.appels.runs[0].entree.searchStringsArray, ['domaine viticole Barr', 'domaine viticole Andlau']);
    assert.equal(apifyFinal.appels.runs[0].entree.maxCrawledPlacesPerSearch, 20);

    const passage = () => fetch(`${admin}/__scheduled?cron=*+*+*+*+*`);
    await passage(); // Apify encore en cours
    assert.match(await (await fetch(`${admin}/recherches`)).text(), /Extraction Apify en cours/);
    await passage(); // terminé : import
    assert.match(await (await fetch(`${admin}/recherches`)).text(), /Terminée/);
    await passage(); // analyse des sites

    const liste = await (await fetch(`${admin}/?cible=vin`)).text();
    const ligne = (nom) => liste.slice(liste.indexOf(`>${nom}<`)).split('</tr>')[0];
    assert.match(ligne('Domaine A'), /badge-nouveau[\s\S]*on ne peut pas commander vos vins[\s\S]*contact@127\.0\.0\.1/);
    assert.match(ligne('Domaine B'), /badge-nouveau[\s\S]*seulement une fiche Google[\s\S]*contact@domaine-b\.fr/);
    assert.match(ligne('Cave coopérative de Barr'), /badge-hors_cible/);

    // Une nouvelle recherche sur les mêmes communes ne touche pas un statut posé à la main.
    await fetch(`${admin}/p/B`, { method: 'POST', body: new URLSearchParams({ statut: 'client', note: 'Signé' }), redirect: 'manual' });
    fiches[1].phone = '03 88 00 00 00';
    await fetch(`${admin}/recherches`, {
      method: 'POST',
      body: new URLSearchParams({ cible: 'vin', metier: 'domaine viticole', communes: 'Barr\nAndlau', max: '20' }),
      redirect: 'manual',
    });
    await passage();
    const ficheB = await (await fetch(`${admin}/p/B`)).text();
    assert.match(ficheB, /badge-client/);
    assert.match(ficheB, /Signé/);
    assert.match(ficheB, /03 88 00 00 00/);
  } finally {
    process.kill(-worker.pid);
    apifyFinal.serveur.close();
  }
});
