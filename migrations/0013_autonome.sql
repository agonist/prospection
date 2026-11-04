-- Mode autonome : le point de chaque semaine, et ce que Smartlead renvoie.
ALTER TABLE prospects ADD COLUMN repondu_le TEXT; -- première réponse (A répondu, maquette, client, pas intéressé)
ALTER TABLE prospects ADD COLUMN rebond_le TEXT;  -- adresse rejetée à l'envoi : elle ne repart plus
UPDATE prospects SET repondu_le = statut_le WHERE statut IN ('a_repondu', 'maquette', 'client', 'pas_interesse');

-- Un point par semaine (lundi, heure de Paris) : les chiffres, le plan, et le mot de Claude.
CREATE TABLE points (
  semaine TEXT PRIMARY KEY,
  cree_le TEXT NOT NULL,
  plan TEXT NOT NULL,
  texte TEXT NOT NULL DEFAULT '',
  idee TEXT NOT NULL DEFAULT ''
);
