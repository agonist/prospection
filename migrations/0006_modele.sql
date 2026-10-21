-- Modèle de l'email écrit à la main (adresses nominatives), par cible.
ALTER TABLE cibles ADD COLUMN modele TEXT NOT NULL DEFAULT '';
