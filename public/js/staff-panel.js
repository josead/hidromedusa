/* ============================================================
   HIDROMEDUSA · Staff panel — rave underground
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
    { id:'fin-3', t:'Revisar comisión Mercado Pago',  done:false, pri:'med'  },
  ]},
  asistencia:      { title: '¿Quién va a la fiesta?', sub: 'Invitados, listas y cortesías.', tasks: [
    { id:'asi-1', t:'Confirmar lista de invitados',   done:false, pri:'high' },
    { id:'asi-2', t:'Definir cupo de cortesías',      done:false, pri:'med'  },
    { id:'asi-3', t:'Lista en puerta para staff',     done:false, pri:'high' },
  ]},
  sistemas:        { title: 'Este sistema', sub: 'Web, backend e infra.', tasks: [
    { id:'sys-1', t:'Conectar Mercado Pago real',     done:false, pri:'high' },
    { id:'sys-2', t:'Dominio hidromedusa.com',        done:false, pri:'high' },
    { id:'sys-3', t:'OAuth Google/Apple/Instagram',   done:false, pri:'high' },
    { id:'sys-4', t:'QR scanner en puerta',           done:false, pri:'med'  },
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

let staffMember = 'jose';
let staffPanel = null;

function loadStaffTasks() {
  if (HM.tasks) return HM.tasks;
  const t = {};
  for (const k in STAFF_PANELS) t[k] = STAFF_PANELS[k].tasks.map(x => ({ ...x }));
  HM.tasks = t; HM.save();
  return t;
}

function openStaff() {
  loadStaffTasks();
  // auto-detect member from logged-in user name
  if (HM.user) {
    const n = (HM.user.name || '').toLowerCase();
    if (n.includes('guido')) staffMember = 'guido';
    else if (n.includes('juan')) staffMember = 'juan';
    else if (n.includes('meli')) staffMember = 'meli';
    else staffMember = 'jose';
  }
  // populate member select
  const sel = document.getElementById('member-pick');
  sel.innerHTML = Object.entries(STAFF_MEMBERS).map(([id,m]) =>
    `<option value="${id}" ${id===staffMember?'selected':''}>${m.name} — ${m.role}</option>`).join('');
  renderStaffNav();
  staffPanel = STAFF_MEMBERS[staffMember].panels[0];
  renderStaffPanel(staffPanel);
  openOverlay('o-staff');
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
  document.getElementById('staff-nav').innerHTML = panels.map(p => {
    const pending = (tasks[p] || []).filter(t => !t.done).length;
    return `<div class="staff-nav-item ${p===staffPanel?'active':''}" id="snav-${p}" onclick="setPanel('${p}')">
      <span>${STAFF_PANELS[p].title}</span>${pending ? `<span class="badge">${pending}</span>` : ''}</div>`;
  }).join('');
}

function setPanel(p) {
  staffPanel = p;
  document.querySelectorAll('.staff-nav-item').forEach(e => e.classList.remove('active'));
  document.getElementById('snav-'+p)?.classList.add('active');
  renderStaffPanel(p);
}

function renderStaffPanel(p) {
  const tasks = loadStaffTasks();
  const panel = STAFF_PANELS[p];
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

function toggleTask(p, id) {
  const tasks = loadStaffTasks();
  const t = (tasks[p] || []).find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  HM.tasks = tasks; HM.save();
  renderStaffPanel(p);
  renderStaffNav();
}
