// ──── Tickets & Mercado Pago ──────────────────────────────────────────────────

const TICKET_TYPES = [
  {
    id: 'general',
    name: 'General',
    emoji: '🎫',
    price: 3500,
    description: 'Acceso al evento. Sumate a la corriente.',
    perks: ['Acceso general', 'Barra habilitada', 'Área de baile'],
    color: 'from-ocean-600 to-ocean-800',
    highlight: false,
  },
  {
    id: 'flashero',
    name: 'Flashero',
    emoji: '🪼',
    price: 6000,
    description: 'Nivel intermedio. Más swag, más flow.',
    perks: ['Acceso general', 'Área VIP', '1 consumición incluida', 'Wristband especial'],
    color: 'from-jelly-700 to-jelly-900',
    highlight: true,
  },
  {
    id: 'abismal',
    name: 'Abismal',
    emoji: '🌑',
    price: 10000,
    description: 'El nivel más profundo del universo.',
    perks: ['Acceso VIP total', 'Meet & greet artistas', '3 consumiciones', 'Merch exclusivo', 'Early access'],
    color: 'from-yellow-900 to-jelly-900',
    highlight: false,
  }
];

let selectedTicket = null;

function renderTickets() {
  const grid = document.getElementById('tickets-grid');
  if (!grid) return;

  grid.innerHTML = TICKET_TYPES.map(t => `
    <div class="ticket-card p-6 flex flex-col gap-4 cursor-pointer transition-all duration-300 ${t.highlight ? 'ring-1 ring-cyan-400/30' : ''}"
         onclick="selectTicket('${t.id}')" id="ticket-${t.id}">
      ${t.highlight ? '<div class="absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-mono font-medium bg-cyan-500/20 border border-cyan-500/30 text-cyan-400">Popular</div>' : ''}
      <div class="flex items-start justify-between gap-2">
        <div>
          <span class="text-3xl">${t.emoji}</span>
          <h3 class="font-display font-bold text-xl text-white mt-2">${t.name}</h3>
          <p class="text-white/50 text-sm mt-1">${t.description}</p>
        </div>
        <div class="text-right flex-shrink-0">
          <p class="font-display font-bold text-2xl text-white">$${t.price.toLocaleString('es-AR')}</p>
          <p class="text-white/30 text-xs font-mono">ARS</p>
        </div>
      </div>
      <div class="divider"></div>
      <ul class="space-y-2">
        ${t.perks.map(p => `
          <li class="flex items-center gap-2 text-sm text-white/60">
            <span class="text-cyan-400 text-xs">✓</span>${p}
          </li>
        `).join('')}
      </ul>
      <button class="btn-primary w-full py-3 rounded-xl text-white font-display font-semibold text-sm mt-2">
        Comprar ${t.name}
      </button>
    </div>
  `).join('');
}

function selectTicket(id) {
  selectedTicket = TICKET_TYPES.find(t => t.id === id);
  if (!selectedTicket) return;

  if (!State.user) {
    openModal('modal-auth');
    showToast('Primero iniciá sesión para comprar 🔐');
    return;
  }

  const section = document.getElementById('payment-section');
  const details = document.getElementById('payment-details');
  if (!section || !details) return;

  section.classList.remove('hidden');
  details.innerHTML = `
    <div class="glass rounded-xl p-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-2xl">${selectedTicket.emoji}</span>
        <div>
          <p class="font-display font-semibold text-white">${selectedTicket.name}</p>
          <p class="text-white/40 text-xs">${selectedTicket.description}</p>
        </div>
      </div>
      <p class="font-display font-bold text-xl text-cyan-400">$${selectedTicket.price.toLocaleString('es-AR')}</p>
    </div>
    <div class="space-y-3">
      <input class="input-field" placeholder="Nombre completo" id="buyer-name" value="${State.user?.name || ''}" />
      <input class="input-field" placeholder="Email" id="buyer-email" type="email" value="${State.user?.email || ''}" />
    </div>
  `;

  section.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Mercado Pago integration (calls backend lambda)
async function initMercadoPago() {
  if (!selectedTicket) return;
  const name = document.getElementById('buyer-name')?.value;
  const email = document.getElementById('buyer-email')?.value;
  if (!name || !email) { showToast('Completá tus datos primero'); return; }

  showToast('Conectando con Mercado Pago... 🟢');

  try {
    const resp = await apiCall('/mercadopago/create-preference', {
      method: 'POST',
      body: { ticket: selectedTicket.id, price: selectedTicket.price, buyer: { name, email } }
    });

    if (resp?.init_point) {
      window.open(resp.init_point, '_blank');
    } else {
      // Dev fallback — simulate success
      simulatePaymentSuccess();
    }
  } catch {
    // Dev mode: simulate
    simulatePaymentSuccess();
  }
}

function simulatePaymentSuccess() {
  if (!selectedTicket || !State.user) return;
  const ticket = {
    id: `HM-${Date.now()}`,
    event: 'Próxima Tocada — Hidromedusa',
    type: selectedTicket.name,
    date: '2026-07-11',
    price: selectedTicket.price,
  };
  State.tickets.push(ticket);
  State.save();
  document.getElementById('payment-section')?.classList.add('hidden');
  selectedTicket = null;
  showToast(`¡Entrada ${ticket.type} confirmada! 🎫 ID: ${ticket.id}`);
  setTimeout(() => navigate('perfil'), 2000);
}

function showQR() {
  const display = document.getElementById('qr-display');
  if (!display) return;
  display.style.display = 'flex';
  drawQR();
}

function drawQR() {
  const canvas = document.getElementById('qr-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = 200;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, size, size);

  // Draw a simple QR-like pattern (placeholder — real QR via library in prod)
  ctx.fillStyle = '#1a0533';
  const modules = 25;
  const cellSize = Math.floor((size - 20) / modules);
  const offset = 10;

  // Generate deterministic pattern
  const pattern = [];
  let seed = 42;
  for (let i = 0; i < modules * modules; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    pattern.push(seed % 2);
  }

  // Finder patterns (corners)
  const drawFinder = (x, y) => {
    ctx.fillStyle = '#1a0533';
    ctx.fillRect(x, y, 7*cellSize, 7*cellSize);
    ctx.fillStyle = 'white';
    ctx.fillRect(x+cellSize, y+cellSize, 5*cellSize, 5*cellSize);
    ctx.fillStyle = '#1a0533';
    ctx.fillRect(x+2*cellSize, y+2*cellSize, 3*cellSize, 3*cellSize);
  };
  drawFinder(offset, offset);
  drawFinder(offset + (modules-7)*cellSize, offset);
  drawFinder(offset, offset + (modules-7)*cellSize);

  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if ((r < 8 && c < 8) || (r < 8 && c >= modules-8) || (r >= modules-8 && c < 8)) continue;
      if (pattern[r * modules + c]) {
        ctx.fillStyle = '#1a0533';
        ctx.fillRect(offset + c*cellSize, offset + r*cellSize, cellSize-1, cellSize-1);
      }
    }
  }

  // CBU overlay text
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(30, 85, 140, 30);
  ctx.fillStyle = 'white';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Hidromedusa - MP QR', 100, 98);
  ctx.fillText('$' + (selectedTicket?.price?.toLocaleString('es-AR') || '0'), 100, 110);
}

// ──── Membership ranks ────────────────────────────────────────────────────────
const RANKS = [
  {
    id: 'plancton',
    name: 'Plancton',
    emoji: '🦠',
    price: 0,
    period: 'Gratis',
    description: 'El primer nivel. Entraste al agua.',
    perks: ['Acceso a la plataforma', 'Notificaciones de eventos', 'Comunidad Discord'],
    cls: 'plancton',
  },
  {
    id: 'medusa',
    name: 'Medusa',
    emoji: '🪼',
    price: 1500,
    period: '/mes',
    description: 'Ya empezaste a flotar.',
    perks: ['Todo Plancton', 'Descuento 10% en entradas', 'Acceso early sale', 'Wristband mensual'],
    cls: 'medusa',
    popular: true,
  },
  {
    id: 'kraken',
    name: 'Kraken',
    emoji: '🐙',
    price: 3500,
    period: '/mes',
    description: 'La corriente te lleva.',
    perks: ['Todo Medusa', 'Descuento 25% entradas', 'Área VIP siempre', '2 entradas/mes incluidas'],
    cls: 'kraken',
  },
  {
    id: 'abismal',
    name: 'Abismal',
    emoji: '🌑',
    price: 8000,
    period: '/mes',
    description: 'El nivel más profundo. Máximo swag.',
    perks: ['Todo Kraken', 'Entradas ilimitadas', 'Meet & greet artistas', 'Merch exclusivo', 'Nombre en créditos'],
    cls: 'abismal',
  }
];

function renderRanks() {
  const grid = document.getElementById('ranks-grid');
  if (!grid) return;
  grid.innerHTML = RANKS.map(r => `
    <div class="glass rounded-2xl p-6 flex flex-col gap-4 ${r.popular ? 'ring-1 ring-purple-400/40' : ''} hover:border-${r.cls === 'abismal' ? 'yellow' : 'cyan'}-400/30 transition-all duration-300">
      ${r.popular ? '<div class="text-center -mt-2 mb-1"><span class="px-3 py-1 rounded-full text-xs font-mono bg-purple-500/20 border border-purple-400/30 text-purple-300">Más popular</span></div>' : ''}
      <div class="text-center">
        <span class="text-5xl">${r.emoji}</span>
        <h3 class="font-display font-bold text-xl text-white mt-3">${r.name}</h3>
        <p class="text-white/40 text-sm mt-1">${r.description}</p>
        <div class="mt-3">
          <span class="font-display font-bold text-3xl text-white">${r.price === 0 ? 'Gratis' : '$'+r.price.toLocaleString('es-AR')}</span>
          ${r.price > 0 ? `<span class="text-white/40 text-sm font-mono">${r.period}</span>` : ''}
        </div>
      </div>
      <div class="divider"></div>
      <ul class="space-y-2 flex-1">
        ${r.perks.map(p => `<li class="flex items-center gap-2 text-sm text-white/60"><span class="rank-${r.cls} text-xs rounded px-1">✓</span>${p}</li>`).join('')}
      </ul>
      <button onclick="${r.price === 0 ? `openModal('modal-auth')` : `subscribePlan('${r.id}')`}" class="btn-${r.popular ? 'primary' : 'ghost'} w-full py-3 rounded-xl font-display font-semibold text-sm ${r.popular ? 'text-white' : ''}">
        ${r.price === 0 ? 'Crear cuenta' : `Suscribirse — $${r.price.toLocaleString('es-AR')}/mes`}
      </button>
    </div>
  `).join('');
}

function subscribePlan(planId) {
  if (!State.user) { openModal('modal-auth'); return; }
  showToast(`Suscripción a ${planId} — Conectando con MP... 🟢`);
  // In production: call /mercadopago/subscription lambda
  setTimeout(() => {
    State.user.rank = planId;
    State.save();
    showToast(`¡Bienvenide al nivel ${planId.charAt(0).toUpperCase()+planId.slice(1)}! ${getRankInfo(planId).emoji}`);
  }, 1500);
}

// ──── API helper ──────────────────────────────────────────────────────────────
async function apiCall(path, opts = {}) {
  const base = window.API_BASE || 'https://api.hidromedusa.com';
  const res = await fetch(base + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(State.user?.token ? { Authorization: `Bearer ${State.user.token}` } : {}) },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {})
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

// ──── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderTickets();
  renderRanks();
});
