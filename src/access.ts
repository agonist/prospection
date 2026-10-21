// Vérifie le jeton que Cloudflare Access ajoute à chaque requête autorisée.
// Sans lui, n'importe qui connaissant l'URL du Worker pourrait lire la base.

type Cle = JsonWebKey & { kid: string };

let cache: { cles: Cle[]; expire: number } | undefined;

async function cles(equipe: string): Promise<Cle[]> {
  if (cache && cache.expire > Date.now()) return cache.cles;
  const reponse = await fetch(`https://${equipe}/cdn-cgi/access/certs`);
  if (!reponse.ok) throw new Error(`Certificats Access introuvables (${reponse.status})`);
  const { keys } = (await reponse.json()) as { keys: Cle[] };
  cache = { cles: keys, expire: Date.now() + 60 * 60 * 1000 };
  return keys;
}

function base64url(texte: string): Uint8Array {
  const base64 = texte.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

// Renvoie l'email de la personne connectée, ou null si le jeton est absent ou invalide.
export async function utilisateur(requete: Request, env: Env): Promise<string | null> {
  if (String(env.ACCESS_DESACTIVE) === '1') return 'local';
  const equipe = String(env.ACCESS_EQUIPE);
  const audience = String(env.ACCESS_AUD);
  if (!equipe || !audience) return null;

  const jeton = requete.headers.get('cf-access-jwt-assertion');
  if (!jeton) return null;
  const [entete, contenu, signature] = jeton.split('.');
  if (!entete || !contenu || !signature) return null;

  try {
    const { kid, alg } = JSON.parse(new TextDecoder().decode(base64url(entete)));
    if (alg !== 'RS256') return null;
    const jwk = (await cles(equipe)).find((cle) => cle.kid === kid);
    if (!jwk) return null;
    const cle = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valide = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cle, base64url(signature), new TextEncoder().encode(`${entete}.${contenu}`));
    if (!valide) return null;

    const donnees = JSON.parse(new TextDecoder().decode(base64url(contenu)));
    const audiences = Array.isArray(donnees.aud) ? donnees.aud : [donnees.aud];
    if (!audiences.includes(audience)) return null;
    if (typeof donnees.exp !== 'number' || donnees.exp * 1000 < Date.now()) return null;
    if (`https://${equipe}` !== donnees.iss) return null;
    return donnees.email ?? null;
  } catch {
    return null;
  }
}
