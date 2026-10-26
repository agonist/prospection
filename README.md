# Prospection

La base de prospects de C'est bien beau. Chaque établissement trouvé sur Google Maps y est gardé, même quand il n'est pas intéressant aujourd'hui. Au fil des extractions, on construit une base de milliers d'entreprises, et on voit qui contacter, qui relancer, et qui ne jamais recontacter.

Tout se fait depuis l'admin (un Worker Cloudflare avec une base D1, protégé par Cloudflare Access) :

1. **Nouvelle recherche** : tu choisis une cible, un métier et des communes. L'admin lance l'extraction Google Maps sur Apify.
2. Une tâche planifiée (toutes les minutes en ligne, toutes les 10 secondes avec `pnpm local`) récupère les fiches, les enregistre, puis visite chaque site pour trouver une adresse générique et un constat (environ 8 sites par minute).
3. Tu relis les prospects prêts, puis tu exportes le CSV pour Smartlead.

## Le tableau de bord

La page d'accueil montre ce qu'il y a à faire aujourd'hui (prêts pour Smartlead, à écrire, email à chercher, à vérifier), l'entonnoir des fiches trouvées jusqu'aux clients, l'activité des 14 derniers jours, les chiffres par cible et les avis de Claude. La liste complète est sous **Prospects**. La touche `/` place le curseur dans la recherche.

## Claude juge chaque site

Avec une clé API Anthropic (`ANTHROPIC_API_KEY` dans `.dev.vars`, à créer sur [console.anthropic.com](https://console.anthropic.com) → API Keys), l'analyse envoie à Claude le texte visible de la page d'accueil, ses liens et quelques indices techniques (Wix, vieux WordPress, mise en page en tableaux…). Claude rend un verdict (site bon, moyen, faible ou hors cible), une note sur 10 et le constat de l'email, écrit à partir de ce qu'il voit sur la page.

- Site **bon** : la fiche passe en « Plus tard », rien à leur vendre aujourd'hui.
- **Hors cible** (chaîne, franchise, autre activité) : « Hors cible ».
- **Moyen** ou **faible** : son constat remplace celui des règles, et la priorité monte pour les sites faibles.

Une clé [OpenRouter](https://openrouter.ai) marche aussi : `OPENROUTER_API_KEY` dans `.dev.vars`, elle passe avant la clé Anthropic. Le modèle par défaut est alors `anthropic/claude-haiku-5.5` ; vérifier son nom exact sur openrouter.ai/models et le changer avec `CLAUDE_MODELE` au besoin.

Claude ne voit pas le rendu visuel, seulement le texte et la structure. Sans clé, l'analyse se fait avec les règles seules, comme avant. Le modèle se change avec `CLAUDE_MODELE` (par défaut Haiku, le moins cher ; Opus coûte environ 40 fois plus). La dépense du jour s'affiche sur le tableau de bord et la page Recherches (coût réel avec OpenRouter, estimé avec une clé Anthropic). Pour faire juger les fiches déjà analysées, ouvrir un onglet et cliquer sur **Réanalyser**.

## Pas d'email sur le site

On n'appelle pas : tout passe par email. Une fiche sans email sur son site part en **Email à chercher**. Avec une clé OpenRouter ou Anthropic, Claude cherche l'adresse sur le web (Pages Jaunes, Facebook, annuaires, mentions légales…), 3 fiches par passage de la tâche. Il doit citer la page où il l'a lue, et l'outil relit cette page :

- adresse retrouvée dans la page : la fiche est rangée comme à l'analyse (Prêt à contacter, ou À écrire si elle est nominative) ;
- page que l'outil ne peut pas relire (Facebook, Instagram, Pages Jaunes et autres annuaires, page qui ne répond pas) : la fiche est rangée de la même façon, avec la mention **non vérifiée** et un lien vers la page. Dans la liste, le filtre « Adresses non vérifiées » les regroupe, pour les regarder ou les exporter dans une campagne à part ;
- page lue où l'adresse n'apparaît pas, ou adresse sans page source : elle est sans doute devinée. Sans source, elle est jetée ; sinon la fiche va en **À vérifier**, avec un bouton pour l'utiliser après avoir regardé la source ;
- rien trouvé : **Sans email**.

La règle ne change pas : Claude n'a pas le droit d'inventer une adresse, ni de deviner un contact@ à partir du nom de domaine.

Dans **Traiter** et sur chaque fiche, un bloc « Trouver l'email » donne des liens tout prêts (site, Google, Pages Jaunes, Facebook, fiche Google) et un champ pour coller l'adresse trouvée : la fiche se range toute seule. Le bouton « Chercher avec Claude » lance la recherche tout de suite. La recherche web coûte plus cher que le jugement d'un site (plusieurs pages lues par fiche) : surveiller la facture sur les premières dizaines.

## Les statuts

| Statut | Posé par | Sens |
| --- | --- | --- |
| En analyse | la recherche | Fiche importée, site pas encore visité |
| Prêt à contacter | l'import | Adresse générique et constat trouvés |
| À écrire | l'import | Adresse nominative : le bouton « Écrire » ouvre l'email prérempli (modèle dans **Cibles**) et passe la fiche en campagne |
| Email à chercher | l'import | Pas d'email sur le site : Claude le cherche sur le web, tout seul |
| À vérifier | l'import | Site injoignable, adresse sur un autre domaine (peut-être l'agence web), adresse proposée par Claude mais pas prouvée |
| Sans email | la recherche d'email | Ni le site ni le web ne donnent d'adresse |
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

## Nouvelles entreprises (registre Sirene)

En bas de **Recherches**, « Nouvelles entreprises » cherche les entreprises créées ces N derniers jours dans les départements choisis, pour les codes d'activité (NAF) de la cible. L'extraction passe par l'acteur Apify [New French Companies Finder (SIRENE)](https://apify.com/fit_melon/new-french-companies-finder-sirene) : gratuit hors consommation de la plateforme, avec une clé INSEE facultative (`INSEE_API_KEY`, gratuite sur portail-api.insee.fr) pour des résultats plus complets. Les entrepreneurs qui ont refusé la diffusion de leurs données sont exclus à la source.

Ces fiches n'ont ni email ni site : elles partent en « Email à chercher » et Claude cherche l'adresse. Leur constat est « vous n'avez pas encore de site internet », et l'email écrit à la main part avec l'angle « félicitations pour le lancement ». Pour Smartlead, filtrer la liste sur la source « Nouvelles entreprises » et faire une campagne à part : la colonne `source` vaut « le registre des entreprises ».

Le filtre « Récentes » montre les entreprises créées dans l'année, et celles qui sont sur Google sans site avec 5 avis ou moins (sans doute récentes). Une étiquette les signale dans la liste.

## Pilote automatique

En haut de **Recherches**, le pilote lance seul les recherches, cible par cible, tant que `pnpm local` tourne :

- **Google Maps, recherches par jour** : il prend les recherches « métier commune » de la cible pas encore faites ces 6 derniers mois, 30 fiches au plus chacune, une extraction à la fois, sans dépasser le nombre choisi par jour. La colonne « Reste à chercher » dit combien il en reste et en combien de jours.
- **Nouvelles entreprises chaque semaine** : une fois par semaine, il cherche les entreprises créées depuis la dernière recherche réussie, avec les codes NAF et les départements de la cible.

L'import, l'analyse et la recherche d'email suivent comme pour une recherche lancée à la main. Après une erreur (crédit Apify épuisé, clé invalide…), le pilote attend une heure avant de réessayer et l'écrit dans l'activité. 0 et la case décochée l'arrêtent pour une cible.

## Les cibles

La page **Cibles** liste les métiers prospectés, avec le nombre de prospects et les communes déjà couvertes. On y crée une nouvelle cible (restaurants, avocats…) et on modifie celles qui existent : métiers cherchés sur Google Maps, communes, mots qui excluent une fiche (coopérative, franchise…) et ordre des constats. `scripts/cibles.mjs` donne les valeurs de départ. Quand on y ajoute des métiers ou des communes et qu'on augmente `VERSION_CIBLES`, l'admin les ajoute aux cibles existantes au lancement suivant, sans rien retirer.

Avec une clé Claude, **Nouveau secteur avec Claude** prépare une cible à partir d'un mot (« photographes ») : recherches Google Maps, codes NAF vérifiés dans la nomenclature de l'INSEE, mots à exclure, ce qu'un bon site doit avoir dans ce métier, constats et email écrit à la main. Rien n'est enregistré avant relecture. « Ce qu'un bon site doit avoir » est donné à Claude quand il juge les sites de la cible.

La liste des prospects se filtre aussi par catégorie Google (« Producteur de vin », « Naturopathe »…).

## Piloter avec Claude (MCP)

L'outil est aussi un serveur MCP : depuis Claude Code, Claude lit le tableau de bord et les fiches, crée des cibles, lance des recherches, règle le pilote, range les fiches et enregistre les emails trouvés. Pendant que `pnpm local` tourne :

```sh
claude mcp add --transport http prospection http://localhost:8787/mcp
```

Puis par exemple : « Où en est la prospection ? », « Prépare une cible pour les photographes et active le pilote à 10 recherches par jour », « Trouve l'email des fiches à chercher de la cible vin ».

Les garde-fous sont dans le serveur, pas seulement dans les consignes données à Claude :

- un email ne s'enregistre qu'avec sa source : l'URL d'une page où l'adresse est écrite, relue comme ci-dessus (vérifiée, non vérifiée, ou proposition « À vérifier » si la page lue ne la contient pas), ou « Bas » ;
- une adresse nominative va en « À écrire », jamais dans Smartlead ; l'export vers Smartlead reste un clic dans l'admin ;
- une fiche désinscrite ne change plus de statut ;
- le serveur ne répond qu'en local (`localhost`), et refuse les pages web d'autres sites.

## Envoyer dans Smartlead

1. Dans l'admin, choisir la cible, puis l'onglet **Prêt à contacter**.
2. Ouvrir chaque site quelques secondes pour vérifier que le constat est vrai. En cas de doute, passer la fiche en « À vérifier ».
3. **Exporter pour Smartlead** télécharge le CSV et passe les fiches en « En campagne ». Les adresses désinscrites ne repartent jamais, même si elles apparaissent sur une autre fiche.
4. Dans Smartlead : importer le CSV, faire correspondre `recherche`, `constat` et `source` à des variables personnalisées, puis lancer la vérification des emails.

**Traiter** (en haut des onglets Prêt à contacter, À écrire, Email à chercher, À vérifier et Sans email) montre une fiche à la fois, la plus prioritaire d'abord, avec l'aperçu du site et les actions sur les touches 1 à 5. La priorité (sur 100) favorise les entreprises bien notées et avec beaucoup d'avis dont la présence en ligne est faible. Dans la liste, cocher des fiches permet de changer leur statut d'un coup.

Dans les onglets « À écrire », « Email à chercher » et « À vérifier », la raison de chaque fiche est affichée, avec un filtre par raison. **Réanalyser** repasse les fiches de l'onglet à l'analyse, par exemple après un changement des règles.

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
