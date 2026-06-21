// MetaCall Lambda — Staff operations
// Tasks are GLOBAL per panel (shared across all staff), persisted in DynamoDB
// via lambdas/lib/store.js (`tasks` API, seeded from TASK_SEED). Members are
// static config per CONTRACT.md.
//
// Endpoints (see metacall.json):
//   GET  /staff/members        → [{ id, name, role, panels }]
//   GET  /staff/tasks          → { panels: { [panelId]: tasks[] } }   (global)
//   POST /staff/tasks/toggle   { panelId, taskId, staffToken } → { task }
//   POST /staff/tasks/add      { panelId, label, priority, staffToken } → { task }
//   GET  /staff/overview       → { panels:[{ id, tasks, pct }], totalPct }

const store = require('../lib/store');

// ── Static staff config (exactly per CONTRACT.md "Staff members") ──
const STAFF_MEMBERS = {
  guido: { name:'Guido', role:'Arte · Visuales',        panels:['arte','finanzas','asistencia'] },
  jose:  { name:'Jose',  role:'Síntesis · Sistemas',    panels:['arte','finanzas','asistencia','sistemas'] },
  juan:  { name:'Juan',  role:'En vivo · Operaciones',  panels:['entradas_fisicas','arte'] },
  meli:  { name:'Meli',  role:'Colaboradora',           panels:['arte','costura','redes'] },
};

// ── Staff gate ──
// True when no STAFF_TOKEN is configured (dev) or the body token matches.
function requireStaff(req) {
  const want = process.env.STAFF_TOKEN;
  if (!want) return true; // unset/empty => allow all
  return req && req.body && req.body.staffToken === want;
}

// ── Members (static) ──
async function getMembers() {
  return {
    status: 200,
    body: Object.entries(STAFF_MEMBERS).map(([id, m]) => ({ id, name: m.name, role: m.role, panels: m.panels })),
  };
}

// ── Tasks (global, all panels) ──
async function getTasks(req) {
  try {
    const panels = await store.tasks.getAll();
    return { status: 200, body: { panels } };
  } catch (err) {
    return { status: 500, body: { error: String(err && err.message || err) } };
  }
}

// ── Toggle a task's done flag (staff) ──
async function toggleTask(req) {
  if (!requireStaff(req)) return { status: 401, body: { error: 'Unauthorized' } };
  const { panelId, taskId } = (req && req.body) || {};
  if (!panelId || !taskId) return { status: 400, body: { error: 'Bad request' } };

  try {
    const list = await store.tasks.getPanel(panelId);     // seeded if absent
    const task = (list || []).find(t => t.id === taskId);
    if (!task) return { status: 404, body: { error: 'Task not found' } };

    task.done = !task.done;
    await store.tasks.putPanel(panelId, list);
    return { status: 200, body: { task } };
  } catch (err) {
    return { status: 500, body: { error: String(err && err.message || err) } };
  }
}

// ── Append a custom task to a panel (staff) ──
async function addTask(req) {
  if (!requireStaff(req)) return { status: 401, body: { error: 'Unauthorized' } };
  const { panelId, label, priority = 'med' } = (req && req.body) || {};
  if (!panelId || !label) return { status: 400, body: { error: 'Bad request' } };

  try {
    const list = await store.tasks.getPanel(panelId);     // seeded if absent
    const task = { id: `custom-${Date.now()}`, label, done: false, priority };
    list.push(task);
    await store.tasks.putPanel(panelId, list);
    return { status: 200, body: { task } };
  } catch (err) {
    return { status: 500, body: { error: String(err && err.message || err) } };
  }
}

// ── Progress overview across every panel ──
async function getOverview() {
  try {
    const all = await store.tasks.getAll();
    let totalTasks = 0, totalDone = 0;
    const panels = Object.entries(all).map(([id, tasks]) => {
      const list = tasks || [];
      const done = list.filter(t => t.done).length;
      totalTasks += list.length;
      totalDone  += done;
      return { id, tasks: list, pct: list.length ? Math.round(done / list.length * 100) : 0 };
    });
    return {
      status: 200,
      body: { panels, totalPct: totalTasks ? Math.round(totalDone / totalTasks * 100) : 0 },
    };
  } catch (err) {
    return { status: 500, body: { error: String(err && err.message || err) } };
  }
}

// Names must match metacall.json routing.
module.exports = { getTasks, toggleTask, addTask, getMembers, getOverview };
