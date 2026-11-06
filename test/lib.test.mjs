import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CIBLES } from '../scripts/cibles.mjs';
import { auditer, choisirConstat, choisirEmail, demandeStop, estGenerique, extraireEmails, lireCsv, natureEmail, normaliser } from '../scripts/lib.mjs';
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
  // Un prénom dans l'adresse désigne une personne, même s'il est aussi dans le nom du domaine.
  assert.equal(natureEmail('gilbert.eber@orange.fr', 'Vins Eber G.'), 'nominative');
  assert.equal(natureEmail('vins.alphonse.kuentz@orange.fr', 'Vins Alphonse Kuentz'), 'nominative');
  assert.equal(natureEmail('jeanmarie.wassler@wanadoo.fr', 'Wassler Jean-Marie Earl'), 'nominative');
  assert.equal(natureEmail('eppele-felix-earl@wanadoo.fr', 'Vins Eppelé'), 'nominative');
  assert.equal(natureEmail('domainemetzgeiger@gmail.com', 'Earl Domaine Metz-geiger'), 'entreprise');
  assert.equal(natureEmail('gerber.chatenois@orange.fr', 'Domaine Gerber'), 'entreprise');

  assert.deepEqual(choisirEmail(['claire.martin@gmail.com', 'cabinet.martin@gmail.com'], '', 'Claire Martin'), { email: 'cabinet.martin@gmail.com', statut: 'entreprise' });
  // Le domaine de l'email reprend le nom de l'entreprise : c'est le sien, pas celui d'une agence.
  assert.equal(choisirEmail(['contact@vins-muller.fr'], 'https://domaine-muller.fr', 'Domaine Muller').statut, 'generique');
});

test('range les fiches sans email ou nominatives dans des files à traiter', () => {
  const avecConstat = { signaux: {}, constat: { cle: 'pasDeSite' } };
  // Pas d'appels : sans email, la fiche part en recherche d'email, téléphone ou pas.
  assert.equal(statutApresAnalyse({ ...avecConstat, statut: 'absente' }).statut, 'a_enrichir');
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
  assert.equal(normaliser({ title: 'Plomberie C', searchString: 'plombier Metz, France' }).recherche, 'plombier Metz');
});

test('lit l’export CSV de Smartlead, guillemets et retours à la ligne compris', () => {
  const csv = '\uFEFFid,email,custom_fields,is_unsubscribed,reply_count\r\n1,contact@domaine-un.fr,"{""constat"":""pas de site, seulement une fiche""}",false,1\r\n2,info@b.fr,"deux\nlignes",true,0\r\n\r\n';
  assert.deepEqual(lireCsv(csv), [
    { id: '1', email: 'contact@domaine-un.fr', custom_fields: '{"constat":"pas de site, seulement une fiche"}', is_unsubscribed: 'false', reply_count: '1' },
    { id: '2', email: 'info@b.fr', custom_fields: 'deux\nlignes', is_unsubscribed: 'true', reply_count: '0' },
  ]);
  assert.deepEqual(lireCsv(''), []);
});

test('reconnaît une réponse « stop », pas une réponse qui cite notre pied de page', () => {
  assert.equal(demandeStop('Stop'), true);
  assert.equal(demandeStop('STOP merci'), true);
  assert.equal(demandeStop('Merci de ne plus me contacter.'), true);
  assert.equal(demandeStop('Ne plus m’envoyer de mails svp'), true);
  assert.equal(demandeStop('Bonjour, je souhaite être désinscrit de votre liste.'), true);
  assert.equal(demandeStop('stop<br><br>Le lun. 3 nov. 2026 à 10:00, Bas &lt;bas@cestbienbeau.fr&gt; a écrit :<br>&gt; Bonjour'), true);
  assert.equal(demandeStop('Bonjour, oui volontiers pour la maquette !\n\nLe lun. 3 nov. 2026, Bas a écrit :\n> Pour ne plus recevoir de message de ma part, répondez « stop ».'), false);
  assert.equal(demandeStop('Oui avec plaisir\nPour ne plus recevoir de message de ma part, répondez « stop ».'), false);
  assert.equal(demandeStop('<div>D’accord pour la maquette</div><blockquote>répondez « stop »</blockquote>'), false);
  assert.equal(demandeStop('Bonjour, on peut en parler ? Le stop-and-go du chantier me prend du temps, mais rappelez-moi la semaine prochaine pour voir ce que vous proposez.'), false);
  assert.equal(demandeStop(''), false);
});

test('raccourcit le nom pour l’objet de l’email, comme je le faisais à la main', async () => {
  const { nomCourt } = await import('../scripts/lib.mjs');
  const cas = [
    ['EARL Domaine Jean-Paul Schmitt Vigneron, Alsace', 'Domaine Jean-Paul Schmitt'],
    ["Domaine Colon Pierre - Vins d'Alsace", 'Domaine Colon Pierre'],
    ['Domaine SCHOEPFER', 'Domaine Schoepfer'],
    ['Les Funambules - Vins (Dégustations sur RDV)', 'Les Funambules'],
    ['Ziegler Mauler et Fils GAEC', 'Ziegler Mauler et Fils'],
    ["Maison Meyer • Sainte Joie • Arnta - Vins d'Alsace", 'Maison Meyer'],
    ['Domaine Humbrecht 1619', 'Domaine Humbrecht'],
    ['Domaine Fritz-Schmitt Vigneron Indépendant', 'Domaine Fritz-Schmitt'],
    ['Vins MARZOLF s.c.e.a.', 'Vins Marzolf'],
    ['Domaine d’Ollwiller', "Domaine d'Ollwiller"],
    ["Vins d'alsace HORCHER", 'Vins Horcher'],
    ["Domaine Bleger François Vins et chambres d'Hôtes", 'Domaine Bleger François'],
    ["MAISON BRUN -Vins d'Alsace", 'Maison Brun'],
    ['SASU METZ-BLEGER', 'Metz-Bleger'],
    ['Domaine JOST Viticulteur Récoltant', 'Domaine Jost'],
    ["Kuehn Vins d'Alsace", 'Vins Kuehn'],
    ['vins thirian', 'Vins Thirian'],
    ["Domaine MEYER Raphaël_Vins et Crémants d'Alsace", 'Domaine Meyer Raphaël'],
    ['Sohler Et Fils', 'Sohler et Fils'],
    ["Vins d'Alsace Eppelé Ammerschwihr en bio (dégustation avec rdv)", 'Vins Eppelé Ammerschwihr'],
    ["Domaine de l'AU-DELA", "Domaine de l'Au-Dela"],
    ['MS MENUISERIE ET FILS SARL', 'MS Menuiserie et Fils'],
    // Ce qui fait partie du nom reste.
    ["Maison des Vins d'Alsace", "Maison des Vins d'Alsace"],
    ['Menuiserie Dupont', 'Menuiserie Dupont'],
    ['Domaine Un', 'Domaine Un'],
  ];
  for (const [nom, attendu] of cas) assert.equal(nomCourt(nom), attendu, nom);
});

test('répartit les envois de la semaine selon les réponses, sans dépasser le stock', async () => {
  const { repartir } = await import('../scripts/strategie.mjs');
  // Sans résultat encore : parts égales.
  assert.deepEqual(repartir(300, [{ cle: 'vin', stock: 500, contactes: 0, positifs: 0 }, { cle: 'artisan', stock: 500, contactes: 0, positifs: 0 }]), { vin: 150, artisan: 150 });
  // Le stock manque d'un côté : le reste va à l'autre.
  assert.deepEqual(repartir(300, [{ cle: 'vin', stock: 500, contactes: 0, positifs: 0 }, { cle: 'artisan', stock: 40, contactes: 0, positifs: 0 }]), { vin: 260, artisan: 40 });
  // Une cible qui répond prend plus, l'autre garde de quoi apprendre (environ 20 %).
  const parts = repartir(300, [{ cle: 'vin', stock: 900, contactes: 300, positifs: 15 }, { cle: 'artisan', stock: 900, contactes: 300, positifs: 0 }]);
  assert.equal(parts.vin + parts.artisan, 300);
  assert.ok(parts.vin > 200 && parts.artisan >= 50, JSON.stringify(parts));
  // Pas de stock : rien.
  assert.deepEqual(repartir(300, [{ cle: 'vin', stock: 0 }]), { vin: 0 });
});

test('le plan ralentit quand les réponses s’accumulent ou que les adresses rebondissent', async () => {
  const { planifier, REGLAGES_DEFAUT } = await import('../scripts/strategie.mjs');
  const cible = (cle, stock, aFaire = 50) => ({ cle, nom: cle, stock, contactes: 0, positifs: 0, desinscrits: 0, aFaire, aEcrire: 0, nonVerifiees: 0 });
  const base = { reglages: { ...REGLAGES_DEFAUT, cibles: ['vin'] }, aTraiter: 0, rebonds: { contactes: 0, rebonds: 0 } };

  const calme = planifier({ ...base, cibles: [cible('vin', 2000), cible('artisan', 100)] });
  assert.equal(calme.volume, 300);
  assert.equal(calme.parCible.find((c) => c.cle === 'vin').envoyer, 300);
  assert.equal(calme.parCible.find((c) => c.cle === 'artisan').envoyer, 0);
  assert.equal(calme.parCible.find((c) => c.cle === 'vin').chercher, false);
  assert.equal(calme.alertes.length, 0);

  // Moins de 3 semaines d'avance : le pilote cherche ; plus rien à chercher : alerte.
  const court = planifier({ ...base, cibles: [cible('vin', 400)] });
  assert.equal(court.parCible[0].chercher, true);
  const vide = planifier({ ...base, cibles: [cible('vin', 120, 0)] });
  assert.equal(vide.parCible[0].epuisee, true);
  assert.match(vide.alertes.map((a) => a.texte).join(' '), /Pas assez de fiches prêtes : 120 cette semaine au lieu de 300[\s\S]*Plus rien à chercher pour « vin »/);

  const charge = planifier({ ...base, aTraiter: 6, cibles: [cible('vin', 2000)] });
  assert.equal(charge.volume, 150);
  assert.match(charge.alertes[0].texte, /6 réponses à traiter : j'envoie moitié moins/);

  const rebonds = planifier({ ...base, rebonds: { contactes: 200, rebonds: 10 }, cibles: [cible('vin', 2000)] });
  assert.equal(rebonds.volume, 150);
  assert.equal(rebonds.alertes[0].niveau, 'danger');
});

test('écarte du lot ce que je retirais à la main', async () => {
  const { ecart } = await import('../scripts/strategie.mjs');
  const vin = { ...CIBLES.vin, departements: ['67', '68'] };
  const p = (champs) => ({ nom: 'Domaine Un', categorie: 'Établissement vinicole', email: 'contact@domaine-un.fr', site: 'https://domaine-un.fr', adresse: '1 rue des Vignes, 68340 Riquewihr', avis_google: 40, email_verifie: 1, ...champs });
  assert.equal(ecart(p({}), vin), null);
  assert.deepEqual(ecart(p({ email_verifie: 0 }), vin), { statut: null, raison: 'adresse non vérifiée' });
  assert.equal(ecart(p({ avis_google: 479 }), vin).statut, 'hors_cible');
  assert.match(ecart(p({ adresse: '3 rue de Rivoli, 75001 Paris' }), vin).raison, /hors zone : code postal 75001/);
  assert.equal(ecart(p({ nom: 'Famille Hugel' }), vin).statut, 'hors_cible');
  assert.equal(ecart(p({ categorie: 'Hôtel' }), vin).statut, 'hors_cible');
  assert.equal(ecart(p({ categorie: 'Hotel, Cottage, Extended stay hotel, Wedding venue' }), vin).statut, 'hors_cible');
  assert.equal(ecart(p({ categorie: 'Hiking area' }), vin).statut, 'hors_cible');
  assert.equal(ecart(p({ categorie: 'Winery, Wine store, Lodge' }), vin), null);
  assert.equal(ecart(p({ categorie: 'Liquor store, Lodge' }), vin), null);
  assert.equal(ecart(p({ email: 'gilbert.eber@orange.fr' }), vin).statut, 'a_ecrire');

  const artisan = CIBLES.artisan;
  const a = (nom, categorie) => ecart(p({ nom, categorie, email: 'contact@atelier.fr', site: 'https://atelier.fr' }), artisan);
  assert.equal(a('Menuiserie Kleim', 'Atelier de menuiserie'), null);
  assert.equal(a('Menuiserie Aluminium Jacob SAS', 'Atelier de métallerie'), null);
  assert.equal(a('MLB Fermetures - Art et Fenêtres', 'Menuisier').statut, 'hors_cible');
  assert.equal(a('Schmidt Groupe - Sites de production', 'Fabricant de meubles').statut, 'hors_cible');
  assert.equal(a('Scierie Ehrhart', 'Scierie').statut, 'hors_cible');
  assert.equal(a('Burstner SA', "Site d'entreprise").statut, 'hors_cible');
  assert.equal(a('Serrurier Strasbourg', "Service de serrurerie d'urgence").statut, 'hors_cible');
  assert.equal(a('Jardins Meyer', 'Paysagiste'), null);
  assert.equal(a('Jardiland Colmar', 'Jardinerie').statut, 'hors_cible');
  assert.equal(a('ENGIE Home Services', 'Chauffagiste').statut, 'hors_cible');
  assert.equal(a('Serrurier Kallax', 'Emergency locksmith service, Window installation service').statut, 'hors_cible');
  assert.equal(a('Menuiserie MEI', 'Woodworker, Furniture store'), null);
  assert.equal(a('Jardins Meyer', 'Landscaper, Garden center'), null);
  assert.equal(ecart(p({ nom: 'Plomberie Metz', categorie: 'Plombier', adresse: '2 rue Serpenoise, 57000 Metz', email: 'contact@pm.fr', site: 'https://pm.fr' }), artisan), null);
});

test('lit l’export d’une campagne Smartlead', async () => {
  const { lireExportSmartlead, retourSmartlead, semaineDe } = await import('../scripts/strategie.mjs');
  const lignes = lireExportSmartlead(
    [
      'Email,Company Name,Status,Category,Reply Count,Is Unsubscribed,Is Bounced',
      'contact@domaine-un.fr,Domaine Un,INPROGRESS,Interested,1,false,false',
      'info@domaine-deux.fr,Domaine Deux,COMPLETED,Not Interested,1,false,false',
      'contact@domaine-trois.fr,Domaine Trois,STOPPED,,0,true,false',
      'contact@domaine-quatre.fr,Domaine Quatre,BLOCKED,,0,false,true',
      'contact@domaine-cinq.fr,Domaine Cinq,INPROGRESS,Out Of Office,1,false,false',
      'contact@domaine-six.fr,Domaine Six,INPROGRESS,,0,false,false',
      'CONTACT@Domaine-Sept.fr,Domaine Sept,COMPLETED,Do Not Contact,1,false,false',
    ].join('\n'),
  );
  assert.deepEqual(
    lignes.map((l) => [l.email, retourSmartlead(l)]),
    [
      ['contact@domaine-un.fr', 'a_repondu'],
      ['info@domaine-deux.fr', 'pas_interesse'],
      ['contact@domaine-trois.fr', 'desinscrit'],
      ['contact@domaine-quatre.fr', 'rebond'],
      ['contact@domaine-cinq.fr', null],
      ['contact@domaine-six.fr', null],
      ['contact@domaine-sept.fr', 'desinscrit'],
    ],
  );
  // Les colonnes de l'API (snake_case) se lisent aussi.
  assert.equal(retourSmartlead(lireExportSmartlead('email,reply_count,is_unsubscribed\ncontact@x.fr,2,false\n')[0]), 'a_repondu');
  // La semaine commence le lundi, à l'heure de Paris.
  assert.equal(semaineDe(new Date('2026-11-04T10:00:00Z')), '2026-11-02');
  assert.equal(semaineDe(new Date('2026-11-08T23:30:00Z')), '2026-11-09'); // lundi 0 h 30 à Paris
  assert.equal(semaineDe(new Date('2026-11-08T22:30:00Z')), '2026-11-02'); // dimanche 23 h 30 à Paris
});
