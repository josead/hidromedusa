// ──── Auth (Google / Apple / Instagram OAuth) ──────────────────────────────────

const AUTH_PROVIDERS = {
  google: {
    name: 'Google',
    color: '#4285f4',
    scopes: 'openid email profile',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: window.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID',
  },
  apple: {
    name: 'Apple',
    authUrl: 'https://appleid.apple.com/auth/authorize',
    clientId: window.APPLE_CLIENT_ID || 'YOUR_APPLE_CLIENT_ID',
  },
  instagram: {
    name: 'Instagram',
    authUrl: 'https://api.instagram.com/oauth/authorize',
    clientId: window.INSTAGRAM_CLIENT_ID || 'YOUR_INSTAGRAM_CLIENT_ID',
  }
};

const REDIRECT_URI = `${location.origin}/auth/callback.html`;

function authWith(provider) {
  closeModal('modal-auth');

  // Dev mode: simulate login
  if (!window.GOOGLE_CLIENT_ID || window.GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
    simulateAuth(provider);
    return;
  }

  const p = AUTH_PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: p.scopes || 'openid email',
    state: provider,
  });

  const popup = window.open(
    `${p.authUrl}?${params}`,
    'hidromedusa-auth',
    'width=500,height=650,scrollbars=yes'
  );

  // Listen for message from OAuth popup
  const handler = (e) => {
    if (e.origin !== location.origin) return;
    if (e.data?.type !== 'auth-success') return;
    window.removeEventListener('message', handler);
    popup?.close();
    handleAuthCallback(e.data.user);
  };
  window.addEventListener('message', handler);
}

function simulateAuth(provider) {
  const fakeUsers = {
    google: { id: 'g-123', name: 'Flasher Demo', email: 'demo@gmail.com', avatar: null, provider: 'google', rank: 'medusa', token: 'fake-token' },
    apple: { id: 'a-456', name: 'Abyssal User', email: 'demo@icloud.com', avatar: null, provider: 'apple', rank: 'plancton', token: 'fake-token' },
    instagram: { id: 'ig-789', name: 'Tentacle Kid', email: null, avatar: null, provider: 'instagram', rank: 'plancton', token: 'fake-token' },
  };
  const user = fakeUsers[provider];
  showToast(`Simulando login con ${AUTH_PROVIDERS[provider].name}... 🔐`);
  setTimeout(() => handleAuthCallback(user), 800);
}

function handleAuthCallback(user) {
  State.login(user);
  navigate('perfil');
  // Ask for notifications after successful login
  setTimeout(() => {
    if (Notification.permission === 'default') openModal('modal-notif');
  }, 1500);
}

// Handle OAuth callback (called from callback.html)
if (location.pathname.includes('/auth/callback')) {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (code && window.opener) {
    // Exchange code with backend lambda
    fetch('/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, provider: state, redirect_uri: REDIRECT_URI })
    })
      .then(r => r.json())
      .then(user => window.opener.postMessage({ type: 'auth-success', user }, location.origin))
      .catch(() => window.opener.postMessage({ type: 'auth-error' }, location.origin))
      .finally(() => window.close());
  }
}
