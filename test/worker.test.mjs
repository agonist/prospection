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
    if (url.pathname === '/v2/datasets/ds1') {
      return json({ data: { itemCount: appels.etat <= 1 ? 0 : fiches.length } });
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
    { placeId: 'A', title: 'Domaine A', city: 'Barr', categoryName: 'Producteur de vin', searchString: 'domaine viticole Barr' },
    { placeId: 'B', title: 'Domaine B', city: 'Andlau', emails: ['contact@domaine-b.fr'] },
    { placeId: 'C', title: 'Cave coopérative de Barr', city: 'Barr' },
    { placeId: 'D', title: 'Domaine D', city: 'Barr', emails: ['claire.martin@gmail.com'] },
    { placeId: 'E', title: 'Domaine E', city: 'Andlau', phone: '03 89 00 00 00' },
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
      body: new URLSearchParams({ cible: 'vin', metiers: 'domaine viticole', communes: 'Barr\nAndlau\n', max: '20', contacts: '1' }),
      redirect: 'manual',
    });
    assert.equal(lancement.status, 303);
    assert.equal(apifyFinal.appels.runs[0].auth, 'Bearer jeton-test');
    assert.deepEqual(apifyFinal.appels.runs[0].entree.searchStringsArray, ['domaine viticole Barr', 'domaine viticole Andlau']);
    assert.equal(apifyFinal.appels.runs[0].entree.maxCrawledPlacesPerSearch, 20);
    assert.equal(apifyFinal.appels.runs[0].entree.scrapeContacts, true);

    const passage = () => fetch(`${admin}/__scheduled?cron=*+*+*+*+*`);
    await passage(); // Apify encore en cours
    assert.match(await (await fetch(`${admin}/recherches`)).text(), /Extraction Apify en cours/);
    await passage(); // terminé : import
    assert.match(await (await fetch(`${admin}/recherches`)).text(), /Terminée/);
    await passage(); // analyse des sites

    const suivi = await (await fetch(`${admin}/recherches`)).text();
    assert.match(suivi, /Dernier passage de la tâche il y a \d+ s/);
    assert.match(suivi, /extraction Apify en cours, 0 fiches trouvées/);
    assert.match(suivi, /5 \/ 5 fiches importées/);
    assert.match(suivi, /Domaine B : prêt à contacter/);

    const liste = await (await fetch(`${admin}/?cible=vin`)).text();
    const ligne = (nom) => liste.slice(liste.indexOf(`>${nom}<`)).split('</tr>')[0];
    assert.match(ligne('Domaine A'), /badge-nouveau[\s\S]*on ne peut pas commander vos vins[\s\S]*contact@127\.0\.0\.1/);
    assert.match(ligne('Domaine B'), /badge-nouveau[\s\S]*seulement une fiche Google[\s\S]*contact@domaine-b\.fr/);
    assert.match(ligne('Cave coopérative de Barr'), /badge-hors_cible/);
    // Adresse nominative : à écrire à la main, avec l'email prérempli.
    assert.match(ligne('Domaine D'), /badge-a_ecrire[\s\S]*href="mailto:claire\.martin@gmail\.com\?subject=Domaine%20D[^"]*j&#39;ai%20remarqu%C3%A9%20que%20vous%20n&#39;avez%20pas%20encore%20de%20site/);
    // Pas d'email mais un téléphone : à appeler.
    assert.match(ligne('Domaine E'), /badge-a_appeler[\s\S]*href="tel:03 89 00 00 00"/);
    assert.match(await (await fetch(`${admin}/?statut=a_appeler`)).text(), /pas d’email trouvé<em>1<\/em>|Réanalyser/);

    // « Écrire » passe la fiche en campagne.
    assert.equal((await fetch(`${admin}/p/D/ecrit`, { method: 'POST' })).status, 204);
    assert.match(await (await fetch(`${admin}/p/D`)).text(), /badge-en_campagne/);

    // « Réanalyser » renvoie les fiches à appeler en analyse, et elles y retombent.
    await fetch(`${admin}/reanalyser`, { method: 'POST', body: new URLSearchParams({ statut: 'a_appeler' }), redirect: 'manual' });
    assert.match(await (await fetch(`${admin}/p/E`)).text(), /badge-a_analyser/);
    await passage();
    assert.match(await (await fetch(`${admin}/p/E`)).text(), /badge-a_appeler/);

    // La même recherche n'est pas relancée tant qu'on ne force pas.
    const rejouee = await fetch(`${admin}/recherches`, {
      method: 'POST',
      body: new URLSearchParams({ cible: 'vin', metiers: 'Domaine viticole', communes: 'barr\nAndlau', max: '20' }),
      redirect: 'manual',
    });
    assert.equal(rejouee.status, 200);
    assert.match(await rejouee.text(), /ont toutes été faites il y a moins de 6 mois/);
    assert.equal(apifyFinal.appels.runs.length, 1);
    const formulaire = await (await fetch(`${admin}/recherches?cible=vin`)).text();
    assert.match(formulaire, /<strong>\d+ recherches à faire sur \d+<\/strong>/);
    assert.match(formulaire, /<textarea id="metiers"[^>]*>domaine viticole\nvigneron</);
    // Barr n'a été faite que pour « domaine viticole » : elle reste proposée pour « vigneron ».
    assert.match(formulaire.match(/<textarea id="communes"[^>]*>([^<]*)/)[1], /Barr/);

    // Cibles modifiables, et filtre par catégorie Google.
    const creation = await fetch(`${admin}/cibles`, {
      method: 'POST',
      body: new URLSearchParams({ cle: '', nom: 'Restaurants', metiers: 'restaurant\npizzeria', communes: 'Colmar\nColmar', exclure: 'mcdo\nkfc', ordre_pasDeSite: '1', ordre_pasMobile: '2' }),
      redirect: 'manual',
    });
    assert.equal(creation.headers.get('location'), `${admin}/cibles?cle=restaurants`);
    const pageCibles = await (await fetch(`${admin}/cibles?cle=restaurants`)).text();
    assert.match(pageCibles, /0 \/ 2 recherches/);
    assert.match(pageCibles, /mcdo\nkfc/);
    assert.match(await (await fetch(`${admin}/recherches?cible=restaurants`)).text(), />restaurant\npizzeria</);
    const parCategorie = await (await fetch(`${admin}/?categorie=Producteur+de+vin`)).text();
    assert.match(parCategorie, /Domaine A/);
    assert.doesNotMatch(parCategorie, /Domaine B/);

    // Une nouvelle recherche sur les mêmes communes ne touche pas un statut posé à la main.
    await fetch(`${admin}/p/B`, { method: 'POST', body: new URLSearchParams({ statut: 'client', note: 'Signé' }), redirect: 'manual' });
    fiches[1].phone = '03 88 00 00 00';
    await fetch(`${admin}/recherches`, {
      method: 'POST',
      body: new URLSearchParams({ cible: 'vin', metiers: 'domaine viticole', communes: 'Barr\nAndlau', max: '20', forcer: '1' }),
      redirect: 'manual',
    });
    assert.equal(apifyFinal.appels.runs.length, 2);
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
