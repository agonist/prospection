-- Les cibles deviennent modifiables dans l'admin (préremplies au premier
-- chargement depuis scripts/cibles.mjs).
CREATE TABLE cibles (
  cle TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  recherche TEXT NOT NULL,
  communes TEXT NOT NULL DEFAULT '[]',
  exclure TEXT NOT NULL DEFAULT '[]',
  constats TEXT NOT NULL DEFAULT '[]',
  modifie_le TEXT NOT NULL
);

-- Chaque recherche Google Maps déjà lancée (« métier commune »), pour ne pas
-- payer deux fois la même extraction.
CREATE TABLE termes (
  terme TEXT PRIMARY KEY,
  cible TEXT NOT NULL,
  recherche_id INTEGER,
  lance_le TEXT NOT NULL
);
CREATE INDEX termes_lance_le ON termes (lance_le);

INSERT OR REPLACE INTO termes (terme, cible, recherche_id, lance_le)
  SELECT lower(trim(j.value)), r.cible, r.id, r.cree_le
  FROM recherches r, json_each(r.termes) j
  WHERE r.statut <> 'echec'
  ORDER BY r.id;

CREATE INDEX prospects_categorie ON prospects (categorie);
