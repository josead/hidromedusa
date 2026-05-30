// ──── Router / Navigation ────────────────────────────────────────────────────
const PAGES = ['home','entradas','membresia','quienes','calendario','perfil','staff','terminos','privacidad'];

function navigate(page) {
  PAGES.forEach(p => {
    const el = document.getElementById(`page-${p}`);
    if (el) el.classList.toggle('active', p === page);
  });
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === page);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  history.pushState({ page }, '', `#${page}`);
  if (page === 'staff') initStaff();
  if (page === 'perfil') renderProfile();
}

window.addEventListener('popstate', e => {
  navigate(e.state?.page || 'home');
});

// Handle initial hash
const hash = location.hash.replace('#', '') || 'home';
if (PAGES.includes(hash)) navigate(hash);

// ──── Modal helpers ──────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}
document.addEventListener('click', e => {
  document.querySelectorAll('.modal-overlay.open').forEach(m => {
    if (e.target === m) m.classList.remove('open');
  });
});

// ──── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  t.classList.remove('hidden');
  setTimeout(() => { t.style.display = 'none'; }, duration);
}

// ──── State ──────────────────────────────────────────────────────────────────
const State = {
  user: JSON.parse(localStorage.getItem('hm_user') || 'null'),
  tickets: JSON.parse(localStorage.getItem('hm_tickets') || '[]'),
  tasks: JSON.parse(localStorage.getItem('hm_tasks') || 'null'),

  save() {
    localStorage.setItem('hm_user', JSON.stringify(this.user));
    localStorage.setItem('hm_tickets', JSON.stringify(this.tickets));
    if (this.tasks) localStorage.setItem('hm_tasks', JSON.stringify(this.tasks));
  },

  login(user) {
    this.user = user;
    this.save();
    updateAuthUI();
    showToast(`¡Bienvenide al abismo, ${user.name}! 🪼`);
  },

  logout() {
    this.user = null;
    this.save();
    updateAuthUI();
    navigate('home');
    showToast('Hasta la próxima inmersión 🌊');
  }
};

function updateAuthUI() {
  const btn = document.getElementById('btn-login');
  const avatar = document.getElementById('user-avatar');
  if (State.user) {
    btn.style.display = 'none';
    avatar.textContent = State.user.name[0].toUpperCase();
    avatar.classList.remove('hidden');
    avatar.style.display = 'flex';
  } else {
    btn.style.display = 'inline-flex';
    avatar.style.display = 'none';
  }
}
updateAuthUI();

// ──── Notifications ──────────────────────────────────────────────────────────
function enableNotifications() {
  if ('Notification' in window) {
    Notification.requestPermission().then(p => {
      closeModal('modal-notif');
      if (p === 'granted') {
        showToast('¡Notificaciones activadas! Te avisamos antes de cada tocada 🔔');
        scheduleEventReminders();
      }
    });
  } else {
    closeModal('modal-notif');
    showToast('Tu navegador no soporta notificaciones nativas');
  }
}

function scheduleEventReminders() {
  const events = getUpcomingEvents();
  events.forEach(ev => {
    const ms = new Date(ev.date) - Date.now() - 86400000;
    if (ms > 0) setTimeout(() => {
      new Notification(`¡Mañana toca ${ev.artist}!`, {
        body: `${ev.venue} — ${ev.time}. ¡Preparate!`,
        icon: '/favicon.ico'
      });
    }, ms);
  });
}

// ──── Events data ─────────────────────────────────────────────────────────────
function getUpcomingEvents() {
  return [
    { id:1, artist: 'Hidromedusa', date: '2026-06-21', time: '22:00', venue: 'Buenos Aires', description: 'Solsticio de Invierno — Inmersión Profunda', tickets: true, tags: ['techno','ambient'] },
    { id:2, artist: 'Hidromedusa feat. Artistas Invitados', date: '2026-07-12', time: '21:00', venue: 'Buenos Aires', description: 'Noches del Kraken — Sesión Abismal', tickets: true, tags: ['experimental','electronic'] },
    { id:3, artist: 'Hidromedusa', date: '2026-08-30', time: '23:00', venue: 'Buenos Aires', description: 'Fin de Invierno — Bioluminiscencia', tickets: false, tags: ['live','dj-set'] },
  ];
}

// Render upcoming event on home
function renderNextEvent() {
  const events = getUpcomingEvents();
  const next = events.find(e => new Date(e.date) > new Date());
  const el = document.getElementById('next-event-content');
  if (!next || !el) return;
  el.innerHTML = `
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="font-display font-semibold text-white text-lg">${next.artist}</p>
        <p class="text-white/50 text-sm mt-1">${next.description}</p>
        <div class="flex flex-wrap gap-2 mt-3">
          ${next.tags.map(t => `<span class="px-2 py-1 rounded-full text-xs font-mono bg-white/5 border border-white/10 text-white/50">${t}</span>`).join('')}
        </div>
      </div>
      <div class="text-right flex-shrink-0">
        <p class="font-mono text-cyan-400 text-sm font-medium">${formatDate(next.date)}</p>
        <p class="text-white/40 text-xs mt-1">${next.time} hs</p>
        <p class="text-white/30 text-xs">${next.venue}</p>
      </div>
    </div>
    ${next.tickets ? `<button onclick="navigate('entradas')" class="mt-4 btn-primary w-full py-3 rounded-xl text-white text-sm font-display font-semibold">Conseguir entrada →</button>` : '<p class="mt-4 text-center text-white/30 text-xs font-mono">Entradas próximamente</p>'}
  `;
}

function formatDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day:'numeric', month:'long' });
}

// Events page
function renderEventsPage() {
  const el = document.getElementById('events-list');
  if (!el) return;
  const events = getUpcomingEvents();
  el.innerHTML = events.map(ev => `
    <div class="glass rounded-2xl p-6 flex flex-col md:flex-row items-start gap-6 hover:border-cyan-500/30 transition-all duration-300 cursor-pointer" onclick="${ev.tickets ? `navigate('entradas')` : `showToast('Entradas próximamente')`}">
      <div class="flex-shrink-0 text-center min-w-[80px]">
        <p class="font-mono text-3xl font-bold text-cyan-400">${new Date(ev.date+'T12:00:00').getDate()}</p>
        <p class="font-mono text-xs text-white/40 uppercase">${new Date(ev.date+'T12:00:00').toLocaleDateString('es-AR',{month:'short'})}</p>
        <p class="font-mono text-xs text-white/30">${new Date(ev.date+'T12:00:00').getFullYear()}</p>
      </div>
      <div class="flex-1">
        <h3 class="font-display font-semibold text-white text-lg mb-1">${ev.artist}</h3>
        <p class="text-white/50 text-sm mb-2">${ev.description}</p>
        <div class="flex flex-wrap gap-2 text-xs">
          <span class="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/50 font-mono">${ev.venue}</span>
          <span class="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/50 font-mono">${ev.time} hs</span>
          ${ev.tags.map(t => `<span class="px-2 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono">${t}</span>`).join('')}
        </div>
      </div>
      <div class="flex-shrink-0">
        ${ev.tickets
          ? `<span class="px-4 py-2 rounded-full text-xs font-mono font-medium bg-green-500/10 border border-green-500/30 text-green-400">Entradas disponibles</span>`
          : `<span class="px-4 py-2 rounded-full text-xs font-mono font-medium bg-white/5 border border-white/10 text-white/30">Próximamente</span>`
        }
      </div>
    </div>
  `).join('');
}

// ──── Legal content ──────────────────────────────────────────────────────────
function renderLegal() {
  const tc = document.getElementById('terminos-content');
  if (tc) tc.innerHTML = `
    <h3 class="font-display font-semibold text-white text-xl">1. Compra de entradas</h3>
    <p>La compra de entradas a través de hidromedusa.com es definitiva e intransferible. Al completar el pago aceptás los presentes términos. Las entradas son validadas mediante código QR único al ingreso.</p>

    <h3 class="font-display font-semibold text-white text-xl">2. Política de reembolso</h3>
    <p>No se realizan reembolsos salvo cancelación del evento por parte de Hidromedusa. En caso de cancelación se informará por los canales oficiales y se gestionará la devolución en un plazo de 15 días hábiles.</p>

    <h3 class="font-display font-semibold text-white text-xl">3. Acceso al evento</h3>
    <p>El ingreso requiere presentar el QR digital o impreso junto con documento de identidad que acredite mayoría de edad. Hidromedusa se reserva el derecho de admisión.</p>

    <h3 class="font-display font-semibold text-white text-xl">4. Notificaciones</h3>
    <p>Al registrarte en nuestra plataforma podés optar por recibir notificaciones periódicas antes del día de las tocadas, novedades de artistas y comunicaciones de la comunidad Hidromedusa. Podés dar de baja estas notificaciones en cualquier momento desde tu perfil.</p>

    <h3 class="font-display font-semibold text-white text-xl">5. Membresías</h3>
    <p>Las membresías Flasheras son renovables mensualmente. Los beneficios pueden variar según el nivel. Hidromedusa se reserva el derecho de modificar los rangos y beneficios con aviso previo a los miembros activos.</p>

    <h3 class="font-display font-semibold text-white text-xl">6. Conducta en el evento</h3>
    <p>Se prohíbe el ingreso con objetos que puedan representar un riesgo para los asistentes. El respeto mutuo entre asistentes es fundamental. Cualquier conducta que atente contra la seguridad o el bienestar de otros será motivo de expulsión sin reembolso.</p>
  `;

  const pp = document.getElementById('privacidad-content');
  if (pp) pp.innerHTML = `
    <h3 class="font-display font-semibold text-white text-xl">¿Qué datos recopilamos?</h3>
    <p>Recopilamos tu nombre, correo electrónico, y los datos de autenticación del proveedor que elegís (Google, Apple o Instagram). También guardamos el historial de compras y preferencias de notificaciones.</p>

    <h3 class="font-display font-semibold text-white text-xl">¿Para qué usamos tus datos?</h3>
    <p>Usamos tus datos para <strong class="text-cyan-400">contarte con vos para la diversión</strong>: enviarte recordatorios antes de las tocadas, informarte sobre artistas nuevos y gestionar tu membresía. Tu información nunca es vendida a terceros.</p>

    <h3 class="font-display font-semibold text-white text-xl">Mercado Pago</h3>
    <p>El procesamiento de pagos es gestionado íntegramente por Mercado Pago. Hidromedusa no almacena datos de tarjetas ni credenciales bancarias.</p>

    <h3 class="font-display font-semibold text-white text-xl">Tus derechos</h3>
    <p>Tenés derecho a acceder, rectificar o eliminar tus datos en cualquier momento. Para ejercerlos escribinos a <span class="text-cyan-400 font-mono">hola@hidromedusa.com</span>.</p>

    <h3 class="font-display font-semibold text-white text-xl">Seguridad</h3>
    <p>Aplicamos medidas técnicas y organizativas para proteger tu información. Todas las comunicaciones utilizan cifrado SSL/TLS.</p>

    <h3 class="font-display font-semibold text-white text-xl">Notificaciones y comunicaciones</h3>
    <p>Podés gestionar tus preferencias de notificación desde tu perfil. Únicamente enviamos comunicaciones relacionadas con eventos, artistas y tu membresía Hidromedusa.</p>
  `;
}

// ──── Profile ────────────────────────────────────────────────────────────────
function renderProfile() {
  const card = document.getElementById('profile-card');
  const myTickets = document.getElementById('my-tickets');
  if (!State.user) {
    if (card) card.innerHTML = `<div class="text-center py-8"><p class="text-white/40 mb-4">No estás logueado</p><button onclick="openModal('modal-auth')" class="btn-primary px-6 py-3 rounded-full text-white font-display font-semibold">Ingresar</button></div>`;
    return;
  }

  const rankInfo = getRankInfo(State.user.rank || 'plancton');
  if (card) card.innerHTML = `
    <div class="flex items-center gap-6 mb-6">
      <div class="w-20 h-20 rounded-2xl flex items-center justify-center font-display font-bold text-3xl flex-shrink-0" style="background:linear-gradient(135deg,#7c2fd6,#00f5ff)">${State.user.name[0].toUpperCase()}</div>
      <div>
        <h3 class="font-display font-bold text-2xl text-white">${State.user.name}</h3>
        <p class="text-white/40 text-sm mb-2">${State.user.email || ''}</p>
        <span class="rank-${rankInfo.cls} px-3 py-1 rounded-full text-xs font-mono font-medium">${rankInfo.emoji} ${rankInfo.name}</span>
      </div>
    </div>
    <div class="divider mb-4"></div>
    <div class="flex gap-4 text-center">
      <div class="flex-1 glass rounded-xl py-4">
        <p class="font-display font-bold text-2xl text-cyan-400">${State.tickets.length}</p>
        <p class="text-white/40 text-xs font-mono mt-1">Entradas</p>
      </div>
      <div class="flex-1 glass rounded-xl py-4">
        <p class="font-display font-bold text-2xl text-purple-400">${rankInfo.level}</p>
        <p class="text-white/40 text-xs font-mono mt-1">Nivel</p>
      </div>
    </div>
    <div class="mt-6">
      <button onclick="State.logout()" class="text-white/30 hover:text-red-400 text-sm font-mono transition-colors">Cerrar sesión</button>
    </div>
  `;

  if (myTickets) {
    if (State.tickets.length === 0) {
      myTickets.innerHTML = '<p>No tenés entradas aún. <button onclick="navigate(\'entradas\')" class="text-cyan-400 hover:underline">Comprar entrada →</button></p>';
    } else {
      myTickets.innerHTML = State.tickets.map(t => `
        <div class="flex items-center justify-between glass rounded-xl p-4">
          <div>
            <p class="font-display font-medium text-white text-sm">${t.event}</p>
            <p class="text-white/40 text-xs font-mono mt-1">${t.type} — ${formatDate(t.date)}</p>
          </div>
          <span class="text-green-400 text-xs font-mono">✓ Válida</span>
        </div>
      `).join('');
    }
  }
}

// ──── Rank helpers ────────────────────────────────────────────────────────────
function getRankInfo(rank) {
  const ranks = {
    plancton: { name:'Plancton', emoji:'🦠', cls:'plancton', level:1 },
    medusa:   { name:'Medusa',   emoji:'🪼', cls:'medusa',   level:2 },
    kraken:   { name:'Kraken',   emoji:'🐙', cls:'kraken',   level:3 },
    abismal:  { name:'Abismal',  emoji:'🌑', cls:'abismal',  level:4 },
  };
  return ranks[rank] || ranks.plancton;
}

// ──── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderNextEvent();
  renderEventsPage();
  renderLegal();
  // Ask for notifications after 5s on first visit
  if (!localStorage.getItem('hm_notif_asked') && 'Notification' in window && Notification.permission === 'default') {
    setTimeout(() => { openModal('modal-notif'); localStorage.setItem('hm_notif_asked','1'); }, 5000);
  }
});
