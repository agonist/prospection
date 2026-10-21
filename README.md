# Prospection

La base de prospects de C'est bien beau. Chaque établissement trouvé sur Google Maps y est gardé, même quand il n'est pas intéressant aujourd'hui. Au fil des extractions, on construit une base de milliers d'entreprises, et on voit qui contacter, qui relancer, et qui ne jamais recontacter.

Tout se fait depuis l'admin (un Worker Cloudflare avec une base D1, protégé par Cloudflare Access) :

1. **Nouvelle recherche** : tu choisis une cible, un métier et des communes. L'admin lance l'extraction Google Maps sur Apify.
2. Une tâche planifiée (toutes les minutes en ligne, toutes les 10 secondes avec `pnpm local`) récupère les fiches, les enregistre, puis visite chaque site pour trouver une adresse générique et un constat (environ 8 sites par minute).
3. Tu relis les prospects prêts, puis tu exportes le CSV pour Smartlead.

## Les statuts

| Statut | Posé par | Sens |
| --- | --- | --- |
| En analyse | la recherche | Fiche importée, site pas encore visité |
| Prêt à contacter | l'import | Adresse générique et constat trouvés |
| À écrire | l'import | Adresse nominative : le bouton « Écrire » ouvre l'email prérempli (modèle dans **Cibles**) et passe la fiche en campagne |
| À appeler | l'import | Pas d'email trouvé, mais un téléphone |
| À vérifier | l'import | Site injoignable, adresse sur un autre domaine (peut-être l'agence web), ni email ni téléphone |
| Plus tard | l'import | Le site a l'air correct aujourd'hui |
| Hors cible | l'import | Coopérative, enseigne, fermé… |
| En campagne | l'export Smartlead | Envoyé dans Smartlead |
| A répondu, Maquette envoyée, Client, Pas intéressé, Désinscrit | toi | Suivi à la main |

Une nouvelle recherche met à jour les données d'une fiche (site, téléphone…) et réanalyse son site si son statut est automatique. Elle ne touche jamais un statut posé à la main ni la note.

## En local, sur ton ordinateur

Il faut Node 22 et pnpm.

```sh
git clone https://github.com/agonist/prospection && cd prospection
pnpm install
pnpm local
```

Au premier lancement, `pnpm local` crée le fichier `.dev.vars` et demande la clé API Apify (sur [console.apify.com](https://console.apify.com), **Settings → API & Integrations**). Colle-la après `APIFY_TOKEN=`, puis relance `pnpm local`. L'admin s'ouvre sur http://localhost:8787, et la tâche tourne toutes les minutes tant que la commande reste ouverte. La base locale est gardée dans `.wrangler/` entre deux lancements.

Pour suivre ce qui se passe : le terminal affiche chaque étape (extraction Apify, import, résultat de l'analyse de chaque site), et la page **Recherches** de l'admin montre l'activité, l'heure du dernier passage de la tâche, la progression et les erreurs. Elle se rafraîchit toute seule tant qu'il reste du travail.

## Mise en ligne (une seule fois)

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

Dans l'admin, **Nouvelle recherche** : la cible préremplit ses métiers et les communes qui restent à faire ; chaque métier est cherché dans chaque commune. Une recherche « métier commune » lancée il y a moins de 6 mois est sautée pour ne pas payer deux fois l'extraction, sauf si on coche « Refaire les recherches déjà faites ». Chaque ligne devient une recherche Google Maps « métier commune », dont le texte est réutilisé tel quel dans l'email (colonne `recherche`). La page des recherches montre l'avancement.

L'extraction Apify est payée au résultat, sur le crédit du compte Apify. Les avis et les photos sont désactivés. La case « Extraire les emails avec Apify » (cochée par défaut) active l'option payante qui récupère les emails des sites pendant l'extraction ; l'analyse repasse de toute façon sur chaque site pour le constat et pour les emails qu'Apify aurait manqués.

## Les cibles

La page **Cibles** liste les métiers prospectés, avec le nombre de prospects et les communes déjà couvertes. On y crée une nouvelle cible (restaurants, avocats…) et on modifie celles qui existent : métiers cherchés sur Google Maps, communes, mots qui excluent une fiche (coopérative, franchise…) et ordre des constats. `scripts/cibles.mjs` donne les valeurs de départ. Quand on y ajoute des métiers ou des communes et qu'on augmente `VERSION_CIBLES`, l'admin les ajoute aux cibles existantes au lancement suivant, sans rien retirer.

La liste des prospects se filtre aussi par catégorie Google (« Producteur de vin », « Naturopathe »…).

## Envoyer dans Smartlead

1. Dans l'admin, choisir la cible, puis l'onglet **Prêt à contacter**.
2. Ouvrir chaque site quelques secondes pour vérifier que le constat est vrai. En cas de doute, passer la fiche en « À vérifier ».
3. **Exporter pour Smartlead** télécharge le CSV et passe les fiches en « En campagne ». Les adresses désinscrites ne repartent jamais, même si elles apparaissent sur une autre fiche.
4. Dans Smartlead : importer le CSV, faire correspondre `recherche`, `constat` et `source` à des variables personnalisées, puis lancer la vérification des emails.

**Traiter** (en haut des onglets Prêt à contacter, À écrire, À appeler et À vérifier) montre une fiche à la fois, la plus prioritaire d'abord, avec l'aperçu du site et les actions sur les touches 1 à 5. La priorité (sur 100) favorise les entreprises bien notées et avec beaucoup d'avis dont la présence en ligne est faible. Dans la liste, cocher des fiches permet de changer leur statut d'un coup.

Dans les onglets « À écrire », « À appeler » et « À vérifier », la raison de chaque fiche est affichée, avec un filtre par raison. **Réanalyser** repasse les fiches de l'onglet à l'analyse, par exemple après un changement des règles.

Quand quelqu'un répond, mettre à jour son statut dans l'admin, et noter ce qui s'est dit.

## RGPD et CNIL

Les artisans et praticiens en nom propre sont des personnes physiques : leurs données sont des données personnelles.

- Smartlead ne reçoit que les adresses **génériques** (contact@, info@…) et celles **au nom de l'entreprise** (menuiserie.dupont@…, domaine.muller@…), qui ne désignent pas une personne. Une adresse qui contient un prénom (claire.martin@, c.martin@) est nominative : elle passe en « À écrire » et ne part jamais dans Smartlead.
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
