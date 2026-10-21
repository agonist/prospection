-- Ce que fait la tâche planifiée, pour suivre l'avancement depuis l'admin.
CREATE TABLE journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  le TEXT NOT NULL,
  niveau TEXT NOT NULL DEFAULT 'info', -- info, succes, erreur
  message TEXT NOT NULL,
  recherche_id INTEGER
);
CREATE INDEX journal_le ON journal (le);

-- Petites valeurs globales, par exemple l'heure du dernier passage de la tâche.
CREATE TABLE etat (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);

-- Dernier état connu de l'extraction Apify.
ALTER TABLE recherches ADD COLUMN apify_statut TEXT NOT NULL DEFAULT '';
ALTER TABLE recherches ADD COLUMN apify_fiches INTEGER NOT NULL DEFAULT 0;
