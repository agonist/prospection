-- Une recherche Google Maps lancée sur Apify depuis l'admin.
CREATE TABLE recherches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cible TEXT NOT NULL,
  termes TEXT NOT NULL,              -- JSON : ["domaine viticole Barr", …]
  run_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_cours', -- en_cours, import, terminee, echec
  fiches INTEGER NOT NULL DEFAULT 0, -- fiches renvoyées par Apify
  importees INTEGER NOT NULL DEFAULT 0,
  erreur TEXT NOT NULL DEFAULT '',
  cree_le TEXT NOT NULL,
  fini_le TEXT
);

-- Emails déjà présents sur la fiche Google, repris lors de l'analyse du site.
ALTER TABLE prospects ADD COLUMN emails_fiche TEXT NOT NULL DEFAULT '[]';
CREATE INDEX prospects_statut ON prospects (statut);
