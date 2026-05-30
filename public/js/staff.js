// ──── Staff Control Panel ─────────────────────────────────────────────────────

const STAFF_CONFIG = {
  guido: {
    name: 'Guido',
    role: 'Arte & Producción',
    emoji: '🎨',
    color: '#ff2d9e',
    panels: ['arte', 'finanzas', 'asistencia'],
  },
  jose: {
    name: 'Jose',
    role: 'Tech & Sistemas',
    emoji: '⚡',
    color: '#00f5ff',
    panels: ['arte', 'finanzas', 'asistencia', 'sistemas'],
  },
  juan: {
    name: 'Juan',
    role: 'Operaciones',
    emoji: '🎫',
    color: '#7c2fd6',
    panels: ['entradas_fisicas', 'arte'],
  },
  meli: {
    name: 'Meli',
    role: 'Colaboradora',
    emoji: '✨',
    color: '#ffd700',
    panels: ['arte', 'costura', 'redes'],
  },
};

const STAFF_PANELS = {
  arte: {
    title: '🎨 Arte',
    description: 'Dirección visual, flyers, identidad del universo Hidromedusa.',
    tasks: [
      { id: 'art-1', label: 'Flyer de la próxima fecha', done: false, priority: 'high' },
      { id: 'art-2', label: 'Actualizar Instagram Stories plantillas', done: false, priority: 'med' },
      { id: 'art-3', label: 'Diseño wristband Flashero', done: true, priority: 'med' },
      { id: 'art-4', label: 'Animación intro para streams', done: false, priority: 'low' },
      { id: 'art-5', label: 'Fotografía evento anterior — selección', done: true, priority: 'high' },
    ]
  },
  finanzas: {
    title: '💰 ¿Cómo vamos a pagar esto?',
    description: 'Costos, ingresos, proyecciones y cómo cuadramos los números.',
    tasks: [
      { id: 'fin-1', label: 'Calcular break-even próxima fecha', done: false, priority: 'high' },
      { id: 'fin-2', label: 'Revisar comisión Mercado Pago mes anterior', done: false, priority: 'med' },
      { id: 'fin-3', label: 'Cotizar sonido + iluminación', done: false, priority: 'high' },
      { id: 'fin-4', label: 'Calcular precio de entradas para cubrir costos', done: true, priority: 'high' },
      { id: 'fin-5', label: 'Revisar facturación membresías', done: false, priority: 'low' },
    ]
  },
  asistencia: {
    title: '🙋 ¿Quién va a la fiesta?',
    description: 'Gestión de invitados, listas, entradas cortesía.',
    tasks: [
      { id: 'asis-1', label: 'Confirmar lista de invitados VIP', done: false, priority: 'high' },
      { id: 'asis-2', label: 'Definir cupo de cortesías', done: false, priority: 'med' },
      { id: 'asis-3', label: 'Avisar a artistas invitados', done: true, priority: 'high' },
      { id: 'asis-4', label: 'Configurar lista en app para staff puerta', done: false, priority: 'high' },
    ]
  },
  sistemas: {
    title: '⚡ Este sistema',
    description: 'Desarrollo, infraestructura y mejoras técnicas.',
    tasks: [
      { id: 'sys-1', label: 'Conectar lambdas MetaCall a producción', done: false, priority: 'high' },
      { id: 'sys-2', label: 'Configurar dominio hidromedusa.com en AWS', done: false, priority: 'high' },
      { id: 'sys-3', label: 'Integrar Mercado Pago webhooks reales', done: false, priority: 'high' },
      { id: 'sys-4', label: 'OAuth Google/Apple/Instagram credentials', done: false, priority: 'high' },
      { id: 'sys-5', label: 'QR scanner para staff en puerta', done: false, priority: 'med' },
      { id: 'sys-6', label: 'Push notifications via service worker', done: false, priority: 'low' },
      { id: 'sys-7', label: 'Deploy CI/CD pipeline', done: false, priority: 'low' },
    ]
  },
  entradas_fisicas: {
    title: '🎫 Entradas Físicas',
    description: 'Impresión, distribución y control de entradas en papel.',
    tasks: [
      { id: 'ef-1', label: 'Imprimir talonario próxima fecha', done: false, priority: 'high' },
      { id: 'ef-2', label: 'Definir puntos de venta físicos', done: false, priority: 'med' },
      { id: 'ef-3', label: 'Confirmar stock wristbands', done: false, priority: 'med' },
      { id: 'ef-4', label: 'Capacitar personal de puerta', done: false, priority: 'high' },
    ]
  },
  costura: {
    title: '🧵 Costura & Merch',
    description: 'Producción de merch, wristbands y vestuario especial.',
    tasks: [
      { id: 'cos-1', label: 'Wristbands Flashero nivel Medusa', done: false, priority: 'med' },
      { id: 'cos-2', label: 'Parche bordado Hidromedusa logo', done: false, priority: 'low' },
      { id: 'cos-3', label: 'Tote bags edición especial', done: false, priority: 'low' },
    ]
  },
  redes: {
    title: '📱 Redes Sociales',
    description: 'Instagram, TikTok y comunicación de la comunidad.',
    tasks: [
      { id: 'red-1', label: 'Post anuncio próxima fecha', done: false, priority: 'high' },
      { id: 'red-2', label: 'Stories countdown fecha', done: false, priority: 'med' },
      { id: 'red-3', label: 'Reels post-evento anterior', done: false, priority: 'med' },
      { id: 'red-4', label: 'Responder DMs y comentarios', done: false, priority: 'low' },
    ]
  },
};

const PRIORITY_BADGE = {
  high: 'bg-red-500/15 border border-red-400/30 text-red-400',
  med:  'bg-yellow-500/15 border border-yellow-400/30 text-yellow-400',
  low:  'bg-white/5 border border-white/10 text-white/30',
};
const PRIORITY_LABEL = { high: 'urgente', med: 'normal', low: 'después' };

let staffState = {
  member: null,
  activePanel: null,
  tasks: null,
};

function initStaff() {
  // Load persisted task state
  staffState.tasks = State.tasks || JSON.parse(JSON.stringify(
    Object.fromEntries(Object.entries(STAFF_PANELS).map(([k, v]) => [k, v.tasks]))
  ));
  State.tasks = staffState.tasks;
  State.save();

  // Determine which staff member is logged in
  const member = detectStaffMember();
  staffState.member = member;

  renderStaffSidebar(member);

  const firstPanel = member ? STAFF_CONFIG[member]?.panels[0] : 'arte';
  staffState.activePanel = firstPanel;
  renderStaffPanel(firstPanel);
}

function detectStaffMember() {
  if (!State.user) return null;
  const name = State.user.name?.toLowerCase();
  if (name?.includes('guido')) return 'guido';
  if (name?.includes('jose') || name?.includes('demo')) return 'jose';
  if (name?.includes('juan')) return 'juan';
  if (name?.includes('meli')) return 'meli';
  return 'jose'; // default for demo
}

function renderStaffSidebar(member) {
  const nav = document.getElementById('staff-nav');
  const info = document.getElementById('staff-user-info');
  if (!nav) return;

  const cfg = member ? STAFF_CONFIG[member] : null;
  const panels = cfg ? cfg.panels : Object.keys(STAFF_PANELS);

  if (info && cfg) {
    info.innerHTML = `
      <div class="flex items-center gap-2 mb-1">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold" style="background:${cfg.color}22;color:${cfg.color}">${cfg.emoji}</div>
        <span class="font-display font-semibold text-white text-sm">${cfg.name}</span>
      </div>
      <p class="text-white/30 text-xs">${cfg.role}</p>
    `;
  }

  nav.innerHTML = `
    <button onclick="navigate('home')" class="staff-sidebar-item w-full text-left">
      <span class="text-base">🏠</span> Inicio
    </button>
    <div class="my-2 divider"></div>
    <p class="font-mono text-xs text-white/30 uppercase tracking-widest px-3 mb-2">Paneles</p>
    ${panels.map(p => {
      const panel = STAFF_PANELS[p];
      if (!panel) return '';
      const tasks = staffState.tasks[p] || [];
      const pending = tasks.filter(t => !t.done).length;
      return `
        <button onclick="setStaffPanel('${p}')" id="nav-${p}" class="staff-sidebar-item w-full text-left justify-between">
          <span>${panel.title}</span>
          ${pending > 0 ? `<span class="text-xs font-mono bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">${pending}</span>` : ''}
        </button>
      `;
    }).join('')}
    <div class="my-2 divider"></div>
    <button onclick="renderStaffOverview()" id="nav-overview" class="staff-sidebar-item w-full text-left">
      <span>📊</span> Vista general
    </button>
  `;

  highlightStaffNav(staffState.activePanel);
}

function highlightStaffNav(panel) {
  document.querySelectorAll('.staff-sidebar-item').forEach(el => el.classList.remove('active'));
  const active = document.getElementById(`nav-${panel}`) || document.getElementById('nav-overview');
  active?.classList.add('active');
}

function setStaffPanel(panel) {
  staffState.activePanel = panel;
  highlightStaffNav(panel);
  renderStaffPanel(panel);
}

function renderStaffPanel(panelId) {
  const content = document.getElementById('staff-content');
  if (!content) return;
  const panel = STAFF_PANELS[panelId];
  if (!panel) return;

  const tasks = staffState.tasks[panelId] || [];
  const done = tasks.filter(t => t.done).length;
  const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;

  content.innerHTML = `
    <div class="max-w-2xl">
      <div class="mb-8">
        <h2 class="font-display font-bold text-2xl text-white mb-1">${panel.title}</h2>
        <p class="text-white/40 text-sm">${panel.description}</p>
      </div>

      <!-- Progress -->
      <div class="glass rounded-xl p-4 mb-6 flex items-center gap-4">
        <div class="flex-1">
          <div class="flex items-center justify-between mb-2">
            <span class="font-mono text-xs text-white/40">Progreso del panel</span>
            <span class="font-mono text-xs text-cyan-400">${done}/${tasks.length} tareas</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="text-3xl font-display font-bold text-white">${pct}%</div>
      </div>

      <!-- Tasks -->
      <div class="space-y-2" id="tasks-list-${panelId}">
        ${tasks.map(t => renderTaskRow(t, panelId)).join('')}
      </div>

      <button onclick="addTaskPrompt('${panelId}')" class="mt-4 w-full py-3 rounded-xl text-white/40 border border-dashed border-white/10 hover:border-cyan-400/30 hover:text-cyan-400 transition-all duration-200 font-mono text-sm">
        + Agregar tarea
      </button>
    </div>
  `;

  // Animate in
  if (window.anime) {
    anime({ targets: `#tasks-list-${panelId} .task-row`, opacity: [0, 1], translateX: [-16, 0], delay: anime.stagger(50), duration: 300, easing: 'easeOutCubic' });
  }
}

function renderTaskRow(task, panelId) {
  return `
    <div class="task-row ${task.done ? 'done' : ''}" id="task-${task.id}" onclick="toggleTask('${panelId}','${task.id}')">
      <div class="task-checkbox mt-0.5">
        ${task.done ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#00f5ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
      </div>
      <div class="flex-1 min-w-0">
        <p class="task-label text-sm text-white/80 font-display">${task.label}</p>
      </div>
      <span class="text-xs px-2 py-0.5 rounded-full font-mono flex-shrink-0 ${PRIORITY_BADGE[task.priority]}">${PRIORITY_LABEL[task.priority]}</span>
    </div>
  `;
}

function toggleTask(panelId, taskId) {
  const tasks = staffState.tasks[panelId];
  const t = tasks?.find(t => t.id === taskId);
  if (!t) return;
  t.done = !t.done;
  State.tasks = staffState.tasks;
  State.save();

  const row = document.getElementById(`task-${taskId}`);
  if (row) {
    row.classList.toggle('done', t.done);
    const cb = row.querySelector('.task-checkbox');
    if (cb) cb.innerHTML = t.done ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#00f5ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
    const label = row.querySelector('.task-label');
    if (label) label.style.textDecoration = t.done ? 'line-through' : '';
    if (window.anime) anime({ targets: row, scale: [1.02, 1], duration: 200, easing: 'easeOutCubic' });
  }

  updatePanelProgress(panelId);
  updateSidebarBadge(panelId);
}

function updatePanelProgress(panelId) {
  const tasks = staffState.tasks[panelId] || [];
  const done = tasks.filter(t => t.done).length;
  const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  const fill = document.querySelector('.progress-fill');
  if (fill) fill.style.width = `${pct}%`;
  const pctEl = document.querySelector('#staff-content .text-3xl');
  if (pctEl) pctEl.textContent = `${pct}%`;
  const label = document.querySelector('#staff-content .font-mono.text-xs.text-cyan-400');
  if (label) label.textContent = `${done}/${tasks.length} tareas`;
}

function updateSidebarBadge(panelId) {
  const tasks = staffState.tasks[panelId] || [];
  const pending = tasks.filter(t => !t.done).length;
  const btn = document.getElementById(`nav-${panelId}`);
  if (!btn) return;
  const existing = btn.querySelector('span:last-child');
  if (pending > 0) {
    if (existing && existing !== btn.querySelector('span:first-child')) {
      existing.textContent = pending;
    }
  } else if (existing && existing !== btn.querySelector('span:first-child')) {
    existing.remove();
  }
}

function addTaskPrompt(panelId) {
  const label = prompt('Nueva tarea:');
  if (!label?.trim()) return;
  const newTask = {
    id: `custom-${Date.now()}`,
    label: label.trim(),
    done: false,
    priority: 'med',
  };
  if (!staffState.tasks[panelId]) staffState.tasks[panelId] = [];
  staffState.tasks[panelId].push(newTask);
  State.tasks = staffState.tasks;
  State.save();
  renderStaffPanel(panelId);
}

function renderStaffOverview() {
  const content = document.getElementById('staff-content');
  if (!content) return;
  staffState.activePanel = 'overview';
  highlightStaffNav('overview');

  const allPanels = Object.keys(STAFF_PANELS);
  const cards = allPanels.map(pid => {
    const panel = STAFF_PANELS[pid];
    const tasks = staffState.tasks[pid] || [];
    const done = tasks.filter(t => !t.done).length === 0 ? tasks.length : tasks.filter(t => t.done).length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    const cfg = staffState.member ? STAFF_CONFIG[staffState.member] : null;
    const isMyPanel = cfg ? cfg.panels.includes(pid) : true;
    return `
      <div class="glass rounded-2xl p-5 cursor-pointer hover:border-cyan-400/20 transition-all ${!isMyPanel ? 'opacity-40' : ''}" onclick="setStaffPanel('${pid}')">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-display font-semibold text-white text-sm">${panel.title}</h3>
          <span class="font-mono text-xs text-cyan-400">${pct}%</span>
        </div>
        <div class="progress-bar mb-2"><div class="progress-fill" style="width:${pct}%"></div></div>
        <p class="text-white/30 text-xs font-mono">${tasks.filter(t=>t.done).length}/${tasks.length} done</p>
      </div>
    `;
  });

  const totalTasks = allPanels.reduce((s, pid) => s + (staffState.tasks[pid]?.length || 0), 0);
  const totalDone = allPanels.reduce((s, pid) => s + (staffState.tasks[pid]?.filter(t=>t.done).length || 0), 0);

  content.innerHTML = `
    <div class="max-w-3xl">
      <div class="mb-8">
        <h2 class="font-display font-bold text-2xl text-white mb-1">📊 Vista General</h2>
        <p class="text-white/40 text-sm">Progreso global de todos los paneles</p>
      </div>
      <div class="glass rounded-2xl p-6 mb-6 flex items-center gap-6">
        <div class="flex-1">
          <div class="flex items-center justify-between mb-2">
            <span class="font-mono text-xs text-white/40">Progreso total del proyecto</span>
            <span class="font-mono text-xs text-cyan-400">${totalDone}/${totalTasks}</span>
          </div>
          <div class="progress-bar h-3 rounded-full">
            <div class="progress-fill h-3 rounded-full" style="width:${Math.round(totalDone/totalTasks*100)}%"></div>
          </div>
        </div>
        <div class="text-4xl font-display font-bold gradient-text">${Math.round(totalDone/totalTasks*100)}%</div>
      </div>
      <div class="grid md:grid-cols-2 gap-4">${cards.join('')}</div>
    </div>
  `;
}
