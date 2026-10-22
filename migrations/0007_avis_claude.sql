-- Avis de Claude sur le site de chaque prospect.
ALTER TABLE prospects ADD COLUMN verdict TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN qualite INTEGER;
ALTER TABLE prospects ADD COLUMN avis TEXT NOT NULL DEFAULT '';
