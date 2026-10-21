import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';

const racine = join(import.meta.dirname, '..');

function base() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(racine, 'migrations/0001_prospects.sql'), 'utf8'));
  return db;
}

async function importer(fiches) {
  const dossier = mkdtempSync(join(tmpdir(), 'prospection-'));
  const entree = join(dossier, 'vin.json');
  writeFileSync(entree, JSON.stringify(fiches));
  await promisify(execFile)(process.execPath, [join(racine, 'scripts/importer.mjs'), '--cible', 'vin', '--entree', entree, '--sans-base']);
  return readFileSync(join(dossier, 'vin.sql'), 'utf8');
}

test('enregistre chaque fiche avec un statut, y compris celles mises de côté', async () => {
  const pages = {
    '/': '<html><a href="/contact">Contact</a><p>Domaine familial depuis 1902</p></html>',
    '/contact': '<html><a href="mailto:contact@domaine-test.fr">écrire</a> claire.martin@gmail.com</html>',
  };
  const serveur = createServer((req, res) => {
    const page = pages[req.url];
    res.writeHead(page ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page ?? '');
  });
  await new Promise((resolve) => serveur.listen(0, '127.0.0.1', resolve));
  const { port } = serveur.address();

  let sql;
  try {
    sql = await importer([
      { placeId: 'A', title: 'Domaine Test', website: `http://127.0.0.1:${port}/`, city: 'Barr', searchString: 'domaine viticole Barr' },
      { placeId: 'A', title: 'Domaine Test', website: `http://127.0.0.1:${port}/`, city: 'Barr' },
      { placeId: 'B', title: "Domaine L'Ancien", city: 'Andlau', emails: ['contact@ancien.fr'] },
      { placeId: 'C', title: 'Cave coopérative de Barr', website: 'https://cave.fr', city: 'Barr' },
      { placeId: 'D', title: 'Domaine Fermé', permanentlyClosed: true },
      { placeId: 'E', title: 'Domaine Facebook', website: 'https://facebook.com/x', city: 'Epfig' },
    ]);
  } finally {
    serveur.close();
  }

  const db = base();
  db.exec(sql);
  const lignes = Object.fromEntries(db.prepare('SELECT id, statut, email, constat, recherche FROM prospects').all().map((ligne) => [ligne.id, ligne]));
  assert.equal(Object.keys(lignes).length, 5);
  assert.equal(lignes.A.statut, 'a_verifier');
  assert.equal(lignes.A.email, 'contact@domaine-test.fr');
  assert.equal(lignes.B.statut, 'nouveau');
  assert.equal(lignes.B.recherche, 'domaine viticole Andlau');
  assert.equal(lignes.B.constat, "vous n'avez pas encore de site, seulement une fiche Google");
  assert.equal(lignes.C.statut, 'hors_cible');
  assert.equal(lignes.D.statut, 'hors_cible');
  assert.equal(lignes.E.statut, 'a_verifier');
});

test('une nouvelle extraction met à jour les données sans écraser un statut posé à la main', async () => {
  const db = base();
  db.exec(await importer([{ placeId: 'B', title: 'Domaine B', city: 'Andlau', emails: ['contact@b.fr'] }]));
  db.prepare("UPDATE prospects SET statut = 'client', note = 'Signé', statut_le = '2026-01-01' WHERE id = 'B'").run();

  db.exec(await importer([{ placeId: 'B', title: 'Domaine B', city: 'Andlau', phone: '03 88 00 00 00', emails: ['contact@b.fr'] }]));
  const ligne = db.prepare("SELECT statut, note, telephone, statut_le FROM prospects WHERE id = 'B'").get();
  assert.deepEqual({ ...ligne }, { statut: 'client', note: 'Signé', telephone: '03 88 00 00 00', statut_le: '2026-01-01' });
});

test('un statut automatique est recalculé quand la fiche change', async () => {
  const db = base();
  db.exec(await importer([{ placeId: 'F', title: 'Domaine F', city: 'Barr' }]));
  assert.equal(db.prepare("SELECT statut FROM prospects WHERE id = 'F'").get().statut, 'a_verifier');
  db.exec(await importer([{ placeId: 'F', title: 'Domaine F', city: 'Barr', emails: ['info@f.fr'] }]));
  assert.equal(db.prepare("SELECT statut FROM prospects WHERE id = 'F'").get().statut, 'nouveau');
});
