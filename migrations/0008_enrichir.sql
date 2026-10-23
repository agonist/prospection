-- Plus d'appels : une fiche sans email part en recherche d'email (Claude cherche sur le web).
ALTER TABLE prospects ADD COLUMN email_source TEXT NOT NULL DEFAULT '';  -- page où l'email a été trouvé
ALTER TABLE prospects ADD COLUMN email_propose TEXT NOT NULL DEFAULT ''; -- adresse que Claude n'a pas pu prouver

UPDATE prospects SET statut = 'a_enrichir', raison = 'pas d’email sur le site : Claude le cherche sur le web'
  WHERE statut = 'a_appeler'
    -- « À vérifier » sans email (anciennes règles) : sauf un site injoignable, il manque juste l'adresse.
    OR (statut = 'a_verifier' AND email = '' AND raison NOT LIKE 'site injoignable%');
