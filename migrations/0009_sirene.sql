-- Nouvelles entreprises trouvées dans le registre Sirene (via Apify), en plus de Google Maps.
ALTER TABLE cibles ADD COLUMN naf TEXT NOT NULL DEFAULT '[]';            -- codes NAF, « 01.21Z Culture de la vigne »
ALTER TABLE recherches ADD COLUMN source TEXT NOT NULL DEFAULT 'maps';   -- maps ou sirene
ALTER TABLE prospects ADD COLUMN origine TEXT NOT NULL DEFAULT 'maps';   -- maps ou sirene
ALTER TABLE prospects ADD COLUMN creation TEXT NOT NULL DEFAULT '';      -- date de création au registre
CREATE INDEX prospects_creation ON prospects (creation);
