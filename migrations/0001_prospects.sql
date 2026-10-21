-- Un établissement trouvé sur Google Maps, gardé même s'il n'est pas intéressant
-- aujourd'hui : son site peut vieillir, son statut peut changer.
CREATE TABLE prospects (
  id TEXT PRIMARY KEY,               -- placeId Google, sinon domaine du site, sinon nom|ville
  cible TEXT NOT NULL,               -- vin, bien-etre, artisan…
  nom TEXT NOT NULL,
  categorie TEXT NOT NULL DEFAULT '',
  ville TEXT NOT NULL DEFAULT '',
  adresse TEXT NOT NULL DEFAULT '',
  telephone TEXT NOT NULL DEFAULT '',
  site TEXT NOT NULL DEFAULT '',
  fiche_google TEXT NOT NULL DEFAULT '',
  note_google REAL,
  avis_google INTEGER,
  recherche TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  email_statut TEXT NOT NULL DEFAULT 'absente', -- generique, autre_domaine, nominative, absente
  constat_cle TEXT NOT NULL DEFAULT '',
  constat TEXT NOT NULL DEFAULT '',
  signaux TEXT NOT NULL DEFAULT '{}', -- JSON renvoyé par auditer()
  raison TEXT NOT NULL DEFAULT '',   -- pourquoi à vérifier ou mis de côté
  statut TEXT NOT NULL DEFAULT 'nouveau',
  note TEXT NOT NULL DEFAULT '',
  cree_le TEXT NOT NULL,
  vu_le TEXT NOT NULL,               -- dernière extraction où la fiche est apparue
  statut_le TEXT NOT NULL,           -- dernier changement de statut
  contacte_le TEXT                   -- premier export vers Smartlead
);

CREATE INDEX prospects_cible_statut ON prospects (cible, statut);
CREATE INDEX prospects_ville ON prospects (ville);
CREATE INDEX prospects_email ON prospects (email);
