export function echapper(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  --fond: #ffffff; --texte: #09090b; --carte: #ffffff;
  --attenue: #f4f4f5; --attenue-texte: #71717a; --bord: #e4e4e7; --champ: #e4e4e7;
  --primaire: #18181b; --primaire-texte: #fafafa; --anneau: #a1a1aa;
  --danger: #dc2626; --succes: #16a34a; --attention: #d97706;
  --rayon: 8px; --barre: #fafafa; --graphe: #2563eb;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fond: #09090b; --texte: #fafafa; --carte: #0c0c0e;
    --attenue: #27272a; --attenue-texte: #a1a1aa; --bord: #27272a; --champ: #3f3f46;
    --primaire: #fafafa; --primaire-texte: #18181b; --anneau: #52525b;
    --danger: #f87171; --succes: #4ade80; --attention: #fbbf24;
    --barre: #0f0f11; --graphe: #3b82f6;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--fond); color: var(--texte); font: 14px/1.5 "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
a { color: inherit; }
code { font: 12px/1 "Geist Mono", ui-monospace, monospace; background: var(--attenue); padding: 2px 6px; border-radius: 4px; }
.icone { flex: none; }

/* Structure : barre latérale + contenu */
.app { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: 100vh; }
.barre { background: var(--barre); border-right: 1px solid var(--bord); padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; position: sticky; top: 0; height: 100vh; }
.marque { display: flex; align-items: center; gap: 10px; padding: 4px 8px 16px; text-decoration: none; }
.marque-logo { width: 32px; height: 32px; border-radius: 8px; background: var(--primaire); color: var(--primaire-texte); display: grid; place-items: center; font-weight: 600; font-size: 13px; }
.marque strong { display: block; font-size: 14px; font-weight: 600; line-height: 1.2; }
.marque span { font-size: 12px; color: var(--attenue-texte); }
.nav-titre { font-size: 12px; color: var(--attenue-texte); padding: 8px 8px 4px; font-weight: 500; }
.nav a { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px; text-decoration: none; color: var(--attenue-texte); font-weight: 500; }
.nav a:hover { background: var(--attenue); color: var(--texte); }
.nav a.actif { background: var(--attenue); color: var(--texte); }
.contenu { padding: 28px 32px 64px; max-width: 1360px; width: 100%; }

/* En-tête de page */
.page-entete { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.page-entete h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; margin: 0; line-height: 1.2; }
.page-entete p { margin: 4px 0 0; color: var(--attenue-texte); }
.actions-entete { display: flex; flex-wrap: wrap; gap: 8px; }
.retour { display: inline-flex; align-items: center; gap: 6px; color: var(--attenue-texte); text-decoration: none; font-weight: 500; margin-bottom: 12px; }
.retour:hover { color: var(--texte); }

/* Boutons */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 6px; border: 1px solid transparent; background: var(--primaire); color: var(--primaire-texte); font: inherit; font-weight: 500; text-decoration: none; cursor: pointer; white-space: nowrap; transition: opacity .15s, background .15s; }
.btn:hover { opacity: .9; }
.btn.contour { background: var(--fond); color: var(--texte); border-color: var(--champ); box-shadow: 0 1px 2px rgb(0 0 0 / .04); }
.btn.contour:hover { background: var(--attenue); opacity: 1; }
.btn.fantome { background: transparent; color: var(--texte); }
.btn.fantome:hover { background: var(--attenue); opacity: 1; }
.btn.danger { background: var(--danger); color: #fff; }
.btn.petit { height: 32px; padding: 0 10px; font-size: 13px; }
.btn:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, a:focus-visible { outline: 2px solid var(--anneau); outline-offset: 2px; }

/* Champs */
input[type=text], input[type=search], input[type=email], input[type=number], select, textarea { font: inherit; color: inherit; background: var(--fond); border: 1px solid var(--champ); border-radius: 6px; height: 36px; padding: 0 12px; box-shadow: 0 1px 2px rgb(0 0 0 / .04); width: 100%; }
textarea { height: auto; padding: 8px 12px; resize: vertical; }
input::placeholder, textarea::placeholder { color: var(--attenue-texte); }
input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--primaire); margin: 0; }
.champ { display: grid; gap: 6px; }
.champ label, .champ > span { font-weight: 500; }
.champ .aide { color: var(--attenue-texte); font-size: 13px; }
.case { display: flex; gap: 10px; align-items: flex-start; }
.case input { margin-top: 2px; }
.case strong { display: block; font-weight: 500; }
.case span { color: var(--attenue-texte); font-size: 13px; }

/* Cartes */
.carte { background: var(--carte); border: 1px solid var(--bord); border-radius: calc(var(--rayon) + 4px); box-shadow: 0 1px 2px rgb(0 0 0 / .04); }
.carte-entete { padding: 20px 24px 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.carte-titre { font-size: 16px; font-weight: 600; margin: 0; letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px; }
.carte-description { color: var(--attenue-texte); margin: 4px 0 0; }
.carte-contenu { padding: 20px 24px 24px; }
.grille { display: grid; gap: 16px; }
.deux-colonnes { grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr); align-items: start; }

/* Chiffres clés */
.stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; margin-bottom: 24px; }
.stat { padding: 16px 20px; text-decoration: none; display: block; transition: border-color .15s; }
.stat:hover { border-color: var(--anneau); }
.stat span { color: var(--attenue-texte); font-weight: 500; font-size: 13px; }
.stat strong { display: block; font-size: 26px; font-weight: 600; letter-spacing: -0.02em; margin-top: 4px; font-variant-numeric: tabular-nums; }

/* Onglets */
.onglets { display: inline-flex; flex-wrap: wrap; gap: 2px; background: var(--attenue); padding: 3px; border-radius: 8px; margin-bottom: 16px; }
.onglets a { padding: 5px 10px; border-radius: 6px; text-decoration: none; color: var(--attenue-texte); font-weight: 500; font-size: 13px; white-space: nowrap; display: inline-flex; gap: 6px; align-items: center; }
.onglets a:hover { color: var(--texte); }
.onglets a.actif { background: var(--fond); color: var(--texte); box-shadow: 0 1px 2px rgb(0 0 0 / .08); }
.onglets em { font-style: normal; font-variant-numeric: tabular-nums; font-size: 12px; opacity: .7; }

/* Barre d'outils au-dessus du tableau */
.outils { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.outils select { width: auto; min-width: 180px; }
.outils input[type=search] { flex: 1 1 220px; width: auto; }

/* Tableaux */
.tableau { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 16px; border-bottom: 1px solid var(--bord); vertical-align: middle; }
th { font-size: 13px; color: var(--attenue-texte); font-weight: 500; white-space: nowrap; height: 40px; }
tbody tr { transition: background .1s; }
tbody tr:hover { background: color-mix(in srgb, var(--attenue) 50%, transparent); }
tbody tr:last-child td { border-bottom: 0; }
td a { text-decoration: none; }
td a:hover { text-decoration: underline; }
.nom { font-weight: 500; }
.discret { color: var(--attenue-texte); font-size: 13px; }
.tronque { max-width: 360px; }
.lien-site { display: inline-flex; gap: 4px; align-items: center; color: var(--attenue-texte); }

/* Badges */
.badge { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 500; white-space: nowrap; border: 1px solid transparent; background: var(--attenue); color: var(--texte); }
.badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .7; }
.badge-nouveau, .badge-client { background: color-mix(in srgb, var(--succes) 14%, transparent); color: var(--succes); }
.badge-a_verifier { background: color-mix(in srgb, var(--attention) 16%, transparent); color: var(--attention); }
.badge-a_ecrire { background: color-mix(in srgb, #0ea5e9 14%, transparent); color: #0284c7; }
.badge-a_enrichir { background: color-mix(in srgb, #8b5cf6 14%, transparent); color: #7c3aed; }
.badge-sans_email { color: var(--attenue-texte); }
.consigne { display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 10px 12px; border-radius: var(--rayon); background: var(--attenue); font-size: 13px; }
.consigne .icone { margin-top: 3px; color: var(--attenue-texte); }
.trouver-email { display: grid; gap: 10px; padding: 14px; border: 1px dashed var(--champ); border-radius: var(--rayon); }
.liens-recherche { display: flex; flex-wrap: wrap; gap: 6px; }
.ligne-email { display: flex; gap: 8px; }
.ligne-email input { flex: 1; min-width: 0; }
.trouver-email p { margin: 0; }
.motifs { display: flex; flex-wrap: wrap; gap: 6px; margin: -8px 0 16px; }
.motifs a { border: 1px solid var(--bord); border-radius: 999px; padding: 4px 10px; font-size: 12px; color: var(--attenue-texte); text-decoration: none; }
.motifs a.actif { background: var(--texte); color: var(--fond); border-color: var(--texte); }
.motifs em { font-style: normal; opacity: .7; margin-left: 4px; }
.badge-en_campagne { background: color-mix(in srgb, #3b82f6 14%, transparent); color: #3b82f6; }
.badge-a_repondu, .badge-maquette { background: color-mix(in srgb, #8b5cf6 14%, transparent); color: #8b5cf6; }
.badge-desinscrit { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
.badge-plus_tard, .badge-hors_cible, .badge-pas_interesse { color: var(--attenue-texte); }
.badge-a_analyser { color: var(--attenue-texte); }
.badge-a_analyser::before { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .2; } }

/* Alertes */
.alerte { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid var(--bord); border-radius: var(--rayon); margin-bottom: 16px; background: var(--carte); }
.alerte p { margin: 0; flex: 1 1 260px; }
.alerte.danger { border-color: color-mix(in srgb, var(--danger) 40%, transparent); color: var(--danger); }
.alerte.attention { border-color: color-mix(in srgb, var(--attention) 40%, transparent); }
.alerte.succes { border-color: color-mix(in srgb, var(--succes) 40%, transparent); color: var(--succes); }
.erreur { color: var(--danger); }

/* Fiche */
dl { display: grid; grid-template-columns: 160px 1fr; gap: 0; margin: 0; }
dt, dd { padding: 10px 0; border-bottom: 1px solid var(--bord); margin: 0; }
dt { color: var(--attenue-texte); }
dd { overflow-wrap: anywhere; }
dl > :nth-last-child(-n+2) { border-bottom: 0; }
.avec-icone { display: inline-flex; align-items: center; gap: 6px; }
.constat { font-size: 15px; padding: 12px 14px; background: var(--attenue); border-radius: var(--rayon); margin: 0; }
.statuts { display: flex; flex-wrap: wrap; gap: 6px; }
.statuts button { height: 30px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--champ); background: var(--fond); color: var(--texte); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
.statuts button:hover { background: var(--attenue); }
.statuts button.actif { background: var(--primaire); color: var(--primaire-texte); border-color: var(--primaire); }
.puces { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.puces li { font: 12px/1 "Geist Mono", ui-monospace, monospace; background: var(--attenue); padding: 4px 8px; border-radius: 4px; }

/* Activité et journal */
.etat-tache { display: flex; align-items: center; gap: 8px; font-weight: 500; margin: 0; }
.voyant { width: 8px; height: 8px; border-radius: 50%; background: var(--succes); box-shadow: 0 0 0 3px color-mix(in srgb, var(--succes) 20%, transparent); }
.voyant.arret { background: var(--danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 20%, transparent); }
.voyant.inactif { background: var(--attenue-texte); box-shadow: none; }
.journal { list-style: none; margin: 0; padding: 0; max-height: 420px; overflow-y: auto; font-size: 13px; }
.journal li { display: grid; grid-template-columns: 68px 1fr; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--bord); }
.journal li:last-child { border-bottom: 0; }
.journal time { color: var(--attenue-texte); font: 12px/1.6 "Geist Mono", ui-monospace, monospace; }
.journal-succes { color: var(--succes); }
.journal-erreur { color: var(--danger); }
.progression { display: flex; align-items: center; gap: 10px; min-width: 200px; }
.progression .piste { flex: 1; height: 6px; border-radius: 999px; background: var(--attenue); overflow: hidden; }
.progression .piste i { display: block; height: 100%; background: var(--primaire); border-radius: 999px; }

.pagination { display: flex; gap: 8px; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid var(--bord); color: var(--attenue-texte); }
.vide { text-align: center; padding: 48px 24px; color: var(--attenue-texte); }
.vide strong { display: block; color: var(--texte); font-size: 15px; margin-bottom: 4px; }
.formulaire { display: grid; gap: 18px; }
.formulaire .ligne { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

input.court { width: 72px; }
table.compact td, table.compact th { padding-top: 6px; padding-bottom: 6px; }
.actions-ligne { text-align: right; white-space: nowrap; }
.actions-ligne .btn + .btn { margin-left: 6px; }
.couverture { display: flex; flex-wrap: wrap; gap: 6px; }
.verdict { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 12px; font-weight: 500; margin-top: 4px; background: var(--attenue); color: var(--attenue-texte); }
.verdict-faible { background: color-mix(in srgb, var(--succes) 14%, transparent); color: var(--succes); }
.verdict-moyen { background: color-mix(in srgb, var(--attention) 14%, transparent); color: var(--attention); }
.verdict-bon, .verdict-hors_cible { background: var(--attenue); color: var(--attenue-texte); }
.avis ul { margin: 8px 0 0; padding-left: 18px; color: var(--attenue-texte); }
.avis li { margin: 2px 0; }
.priorite { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 22px; padding: 0 6px; border-radius: 6px; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; background: var(--attenue); color: var(--attenue-texte); }
.priorite-haute { background: color-mix(in srgb, var(--succes) 16%, transparent); color: var(--succes); }
.priorite-moyenne { background: color-mix(in srgb, var(--attention) 14%, transparent); color: var(--attention); }
.case-ligne { width: 32px; padding-right: 0 !important; }
.case-ligne input { width: 16px; height: 16px; accent-color: var(--primaire); }
.barre-lot { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--bord); }
.barre-lot span { margin-right: auto; }
.barre-lot select { width: auto; }
.traiter { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 16px; align-items: start; }
.actions-traiter { display: flex; flex-wrap: wrap; gap: 8px; }
.actions-traiter kbd { margin-left: 8px; font: 11px "Geist Mono", ui-monospace, monospace; opacity: .6; border: 1px solid currentColor; border-radius: 4px; padding: 0 4px; }
.apercu { position: sticky; top: 16px; border: 1px solid var(--bord); border-radius: calc(var(--rayon) + 4px); overflow: hidden; background: var(--carte); }
.apercu-barre { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--bord); background: var(--attenue); font-size: 13px; }
.apercu-barre span { flex: 1; min-width: 0; }
.apercu iframe { display: block; width: 100%; height: 72vh; border: 0; background: #fff; }
.apercu > p { margin: 0; padding: 8px 12px; font-size: 12px; border-top: 1px solid var(--bord); }
.apercu.vide { padding: 48px 24px; }
.gros { font-size: 16px; font-weight: 600; }
/* Tableau de bord */
.surtitre { margin: 0 0 2px !important; font-size: 13px; font-weight: 500; }
.pastille { display: inline-flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 13px; color: var(--attenue-texte); }
a.pastille { margin-left: 16px; text-decoration: none; }
a.pastille:hover { color: var(--texte); }
.recherche-globale { position: relative; display: flex; align-items: center; flex: 0 1 340px; }
.recherche-globale > .icone { position: absolute; left: 12px; color: var(--attenue-texte); pointer-events: none; }
.recherche-globale input { padding-left: 36px; padding-right: 40px; }
.recherche-globale kbd { position: absolute; right: 10px; }
kbd { font: 11px/1.6 "Geist Mono", ui-monospace, monospace; color: var(--attenue-texte); border: 1px solid var(--bord); border-radius: 4px; padding: 0 5px; background: var(--attenue); }
.a-faire-grille { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
.a-faire { padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; transition: border-color .15s, transform .15s; }
.a-faire:hover { border-color: var(--anneau); }
.a-faire.vide { background: transparent; box-shadow: none; }
.a-faire.vide .a-faire-chiffre strong { color: var(--attenue-texte); }
.a-faire p { margin: 0; color: var(--attenue-texte); font-size: 13px; flex: 1; }
.a-faire-icone { width: 36px; height: 36px; border-radius: 8px; display: grid; place-items: center; background: var(--attenue); }
.a-faire-nouveau { color: var(--succes); background: color-mix(in srgb, var(--succes) 12%, transparent); }
.a-faire-a_ecrire { color: #0284c7; background: color-mix(in srgb, #0ea5e9 12%, transparent); }
.a-faire-a_enrichir { color: #7c3aed; background: color-mix(in srgb, #8b5cf6 12%, transparent); }
.a-faire-a_verifier { color: var(--attention); background: color-mix(in srgb, var(--attention) 12%, transparent); }
.a-faire-chiffre strong { display: block; font-size: 32px; font-weight: 600; letter-spacing: -0.03em; line-height: 1.1; font-variant-numeric: tabular-nums; }
.a-faire-chiffre span { font-weight: 500; }
.a-faire-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 32px; }
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
th.chiffre, td.chiffre { text-align: right; font-variant-numeric: tabular-nums; }
.couverture { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--attenue-texte); font-variant-numeric: tabular-nums; }
.couverture .piste { width: 80px; height: 6px; border-radius: 999px; background: var(--attenue); overflow: hidden; }
.couverture .piste i { display: block; height: 100%; background: var(--graphe); border-radius: 999px; }

/* Notification après une action */
.toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; display: flex; align-items: center; gap: 10px; max-width: min(420px, calc(100vw - 32px)); padding: 12px 16px; border-radius: var(--rayon); border: 1px solid var(--bord); background: var(--carte); color: var(--texte); box-shadow: 0 10px 30px rgb(0 0 0 / .12); font-weight: 500; animation: toast-entree .25s ease-out; transition: opacity .3s, transform .3s; }
.toast .icone { color: var(--succes); }
.toast.parti { opacity: 0; transform: translateY(8px); }
@keyframes toast-entree { from { opacity: 0; transform: translateY(8px); } }

@media (max-width: 1000px) {
  .a-faire-grille { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tableau-de-bord { grid-template-columns: minmax(0, 1fr); }
  .traiter { grid-template-columns: minmax(0, 1fr); }
  .apercu { position: static; }
  .deux-colonnes { grid-template-columns: 1fr; }
  .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .a-faire-grille { grid-template-columns: minmax(0, 1fr); }
  .recherche-globale { flex: 1 1 100%; }
  .app { grid-template-columns: minmax(0, 1fr); }
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .contenu, .carte, .stat { min-width: 0; }
  .outils { flex-wrap: wrap; }
  .outils > * { min-width: 0; }
  .barre { position: static; height: auto; flex-direction: row; align-items: center; border-right: 0; border-bottom: 1px solid var(--bord); padding: 10px 16px; }
  .marque { padding: 0; margin-right: auto; }
  .marque span, .nav-titre { display: none; }
  .barre { flex-wrap: wrap; row-gap: 8px; }
  .nav { display: flex; gap: 4px; width: 100%; overflow-x: auto; }
  .nav a { white-space: nowrap; flex: none; }
  .contenu { padding: 20px 16px 48px; }
  dl { grid-template-columns: 1fr; }
  dt { border-bottom: 0; padding-bottom: 0; }
  .formulaire .ligne { grid-template-columns: 1fr; }
  .outils select { flex: 1 1 140px; min-width: 0; }
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
