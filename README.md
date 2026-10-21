# Prospection

La base de prospects de C'est bien beau. Chaque établissement trouvé sur Google Maps y est gardé, même quand il n'est pas intéressant aujourd'hui. Au fil des extractions, on construit une base de milliers d'entreprises, et on voit qui contacter, qui relancer, et qui ne jamais recontacter.

Tout se fait depuis l'admin (un Worker Cloudflare avec une base D1, protégé par Cloudflare Access) :

1. **Nouvelle recherche** : tu choisis une cible, un métier et des communes. L'admin lance l'extraction Google Maps sur Apify.
2. Toutes les minutes, une tâche planifiée récupère les fiches, les enregistre, puis visite chaque site pour trouver une adresse générique et un constat (environ 8 sites par minute).
3. Tu relis les prospects prêts, puis tu exportes le CSV pour Smartlead.

## Les statuts

| Statut | Posé par | Sens |
| --- | --- | --- |
| En analyse | la recherche | Fiche importée, site pas encore visité |
| Prêt à contacter | l'import | Adresse générique et constat trouvés |
| À vérifier | l'import | Pas d'email, email nominatif ou d'un autre domaine, site injoignable |
| Plus tard | l'import | Le site a l'air correct aujourd'hui |
| Hors cible | l'import | Coopérative, enseigne, fermé… |
| En campagne | l'export Smartlead | Envoyé dans Smartlead |
| A répondu, Maquette envoyée, Client, Pas intéressé, Désinscrit | toi | Suivi à la main |

Une nouvelle recherche met à jour les données d'une fiche (site, téléphone…) et réanalyse son site si son statut est automatique. Elle ne touche jamais un statut posé à la main ni la note.

## Mise en place (une seule fois)

```sh
pnpm install
pnpm wrangler login
pnpm wrangler d1 create prospection
```

1. Copier l'identifiant affiché dans `database_id` de `wrangler.jsonc`.
2. `pnpm db:migrer` crée les tables dans la base en ligne.
3. Sur [console.apify.com](https://console.apify.com), **Settings → API & Integrations**, copier la clé API, puis `pnpm wrangler secret put APIFY_TOKEN` et la coller.
4. `pnpm publier` publie l'admin sur `prospection.<ton-compte>.workers.dev`.
5. Dans le tableau de bord Cloudflare, **Zero Trust → Access → Applications → Add an application → Self-hosted**. Domaine : l'adresse du Worker. Règle : ton email uniquement.
6. Copier le domaine de l'équipe (`xxx.cloudflareaccess.com`) dans `ACCESS_EQUIPE` et l'**Application Audience (AUD) Tag** dans `ACCESS_AUD` de `wrangler.jsonc`, puis `pnpm publier` à nouveau.

Tant que ces deux valeurs sont vides, l'admin refuse toutes les requêtes.

Sur le plan Workers gratuit, chaque passage de la tâche est limité à 10 ms de calcul. Si des analyses restent bloquées « En analyse » ou que les journaux du Worker signalent un dépassement, passer au plan Workers Paid (5 $ par mois).

## Lancer une recherche

Dans l'admin, **Nouvelle recherche** : la cible préremplit le métier et une liste de communes (dans `scripts/cibles.mjs`). Chaque ligne devient une recherche Google Maps « métier commune », dont le texte est réutilisé tel quel dans l'email (colonne `recherche`). La page des recherches montre l'avancement.

L'extraction Apify est payée au résultat, sur le crédit du compte Apify. Les avis, les photos et l'extraction payante des contacts sont désactivés : l'analyse cherche les emails elle-même.

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
cp .dev.vars.exemple .dev.vars   # désactive Access en local, y mettre la clé Apify
pnpm db:migrer:local
pnpm dev                          # puis http://localhost:8787
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"   # déclenche la tâche à la main
pnpm test && pnpm test:worker && pnpm check
```

`pnpm dev` ne déclenche pas la tâche planifiée tout seul : l’appeler avec la commande `curl` ci-dessus.
