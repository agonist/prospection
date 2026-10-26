-- Pilote automatique : chaque cible peut lancer seule ses recherches.
ALTER TABLE cibles ADD COLUMN pilote INTEGER NOT NULL DEFAULT 0;              -- recherches Google Maps par jour (0 : arrêté)
ALTER TABLE cibles ADD COLUMN pilote_sirene INTEGER NOT NULL DEFAULT 0;       -- 1 : nouvelles entreprises chaque semaine
ALTER TABLE cibles ADD COLUMN departements TEXT NOT NULL DEFAULT '["67","68"]'; -- pour les nouvelles entreprises
-- Ce qu'un bon site doit avoir dans ce métier : Claude s'en sert pour juger.
ALTER TABLE cibles ADD COLUMN attentes TEXT NOT NULL DEFAULT '';
-- 1 quand la recherche a été lancée par le pilote.
ALTER TABLE recherches ADD COLUMN auto INTEGER NOT NULL DEFAULT 0;
