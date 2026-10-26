-- 1 : adresse lue sur le site, la fiche Google ou la page citée par Claude, ou donnée par Bas.
-- 0 : trouvée par Claude sur une page que l'outil ne peut pas relire (Facebook, Instagram,
--     annuaire, page qui ne répond pas). Elle part quand même, et se filtre dans la liste.
ALTER TABLE prospects ADD COLUMN email_verifie INTEGER NOT NULL DEFAULT 1;
