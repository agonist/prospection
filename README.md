# Prospection

La base de prospects de C'est bien beau. Chaque établissement trouvé sur Google Maps y est gardé, même quand il n'est pas intéressant aujourd'hui. Au fil des extractions, on construit une base de milliers d'entreprises, et on voit qui contacter, qui relancer, et qui ne jamais recontacter.

- `scripts/importer.mjs` lit un export Google Maps (Apify ou Outscraper), visite chaque site pour trouver une adresse générique et un constat, puis enregistre tout dans la base.
- `src/` est l'admin : un Worker Cloudflare avec une base D1, protégé par Cloudflare Access.

## Les statuts

| Statut | Posé par | Sens |
| --- | --- | --- |
| Prêt à contacter | l'import | Adresse générique et constat trouvés |
| À vérifier | l'import | Pas d'email, email nominatif ou d'un autre domaine, site injoignable |
| Plus tard | l'import | Le site a l'air correct aujourd'hui |
| Hors cible | l'import | Coopérative, enseigne, fermé… |
| En campagne | l'export Smartlead | Envoyé dans Smartlead |
| A répondu, Maquette envoyée, Client, Pas intéressé, Désinscrit | toi | Suivi à la main |

Une nouvelle extraction met à jour les données d'une fiche (site, constat, téléphone…) et recalcule les quatre statuts de l'import. Elle ne touche jamais un statut posé à la main ni la note.

## Mise en place (une seule fois)

```sh
pnpm install
pnpm wrangler login
pnpm wrangler d1 create prospection
```

1. Copier l'identifiant affiché dans `database_id` de `wrangler.jsonc`.
2. `pnpm db:migrer` crée la table dans la base en ligne.
3. `pnpm publier` publie l'admin sur `prospection.<ton-compte>.workers.dev`.
4. Dans le tableau de bord Cloudflare, **Zero Trust → Access → Applications → Add an application → Self-hosted**. Domaine : l'adresse du Worker. Règle : ton email uniquement.
5. Copier le domaine de l'équipe (`xxx.cloudflareaccess.com`) dans `ACCESS_EQUIPE` et l'**Application Audience (AUD) Tag** dans `ACCESS_AUD` de `wrangler.jsonc`, puis `pnpm publier` à nouveau.

Tant que ces deux valeurs sont vides, l'admin refuse toutes les requêtes.

## Importer une extraction

1. Sur [apify.com](https://apify.com), lancer **Google Maps Scraper** avec une recherche par métier et par commune : `domaine viticole Barr`, `domaine viticole Mittelbergheim`… Le texte de la recherche est réutilisé tel quel dans l'email (colonne `recherche`).
2. **Export → JSON**, et enregistrer le fichier dans `donnees/` (ignoré par git).
3. Lancer :

```sh
pnpm importer --cible vin --entree donnees/vin-barr.json
```

Cibles : `vin`, `bien-etre`, `artisan` (dans `scripts/cibles.mjs`). Options :

- `--limite 20` : n'analyse que les 20 premiers sites, pour un essai.
- `--local` : écrit dans la base locale de `pnpm dev` au lieu de la base en ligne.
- `--sans-base` : écrit seulement le fichier SQL à côté de l'export.

## Envoyer dans Smartlead

1. Dans l'admin, choisir la cible, puis l'onglet **Prêt à contacter**.
2. Ouvrir chaque site quelques secondes pour vérifier que le constat est vrai. En cas de doute, passer la fiche en « À vérifier ».
3. **Exporter pour Smartlead** télécharge le CSV et passe les fiches en « En campagne ». Les adresses désinscrites ne repartent jamais, même si elles apparaissent sur une autre fiche.
4. Dans Smartlead : importer le CSV, faire correspondre `recherche`, `constat` et `source` à des variables personnalisées, puis lancer la vérification des emails.

Quand quelqu'un répond, mettre à jour son statut dans l'admin, et noter ce qui s'est dit.

## RGPD et CNIL

Les artisans et praticiens en nom propre sont des personnes physiques : leurs données sont des données personnelles.

- On ne prospecte sans consentement que les adresses **génériques** (contact@, info@…). Une adresse nominative reste en « À vérifier » et ne part jamais dans Smartlead.
- Chaque email propose de se désinscrire. Une demande de désinscription passe la fiche en **Désinscrit**, et elle y reste.
- Un prospect sans nouvelles depuis 3 ans doit être effacé. L'admin affiche un bandeau quand il y en a, avec un bouton pour les effacer. Les clients, les désinscrits et les échanges en cours ne sont jamais effacés.

## Développement

```sh
cp .dev.vars.exemple .dev.vars   # désactive Access en local
pnpm db:migrer:local
pnpm importer --cible vin --entree donnees/essai.json --local
pnpm dev
pnpm test && pnpm check
```
