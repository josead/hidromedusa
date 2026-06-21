// MetaCall Lambda — Auth: OAuth code exchange
// Endpoints:
//   POST /auth/exchange  { code, provider, redirect_uri }  → { user }
//   GET  /auth/me        headers: { Authorization: Bearer <token> } → { user }

const store = require('../lib/store');

const PROVIDERS = {
  google: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  apple: {
    tokenUrl: 'https://appleid.apple.com/auth/token',
    clientId: process.env.APPLE_CLIENT_ID,
    clientSecret: process.env.APPLE_CLIENT_SECRET,
  },
  instagram: {
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    userUrl: 'https://graph.instagram.com/me?fields=id,username',
    clientId: process.env.INSTAGRAM_CLIENT_ID,
    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
  },
};

// Sessions persisted in DynamoDB (hm_sessions) via the shared store.
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

async function exchange(req) {
  const { code, provider, redirect_uri } = req.body || {};
  if (!code || !provider) return { status: 400, body: { error: 'Missing code or provider' } };

  const p = PROVIDERS[provider];
  if (!p) return { status: 400, body: { error: 'Unknown provider' } };

  try {
    // Exchange code for access token
    const tokenRes = await fetch(p.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: p.clientId,
        client_secret: p.clientSecret,
        redirect_uri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token && !tokenData.id_token) {
      return { status: 401, body: { error: 'Token exchange failed', detail: tokenData } };
    }

    // Fetch user profile
    let user = {};
    if (p.userUrl) {
      const userRes = await fetch(p.userUrl, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      user = await userRes.json();
    } else if (tokenData.id_token) {
      // Apple JWT decode (simplified)
      const payload = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64').toString());
      user = { id: payload.sub, email: payload.email, name: payload.name };
    }

    const sessionToken = generateToken();
    const session = {
      token: sessionToken,
      id: user.id || user.sub,
      name: user.name || user.username || user.email?.split('@')[0] || 'Flasher',
      email: user.email || null,
      avatar: user.picture || null,
      provider,
      rank: 'plancton',
      // Epoch seconds, for future DynamoDB TTL (hm_sessions TTL attr `expiresAt`).
      expiresAt: Math.floor(Date.now() / 1000) + THIRTY_DAYS_SECONDS,
    };

    try {
      const stored = await store.sessions.put(session);
      return { status: 200, body: stored };
    } catch (storeErr) {
      return { status: 500, body: { error: storeErr.message } };
    }
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

async function me(req) {
  const token = req.headers?.authorization?.replace('Bearer ', '');
  if (!token) return { status: 401, body: { error: 'No token' } };

  let session;
  try {
    session = await store.sessions.get(token);
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
  if (!session) return { status: 401, body: { error: 'Invalid session' } };

  // Reject expired sessions; best-effort cleanup of the stale record.
  if (session.expiresAt && session.expiresAt < Math.floor(Date.now() / 1000)) {
    try { await store.sessions.del(token); } catch (_) { /* best-effort */ }
    return { status: 401, body: { error: 'Invalid session' } };
  }

  return { status: 200, body: session };
}

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

module.exports = { exchange, me };
