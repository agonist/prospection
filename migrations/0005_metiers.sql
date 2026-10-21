-- Une cible peut chercher plusieurs métiers (naturopathe, sophrologue…).
-- `recherche` garde le premier, pour les anciennes lignes.
ALTER TABLE cibles ADD COLUMN metiers TEXT NOT NULL DEFAULT '[]';
UPDATE cibles SET metiers = json_array(recherche);
