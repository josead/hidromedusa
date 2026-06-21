/* ============================================================
   HIDROMEDUSA · Staff panel — rave underground
   Wired to /staff/* + /tickets with localStorage fallback.
   ============================================================ */

const STAFF_MEMBERS = {
  guido: { name: 'Guido', role: 'Arte · Visuales',     panels: ['arte','finanzas','asistencia'] },
  jose:  { name: 'Jose',  role: 'Síntesis · Sistemas', panels: ['arte','finanzas','asistencia','sistemas'] },
  juan:  { name: 'Juan',  role: 'En vivo · Operaciones', panels: ['entradas_fisicas','arte'] },
  meli:  { name: 'Meli',  role: 'Colaboradora',         panels: ['arte','costura','redes'] },
};

const STAFF_PANELS = {
  arte:            { title: 'Arte', sub: 'Flyers, identidad, visuales de cada fecha.', tasks: [
    { id:'art-1', t:'Flyer próxima fecha (11/7)',     done:false, pri:'high' },
    { id:'art-2', t:'Templates de Instagram Stories', done:false, pri:'med'  },
    { id:'art-3', t:'Diseño merch secreto VIP',       done:false, pri:'high' },
    { id:'art-4', t:'Visuales para el vivo',          done:false, pri:'med'  },
  ]},
  finanzas:        { title: '¿Cómo pagamos esto?', sub: 'Costos, ingresos y cómo cuadran los números.', tasks: [
    { id:'fin-1', t:'Break-even de la fecha 11/7',    done:false, pri:'high' },
    { id:'fin-2', t:'Cotizar sonido + luces',         done:false, pri:'high' },
    { id:'fin-3', t:'Definir precios y cupos',        done:false, pri:'med'  },
  ]},
  asistencia:      { title: '¿Quién va a la fiesta?', sub: 'Invitados, listas y cortesías.', tasks: [
    { id:'asi-1', t:'Confirmar lista de invitados',   done:false, pri:'high' },
    { id:'asi-2', t:'Definir cupo de cortesías',      done:false, pri:'med'  },
    { id:'asi-3', t:'Lista en puerta para staff',     done:false, pri:'high' },
  ]},
  sistemas:        { title: 'Este sistema', sub: 'Web, backend e infra.', tasks: [
    { id:'sys-1', t:'Conectar backend MetaCall',      done:false, pri:'high' },
    { id:'sys-2', t:'Dominio hidromedusa.com',        done:false, pri:'high' },
    { id:'sys-3', t:'OAuth Google/Apple/Instagram',   done:false, pri:'high' },
    { id:'sys-4', t:'Lista de palabras clave en puerta', done:false, pri:'med'  },
    { id:'sys-5', t:'Deploy lambdas MetaCall',        done:false, pri:'med'  },
  ]},
  entradas_fisicas:{ title: 'Entradas físicas', sub: 'Talonarios, puntos de venta, puerta.', tasks: [
    { id:'ef-1',  t:'Imprimir talonario',             done:false, pri:'high' },
    { id:'ef-2',  t:'Puntos de venta físicos',        done:false, pri:'med'  },
  ]},
  costura:         { title: 'Costura & Merch', sub: 'Producción del merch (incluido el secreto).', tasks: [
    { id:'cos-1', t:'Prototipo merch secreto VIP',    done:false, pri:'high' },
    { id:'cos-2', t:'Wristbands de la fecha',         done:false, pri:'med'  },
  ]},
  redes:           { title: 'Redes', sub: 'Instagram, TikTok, comunidad.', tasks: [
    { id:'red-1', t:'Post anuncio fecha 11/7',        done:false, pri:'high' },
    { id:'red-2', t:'Stories countdown',              done:false, pri:'med'  },
    { id:'red-3', t:'Reels post-evento',              done:false, pri:'med'  },
  ]},
};

const ENTRADAS_PANEL = '__entradas__'; // pseudo-panel: gestión de entradas

let staffMember = 'jose';
let staffPanel = null;

/* ---------- Staff token ---------- */
function staffToken() {
  let t = localStorage.getItem('hm_staff_token');
  if (t === null) {
    t = prompt('Token de staff (dejalo vacío si el backend está en modo dev):') || '';
    localStorage.setItem('hm_staff_token', t);
  }
  return t;
}
function resetStaffToken() {
  localStorage.removeItem('hm_staff_token');
  toast('Token de staff borrado');
}

/* ---------- Tasks: load (API or localStorage) ---------- */
function loadStaffTasks() {
  if (HM.tasks) return HM.tasks;
  const t = {};
  for (const k in STAFF_PANELS) t[k] = STAFF_PANELS[k].tasks.map(x => ({ ...x }));
  HM.tasks = t; HM.save();
  return t;
}
async function syncStaffTasks() {
  try {
    const r = await api('/staff/tasks');            // { panels: { [id]: tasks[] } }
    if (r && r.panels) { HM.tasks = r.panels; HM.save(); return true; }
  } catch (e) {}
  return false;
}

/* ---------- Open ---------- */
async function openStaff() {
  loadStaffTasks();
  if (HM.user) {
    const n = (HM.user.name || '').toLowerCase();
    if (n.includes('guido')) staffMember = 'guido';
    else if (n.includes('juan')) staffMember = 'juan';
    else if (n.includes('meli')) staffMember = 'meli';
    else staffMember = 'jose';
  }
  const sel = document.getElementById('member-pick');
  sel.innerHTML = Object.entries(STAFF_MEMBERS).map(([id,m]) =>
    `<option value="${id}" ${id===staffMember?'selected':''}>${m.name} — ${m.role}</option>`).join('');
  renderStaffNav();
  staffPanel = STAFF_MEMBERS[staffMember].panels[0];
  renderStaffPanel(staffPanel);
  openOverlay('o-staff');
  // best-effort: refresh tasks from backend, then re-render
  if (await syncStaffTasks()) { renderStaffNav(); if (staffPanel !== ENTRADAS_PANEL) renderStaffPanel(staffPanel); }
}

function selectMember(id) {
  staffMember = id;
  renderStaffNav();
  staffPanel = STAFF_MEMBERS[id].panels[0];
  renderStaffPanel(staffPanel);
}

function renderStaffNav() {
  const tasks = loadStaffTasks();
  const panels = STAFF_MEMBERS[staffMember].panels;
  const taskItems = panels.map(p => {
    const pending = (tasks[p] || []).filter(t => !t.done).length;
    return `<div class="staff-nav-item ${p===staffPanel?'active':''}" id="snav-${p}" onclick="setPanel('${p}')">
      <span>${STAFF_PANELS[p].title}</span>${pending ? `<span class="badge">${pending}</span>` : ''}</div>`;
  }).join('');
  const entradasItem = `<div class="staff-nav-item ${staffPanel===ENTRADAS_PANEL?'active':''}" id="snav-${ENTRADAS_PANEL}" onclick="setPanel('${ENTRADAS_PANEL}')">
      <span>Entradas</span></div>`;
  document.getElementById('staff-nav').innerHTML = taskItems + entradasItem;
}

function setPanel(p) {
  staffPanel = p;
  document.querySelectorAll('.staff-nav-item').forEach(e => e.classList.remove('active'));
  document.getElementById('snav-'+p)?.classList.add('active');
  if (p === ENTRADAS_PANEL) renderEntradas();
  else renderStaffPanel(p);
}

/* ---------- Task panel ---------- */
function renderStaffPanel(p) {
  const tasks = loadStaffTasks();
  const panel = STAFF_PANELS[p];
  if (!panel) return;
  const list = tasks[p] || [];
  const done = list.filter(t => t.done).length;
  const pct = list.length ? Math.round(done / list.length * 100) : 0;
  document.getElementById('staff-main').innerHTML = `
    <h2>${panel.title}</h2>
    <div class="sub">${panel.sub}</div>
    <div class="progress">
      <div class="pct">${pct}%</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div style="font-family:var(--mono);font-size:12px;color:var(--muted)">${done}/${list.length}</div>
    </div>
    <div id="task-list">
      ${list.map(t => `
        <div class="task ${t.done?'done':''}" onclick="toggleTask('${p}','${t.id}')">
          <div class="task-cb">${t.done?'<i data-lucide="check" style="width:14px;height:14px;color:#0a0a0b"></i>':''}</div>
          <div class="task-t">${t.t}</div>
          <div class="task-pri ${t.pri==='high'?'high':''}">${t.pri==='high'?'urgente':t.pri==='med'?'normal':'después'}</div>
        </div>`).join('')}
    </div>`;
  lucide.createIcons();
  anime({ targets:'#task-list .task', opacity:[0,1], translateX:[-12,0], delay:anime.stagger(40), duration:300, easing:'easeOutCubic' });
}

async function toggleTask(p, id) {
  const tasks = loadStaffTasks();
  const t = (tasks[p] || []).find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  HM.tasks = tasks; HM.save();
  renderStaffPanel(p);
  renderStaffNav();
  // best-effort backend sync
  api('/staff/tasks/toggle', { method:'POST', body:{ panelId:p, taskId:id, staffToken: staffToken() } }).catch(()=>{});
}

/* ============================================================
   Entradas — gestión (list / liberar / claim phrase)
   ============================================================ */
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function renderEntradas() {
  const main = document.getElementById('staff-main');
  main.innerHTML = `
    <h2>Entradas</h2>
    <div class="sub">Liberá pedidos pendientes y pasá la frase secreta por WhatsApp.</div>
    <div id="entradas-list" style="font-family:var(--mono);font-size:13px;color:var(--muted)">Cargando…</div>`;
  let tickets;
  try {
    tickets = await api('/tickets');                 // [tickets]
  } catch (e) {
    document.getElementById('entradas-list').innerHTML =
      `<div style="border:2px solid var(--line-strong);padding:24px;background:var(--bg-2);text-align:center;color:var(--bone-dim);font-family:var(--body)">
         <i data-lucide="plug-zap" style="width:28px;height:28px;color:var(--acid);margin:0 auto 12px"></i>
         <div style="font-size:15px">Conectá el backend para gestionar entradas.</div>
         <div style="font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:8px">Definí <b>API_BASE</b> en HM_CONFIG (index.html).</div>
       </div>`;
    lucide.createIcons();
    return;
  }
  drawEntradas(tickets || []);
}

function drawEntradas(tickets) {
  const pending = tickets.filter(t => t.status === 'pending');
  const freed   = tickets.filter(t => t.status === 'freed');
  const others  = tickets.filter(t => t.status !== 'pending' && t.status !== 'freed');
  const row = (t) => {
    const merch = t.merchIdea ? ` · merch: ${esc(t.merchIdea)}` : '';
    const contact = [t.buyerPhone, t.buyerEmail].filter(Boolean).map(esc).join(' · ');
    let right;
    if (t.status === 'pending') {
      right = `<button class="btn btn-acid" onclick="freeTicket('${esc(t.id)}')">Liberar</button>`;
    } else if (t.status === 'freed') {
      right = `<div class="claim-chip"><span class="ph">${esc(t.claim||'?')}</span>
                 <button onclick="copyClaim('${esc(t.claim||'')}')">Copiar</button></div>`;
    } else {
      right = `<span class="tk-status used">${esc(t.status)}</span>`;
    }
    return `<div class="tk-row">
      <div><div class="tk-who">${esc(t.buyerName||'—')} · ${esc((t.type||'').toUpperCase())}</div>
      <div class="tk-info">${contact||'sin contacto'}${merch}</div></div>
      <div>${right}</div></div>`;
  };
  const section = (label, arr) => arr.length
    ? `<div class="lbl" style="font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:18px 0 10px">${label} (${arr.length})</div>${arr.map(row).join('')}`
    : '';
  document.getElementById('entradas-list').innerHTML =
    (pending.length||freed.length||others.length)
      ? section('Pendientes', pending) + section('Liberadas', freed) + section('Otras', others)
      : `<div style="color:var(--bone-dim);font-family:var(--body);padding:14px 0">No hay entradas todavía.</div>`;
  lucide.createIcons();
}

async function freeTicket(id) {
  try {
    const r = await api('/tickets/'+encodeURIComponent(id)+'/free', { method:'POST', body:{ staffToken: staffToken() } });
    const claim = r && r.ticket && r.ticket.claim;
    toast(claim ? ('Liberada · frase: '+claim) : 'Entrada liberada');
  } catch (e) {
    toast('No se pudo liberar (¿backend / token?)');
  }
  renderEntradas();
}

function copyClaim(claim) {
  if (!claim) return;
  const ok = () => toast('Frase copiada: '+claim);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(claim).then(ok).catch(()=>fallbackCopy(claim, ok));
  } else fallbackCopy(claim, ok);
}
function fallbackCopy(text, ok) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); ok(); } catch(e){ toast('Copiá a mano: '+text); }
  ta.remove();
}
