export function echapper(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLE = `
:root {
  --fond: #faf9f6; --surface: #ffffff; --texte: #1d1c1a; --discret: #6b675f; --ligne: #e6e2da;
  --accent: #2f5d50; --accent-texte: #ffffff; --alerte: #fdf3e1; --alerte-bord: #e3b766;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fond: #161614; --surface: #1f1e1b; --texte: #ecebe7; --discret: #a29e95; --ligne: #34322d;
    --accent: #7fb8a6; --accent-texte: #10201b; --alerte: #2e2617; --alerte-bord: #8a6b2f;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--fond); color: var(--texte); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1280px; margin: 0 auto; padding: 24px 16px 64px; }
a { color: var(--accent); }
h1 { font-size: 24px; margin: 0; display: flex; align-items: center; gap: 16px; }
.bouton { font-size: 14px; font-weight: 500; text-decoration: none; background: var(--accent); color: var(--accent-texte); border-radius: 6px; padding: 6px 12px; }
.activite { background: var(--surface); border: 1px solid var(--ligne); border-radius: 8px; padding: 4px 16px 12px; margin-bottom: 24px; }
.activite p { margin: 8px 0; }
.erreur { color: #b3261e; }
@media (prefers-color-scheme: dark) { .erreur { color: #f2b8b5; } }
.journal { list-style: none; margin: 8px 0 0; padding: 0; max-height: 320px; overflow-y: auto; font-size: 13px; border-top: 1px solid var(--ligne); }
.journal li { padding: 4px 0; border-bottom: 1px solid var(--ligne); }
.journal time { color: var(--discret); font-variant-numeric: tabular-nums; margin-right: 8px; }
.journal-succes { color: var(--accent); }
.journal-erreur { color: #b3261e; }
@media (prefers-color-scheme: dark) { .journal-erreur { color: #f2b8b5; } }
progress { vertical-align: middle; width: 100px; accent-color: var(--accent); }
.recherche { display: grid; gap: 12px; max-width: 560px; }
.recherche label { display: grid; gap: 4px; font-weight: 500; }
.recherche input, .recherche select { font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--ligne); border-radius: 6px; padding: 6px 10px; }
.recherche p { margin: 0; }
.recherche button { justify-self: start; }
h2 { font-size: 15px; margin: 24px 0 8px; }
code { font-size: 13px; }
.entete { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.filtres { display: flex; flex-wrap: wrap; gap: 8px; }
.filtres select, .filtres input { flex: 1 1 160px; min-width: 0; }
select, input[type=search], textarea, button { font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--ligne); border-radius: 6px; padding: 6px 10px; }
textarea { width: 100%; }
button { cursor: pointer; }
button[type=submit]:not([name=statut]), button.principal, .statuts button.actif { background: var(--accent); color: var(--accent-texte); border-color: var(--accent); }
.onglets { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--ligne); margin-bottom: 16px; }
.onglets a { padding: 8px 12px; white-space: nowrap; text-decoration: none; color: var(--discret); border-bottom: 2px solid transparent; }
.onglets a.actif { color: var(--texte); border-bottom-color: var(--accent); }
.onglets span { font-variant-numeric: tabular-nums; opacity: .7; }
.export, .alerte { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid var(--ligne); background: var(--surface); border-radius: 8px; margin-bottom: 16px; }
.alerte { background: var(--alerte); border-color: var(--alerte-bord); }
.export p, .alerte p { margin: 0; flex: 1 1 260px; }
table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--ligne); border-radius: 8px; overflow: hidden; display: block; overflow-x: auto; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--ligne); vertical-align: top; }
th { font-size: 13px; color: var(--discret); font-weight: 500; white-space: nowrap; }
td a { text-decoration: none; }
.discret { color: var(--discret); font-size: 13px; }
.badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; white-space: nowrap; border: 1px solid var(--ligne); }
.badge-nouveau, .badge-a_repondu, .badge-maquette, .badge-client { border-color: var(--accent); color: var(--accent); }
.badge-a_verifier { border-color: var(--alerte-bord); }
.badge-hors_cible, .badge-desinscrit, .badge-pas_interesse { color: var(--discret); }
.pagination { display: flex; gap: 16px; justify-content: center; margin-top: 16px; }
.vide { color: var(--discret); padding: 32px 0; }
.succes { color: var(--accent); }
.fiche { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 32px; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; }
dt { color: var(--discret); }
dd { margin: 0; overflow-wrap: anywhere; }
.signaux { margin: 0; padding-left: 18px; }
.statuts { display: flex; flex-wrap: wrap; gap: 6px; }
.actions > button { margin-top: 8px; }
@media (max-width: 760px) { .fiche { grid-template-columns: 1fr; } dl { grid-template-columns: 1fr; } dt { margin-top: 8px; } }
`;

export function page(titre: string, contenu: string): Response {
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${echapper(titre)} · Prospection</title><style>${STYLE}</style></head><body><main>${contenu}</main></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}
