-- Smartlead : la campagne où partent les fiches de chaque cible.
ALTER TABLE cibles ADD COLUMN smartlead TEXT NOT NULL DEFAULT '';          -- fiches Google Maps
ALTER TABLE cibles ADD COLUMN smartlead_creation TEXT NOT NULL DEFAULT ''; -- nouvelles entreprises (registre Sirene)
