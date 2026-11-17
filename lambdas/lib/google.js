// Verifica el ID token de "Continuar con Google" (Google Identity Services) sin dependencias:
// firma RS256 contra las claves públicas de Google (JWKS) y los campos iss/aud/exp/iat.
// Devuelve { sub } (el id estable de la cuenta) o null si el token no sirve. No mira mail ni nombre.
//
// Exports:
//   verifyIdToken(token, clientId) -> Promise<{ sub } | null>

const crypto = require('crypto');

const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const SKEW = 60;              // segundos de tolerancia con el reloj de Google
const REFETCH = 5 * 60e3;     // un kid desconocido vuelve a bajar las claves, como mucho cada 5 min

// Las claves rotan cada tantos días; se cachean lo que diga el Cache-Control (el Lambda queda tibio).
let jwks = { keys: [], exp: 0, at: 0 };

async function loadKeys(force) {
  const now = Date.now();
  if (jwks.keys.length && (force ? now - jwks.at < REFETCH : now < jwks.exp)) return jwks.keys;
  const res = await fetch(CERTS);
  if (!res.ok) throw new Error(`Google certs: HTTP ${res.status}`);
  const { keys } = await res.json();
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  jwks = { keys: keys || [], exp: now + (maxAge ? +maxAge[1] : 3600) * 1000, at: now };
  return jwks.keys;
}

const b64json = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

async function verifyIdToken(token, clientId) {
  if (!clientId || typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let head, claims;
  try { head = b64json(parts[0]); claims = b64json(parts[1]); } catch (e) { return null; }
  if (!head || head.alg !== 'RS256' || !head.kid || !claims) return null;

  const find = (keys) => keys.find((k) => k.kid === head.kid);
  const jwk = find(await loadKeys(false)) || find(await loadKeys(true));
  if (!jwk) return null;
  let ok = false;
  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  } catch (e) { return null; }
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  if (!ISSUERS.includes(claims.iss) || claims.aud !== clientId) return null;
  if (!(claims.exp > now - SKEW) || !(claims.iat < now + SKEW)) return null;
  if (typeof claims.sub !== 'string' || !claims.sub) return null;
  return { sub: claims.sub };
}

module.exports = { verifyIdToken };
