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
  const appels = { runs: [], etat: 0, claude: [], recherches: [], sirene: [], propositions: [], hubertino: [], etatHubertino: 0 };
  // Hubertino : une fiche avec email, une fermée, une dont la visite du site a échoué.
  const lignesHubertino = [
    { _status: 'enriched', query: 'photographe Barr, Alsace, France', name: 'Studio Lumière', category: 'Photographe', phone: '03 88 00 00 01', email: 'contact@studio-lumiere.fr', website: null, address: '1 rue du Marché, 67140 Barr', city: 'Barr', rating: 4.8, reviews: 12, business_status: 'OPERATIONAL', location_link: 'https://www.google.com/maps/place/?q=place_id:ChIJ1', place_id: 'ChIJ1' },
    { _status: 'enriched', query: 'studio photo Saint-Louis, Haut-Rhin', name: 'Photo Rhin', category: 'Studio photo', email: null, website: null, city: 'Saint-Louis', rating: null, reviews: null, business_status: 'CLOSED_PERMANENTLY', place_id: 'ChIJ2' },
    { _status: 'failed', query: 'photographe Saint-Louis, Haut-Rhin', name: 'Atelier Image', category: 'Photographe', email: null, website: null, city: 'Saint-Louis', rating: 4.1, reviews: 3, business_status: 'OPERATIONAL', place_id: 'ChIJ3' },
  ];
  // Registre Sirene : une entreprise créée il y a 10 jours, et un résultat vide.
  const creees = [
    { status: 'found', siret: '12345678900011', siren: '123456789', name: 'DOMAINE NOUVEAU EARL', creationDate: new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10), nafCode: '01.21Z', address: '3 RUE DES VIGNES', postalCode: '67140', city: 'BARR', department: '67' },
    { status: 'not_found' },
  ];
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
    if (req.method === 'POST' && url.pathname === '/v2/acts/fit_melon~new-french-companies-finder-sirene/runs') {
      let corps = '';
      req.on('data', (morceau) => (corps += morceau));
      req.on('end', () => {
        appels.sirene.push(JSON.parse(corps));
        json({ data: { id: 'run2', defaultDatasetId: 'ds2' } });
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/hubertino/scrapes') {
      let corps = '';
      req.on('data', (morceau) => (corps += morceau));
      req.on('end', () => {
        appels.hubertino.push({ auth: req.headers.authorization, entree: JSON.parse(corps) });
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ scrape: { id: 'h1', status: 'queued' } }));
      });
      return;
    }
    if (url.pathname === '/hubertino/scrapes/h1') {
      appels.etatHubertino += 1;
      return json({ scrape: { id: 'h1', status: appels.etatHubertino === 1 ? 'running' : 'done' } });
    }
    if (url.pathname === '/hubertino/scrapes/h1/results') {
      const debut = Number(url.searchParams.get('offset'));
      const limite = Number(url.searchParams.get('limit'));
      const lignes = appels.etatHubertino <= 1 ? [] : lignesHubertino;
      return json({ status: 'done', partial: false, count: lignes.length, updated: 1, coverage: null, columns: [], rows: lignes.slice(debut, debut + limite), offset: debut, limit: limite, hasMore: debut + limite < lignes.length });
    }
    if (url.pathname === '/v2/actor-runs/run2') return json({ data: { status: 'SUCCEEDED' } });
    if (url.pathname === '/v2/datasets/ds2') return json({ data: { itemCount: creees.length } });
    if (url.pathname === '/v2/datasets/ds2/items') {
      const debut = Number(url.searchParams.get('offset'));
      return json(creees.slice(debut, debut + Number(url.searchParams.get('limit'))), { 'x-apify-pagination-total': String(creees.length) });
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
        if (entree.messages[0].content.includes('nouvelle cible de prospection')) {
          // Proposition de cible : un code NAF inventé et un constat inconnu, à écarter.
          appels.propositions.push(entree);
          const proposition = {
            nom: 'Photographes',
            metiers: ['Photographe', 'photographe de mariage'],
            naf: ['74.20Z', '99.99Z'],
            exclure: ['studio harcourt', 'photomaton'],
            attentes: 'Une galerie de réalisations et les tarifs des séances.',
            constats: ['pasDeSite', 'pasDeTarifs', 'inconnu'],
            modele: '{{nom}}, vos photos\nBonjour,\n\nEn cherchant « {{recherche}} », j’ai remarqué que {{constat}}.\n\nBas',
          };
          return json({ id: 'gen-3', model: entree.model, usage: { cost: 0.01 }, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(proposition) } }] });
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
          // Recherche d'email avec les outils web : E est trouvé (après une pause), G absent de la page citée,
          // I sur Facebook (page illisible), J sans source, H introuvable.
          appels.recherches.push({ beta: req.headers['anthropic-beta'], entree });
          const port = serveur.address().port;
          if (texte.includes('Entreprise : Domaine E') && entree.messages.length === 1) {
            return reponse([{ type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'Domaine E Andlau email' } }], 'pause_turn');
          }
          const trouvaille = texte.includes('Entreprise : Domaine E')
            ? { email: 'bonjour@domaine-e.fr', source: `http://127.0.0.1:${port}/annuaire-e/` }
            : texte.includes('Entreprise : Domaine Nouveau EARL')
              ? { email: 'contact@domaine-nouveau.fr', source: `http://127.0.0.1:${port}/annuaire-e/` }
              : texte.includes('Entreprise : Domaine G')
              ? { email: 'devine@domaine-g.fr', source: `http://127.0.0.1:${port}/annuaire-g/` }
              : texte.includes('Entreprise : Domaine I')
              ? { email: 'domaine.i@gmail.com', source: 'https://www.facebook.com/domaine.i' }
              : texte.includes('Entreprise : Domaine J')
              ? { email: 'contact@domaine-j.fr', source: '' }
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
      return res.end(url.pathname === '/annuaire-e/' ? '<p>Domaine E, Andlau : bonjour@domaine-e.fr</p><p>Domaine Nouveau, Barr : contact@domaine-nouveau.fr</p>' : '<p>Domaine G, Barr : pas d’adresse ici</p>');
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
    { placeId: 'I', title: 'Domaine I', city: 'Barr' },
    { placeId: 'J', title: 'Domaine J', city: 'Barr' },
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
    await passage(); // analyse des sites et premières recherches d'email
    await passage(); // dernières recherches d'email

    const suivi = await (await fetch(`${admin}/recherches`)).text();
    assert.match(suivi, /Dernier passage de la tâche il y a \d+ s/);
    assert.match(suivi, /extraction Apify en cours, 0 fiches trouvées/);
    assert.match(suivi, /10 \/ 10 fiches importées/);
    assert.match(suivi, /Domaine B : prêt à contacter/);

    const liste = await (await fetch(`${admin}/prospects?cible=vin`)).text();
    const ligne = (nom) => liste.slice(liste.indexOf(`>${nom}<`)).split('</tr>')[0];
    // Claude juge les sites lus : son constat remplace celui des règles, un site déjà bon part en « plus tard ».
    assert.match(ligne('Domaine A'), /badge-nouveau[\s\S]*votre page d’accueil ne présente aucune de vos cuvées<[\s\S]*contact@127\.0\.0\.1[\s\S]*Site faible 3\/10/);
    assert.match(ligne('Domaine F'), /badge-plus_tard[\s\S]*site déjà bon selon Claude \(9\/10\)/);
    assert.equal(apifyFinal.appels.claude.length, 2); // seulement les sites lus, pas les fiches sans site
    const appel = apifyFinal.appels.claude[0];
    assert.equal(appel.cle, 'cle-test');
    // Haiku par défaut, sans relance serveur (Haiku ne la prend pas).
    assert.equal(appel.entree.model, 'claude-haiku-5-5');
    assert.equal(appel.entree.fallbacks, undefined);
    assert.doesNotMatch(appel.beta ?? '', /server-side-fallback/);
    assert.match(await (await fetch(`${admin}/recherches`)).text(), /Claude juge chaque site \(claude-haiku-5-5\)/);
    assert.equal(appel.entree.output_config.effort, 'low');
    assert.match(apifyFinal.appels.claude.map((a) => a.entree.messages[0].content).join(), /Nos vins/);
    assert.match(ligne('Domaine B'), /badge-nouveau[\s\S]*seulement une fiche Google[\s\S]*contact@domaine-b\.fr/);
    assert.match(ligne('Cave coopérative de Barr'), /badge-hors_cible/);
    // Adresse nominative : à écrire à la main, avec l'email prérempli.
    assert.match(ligne('Domaine D'), /badge-a_ecrire[\s\S]*href="mailto:claire\.martin@gmail\.com\?subject=Domaine%20D[^"]*j&#39;ai%20remarqu%C3%A9%20que%20vous%20n&#39;avez%20pas%20encore%20de%20site/);
    // Pas d'email sur le site : Claude le cherche sur le web, et l'adresse doit figurer dans la page citée.
    assert.equal(apifyFinal.appels.recherches.length, 6); // E deux fois (pause_turn), G, H, I et J
    assert.ok(apifyFinal.appels.recherches.every((a) => a.entree.tools.some((t) => t.type === 'web_search_20260209')));
    assert.equal(apifyFinal.appels.recherches.find((a) => a.entree.messages.length === 2).entree.messages[1].role, 'assistant');
    assert.match(ligne('Domaine E'), /badge-nouveau[\s\S]*bonjour@domaine-e\.fr/);
    assert.match(await (await fetch(`${admin}/p/E`)).text(), /lu sur 127\.0\.0\.1/);
    assert.match(ligne('Domaine G'), /badge-a_verifier[\s\S]*proposé : devine@domaine-g\.fr/);
    assert.match(ligne('Domaine H'), /badge-sans_email/);
    // Adresse vue sur Facebook, que l'outil ne peut pas relire : prête, marquée « non vérifiée ».
    assert.match(ligne('Domaine I'), /badge-nouveau[\s\S]*domaine\.i@gmail\.com[\s\S]*href="https:\/\/www\.facebook\.com\/domaine\.i"[^>]*>non vérifiée</);
    // Adresse sans page source : jetée.
    assert.match(ligne('Domaine J'), /badge-sans_email/);
    assert.doesNotMatch(ligne('Domaine J'), /domaine-j/);
    const nonVerifiees = await (await fetch(`${admin}/prospects?cible=vin&statut=nouveau&verif=non_verifie`)).text();
    assert.match(nonVerifiees, /Adresses non vérifiées \(1\)/);
    assert.match(nonVerifiees, />Domaine I</);
    assert.doesNotMatch(nonVerifiees, />Domaine B</);
    const csvNonVerifiees = await (await fetch(`${admin}/export`, { method: 'POST', body: new URLSearchParams({ cible: 'vin', verif: 'non_verifie' }) })).text();
    assert.equal(csvNonVerifiees.trim().split('\n').length, 2);
    assert.match(csvNonVerifiees, /^domaine\.i@gmail\.com,/m);
    assert.doesNotMatch(await (await fetch(`${admin}/prospects?cible=vin&statut=nouveau&verif=verifie`)).text(), />Domaine I</);
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
    assert.match(await (await fetch(`${admin}/p/I`)).text(), /badge-nouveau[\s\S]*domaine\.i@gmail\.com[\s\S]*non vérifiée/);
    assert.equal(apifyFinal.appels.recherches.length, recherchesAvant);

    // Tableau de bord en page d'accueil ; les anciens liens filtrés mènent à la liste.
    const accueil = await (await fetch(admin)).text();
    assert.match(accueil, /<h1>Tableau de bord<\/h1>/);
    assert.match(accueil, /Email à chercher<\/span><strong>0<\/strong>/);
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

    // Nouvelles entreprises du registre Sirene : import, angle « création », email trouvé par Claude.
    const sirene = await fetch(`${admin}/recherches`, {
      method: 'POST',
      body: new URLSearchParams({ source: 'sirene', cible: 'vin', naf: '01.21Z Culture de la vigne\n11.02B Vinification\npas un code', departements: '67, 68', jours: '30', max: '300' }),
      redirect: 'manual',
    });
    assert.equal(sirene.status, 303);
    assert.deepEqual(apifyFinal.appels.sirene[0], { departments: ['67', '68'], nafCodes: ['01.21Z', '11.02B'], lastNDays: 30, onlyHeadquarters: true, onlyActive: true, maxResults: 300 });
    await passage(); // import
    await passage(); // analyse puis recherche d'email
    const nouvelle = await (await fetch(`${admin}/p/${encodeURIComponent('siret:12345678900011')}`)).text();
    assert.match(nouvelle, /<h1>Domaine Nouveau EARL<\/h1>/);
    assert.match(nouvelle, /badge-nouveau/);
    assert.match(nouvelle, /vous n&#39;avez pas encore de site internet/);
    assert.match(nouvelle, /Registre des entreprises, créée le/);
    assert.match(nouvelle, /contact@domaine-nouveau\.fr/);
    const recentes = await (await fetch(`${admin}/prospects?origine=recent`)).text();
    assert.match(recentes, /Domaine Nouveau EARL<\/a><span class="etiquette-recente"/);
    assert.match(await (await fetch(`${admin}/prospects?origine=sirene`)).text(), /Culture de la vigne/);
    const csv = await (await fetch(`${admin}/export`, { method: 'POST', body: new URLSearchParams({ cible: 'vin', origine: 'sirene' }) })).text();
    assert.match(csv, /contact@domaine-nouveau\.fr,,Domaine Nouveau EARL,"Bonjour,",création Barr,vous n'avez pas encore de site internet,le registre des entreprises/);
    assert.equal(csv.trim().split('\n').length, 2);
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
    `ACCESS_DESACTIVE=1\nAPIFY_TOKEN=jeton-test\nAPIFY_API=http://127.0.0.1:${faux.port}\nANTHROPIC_API_KEY=cle-anthropic\nOPENROUTER_API_KEY=cle-openrouter\nOPENROUTER_API=http://127.0.0.1:${faux.port}/openrouter/\n`,
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
    // Recherche d'email par la recherche web d'OpenRouter, prouvée par ses citations ; le coût réel s'additionne.
    assert.equal(faux.appels.recherches.length, 1);
    assert.match(await (await fetch(`${admin}/recherches`)).text(), /0,60 \$ aujourd’hui/);
    assert.equal(faux.appels.recherches[0].entree.plugins[0].id, 'web');
    assert.match(await (await fetch(`${admin}/p/E`)).text(), /badge-nouveau[\s\S]*bonjour@domaine-e\.fr/);
  } finally {
    process.kill(-worker.pid);
    faux.serveur.close();
  }
});

test('Claude propose une cible, pilote l’outil par MCP, et le pilote automatique lance seul les recherches', { timeout: 120_000 }, async () => {
  const fiches = [{ placeId: 'P1', title: 'Studio Lumière', city: 'Barr', categoryName: 'Photographe' }];
  const faux = await demarrerFauxApify(fiches);
  const persistance = mkdtempSync(join(tmpdir(), 'prospection-d1-'));
  const vars = join(persistance, '.dev.vars');
  writeFileSync(vars, `ACCESS_DESACTIVE=1\nAPIFY_TOKEN=jeton-test\nAPIFY_API=http://127.0.0.1:${faux.port}\nOPENROUTER_API_KEY=cle-openrouter\nOPENROUTER_API=http://127.0.0.1:${faux.port}/openrouter/\n`);
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'prospection', '--local', '--persist-to', persistance], { cwd: racine, stdio: 'ignore' });
  // Une proposition faite avec les anciennes règles, vue sur Instagram.
  const ancienne = `INSERT INTO prospects (id, cible, nom, ville, statut, raison, email_propose, email_source, cree_le, vu_le, statut_le)
    VALUES ('ancienne', 'vin', 'Studio Ancien', 'Barr', 'a_verifier', 'Claude propose une adresse sans avoir pu la retrouver dans la page citée : vérifie la source',
    'contact@studio-ancien.fr', 'https://www.instagram.com/studio.ancien', '2026-01-01', '2026-01-01', '2026-01-01')`;
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'prospection', '--local', '--persist-to', persistance, '--command', ancienne], { cwd: racine, stdio: 'ignore' });
  const port = PORT_WORKER + 2;
  const worker = spawn('npx', ['wrangler', 'dev', '--port', String(port), '--test-scheduled', '--persist-to', persistance, '--env-file', vars], {
    cwd: racine,
    stdio: 'ignore',
    detached: true,
  });
  try {
    const admin = `http://127.0.0.1:${port}`;
    await attendre(admin);
    const passage = () => fetch(`${admin}/__scheduled?cron=*+*+*+*+*`);

    // Proposition de cible : seuls les codes NAF et les constats connus sont gardés, rien n'est enregistré.
    const proposee = await (await fetch(`${admin}/cibles/proposer`, { method: 'POST', body: new URLSearchParams({ secteur: 'photographes' }) })).text();
    assert.equal(faux.appels.propositions[0].response_format.json_schema.name, 'cible');
    assert.match(faux.appels.propositions[0].messages[1].content, /74\.20Z Activités photographiques/);
    assert.match(proposee, /Proposition de Claude pour « photographes »/);
    assert.match(proposee, /<textarea id="metiers"[^>]*>photographe\nphotographe de mariage</);
    assert.match(proposee, /74\.20Z Activités photographiques/);
    assert.doesNotMatch(proposee, /99\.99Z/);
    assert.match(proposee, /studio harcourt\nphotomaton/);
    assert.match(proposee, /Une galerie de réalisations/);
    assert.doesNotMatch(await (await fetch(`${admin}/cibles`)).text(), /Photographes/);

    // Serveur MCP : poignée de main, liste des outils, origine contrôlée.
    let numero = 0;
    const mcp = async (method, params, entetes = {}) => {
      const reponse = await fetch(`${admin}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...entetes },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++numero, method, params }),
      });
      return reponse.json();
    };
    const outil = async (name, args = {}) => (await mcp('tools/call', { name, arguments: args })).result;
    const lire = (resultat) => JSON.parse(resultat.content[0].text);

    const init = await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.equal(init.result.serverInfo.name, 'prospection');
    assert.match(init.result.instructions, /N'invente jamais une adresse email/);
    const notification = await fetch(`${admin}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
    assert.equal(notification.status, 202);
    assert.equal((await fetch(`${admin}/mcp`)).status, 405);
    assert.equal((await fetch(`${admin}/mcp`, { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' })).status, 403);
    const { tools } = (await mcp('tools/list')).result;
    assert.deepEqual(
      tools.map((t) => t.name),
      ['tableau_de_bord', 'chercher_prospects', 'voir_prospect', 'changer_statut', 'enregistrer_email', 'chercher_email', 'lister_cibles', 'chercher_codes_naf', 'enregistrer_cible', 'lancer_recherche', 'lancer_nouvelles_entreprises', 'regler_pilote', 'journal'],
    );
    assert.ok(tools.every((t) => t.inputSchema.type === 'object' && t.description));
    assert.equal((await mcp('outil/inconnu')).error.code, -32601);

    // Claude crée la cible et règle le pilote.
    assert.ok(lire(await outil('chercher_codes_naf', { mots: 'photo' })).includes('74.20Z Activités photographiques'));
    const refusee = await outil('enregistrer_cible', { nom: 'Photographes', metiers: ['photographe'], naf: ['00.00Z'] });
    assert.equal(refusee.isError, true);
    assert.match(refusee.content[0].text, /Codes NAF inconnus : 00\.00Z/);
    const creee = lire(await outil('enregistrer_cible', { nom: 'Photographes', metiers: ['photographe'], communes: ['Barr', 'Obernai'], naf: ['74.20Z'], exclure: ['harcourt'] }));
    assert.equal(creee.cle, 'photographes');
    const cible = lire(await outil('lister_cibles')).find((c) => c.cle === 'photographes');
    assert.deepEqual(cible.naf, ['74.20Z Activités photographiques']);
    assert.deepEqual(cible.recherches, { total: 2, restantes: 2 });
    assert.match((await outil('regler_pilote', { cible: 'inconnue', recherches_par_jour: 5 })).content[0].text, /Cible inconnue/);
    assert.deepEqual(lire(await outil('regler_pilote', { cible: 'photographes', recherches_par_jour: 1, nouvelles_entreprises: true })), {
      cible: 'photographes',
      recherches_par_jour: 1,
      nouvelles_entreprises: true,
    });
    assert.match(await (await fetch(`${admin}/recherches`)).text(), /Actif sur 1 cible/);

    // Le pilote lance d'abord les nouvelles entreprises, puis une seule recherche Google Maps par jour.
    await passage();
    assert.deepEqual(faux.appels.sirene[0], { departments: ['67', '68'], nafCodes: ['74.20Z'], lastNDays: 8, onlyHeadquarters: true, onlyActive: true, maxResults: 500 });
    for (let i = 0; i < 8 && !faux.appels.runs.length; i++) await passage();
    assert.equal(faux.appels.runs.length, 1);
    assert.deepEqual(faux.appels.runs[0].entree.searchStringsArray, ['photographe Barr']);
    assert.equal(faux.appels.runs[0].entree.maxCrawledPlacesPerSearch, 30);
    for (let i = 0; i < 6; i++) await passage();
    assert.equal(faux.appels.runs.length, 1);
    assert.equal(faux.appels.sirene.length, 1);
    const journal = lire(await outil('journal'));
    assert.ok(journal.recherches.every((r) => r.auto && r.statut === 'terminee'));
    assert.ok(journal.messages.some((m) => /lancée par le pilote automatique sur Apify : 1 recherches/.test(m.message)));
    const tableau = lire(await outil('tableau_de_bord'));
    assert.equal(tableau.tache.active, true);
    assert.deepEqual(tableau.cibles.find((c) => c.cle === 'photographes').pilote, { recherches_par_jour: 1, lancees_aujourdhui: 1, nouvelles_entreprises: true });
    assert.equal(tableau.cibles.find((c) => c.cle === 'photographes').recherches_restantes, 1);

    // Lire et ranger les fiches ; une adresse doit figurer sur la page citée.
    const trouvees = lire(await outil('chercher_prospects', { cible: 'photographes', q: 'Lumière' }));
    assert.equal(trouvees.total, 1);
    assert.equal(trouvees.prospects[0].fiche, `${admin}/p/P1`);
    const inventee = lire(await outil('enregistrer_email', { id: 'P1', email: 'devine@studio-lumiere.fr', source: `http://127.0.0.1:${faux.port}/annuaire-g/` }));
    assert.equal(inventee.statut, 'a_verifier');
    assert.equal(lire(await outil('voir_prospect', { id: 'P1' })).email_propose, 'devine@studio-lumiere.fr');
    const prouvee = lire(await outil('enregistrer_email', { id: 'P1', email: 'Contact@Domaine-Nouveau.fr', source: `http://127.0.0.1:${faux.port}/annuaire-e/` }));
    assert.equal(prouvee.statut, 'nouveau');
    assert.equal(prouvee.email, 'contact@domaine-nouveau.fr');
    assert.equal((await outil('enregistrer_email', { id: 'P1', email: 'pas une adresse', source: 'Bas' })).isError, true);
    assert.equal((await outil('enregistrer_email', { id: 'P1', email: 'studio@lumiere.fr', source: 'sa page Facebook' })).isError, true);
    const facebook = lire(await outil('enregistrer_email', { id: 'P1', email: 'studio.lumiere@gmail.com', source: 'https://www.facebook.com/studiolumiere' }));
    assert.equal(facebook.statut, 'nouveau');
    assert.equal(facebook.verifiee, false);
    assert.equal(lire(await outil('chercher_prospects', { verif: 'non_verifie', q: 'Lumière' })).total, 1);
    // L'ancienne proposition vue sur Instagram est reprise en « Prêt », non vérifiée.
    const reprise = lire(await outil('voir_prospect', { id: 'ancienne' }));
    assert.equal(reprise.statut, 'nouveau');
    assert.equal(reprise.email, 'contact@studio-ancien.fr');
    assert.equal(reprise.email_verifie, false);
    assert.equal(lire(await outil('changer_statut', { ids: ['P1', 'inconnu'], statut: 'desinscrit', note: 'Ne veut plus d’email' })).modifiees, 1);
    assert.deepEqual(lire(await outil('changer_statut', { ids: ['P1'], statut: 'nouveau' })).desinscrites_inchangees, ['P1']);
    const fiche = lire(await outil('voir_prospect', { id: 'P1' }));
    assert.equal(fiche.statut, 'desinscrit');
    assert.equal(fiche.note, 'Ne veut plus d’email');

    // Recherche lancée par Claude : seulement ce qui reste à faire.
    const lancee = lire(await outil('lancer_recherche', { cible: 'photographes' }));
    assert.deepEqual(lancee.lancees, ['photographe Obernai']);
    assert.equal(lancee.deja_faites, 1);
    assert.deepEqual(faux.appels.runs[1].entree.searchStringsArray, ['photographe Obernai']);
    assert.equal((await outil('lancer_recherche', { cible: 'photographes' })).isError, true);
  } finally {
    process.kill(-worker.pid);
    faux.serveur.close();
  }
});

test('avec une clé Hubertino, les recherches Google Maps passent par Hubertino', { timeout: 120_000 }, async () => {
  const faux = await demarrerFauxApify([]);
  const persistance = mkdtempSync(join(tmpdir(), 'prospection-d1-'));
  const vars = join(persistance, '.dev.vars');
  writeFileSync(vars, `ACCESS_DESACTIVE=1\nHUBERTINO_API_KEY=hub_test\nHUBERTINO_API=http://127.0.0.1:${faux.port}/hubertino/\n`);
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'prospection', '--local', '--persist-to', persistance], { cwd: racine, stdio: 'ignore' });
  const port = PORT_WORKER + 3;
  const worker = spawn('npx', ['wrangler', 'dev', '--port', String(port), '--test-scheduled', '--persist-to', persistance, '--env-file', vars], {
    cwd: racine,
    stdio: 'ignore',
    detached: true,
  });
  try {
    const admin = `http://127.0.0.1:${port}`;
    await attendre(admin);
    const passage = () => fetch(`${admin}/__scheduled?cron=*+*+*+*+*`);
    assert.match(await (await fetch(`${admin}/recherches`)).text(), /Google Maps passe par Hubertino/);

    const lancement = await fetch(`${admin}/recherches`, {
      method: 'POST',
      body: new URLSearchParams({ cible: 'vin', metiers: 'photographe\nstudio photo', communes: 'Barr\nSaint-Louis, Haut-Rhin', max: '20', contacts: '1' }),
      redirect: 'manual',
    });
    assert.equal(lancement.status, 303);
    assert.equal(faux.appels.runs.length, 0);
    assert.equal(faux.appels.hubertino[0].auth, 'Bearer hub_test');
    assert.deepEqual(faux.appels.hubertino[0].entree, {
      categories: ['photographe', 'studio photo'],
      locations: ['Barr, Alsace, France', 'Saint-Louis, Haut-Rhin'],
      maxResults: 20,
      country: 'fr',
      enrichWebsite: true,
      enrichLinks: true,
    });
    assert.match(await (await fetch(`${admin}/recherches`)).text(), /Extraction Hubertino en cours/);

    await passage(); // en cours
    await passage(); // terminé : import
    await passage(); // analyse
    const suivi = await (await fetch(`${admin}/recherches`)).text();
    assert.match(suivi, /extraction Hubertino en cours, 0 fiches trouvées/);
    assert.match(suivi, /3 \/ 3 fiches importées/);
    assert.match(suivi, /lancée sur Hubertino : 4 recherches, 20 fiches maximum chacune\./);

    // La fiche garde la recherche « métier commune » lancée, et l'email du site trouvé par Hubertino.
    const studio = await (await fetch(`${admin}/p/ChIJ1`)).text();
    assert.match(studio, /<h1>Studio Lumière<\/h1>/);
    assert.match(studio, /badge-nouveau/);
    assert.match(studio, /contact@studio-lumiere\.fr/);
    assert.match(studio, /<dt>Recherche<\/dt><dd>photographe Barr<\/dd>/);
    assert.match(studio, /4,8 ★ · 12 avis/);
    assert.match(await (await fetch(`${admin}/p/ChIJ2`)).text(), /badge-hors_cible/);
    assert.match(await (await fetch(`${admin}/p/ChIJ3`)).text(), /<dt>Recherche<\/dt><dd>photographe Saint-Louis, Haut-Rhin<\/dd>/);

    // Les 4 recherches croisées sont notées : relancer la même chose ne coûte rien.
    const rejouee = await fetch(`${admin}/recherches`, {
      method: 'POST',
      body: new URLSearchParams({ cible: 'vin', metiers: 'studio photo', communes: 'Barr', max: '20' }),
      redirect: 'manual',
    });
    assert.match(await rejouee.text(), /ont toutes été faites il y a moins de 6 mois/);
    assert.equal(faux.appels.hubertino.length, 1);
  } finally {
    process.kill(-worker.pid);
    faux.serveur.close();
  }
});
