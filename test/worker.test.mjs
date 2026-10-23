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
  const appels = { runs: [], etat: 0, claude: [], recherches: [] };
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
    // Faux Claude : juge le site A faible et le site F déjà bon.
    const avisPour = (texte) =>
      texte.includes('Entreprise : Domaine F')
        ? { verdict: 'bon', qualite: 9, constat: '', raisons: ['site récent et complet'], confiance: 'haute' }
        : { verdict: 'faible', qualite: 3, constat: 'votre page d’accueil ne présente aucune de vos cuvées.', raisons: ['texte très court', 'aucune cuvée'], confiance: 'haute' };
    // Faux OpenRouter : même chose, au format chat completions, JSON entouré de ```json.
    if (req.method === 'POST' && url.pathname === '/openrouter/chat/completions') {
      let corps = '';
      req.on('data', (morceau) => (corps += morceau));
      req.on('end', () => {
        const entree = JSON.parse(corps);
        if (entree.plugins) {
          // Recherche d'email : la preuve est dans les citations renvoyées par la recherche web.
          appels.recherches.push({ cle: req.headers.authorization, entree });
          const contenu = JSON.stringify({ email: 'bonjour@domaine-e.fr', source: 'https://annuaire.example/domaine-e' });
          const annotations = [{ type: 'url_citation', url_citation: { url: 'https://annuaire.example/domaine-e', content: 'Domaine E, Barr. Écrire à bonjour@domaine-e.fr' } }];
          return json({ id: 'gen-2', model: entree.model, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: contenu, annotations } }] });
        }
        appels.claude.push({ cle: req.headers.authorization, entree });
        const avis = avisPour(entree.messages.find((m) => m.role === 'user').content);
        json({ id: 'gen-1', model: entree.model, usage: { cost: 0.3 }, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '```json\n' + JSON.stringify(avis) + '\n```' } }] });
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/v1/messages') {
      let corps = '';
      req.on('data', (morceau) => (corps += morceau));
      req.on('end', () => {
        const entree = JSON.parse(corps);
        if (!entree.tools) appels.claude.push({ beta: req.headers['anthropic-beta'], cle: req.headers['x-api-key'], entree });
        const texte = entree.messages[0].content;
        const reponse = (content, stop_reason = 'end_turn') =>
          json({ id: 'msg_1', type: 'message', role: 'assistant', model: entree.model, content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });
        if (entree.tools) {
          // Recherche d'email avec les outils web : E est trouvé (après une pause), G proposé sans preuve, H introuvable.
          appels.recherches.push({ beta: req.headers['anthropic-beta'], entree });
          const port = serveur.address().port;
          if (texte.includes('Entreprise : Domaine E') && entree.messages.length === 1) {
            return reponse([{ type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'Domaine E Andlau email' } }], 'pause_turn');
          }
          const trouvaille = texte.includes('Entreprise : Domaine E')
            ? { email: 'bonjour@domaine-e.fr', source: `http://127.0.0.1:${port}/annuaire-e/` }
            : texte.includes('Entreprise : Domaine G')
              ? { email: 'devine@domaine-g.fr', source: `http://127.0.0.1:${port}/annuaire-g/` }
              : { email: '', source: '' };
          return reponse([{ type: 'text', text: `Voici : ${JSON.stringify(trouvaille)}` }]);
        }
        const avis = avisPour(texte);
        json({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: entree.model,
          content: [{ type: 'text', text: JSON.stringify(avis) }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 },
        });
      });
      return;
    }
    if (url.pathname === '/annuaire-e/' || url.pathname === '/annuaire-g/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(url.pathname === '/annuaire-e/' ? '<p>Domaine E, Andlau : bonjour@domaine-e.fr</p>' : '<p>Domaine G, Barr : pas d’adresse ici</p>');
    }
    if (url.pathname === '/site-f/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<html><meta name="viewport" content="width=device-width"><p>Domaine F, boutique en ligne</p> © 2026 contact@127.0.0.1</html>');
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
    { placeId: 'E', title: 'Domaine E', city: 'Andlau', phone: '03 89 00 00 00', emails: ['mailto:'] },
    { placeId: 'F', title: 'Domaine F', city: 'Barr' },
    { placeId: 'G', title: 'Domaine G', city: 'Barr' },
    { placeId: 'H', title: 'Domaine H', city: 'Andlau' },
  ];
  const apifyFinal = await demarrerFauxApify(fiches);
  fiches[0].website = `http://127.0.0.1:${apifyFinal.port}/site-a/`;
  fiches[5].website = `http://127.0.0.1:${apifyFinal.port}/site-f/`;

  const persistance = mkdtempSync(join(tmpdir(), 'prospection-d1-'));
  const vars = join(persistance, '.dev.vars');
  writeFileSync(vars, `ACCESS_DESACTIVE=1\nAPIFY_TOKEN=jeton-test\nAPIFY_API=http://127.0.0.1:${apifyFinal.port}\nANTHROPIC_API_KEY=cle-test\nANTHROPIC_API=http://127.0.0.1:${apifyFinal.port}\n`);
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
    assert.match(suivi, /8 \/ 8 fiches importées/);
    assert.match(suivi, /Domaine B : prêt à contacter/);

    const liste = await (await fetch(`${admin}/prospects?cible=vin`)).text();
    const ligne = (nom) => liste.slice(liste.indexOf(`>${nom}<`)).split('</tr>')[0];
    // Claude juge les sites lus : son constat remplace celui des règles, un site déjà bon part en « plus tard ».
    assert.match(ligne('Domaine A'), /badge-nouveau[\s\S]*votre page d’accueil ne présente aucune de vos cuvées<[\s\S]*Site faible 3\/10[\s\S]*contact@127\.0\.0\.1/);
    assert.match(ligne('Domaine F'), /badge-plus_tard[\s\S]*site déjà bon selon Claude \(9\/10\)/);
    assert.equal(apifyFinal.appels.claude.length, 2); // seulement les sites lus, pas les fiches sans site
    const appel = apifyFinal.appels.claude[0];
    assert.equal(appel.cle, 'cle-test');
    // Haiku par défaut, sans relance serveur (Haiku ne la prend pas).
    assert.equal(appel.entree.model, 'claude-haiku-5-5');
    assert.equal(appel.entree.fallbacks, undefined);
    assert.doesNotMatch(appel.beta ?? '', /server-side-fallback/);
    assert.match(await (await fetch(`${admin}/recherches`)).text(), /dépensés aujourd’hui sur 1,00 \$/);
    assert.equal(appel.entree.output_config.effort, 'low');
    assert.match(apifyFinal.appels.claude.map((a) => a.entree.messages[0].content).join(), /Nos vins/);
    assert.match(ligne('Domaine B'), /badge-nouveau[\s\S]*seulement une fiche Google[\s\S]*contact@domaine-b\.fr/);
    assert.match(ligne('Cave coopérative de Barr'), /badge-hors_cible/);
    // Adresse nominative : à écrire à la main, avec l'email prérempli.
    assert.match(ligne('Domaine D'), /badge-a_ecrire[\s\S]*href="mailto:claire\.martin@gmail\.com\?subject=Domaine%20D[^"]*j&#39;ai%20remarqu%C3%A9%20que%20vous%20n&#39;avez%20pas%20encore%20de%20site/);
    // Pas d'email sur le site : Claude le cherche sur le web, et l'adresse doit figurer dans la page citée.
    assert.equal(apifyFinal.appels.recherches.length, 4); // E deux fois (pause_turn), G et H
    assert.ok(apifyFinal.appels.recherches.every((a) => a.entree.tools.some((t) => t.type === 'web_search_20260209')));
    assert.equal(apifyFinal.appels.recherches.find((a) => a.entree.messages.length === 2).entree.messages[1].role, 'assistant');
    assert.match(ligne('Domaine E'), /badge-nouveau[\s\S]*bonjour@domaine-e\.fr/);
    assert.match(await (await fetch(`${admin}/p/E`)).text(), /lu sur 127\.0\.0\.1/);
    assert.match(ligne('Domaine G'), /badge-a_verifier[\s\S]*proposé : devine@domaine-g\.fr/);
    assert.match(ligne('Domaine H'), /badge-sans_email/);
    assert.doesNotMatch(liste, /tel:/);

    // Mode traitement : valider l'adresse proposée, ou coller celle trouvée soi-même.
    const traitement = await (await fetch(`${admin}/traiter?statut=a_verifier`)).text();
    assert.match(traitement, /<h1>Domaine G<\/h1>/);
    assert.match(traitement, /Utiliser devine@domaine-g\.fr<kbd>1<\/kbd>/);
    assert.match(traitement, /pagesjaunes\.fr\/annuaire\/chercherlespros\?quoiqui=Domaine%20G/);
    const valide = await fetch(`${admin}/traiter`, { method: 'POST', body: new URLSearchParams({ id: 'G', action: 'valider', statut: 'a_verifier', note: '' }), redirect: 'manual' });
    assert.match(valide.headers.get('location'), /\/traiter\?statut=a_verifier&message=devine%40domaine-g\.fr\+enregistr/);
    assert.match(await (await fetch(`${admin}/p/G`)).text(), /badge-nouveau/);
    const invalide = await fetch(`${admin}/traiter`, { method: 'POST', body: new URLSearchParams({ id: 'H', action: 'email', email: 'pas une adresse', statut: 'sans_email' }), redirect: 'manual' });
    assert.match(invalide.headers.get('location'), /n%E2%80%99est\+pas\+une\+adresse/);
    await fetch(`${admin}/traiter`, { method: 'POST', body: new URLSearchParams({ id: 'H', action: 'email', email: ' Contact@Domaine-H.fr ', statut: 'sans_email' }), redirect: 'manual' });
    assert.match(await (await fetch(`${admin}/p/H`)).text(), /badge-nouveau[\s\S]*contact@domaine-h\.fr[\s\S]*saisi à la main/);
    assert.match(await (await fetch(`${admin}/traiter?statut=a_ecrire`)).text(), /<h1>Domaine D<\/h1>[\s\S]*href="mailto:claire\.martin@gmail\.com/);

    // Changement de statut groupé depuis la liste.
    const groupe = await fetch(`${admin}/lot`, { method: 'POST', body: new URLSearchParams([['ids', 'C'], ['statut', 'pas_interesse'], ['retour', '/prospects?statut=hors_cible']]), redirect: 'manual' });
    assert.equal(groupe.headers.get('location'), `${admin}/prospects?statut=hors_cible&message=1+fiche+pass%C3%A9e+en+%C2%AB+Pas+int%C3%A9ress%C3%A9+%C2%BB`);
    assert.match(await (await fetch(`${admin}/p/C`)).text(), /badge-pas_interesse/);

    // « Écrire » passe la fiche en campagne.
    assert.equal((await fetch(`${admin}/p/D/ecrit`, { method: 'POST' })).status, 204);
    assert.match(await (await fetch(`${admin}/p/D`)).text(), /badge-en_campagne/);

    // « Réanalyser » garde l'email trouvé sur le web, sans relancer de recherche.
    const recherchesAvant = apifyFinal.appels.recherches.length;
    await fetch(`${admin}/reanalyser`, { method: 'POST', body: new URLSearchParams({ statut: 'nouveau' }), redirect: 'manual' });
    assert.match(await (await fetch(`${admin}/p/E`)).text(), /badge-a_analyser/);
    await passage();
    assert.match(await (await fetch(`${admin}/p/E`)).text(), /badge-nouveau[\s\S]*bonjour@domaine-e\.fr/);
    assert.equal(apifyFinal.appels.recherches.length, recherchesAvant);

    // Tableau de bord en page d'accueil ; les anciens liens filtrés mènent à la liste.
    const accueil = await (await fetch(admin)).text();
    assert.match(accueil, /<h1>Tableau de bord<\/h1>/);
    assert.match(accueil, /<strong>0<\/strong><span>Email à chercher<\/span>/);
    assert.match(accueil, /Trouvés sur Google Maps/);
    const ancien = await fetch(`${admin}/?statut=a_verifier`, { redirect: 'manual' });
    assert.equal(ancien.headers.get('location'), `${admin}/prospects?statut=a_verifier`);

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
    assert.match(creation.headers.get('location'), /\/cibles\?cle=restaurants&message=/);
    const pageCibles = await (await fetch(`${admin}/cibles?cle=restaurants`)).text();
    assert.match(pageCibles, /0 \/ 2 recherches/);
    assert.match(pageCibles, /mcdo\nkfc/);
    assert.match(await (await fetch(`${admin}/recherches?cible=restaurants`)).text(), />restaurant\npizzeria</);
    const parCategorie = await (await fetch(`${admin}/prospects?categorie=Producteur+de+vin`)).text();
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

test('avec une clé OpenRouter, Claude est appelé par OpenRouter', { timeout: 120_000 }, async () => {
  const fiches = [
    { placeId: 'A', title: 'Domaine A', city: 'Barr', categoryName: 'Producteur de vin' },
    { placeId: 'F', title: 'Domaine F', city: 'Barr' },
    { placeId: 'E', title: 'Domaine E', city: 'Barr' },
  ];
  const faux = await demarrerFauxApify(fiches);
  fiches[0].website = `http://127.0.0.1:${faux.port}/site-a/`;
  fiches[1].website = `http://127.0.0.1:${faux.port}/site-f/`;
  const persistance = mkdtempSync(join(tmpdir(), 'prospection-d1-'));
  const vars = join(persistance, '.dev.vars');
  writeFileSync(
    vars,
    `ACCESS_DESACTIVE=1\nAPIFY_TOKEN=jeton-test\nAPIFY_API=http://127.0.0.1:${faux.port}\nANTHROPIC_API_KEY=cle-anthropic\nOPENROUTER_API_KEY=cle-openrouter\nOPENROUTER_API=http://127.0.0.1:${faux.port}/openrouter/\nCLAUDE_BUDGET_JOUR=0.5\n`,
  );
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'prospection', '--local', '--persist-to', persistance], { cwd: racine, stdio: 'ignore' });
  const port = PORT_WORKER + 1;
  const worker = spawn('npx', ['wrangler', 'dev', '--port', String(port), '--test-scheduled', '--persist-to', persistance, '--env-file', vars], {
    cwd: racine,
    stdio: 'ignore',
    detached: true,
  });
  try {
    const admin = `http://127.0.0.1:${port}`;
    await attendre(admin);
    assert.match(await (await fetch(`${admin}/recherches`)).text(), /Claude juge chaque site \(anthropic\/claude-haiku-5\.5\)/);
    await fetch(`${admin}/recherches`, { method: 'POST', body: new URLSearchParams({ cible: 'vin', metiers: 'domaine viticole', communes: 'Barr', max: '20' }), redirect: 'manual' });
    for (let i = 0; i < 3; i++) await fetch(`${admin}/__scheduled?cron=*+*+*+*+*`);

    assert.equal(faux.appels.claude.length, 2);
    const appel = faux.appels.claude[0];
    assert.equal(appel.cle, 'Bearer cle-openrouter');
    assert.equal(appel.entree.model, 'anthropic/claude-haiku-5.5');
    assert.deepEqual(appel.entree.usage, { include: true });
    assert.equal(appel.entree.response_format.json_schema.strict, true);
    assert.equal(appel.entree.messages[0].role, 'system');
    const liste = await (await fetch(`${admin}/prospects?cible=vin`)).text();
    const ligne = (nom) => liste.slice(liste.indexOf(`>${nom}<`)).split('</tr>')[0];
    assert.match(ligne('Domaine A'), /votre page d’accueil ne présente aucune de vos cuvées<[\s\S]*Site faible 3\/10/);
    assert.match(ligne('Domaine F'), /badge-plus_tard[\s\S]*site déjà bon selon Claude \(9\/10\)/);
    // Les deux jugements ont coûté 0,60 $ pour un budget de 0,50 $ : la recherche d'email automatique attend demain.
    assert.equal(faux.appels.recherches.length, 0);
    assert.match(ligne('Domaine E'), /badge-a_enrichir/);
    assert.match(await (await fetch(`${admin}/recherches`)).text(), /Budget Claude du jour atteint[\s\S]*0,60 \$ dépensés aujourd’hui sur 0,50 \$/);
    // Un clic sur « Chercher avec Claude » passe outre : recherche web d'OpenRouter, prouvée par ses citations.
    await fetch(`${admin}/traiter`, { method: 'POST', body: new URLSearchParams({ id: 'E', action: 'chercher', statut: 'a_enrichir' }), redirect: 'manual' });
    assert.equal(faux.appels.recherches.length, 1);
    assert.equal(faux.appels.recherches[0].entree.plugins[0].id, 'web');
    assert.match(await (await fetch(`${admin}/p/E`)).text(), /badge-nouveau[\s\S]*bonjour@domaine-e\.fr/);
  } finally {
    process.kill(-worker.pid);
    faux.serveur.close();
  }
});
