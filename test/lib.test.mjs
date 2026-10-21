import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CIBLES } from '../scripts/cibles.mjs';
import { auditer, choisirConstat, choisirEmail, estGenerique, extraireEmails, natureEmail, normaliser } from '../scripts/lib.mjs';
import { statutApresAnalyse } from '../scripts/base.mjs';

test('ne garde que les adresses génériques, de préférence sur le domaine du site', () => {
  assert.equal(estGenerique('contact@domaine.fr'), true);
  assert.equal(estGenerique('claire.martin@orange.fr'), false);
  assert.deepEqual(choisirEmail(['claire.martin@domaine.fr', 'info@agence.fr', 'contact@domaine.fr'], 'https://www.domaine.fr'), {
    email: 'contact@domaine.fr',
    statut: 'generique',
  });
  assert.equal(choisirEmail(['contact@agence-web.fr'], 'https://domaine.fr').statut, 'autre_domaine');
  assert.equal(choisirEmail(['contact.domaine@orange.fr', 'contact@orange.fr'], 'https://domaine.fr').email, 'contact@orange.fr');
  assert.equal(choisirEmail(['claire.martin@orange.fr'], 'https://domaine.fr').statut, 'nominative');
});

test('distingue l’adresse de l’entreprise de celle d’une personne', () => {
  assert.equal(natureEmail('menuiserie.dupont@orange.fr', 'Menuiserie Dupont'), 'entreprise');
  assert.equal(natureEmail('dupont.plomberie@gmail.com', 'Dupont Michel'), 'entreprise');
  assert.equal(natureEmail('sarl-weber67@wanadoo.fr', 'Weber'), 'entreprise');
  assert.equal(natureEmail('domaine.muller@gmail.com', 'Domaine Muller'), 'entreprise');
  assert.equal(natureEmail('naturopathie.alsace@gmail.com', 'Claire Martin Naturopathe'), 'entreprise');
  assert.equal(natureEmail('michel.dupont@orange.fr', 'Menuiserie Dupont'), 'nominative');
  assert.equal(natureEmail('c.martin@gmail.com', 'Claire Martin Naturopathe'), 'nominative');
  assert.equal(natureEmail('kmartin@gmail.com', 'Cabinet'), 'nominative');

  assert.deepEqual(choisirEmail(['claire.martin@gmail.com', 'cabinet.martin@gmail.com'], '', 'Claire Martin'), { email: 'cabinet.martin@gmail.com', statut: 'entreprise' });
  // Le domaine de l'email reprend le nom de l'entreprise : c'est le sien, pas celui d'une agence.
  assert.equal(choisirEmail(['contact@vins-muller.fr'], 'https://domaine-muller.fr', 'Domaine Muller').statut, 'generique');
});

test('range les fiches sans email ou nominatives dans des files à traiter', () => {
  const avecConstat = { signaux: {}, constat: { cle: 'pasDeSite' } };
  assert.equal(statutApresAnalyse({ ...avecConstat, statut: 'absente' }, '03 88 00 00 00').statut, 'a_appeler');
  assert.equal(statutApresAnalyse({ ...avecConstat, statut: 'absente' }, '').statut, 'a_verifier');
  assert.equal(statutApresAnalyse({ ...avecConstat, statut: 'nominative' }).statut, 'a_ecrire');
  assert.equal(statutApresAnalyse({ ...avecConstat, statut: 'entreprise' }).statut, 'nouveau');
});

test('ignore ce qui n’est pas une adresse', () => {
  assert.deepEqual(choisirEmail(['', 'mailto:', 'pas une adresse', null, 'contact@domaine.fr'], 'https://domaine.fr', 'Domaine'), { email: 'contact@domaine.fr', statut: 'generique' });
  assert.deepEqual(choisirEmail(['mailto:'], '', 'Domaine'), { email: '', statut: 'absente' });
});

test('extrait les emails sans prendre les images ni les adresses techniques', () => {
  const html = '<a href="mailto:Contact@Domaine.fr?subject=x">x</a> info [at] domaine.fr logo@2x.png abc@sentry.io';
  assert.deepEqual(extraireEmails(html).sort(), ['contact@domaine.fr', 'info@domaine.fr']);
});

test('choisit le constat selon l’ordre de la cible', () => {
  assert.equal(choisirConstat(auditer({ site: '' }), CIBLES.vin).cle, 'pasDeSite');
  assert.equal(choisirConstat(auditer({ site: 'https://www.facebook.com/domaine' }), CIBLES.vin).cle, 'reseauSocial');
  assert.equal(choisirConstat(auditer({ site: 'https://www.resalib.fr/praticien/x' }), CIBLES['bien-etre']).cle, 'annuaire');

  const moderne = '<meta name="viewport" content="width=device-width"><a href="/boutique">Boutique</a><a hreflang="de">DE</a> Réservez une dégustation © 2026';
  assert.equal(choisirConstat(auditer({ site: 'https://d.fr', urlFinale: 'https://d.fr/', html: moderne, anneeCourante: 2026 }), CIBLES.vin), null);

  const ancien = '<p>Nos vins</p> © 2015';
  const constat = choisirConstat(auditer({ site: 'http://d.fr', urlFinale: 'http://d.fr/', html: ancien, anneeCourante: 2026 }), CIBLES.vin);
  assert.equal(constat.cle, 'pasDeBoutique');

  const vieux = auditer({ site: 'https://d.fr', urlFinale: 'https://d.fr/', html: '<meta name="viewport"><form></form> réalisations © 2012-2019', anneeCourante: 2026 });
  assert.equal(choisirConstat(vieux, CIBLES.artisan).phrase, "votre site n'a pas l'air d'avoir été mis à jour depuis 2019");
});

test('lit un export Apify comme un export Outscraper', () => {
  assert.equal(normaliser({ title: 'Domaine A', website: 'domaine-a.fr', city: 'Barr' }).site, 'https://domaine-a.fr');
  assert.deepEqual(normaliser({ name: 'Domaine B', site: 'https://b.fr', email_1: 'contact@b.fr' }).emails, ['contact@b.fr']);
});
