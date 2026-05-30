// MetaCall Lambda — Staff operations
// Endpoints:
//   GET  /staff/tasks/:member         → { panels: { [panelId]: tasks[] } }
//   POST /staff/tasks/:member/toggle  { panelId, taskId } → { task }
//   POST /staff/tasks/:member/add     { panelId, label, priority } → { task }
//   GET  /staff/members               → [members]
//   GET  /staff/overview              → { panels, totalPct }

const STAFF_MEMBERS = {
  guido: { name:'Guido', role:'Arte & Producción', panels:['arte','finanzas','asistencia'] },
  jose:  { name:'Jose',  role:'Tech & Sistemas',   panels:['arte','finanzas','asistencia','sistemas'] },
  juan:  { name:'Juan',  role:'Operaciones',        panels:['entradas_fisicas','arte'] },
  meli:  { name:'Meli',  role:'Colaboradora',       panels:['arte','costura','redes'] },
};

// Task store — persisted per session (use DynamoDB with TTL in prod)
const taskStore = new Map();

function defaultTasks() {
  return {
    arte:            [
      { id:'art-1', label:'Flyer próxima fecha',          done:false, priority:'high' },
      { id:'art-2', label:'Instagram Stories templates',  done:false, priority:'med'  },
      { id:'art-3', label:'Diseño wristband Flashero',    done:true,  priority:'med'  },
      { id:'art-4', label:'Animación intro streams',      done:false, priority:'low'  },
    ],
    finanzas:        [
      { id:'fin-1', label:'Break-even próxima fecha',     done:false, priority:'high' },
      { id:'fin-2', label:'Revisar comisión MP',          done:false, priority:'med'  },
      { id:'fin-3', label:'Cotizar sonido + iluminación', done:false, priority:'high' },
    ],
    asistencia:      [
      { id:'asi-1', label:'Confirmar lista VIP',          done:false, priority:'high' },
      { id:'asi-2', label:'Definir cupo cortesías',       done:false, priority:'med'  },
      { id:'asi-3', label:'Avisar artistas invitados',    done:true,  priority:'high' },
    ],
    sistemas:        [
      { id:'sys-1', label:'Lambdas a producción',         done:false, priority:'high' },
      { id:'sys-2', label:'Dominio hidromedusa.com',      done:false, priority:'high' },
      { id:'sys-3', label:'MP webhooks reales',           done:false, priority:'high' },
      { id:'sys-4', label:'OAuth credentials',            done:false, priority:'high' },
      { id:'sys-5', label:'QR scanner puerta',            done:false, priority:'med'  },
    ],
    entradas_fisicas:[
      { id:'ef-1',  label:'Imprimir talonario',           done:false, priority:'high' },
      { id:'ef-2',  label:'Puntos de venta físicos',      done:false, priority:'med'  },
    ],
    costura:         [
      { id:'cos-1', label:'Wristbands nivel Medusa',      done:false, priority:'med'  },
      { id:'cos-2', label:'Parche bordado logo',          done:false, priority:'low'  },
    ],
    redes:           [
      { id:'red-1', label:'Post anuncio fecha',           done:false, priority:'high' },
      { id:'red-2', label:'Stories countdown',            done:false, priority:'med'  },
      { id:'red-3', label:'Reels post-evento',            done:false, priority:'med'  },
    ],
  };
}

function getMemberTasks(member) {
  if (!taskStore.has(member)) taskStore.set(member, defaultTasks());
  const all = taskStore.get(member);
  const panels = STAFF_MEMBERS[member]?.panels || [];
  return Object.fromEntries(panels.map(p => [p, all[p] || []]));
}

async function getTasks(req) {
  const member = req.params?.member?.toLowerCase();
  if (!STAFF_MEMBERS[member]) return { status: 404, body: { error: 'Unknown staff member' } };
  return { status: 200, body: { member, panels: getMemberTasks(member) } };
}

async function toggleTask(req) {
  const member = req.params?.member?.toLowerCase();
  const { panelId, taskId } = req.body || {};
  if (!STAFF_MEMBERS[member] || !panelId || !taskId) return { status: 400, body: { error: 'Bad request' } };

  if (!taskStore.has(member)) taskStore.set(member, defaultTasks());
  const tasks = taskStore.get(member)[panelId] || [];
  const task = tasks.find(t => t.id === taskId);
  if (!task) return { status: 404, body: { error: 'Task not found' } };

  task.done = !task.done;
  return { status: 200, body: { task } };
}

async function addTask(req) {
  const member = req.params?.member?.toLowerCase();
  const { panelId, label, priority = 'med' } = req.body || {};
  if (!STAFF_MEMBERS[member] || !panelId || !label) return { status: 400, body: { error: 'Bad request' } };

  if (!taskStore.has(member)) taskStore.set(member, defaultTasks());
  const store = taskStore.get(member);
  if (!store[panelId]) store[panelId] = [];

  const task = { id: `custom-${Date.now()}`, label, done: false, priority };
  store[panelId].push(task);
  return { status: 200, body: { task } };
}

async function getMembers() {
  return {
    status: 200,
    body: Object.entries(STAFF_MEMBERS).map(([id, m]) => ({ id, ...m }))
  };
}

async function getOverview() {
  const panels = {};
  let totalTasks = 0, totalDone = 0;

  for (const [member, cfg] of Object.entries(STAFF_MEMBERS)) {
    const memberTasks = getMemberTasks(member);
    for (const [panelId, tasks] of Object.entries(memberTasks)) {
      if (!panels[panelId]) panels[panelId] = { tasks: [], members: [] };
      tasks.forEach(t => {
        const existing = panels[panelId].tasks.find(x => x.id === t.id);
        if (!existing) {
          panels[panelId].tasks.push(t);
          totalTasks++;
          if (t.done) totalDone++;
        }
      });
      panels[panelId].members.push(member);
    }
  }

  return {
    status: 200,
    body: {
      panels: Object.entries(panels).map(([id, p]) => ({
        id,
        tasks: p.tasks,
        members: [...new Set(p.members)],
        pct: p.tasks.length ? Math.round(p.tasks.filter(t=>t.done).length / p.tasks.length * 100) : 0,
      })),
      totalPct: totalTasks ? Math.round(totalDone / totalTasks * 100) : 0,
    }
  };
}

module.exports = { getTasks, toggleTask, addTask, getMembers, getOverview };
