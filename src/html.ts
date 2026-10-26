export function echapper(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FORMES = new Set(['SARL', 'SAS', 'SASU', 'EURL', 'EARL', 'SCEA', 'GAEC', 'SCI', 'SA', 'EI', 'SNC']);
const PETITS_MOTS = new Set(['de', 'du', 'des', 'et', 'la', 'le', 'les', 'en', 'sur', 'sous', 'au', 'aux', 'à', 'd', 'l']);

// Les noms en capitales (registre, fiches Google) : « MS MENUISERIE ET FILS SARL » → « MS Menuiserie et Fils SARL ».
// Les sigles (sans voyelle) et les formes juridiques restent en capitales.
export function nomLisible(nom: string) {
  if (nom !== nom.toUpperCase() || !/\p{Lu}\p{Lu}/u.test(nom)) return nom;
  let premier = true;
  return nom.toLowerCase().replace(/[\p{L}\d]+/gu, (mot) => {
    const debut = premier;
    premier = false;
    if (FORMES.has(mot.toUpperCase()) || (mot.length >= 2 && mot.length <= 4 && /\p{L}/u.test(mot) && !/[aeiouyàâäéèêëîïôöùûü]/.test(mot))) return mot.toUpperCase();
    if (!debut && PETITS_MOTS.has(mot)) return mot;
    return mot.charAt(0).toUpperCase() + mot.slice(1);
  });
}

// Icônes Lucide (lucide.dev), en ligne pour ne rien charger.
const TRACES = {
  tableau: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  valide: '<path d="M20 6 9 17l-5-5"/>',
  prospects: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  recherches: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  jouer: '<polygon points="6 3 20 12 6 21 6 3"/>',
  cibles: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  telecharger: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  retour: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  externe: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  telephone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  email: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  site: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  lieu: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  activite: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  poubelle: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
};

export function icone(nom: keyof typeof TRACES, taille = 16) {
  return `<svg class="icone" width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRACES[nom]}</svg>`;
}

// Jetons et composants dans l'esprit de shadcn/ui (palette zinc).
const STYLE = `
:root {
  --fond: #fafafa; --carte: #ffffff; --barre: #f4f4f5; --champ-fond: #ffffff;
  --texte: #0a0a0b; --attenue-texte: #67676f; --attenue: #f1f1f3; --survol: #f6f6f7;
  --bord: #e6e6e9; --champ: #d9d9de;
  --primaire: #18181b; --primaire-texte: #fafafa; --accent: #2563eb; --anneau: #a1a1aa;
  --vert: #15803d; --ambre: #b45309; --bleu: #0369a1; --violet: #6d28d9; --sarcelle: #0f766e; --rouge: #b91c1c; --indigo: #1d4ed8;
  --succes: var(--vert); --attention: var(--ambre); --danger: var(--rouge);
  --rayon: 8px; --graphe: #2563eb;
  --ombre: 0 1px 2px rgb(0 0 0 / .05);
  --chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fond: #0b0b0d; --carte: #121215; --barre: #0e0e11; --champ-fond: #0e0e11;
    --texte: #f4f4f5; --attenue-texte: #a1a1aa; --attenue: #1c1c21; --survol: #17171b;
    --bord: #232329; --champ: #303037;
    --primaire: #f4f4f5; --primaire-texte: #18181b; --accent: #60a5fa; --anneau: #52525b;
    --vert: #4ade80; --ambre: #fbbf24; --bleu: #38bdf8; --violet: #a78bfa; --sarcelle: #2dd4bf; --rouge: #f87171; --indigo: #93c5fd;
    --graphe: #3b82f6;
    --ombre: 0 1px 2px rgb(0 0 0 / .4);
    --chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    color-scheme: dark;
  }
}
* { box-sizing: border-box; scrollbar-width: thin; scrollbar-color: var(--champ) transparent; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--fond); color: var(--texte); font: 14px/1.5 "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; caret-color: var(--accent); }
::selection { background: color-mix(in srgb, var(--accent) 24%, transparent); }
a { color: inherit; text-underline-offset: 3px; text-decoration-thickness: 1px; }
code { font: 12px/1 "Geist Mono", ui-monospace, monospace; background: var(--attenue); padding: 2px 6px; border-radius: 4px; }
h1, h2 { text-wrap: balance; }
.icone { flex: none; }
.discret { color: var(--attenue-texte); font-size: 13px; }
.une-ligne, .tronque { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.serre { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.description { max-width: 56ch; }
.sans-coupure { white-space: nowrap; }

/* Structure : barre latérale + contenu */
.app { display: grid; grid-template-columns: 224px minmax(0, 1fr); min-height: 100vh; }
.barre { background: var(--barre); border-right: 1px solid var(--bord); padding: 14px 10px; display: flex; flex-direction: column; gap: 2px; position: sticky; top: 0; height: 100vh; }
.marque { display: flex; align-items: center; gap: 10px; padding: 4px 8px 18px; text-decoration: none; }
.marque-logo { width: 30px; height: 30px; border-radius: 8px; background: var(--primaire); color: var(--primaire-texte); display: grid; place-items: center; font-weight: 600; font-size: 12px; letter-spacing: -0.02em; }
.marque strong { display: block; font-size: 14px; font-weight: 600; line-height: 1.2; }
.marque span { font-size: 12px; color: var(--attenue-texte); }
.nav-titre { font-size: 12px; color: var(--attenue-texte); padding: 6px 10px 4px; font-weight: 500; }
.nav { display: grid; gap: 2px; }
.nav a { display: flex; align-items: center; gap: 9px; height: 32px; padding: 0 10px; border-radius: 7px; text-decoration: none; color: var(--attenue-texte); font-weight: 500; transition: background .15s, color .15s; }
.nav a:hover { color: var(--texte); background: color-mix(in srgb, var(--texte) 5%, transparent); }
.nav a.actif { background: var(--carte); color: var(--texte); box-shadow: 0 0 0 1px var(--bord), var(--ombre); }
.contenu { padding: 28px 32px 64px; max-width: 1440px; width: 100%; }

/* En-tête de page */
.page-entete { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.page-entete h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 0; line-height: 1.25; }
.page-entete p { margin: 4px 0 0; color: var(--attenue-texte); }
.titre-ligne { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.titre-ligne .etiquette-recente { margin: 0; }
.sous-titre { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; margin-top: 6px; color: var(--attenue-texte); font-size: 13px; }
.actions-entete { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.retour { display: inline-flex; align-items: center; gap: 6px; color: var(--attenue-texte); text-decoration: none; font-weight: 500; font-size: 13px; margin-bottom: 12px; }
.retour:hover { color: var(--texte); }

/* Boutons */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 13px; border-radius: 7px; border: 1px solid transparent; background: var(--primaire); color: var(--primaire-texte); font: inherit; font-weight: 500; text-decoration: none; cursor: pointer; white-space: nowrap; transition: background .15s, border-color .15s, opacity .15s; }
.btn:hover { opacity: .88; }
.btn:active { transform: translateY(.5px); }
.btn:disabled { opacity: .5; cursor: progress; }
.btn.contour { background: var(--champ-fond); color: var(--texte); border-color: var(--champ); box-shadow: var(--ombre); }
.btn.contour:hover { background: var(--attenue); opacity: 1; }
.btn.fantome { background: transparent; color: var(--attenue-texte); }
.btn.fantome:hover { background: var(--attenue); color: var(--texte); opacity: 1; }
.btn.danger { background: var(--danger); color: #fff; }
.btn.petit { height: 30px; padding: 0 10px; font-size: 13px; }
.btn.mini { height: 26px; padding: 0 8px; font-size: 12px; gap: 5px; border-radius: 6px; }
:focus-visible { outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent); outline-offset: 2px; }

/* Champs */
input[type=text], input[type=search], input[type=email], input[type=number], select, textarea { font: inherit; color: inherit; background-color: var(--champ-fond); border: 1px solid var(--champ); border-radius: 7px; height: 34px; padding: 0 11px; box-shadow: var(--ombre); width: 100%; transition: border-color .15s, box-shadow .15s; }
input:hover, select:hover, textarea:hover { border-color: color-mix(in srgb, var(--champ) 50%, var(--attenue-texte)); }
input:focus-visible, select:focus-visible, textarea:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
select { appearance: none; -webkit-appearance: none; background-image: var(--chevron); background-repeat: no-repeat; background-position: right 9px center; background-size: 15px; padding-right: 32px; cursor: pointer; text-overflow: ellipsis; white-space: nowrap; }
textarea { height: auto; padding: 8px 11px; resize: vertical; line-height: 1.55; }
input::placeholder, textarea::placeholder { color: var(--attenue-texte); opacity: 1; }
input[type=search]::-webkit-search-cancel-button { -webkit-appearance: none; }
input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--primaire); margin: 0; cursor: pointer; }
.champ { display: grid; gap: 6px; min-width: 0; }
.champ label, .champ > span { font-weight: 500; }
.aide, .champ .aide { color: var(--attenue-texte); font-size: 13px; margin: 0; }
.case { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
.case input { margin-top: 2px; }
.case strong { display: block; font-weight: 500; }
.case span { color: var(--attenue-texte); font-size: 13px; }

/* Cartes */
.carte { background: var(--carte); border: 1px solid var(--bord); border-radius: 12px; box-shadow: var(--ombre); min-width: 0; }
.carte-entete { padding: 18px 20px 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.carte-titre { font-size: 15px; font-weight: 600; margin: 0; letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px; }
.carte-description { color: var(--attenue-texte); margin: 3px 0 0; font-size: 13px; }
.carte-contenu { padding: 16px 20px 20px; min-width: 0; }
.grille { display: grid; gap: 16px; min-width: 0; }
.grille > * { min-width: 0; }
.deux-colonnes { grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr); align-items: start; }

/* Onglets de statut, soulignés */
.onglets { display: flex; gap: 22px; border-bottom: 1px solid var(--bord); margin-bottom: 16px; overflow-x: auto; scrollbar-width: none; }
.onglets a { position: relative; display: inline-flex; align-items: center; gap: 7px; padding: 10px 0 11px; text-decoration: none; color: var(--attenue-texte); font-weight: 500; white-space: nowrap; transition: color .15s; }
.onglets a:hover { color: var(--texte); }
.onglets a.actif { color: var(--texte); }
.onglets a.actif::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 2px; background: var(--texte); }
.onglets em { font-style: normal; font-variant-numeric: tabular-nums; font-size: 12px; min-width: 20px; height: 18px; padding: 0 6px; border-radius: 999px; display: inline-grid; place-items: center; background: var(--attenue); color: var(--attenue-texte); }
.onglets a.actif em { background: var(--primaire); color: var(--primaire-texte); }

/* Filtres au-dessus du tableau */
.filtres { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 4px; }
.filtres select { width: auto; max-width: 220px; height: 32px; font-size: 13px; color: var(--attenue-texte); }
.filtres select.rempli { color: var(--texte); border-color: color-mix(in srgb, var(--texte) 35%, var(--champ)); background-color: var(--attenue); }
.filtres .effacer { color: var(--attenue-texte); font-size: 13px; text-decoration: none; padding: 0 6px; }
.filtres .effacer:hover { color: var(--texte); text-decoration: underline; }
.champ-recherche { position: relative; display: flex; align-items: center; flex: 1 1 260px; min-width: 200px; }
.champ-recherche > .icone { position: absolute; left: 11px; color: var(--attenue-texte); pointer-events: none; }
.champ-recherche input { height: 32px; padding-left: 34px; padding-right: 36px; font-size: 13px; }
.champ-recherche kbd { position: absolute; right: 9px; }

/* Tableaux */
.tableau { overflow-x: auto; }
.carte > .tableau:last-child { border-bottom-left-radius: inherit; border-bottom-right-radius: inherit; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 10px 16px; border-bottom: 1px solid var(--bord); vertical-align: middle; }
th { font-size: 12px; color: var(--attenue-texte); font-weight: 500; white-space: nowrap; height: 36px; background: color-mix(in srgb, var(--attenue) 45%, transparent); }
tbody tr { transition: background .1s; }
tbody tr:hover { background: var(--survol); }
tbody tr:last-child td { border-bottom: 0; }
td a { text-decoration: none; }
td a:hover { text-decoration: underline; }
.nom { font-weight: 500; }
th.chiffre, td.chiffre { text-align: right; font-variant-numeric: tabular-nums; }

/* Liste des prospects */
table.liste { table-layout: fixed; min-width: 1000px; }
table.liste th, table.liste td { padding: 9px 12px; }
table.liste th:first-child, table.liste td:first-child { padding-left: 16px; }
table.liste tbody tr:has(input[name=ids]:checked) { background: color-mix(in srgb, var(--accent) 7%, transparent); }
table.liste th.col-case { width: 44px; }
table.liste th.col-etab { width: 23%; }
table.liste th.col-statut { width: 156px; }
table.liste th.col-priorite { width: 56px; }
table.liste th.col-contact { width: 216px; }
table.liste th.col-site { width: 152px; }
table.liste th.col-vu { width: 72px; }
td.col-etab .nom { font-size: 14px; }
.ligne-nom { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ligne-nom .nom { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ligne-nom .etiquette-recente { margin: 0; }
td.col-constat { font-size: 13px; line-height: 1.45; }
.raison { color: var(--attention); font-weight: 500; }
.raison-en-cours { color: var(--violet); font-weight: 500; display: inline-flex; align-items: center; gap: 6px; }
.raison-en-cours::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: pulse 1.2s ease-in-out infinite; }
td.col-vu { font-size: 13px; white-space: nowrap; }
.contact { display: flex; align-items: center; gap: 8px; min-width: 0; }
.contact .une-ligne { flex: 1; }
.contact .btn { flex: none; }
.non-verifiee { display: inline-block; font-size: 11.5px; font-weight: 500; color: var(--ambre); text-decoration: none; white-space: nowrap; }
a.non-verifiee:hover { text-decoration: underline; }
.contact .non-verifiee { flex: none; }
.avec-icone + .non-verifiee { margin-left: 8px; }
.lien-site { display: flex; align-items: center; gap: 5px; min-width: 0; color: var(--texte); font-size: 13px; }
.lien-site span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lien-site .icone { color: var(--attenue-texte); }
.entete-liste { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 52px; padding: 10px 12px 10px 16px; border-bottom: 1px solid var(--bord); }
.entete-liste .compte { font-weight: 500; }
.entete-liste .compte em { font-style: normal; color: var(--attenue-texte); font-weight: 400; }
.actions-lot { display: flex; align-items: center; gap: 8px; }
.actions-lot[hidden] { display: none; }
.actions-lot select { width: auto; height: 30px; font-size: 13px; }
.entete-liste .tri { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--attenue-texte); }
.entete-liste .tri select { width: auto; height: 30px; font-size: 13px; }

/* Badges */
.badge { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 500; white-space: nowrap; color: var(--attenue-texte); background: color-mix(in srgb, currentColor 12%, transparent); max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.badge::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.badge-nouveau, .badge-client { color: var(--vert); }
.badge-a_verifier { color: var(--ambre); }
.badge-a_ecrire { color: var(--bleu); }
.badge-a_enrichir, .badge-a_repondu, .badge-maquette { color: var(--violet); }
.badge-en_campagne { color: var(--indigo); }
.badge-desinscrit { color: var(--rouge); }
.badge-a_analyser::before { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .25; } }
.etiquette-recente { display: inline-flex; align-items: center; flex: none; margin-left: 8px; height: 20px; padding: 0 7px; border-radius: 6px; font-size: 11px; font-weight: 500; vertical-align: middle; color: var(--sarcelle); background: color-mix(in srgb, var(--sarcelle) 13%, transparent); white-space: nowrap; }
h1 + .etiquette-recente { margin: 6px 0 0; }
.verdict { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 6px; font-size: 11px; font-weight: 500; margin-top: 4px; white-space: nowrap; color: var(--attenue-texte); background: var(--attenue); }
.verdict-faible { color: var(--vert); background: color-mix(in srgb, var(--vert) 12%, transparent); }
.verdict-moyen { color: var(--ambre); background: color-mix(in srgb, var(--ambre) 12%, transparent); }
.priorite { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 22px; padding: 0 6px; border-radius: 6px; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--attenue-texte); background: var(--attenue); }
.priorite-haute { color: var(--vert); background: color-mix(in srgb, var(--vert) 13%, transparent); }
.priorite-moyenne { color: var(--ambre); background: color-mix(in srgb, var(--ambre) 12%, transparent); }

/* Raisons d'une file */
.motifs { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; }
.motifs a { display: inline-flex; align-items: center; gap: 6px; height: 28px; border: 1px solid var(--bord); border-radius: 999px; padding: 0 11px; font-size: 12px; color: var(--attenue-texte); text-decoration: none; background: var(--carte); }
.motifs a:hover { color: var(--texte); border-color: var(--champ); }
.motifs a.actif { background: var(--primaire); color: var(--primaire-texte); border-color: var(--primaire); }
.motifs em { font-style: normal; opacity: .7; font-variant-numeric: tabular-nums; }
.barre-filtres { margin-bottom: 16px; }

/* Alertes */
.alerte { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 10px 12px 10px 14px; border: 1px solid var(--bord); border-radius: 10px; margin-bottom: 16px; background: var(--carte); font-size: 13px; }
.alerte p { margin: 0; flex: 1 1 260px; }
.alerte.danger { border-color: color-mix(in srgb, var(--danger) 35%, var(--bord)); background: color-mix(in srgb, var(--danger) 6%, var(--carte)); color: var(--danger); }
.alerte.attention { border-color: color-mix(in srgb, var(--attention) 35%, var(--bord)); background: color-mix(in srgb, var(--attention) 6%, var(--carte)); }
.alerte.succes { border-color: color-mix(in srgb, var(--succes) 35%, var(--bord)); background: color-mix(in srgb, var(--succes) 6%, var(--carte)); }
.alerte.succes p strong { color: var(--succes); }
.proposer-cible input[type=text] { flex: 1 1 220px; width: auto; max-width: 320px; }
.proposer-cible .btn { flex: none; }
.erreur { color: var(--danger); }
.consigne { display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 10px 12px; border-radius: var(--rayon); background: var(--attenue); font-size: 13px; }
.consigne .icone { margin-top: 3px; color: var(--attenue-texte); }

/* Trouver un email */
.trouver-email { display: grid; gap: 10px; padding: 14px; border: 1px dashed var(--champ); border-radius: 10px; }
.liens-recherche { display: flex; flex-wrap: wrap; gap: 6px; }
.ligne-email { display: flex; gap: 8px; }
.ligne-email input { flex: 1; min-width: 0; }
.trouver-email p { margin: 0; }

/* Fiche */
dl { display: grid; grid-template-columns: 148px minmax(0, 1fr); gap: 0; margin: 0; }
dt, dd { padding: 9px 0; border-bottom: 1px solid var(--bord); margin: 0; min-width: 0; }
dt { color: var(--attenue-texte); font-size: 13px; padding-top: 10px; }
dd { overflow-wrap: anywhere; }
dl > :nth-last-child(-n+2) { border-bottom: 0; }
.avec-icone { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; }
.constat { font-size: 15px; padding: 12px 14px; background: var(--attenue); border-radius: var(--rayon); margin: 0; }
.groupes-statuts { display: grid; gap: 14px; }
.groupe-statuts > span { display: block; font-size: 12px; font-weight: 500; color: var(--attenue-texte); margin-bottom: 6px; }
.statuts { display: flex; flex-wrap: wrap; gap: 6px; }
.statuts button { height: 28px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--champ); background: var(--champ-fond); color: var(--texte); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; transition: background .15s; }
.statuts button:hover { background: var(--attenue); }
.statuts button.actif { background: var(--primaire); color: var(--primaire-texte); border-color: var(--primaire); }
.puces { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.puces li { font: 12px/1 "Geist Mono", ui-monospace, monospace; background: var(--attenue); padding: 4px 8px; border-radius: 4px; }
.avis ul { margin: 8px 0 0; padding-left: 18px; color: var(--attenue-texte); }
.avis li { margin: 2px 0; }

/* Activité et journal */
.etat-tache { position: relative; padding-left: 18px; font-weight: 500; margin: 0; }
.etat-tache > .voyant { position: absolute; left: 0; top: .5em; }
.voyant { display: inline-block; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--succes); box-shadow: 0 0 0 3px color-mix(in srgb, var(--succes) 20%, transparent); }
.voyant.arret { background: var(--danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 20%, transparent); }
.voyant.inactif { background: var(--attenue-texte); box-shadow: none; }
.journal { list-style: none; margin: 0; padding: 0; max-height: 420px; overflow-y: auto; font-size: 13px; }
.journal li { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--bord); }
.journal li:last-child { border-bottom: 0; }
.journal time { color: var(--attenue-texte); font: 12px/1.6 "Geist Mono", ui-monospace, monospace; }
.journal-succes span { color: var(--succes); }
.journal-erreur span { color: var(--danger); }
.progression { display: flex; align-items: center; gap: 10px; min-width: 200px; }
.progression .piste { flex: 1; height: 6px; border-radius: 999px; background: var(--attenue); overflow: hidden; }
.progression .piste i { display: block; height: 100%; background: var(--primaire); border-radius: 999px; }

.pagination { display: flex; gap: 8px; justify-content: space-between; align-items: center; padding: 10px 16px; border-top: 1px solid var(--bord); color: var(--attenue-texte); font-size: 13px; }
.vide { text-align: center; padding: 48px 24px; color: var(--attenue-texte); }
.vide strong { display: block; color: var(--texte); font-size: 15px; margin-bottom: 4px; }
.formulaire { display: grid; gap: 18px; }
.formulaire .ligne { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
input.court { width: 72px; }
table.compact td, table.compact th { padding-top: 6px; padding-bottom: 6px; }
.actions-ligne { text-align: right; white-space: nowrap; }
.actions-ligne .btn + .btn { margin-left: 6px; }
.case-ligne { width: 44px; }
.case-ligne input { width: 16px; height: 16px; }

/* Mode traitement */
.traiter { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 16px; align-items: start; }
.traiter.sans-site { grid-template-columns: minmax(0, 760px); }
.actions-traiter { display: flex; flex-wrap: wrap; gap: 8px; }
.actions-traiter kbd { margin-left: 4px; background: transparent; color: inherit; border-color: currentColor; opacity: .55; }
.apercu { position: sticky; top: 16px; border: 1px solid var(--bord); border-radius: 12px; overflow: hidden; background: var(--carte); box-shadow: var(--ombre); }
.apercu-barre { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 14px; border-bottom: 1px solid var(--bord); background: var(--barre); font-size: 13px; }
.apercu-barre span { flex: 1; min-width: 0; }
.apercu iframe { display: block; width: 100%; height: 72vh; border: 0; background: #fff; }
.apercu > p { margin: 0; padding: 8px 14px; font-size: 12px; border-top: 1px solid var(--bord); }
.apercu.vide { padding: 48px 24px; }
.gros { font-size: 16px; font-weight: 600; }

/* Tableau de bord */
.pastille { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--attenue-texte); }
a.pastille { text-decoration: none; }
a.pastille:hover { color: var(--texte); }
.recherche-globale { position: relative; display: flex; align-items: center; flex: 0 1 340px; }
.recherche-globale > .icone { position: absolute; left: 11px; color: var(--attenue-texte); pointer-events: none; }
.recherche-globale input { padding-left: 34px; padding-right: 40px; }
.recherche-globale kbd { position: absolute; right: 10px; }
kbd { font: 11px/1.6 "Geist Mono", ui-monospace, monospace; color: var(--attenue-texte); border: 1px solid var(--bord); border-radius: 4px; padding: 0 5px; background: var(--attenue); }
.files { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 16px; }
.file { display: flex; flex-direction: column; gap: 8px; padding: 18px 20px; min-width: 0; }
.file + .file { border-left: 1px solid var(--bord); }
.file-chiffre { display: flex; flex-direction: column; gap: 2px; }
.file-chiffre span { display: inline-flex; align-items: center; gap: 7px; font-weight: 500; color: var(--attenue-texte); font-size: 13px; }
.file-chiffre span .icone { color: var(--teinte); }
.file-chiffre strong { font-size: 30px; font-weight: 600; letter-spacing: -0.03em; line-height: 1.15; font-variant-numeric: tabular-nums; }
.file.vide .file-chiffre strong { color: var(--attenue-texte); }
.file p { margin: 0; color: var(--attenue-texte); font-size: 13px; flex: 1; }
.file-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 30px; margin-top: 4px; }
.file-nouveau { --teinte: var(--vert); }
.file-a_ecrire { --teinte: var(--bleu); }
.file-a_enrichir { --teinte: var(--violet); }
.file-a_verifier { --teinte: var(--ambre); }
.tableau-de-bord { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; margin-bottom: 16px; }
.bloc { margin-bottom: 16px; }
.bloc .tableau { margin-top: 12px; }
.bienvenue { margin-bottom: 16px; border-style: dashed; }
.bienvenue .carte-description { margin-bottom: 16px; }
.barres { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.barres-texte { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; margin-bottom: 6px; }
.barres-texte a { text-decoration: none; }
.barres-texte a:hover { text-decoration: underline; }
.barres-texte strong { font-variant-numeric: tabular-nums; font-weight: 600; }
.barres-texte em { font-style: normal; color: var(--attenue-texte); margin-left: 4px; }
.barres-piste { height: 8px; border-radius: 4px; background: var(--attenue); overflow: hidden; }
.barres-piste i { display: block; height: 100%; background: var(--graphe); border-radius: 4px; transition: width .6s cubic-bezier(.2, .8, .2, 1); }
.activite { display: grid; gap: 24px; }
.histogramme-entete { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; color: var(--attenue-texte); margin-bottom: 8px; }
.histogramme-entete strong { color: var(--texte); font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.colonnes { display: grid; grid-template-columns: repeat(14, minmax(0, 1fr)); gap: 2px; height: 96px; align-items: end; border-bottom: 1px solid var(--bord); }
.colonne { position: relative; height: 100%; display: flex; align-items: flex-end; justify-content: center; cursor: default; }
.colonne i { display: block; width: min(100%, 22px); background: var(--graphe); border-radius: 4px 4px 0 0; }
.colonne:hover i { filter: brightness(1.15); }
.colonne:hover { background: color-mix(in srgb, var(--attenue) 60%, transparent); border-radius: 4px 4px 0 0; }
.colonne:hover::after { content: attr(data-info); position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); white-space: nowrap; background: var(--primaire); color: var(--primaire-texte); font-size: 12px; font-weight: 500; padding: 4px 8px; border-radius: 6px; z-index: 2; pointer-events: none; }
.colonne:first-child:hover::after { left: 0; transform: none; }
.colonne:last-child:hover::after { left: auto; right: 0; transform: none; }
.histogramme-axe { display: flex; justify-content: space-between; font-size: 12px; color: var(--attenue-texte); margin-top: 6px; }
.couverture { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--attenue-texte); font-variant-numeric: tabular-nums; }
.couverture .piste { width: 80px; height: 6px; border-radius: 999px; background: var(--attenue); overflow: hidden; }
.couverture .piste i { display: block; height: 100%; background: var(--graphe); border-radius: 999px; }

/* Notification après une action */
.toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; display: flex; align-items: center; gap: 10px; max-width: min(420px, calc(100vw - 32px)); padding: 12px 16px; border-radius: 10px; border: 1px solid var(--bord); background: var(--carte); color: var(--texte); box-shadow: 0 12px 32px rgb(0 0 0 / .14), 0 2px 6px rgb(0 0 0 / .06); font-weight: 500; animation: toast-entree .25s cubic-bezier(.2, .8, .2, 1); transition: opacity .3s, transform .3s; }
.toast .icone { color: var(--succes); }
.toast.parti { opacity: 0; transform: translateY(8px); }
@keyframes toast-entree { from { opacity: 0; transform: translateY(8px); } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }

@media (max-width: 1100px) {
  .files { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .file:nth-child(3) { border-left: 0; }
  .file:nth-child(n+3) { border-top: 1px solid var(--bord); }
  .tableau-de-bord { grid-template-columns: minmax(0, 1fr); }
  .traiter { grid-template-columns: minmax(0, 1fr); }
  .apercu { position: static; }
  .deux-colonnes { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 760px) {
  .app { grid-template-columns: minmax(0, 1fr); }
  .barre { position: static; height: auto; flex-direction: row; flex-wrap: wrap; align-items: center; row-gap: 8px; border-right: 0; border-bottom: 1px solid var(--bord); padding: 10px 16px; }
  .marque { padding: 0; margin-right: auto; }
  .marque span, .nav-titre { display: none; }
  .nav { display: flex; gap: 4px; width: 100%; overflow-x: auto; scrollbar-width: none; }
  .nav a { white-space: nowrap; flex: none; }
  .contenu { padding: 20px 16px 48px; }
  .page-entete { align-items: flex-start; }
  .files { grid-template-columns: minmax(0, 1fr); }
  .file + .file { border-left: 0; border-top: 1px solid var(--bord); }
  .recherche-globale { flex: 1 1 100%; }
  dl { grid-template-columns: minmax(0, 1fr); }
  dt { border-bottom: 0; padding-bottom: 0; }
  .formulaire .ligne { grid-template-columns: minmax(0, 1fr); }
  .filtres select { flex: 1 1 40%; max-width: none; min-width: 0; }
  .champ-recherche { flex-basis: 100%; }
  .entete-liste .tri span { display: none; }
  .ligne-nom { flex-wrap: wrap; row-gap: 2px; }
  .ligne-nom .nom { white-space: normal; }
  /* Le tableau devient une liste de lignes empilées. */
  table.liste { min-width: 0; }
  table.liste, table.liste tbody { display: block; }
  table.liste thead { display: none; }
  table.liste tr { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 4px 10px; padding: 12px 16px; border-bottom: 1px solid var(--bord); }
  table.liste tbody tr:last-child { border-bottom: 0; }
  table.liste td, table.liste td:first-child { padding: 0; border: 0; min-width: 0; }
  table.liste td.case-ligne { grid-row: 1 / span 3; padding-top: 3px; }
  table.liste td.col-etab { grid-column: 2; grid-row: 1; }
  table.liste td.col-statut { grid-column: 3; grid-row: 1; }
  table.liste td.col-constat, table.liste td.col-contact { grid-column: 2 / span 2; }
  table.liste td.col-priorite, table.liste td.col-site, table.liste td.col-vu { display: none; }
  .toast { left: 16px; right: 16px; bottom: 16px; }
}
`;

// Sur toutes les pages : « / » place le curseur dans la recherche, et un message
// passé dans l'adresse (?message=…) s'affiche quelques secondes après une action.
const SCRIPT = `
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || /^(input|textarea|select)$/i.test(document.activeElement?.tagName ?? '')) return;
  const champ = document.querySelector('input[type=search]');
  if (champ) { e.preventDefault(); champ.focus(); champ.select(); }
});
const adresse = new URL(location.href);
const message = adresse.searchParams.get('message');
if (message) {
  adresse.searchParams.delete('message');
  history.replaceState(null, '', adresse.pathname + adresse.search + adresse.hash);
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.innerHTML = '${icone('valide').replace(/"/g, '\\"')}';
  toast.append(message);
  document.body.append(toast);
  setTimeout(() => { toast.classList.add('parti'); setTimeout(() => toast.remove(), 400); }, 4000);
}
`;

export type Rubrique = 'tableau' | 'prospects' | 'recherches' | 'cibles';

export function page(titre: string, contenu: string, rubrique: Rubrique = 'prospects', tete = ''): Response {
  const lien = (cle: Rubrique, href: string, libelle: string) =>
    `<a href="${href}" class="${rubrique === cle ? 'actif' : ''}">${icone(cle)}${libelle}</a>`;
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${echapper(titre)} · Prospection</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono&display=swap" rel="stylesheet">
<style>${STYLE}</style>${tete}</head>
<body><div class="app">
  <aside class="barre">
    <a href="/" class="marque"><div class="marque-logo">Cb</div><div><strong>Prospection</strong><span>C'est bien beau</span></div></a>
    <div class="nav-titre">Outils</div>
    <nav class="nav">${lien('tableau', '/', 'Tableau de bord')}${lien('prospects', '/prospects', 'Prospects')}${lien('recherches', '/recherches', 'Recherches')}${lien('cibles', '/cibles', 'Cibles')}</nav>
  </aside>
  <main class="contenu">${contenu}</main>
</div><script>${SCRIPT}</script></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}
