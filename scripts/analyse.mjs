// Visite le site d'un prospect pour trouver une adresse email et un constat.
// Utilisé par le Worker (tâche planifiée) et par les tests.
import { auditer, choisirConstat, choisirEmail, estPlateforme, extraireEmails, liensUtiles } from './lib.mjs';

const TIMEOUT_MS = 10_000;
const NAVIGATEUR = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

export async function telecharger(url) {
  try {
    const reponse = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': NAVIGATEUR, 'accept-language': 'fr-FR,fr;q=0.9' },
    });
    if (!reponse.ok) return null;
    const type = reponse.headers.get('content-type') ?? '';
    if (!type.includes('html')) return null;
    return { url: reponse.url, html: await reponse.text() };
  } catch {
    return null;
  }
}

// Au plus 4 requêtes par prospect : l'accueil et 3 pages contact ou mentions légales.
export async function analyser({ site, emails = [] }, cible) {
  const accueil = site && !estPlateforme(site) ? await telecharger(site) : null;
  const trouves = [...emails];
  if (accueil) {
    trouves.push(...extraireEmails(accueil.html));
    for (const lien of liensUtiles(accueil.html, accueil.url)) {
      const page = await telecharger(lien);
      if (page) trouves.push(...extraireEmails(page.html));
    }
  }
  const signaux = auditer({ site, urlFinale: accueil?.url, html: accueil?.html ?? null });
  return { signaux, constat: choisirConstat(signaux, cible), ...choisirEmail(trouves, site) };
}
