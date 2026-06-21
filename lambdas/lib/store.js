// Shared persistence — DynamoDB (AWS SDK v3), LocalStack-compatible.
// One DocumentClient honouring env: DYNAMODB_ENDPOINT, AWS_REGION, DDB_TABLE_PREFIX.
// Every call rethrows a clear error on failure — callers handle fallback.
//
// Exports:
//   tickets.{put,get,byClaim,list,update}
//   tasks.{getAll,getPanel,putPanel}
//   newsletter.{add,list}
//   sessions.{put,get,del}

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');

// ── Config ────────────────────────────────────────
const REGION   = process.env.AWS_REGION || 'us-east-1';
const ENDPOINT = process.env.DYNAMODB_ENDPOINT || undefined; // unset => real AWS
const PREFIX   = process.env.DDB_TABLE_PREFIX || 'hm_';

const T = {
  tickets:    `${PREFIX}tickets`,
  tasks:      `${PREFIX}tasks`,
  newsletter: `${PREFIX}newsletter`,
  sessions:   `${PREFIX}sessions`,
};

// LocalStack needs *some* credentials; real AWS uses the default provider chain.
const clientCfg = { region: REGION };
if (ENDPOINT) {
  clientCfg.endpoint = ENDPOINT;
  clientCfg.credentials = { accessKeyId: 'test', secretAccessKey: 'test' };
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient(clientCfg), {
  marshallOptions: { removeUndefinedValues: true },
});

// Run a command, wrapping failures in a clear, rethrown error.
async function run(label, cmd) {
  try {
    return await ddb.send(cmd);
  } catch (err) {
    console.error(`[store] ${label} failed:`, err && err.message ? err.message : err);
    throw new Error(`store.${label}: ${err && err.message ? err.message : 'DynamoDB error'}`);
  }
}

// ── Tickets ───────────────────────────────────────
const tickets = {
  async put(t) {
    await run('tickets.put', new PutCommand({ TableName: T.tickets, Item: t }));
    return t;
  },
  async get(id) {
    const r = await run('tickets.get', new GetCommand({ TableName: T.tickets, Key: { id } }));
    return r.Item || null;
  },
  // Query the claimNorm-index GSI for a normalized claim phrase.
  async byClaim(norm) {
    const r = await run('tickets.byClaim', new QueryCommand({
      TableName: T.tickets,
      IndexName: 'claimNorm-index',
      KeyConditionExpression: 'claimNorm = :n',
      ExpressionAttributeValues: { ':n': norm },
      Limit: 1,
    }));
    return (r.Items && r.Items[0]) || null;
  },
  // Full list; optional client-side status filter (table is small).
  async list({ status } = {}) {
    const r = await run('tickets.list', new ScanCommand({ TableName: T.tickets }));
    let items = r.Items || [];
    if (status) items = items.filter(t => t.status === status);
    return items;
  },
  // Patch a ticket by id with a shallow set of attributes; returns updated item.
  async update(id, patch) {
    const keys = Object.keys(patch || {});
    if (!keys.length) return tickets.get(id);
    const names = {}, values = {};
    const sets = keys.map((k, i) => {
      names[`#k${i}`] = k;
      values[`:v${i}`] = patch[k];
      return `#k${i} = :v${i}`;
    });
    const r = await run('tickets.update', new UpdateCommand({
      TableName: T.tickets,
      Key: { id },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }));
    return r.Attributes || null;
  },
  // Hard-delete a ticket by id (staff "Eliminar"). No-op if it doesn't exist.
  async remove(id) {
    await run('tickets.remove', new DeleteCommand({ TableName: T.tickets, Key: { id } }));
    return true;
  },
};

// ── Tasks ─────────────────────────────────────────
// One item per panel: { panelId, tasks: [{ id, label, done, priority }] }.
// GLOBAL/shared (no per-member copies). Seeds from STAFF_PANELS when absent.

// Canonical task seed, copied from public/js/staff-panel.js (STAFF_PANELS),
// normalized: t -> label, pri -> priority.
const TASK_SEED = {
  arte: [
    { id:'art-1', label:'Flyer próxima fecha (11/7)',     done:false, priority:'high' },
    { id:'art-2', label:'Templates de Instagram Stories', done:false, priority:'med'  },
    { id:'art-3', label:'Diseño merch secreto VIP',       done:false, priority:'high' },
    { id:'art-4', label:'Visuales para el vivo',          done:false, priority:'med'  },
  ],
  finanzas: [
    { id:'fin-1', label:'Break-even de la fecha 11/7',    done:false, priority:'high' },
    { id:'fin-2', label:'Cotizar sonido + luces',         done:false, priority:'high' },
    { id:'fin-3', label:'Revisar comisión Mercado Pago',  done:false, priority:'med'  },
  ],
  asistencia: [
    { id:'asi-1', label:'Confirmar lista de invitados',   done:false, priority:'high' },
    { id:'asi-2', label:'Definir cupo de cortesías',      done:false, priority:'med'  },
    { id:'asi-3', label:'Lista en puerta para staff',     done:false, priority:'high' },
  ],
  sistemas: [
    { id:'sys-1', label:'Conectar Mercado Pago real',     done:false, priority:'high' },
    { id:'sys-2', label:'Dominio hidromedusa.com',        done:false, priority:'high' },
    { id:'sys-3', label:'OAuth Google/Apple/Instagram',   done:false, priority:'high' },
    { id:'sys-4', label:'Lista de palabras clave en puerta', done:false, priority:'med'  },
    { id:'sys-5', label:'Deploy lambdas MetaCall',        done:false, priority:'med'  },
  ],
  entradas_fisicas: [
    { id:'ef-1',  label:'Imprimir talonario',             done:false, priority:'high' },
    { id:'ef-2',  label:'Puntos de venta físicos',        done:false, priority:'med'  },
  ],
  costura: [
    { id:'cos-1', label:'Prototipo merch secreto VIP',    done:false, priority:'high' },
    { id:'cos-2', label:'Wristbands de la fecha',         done:false, priority:'med'  },
  ],
  redes: [
    { id:'red-1', label:'Post anuncio fecha 11/7',        done:false, priority:'high' },
    { id:'red-2', label:'Stories countdown',              done:false, priority:'med'  },
    { id:'red-3', label:'Reels post-evento',              done:false, priority:'med'  },
  ],
};

// Deep-clone a seed panel so callers can mutate freely.
function seedFor(panelId) {
  const s = TASK_SEED[panelId];
  return s ? s.map(t => ({ ...t })) : [];
}

const tasks = {
  // Fetch one panel's task list; seed from TASK_SEED if the item is absent.
  async getPanel(panelId) {
    const r = await run('tasks.getPanel', new GetCommand({ TableName: T.tasks, Key: { panelId } }));
    if (r.Item && Array.isArray(r.Item.tasks)) return r.Item.tasks;
    return seedFor(panelId);
  },
  // Map of every known panel -> its task list (persisted or seeded).
  async getAll() {
    const r = await run('tasks.getAll', new ScanCommand({ TableName: T.tasks }));
    const stored = {};
    for (const item of (r.Items || [])) {
      if (item && item.panelId) stored[item.panelId] = item.tasks || [];
    }
    const out = {};
    for (const panelId of Object.keys(TASK_SEED)) {
      out[panelId] = stored[panelId] || seedFor(panelId);
    }
    // Include any extra panels that exist in the store but not in the seed.
    for (const panelId of Object.keys(stored)) {
      if (!(panelId in out)) out[panelId] = stored[panelId];
    }
    return out;
  },
  // Persist a panel's full task list.
  async putPanel(panelId, list) {
    const item = { panelId, tasks: list || [] };
    await run('tasks.putPanel', new PutCommand({ TableName: T.tasks, Item: item }));
    return item.tasks;
  },
};

// ── Newsletter ────────────────────────────────────
const newsletter = {
  async add(email) {
    const item = { email, createdAt: new Date().toISOString() };
    await run('newsletter.add', new PutCommand({ TableName: T.newsletter, Item: item }));
    return item;
  },
  async list() {
    const r = await run('newsletter.list', new ScanCommand({ TableName: T.newsletter }));
    return r.Items || [];
  },
};

// ── Sessions ──────────────────────────────────────
// OAuth sessions keyed by token; TTL attr `expiresAt` (epoch seconds) if set.
const sessions = {
  async put(s) {
    await run('sessions.put', new PutCommand({ TableName: T.sessions, Item: s }));
    return s;
  },
  async get(token) {
    const r = await run('sessions.get', new GetCommand({ TableName: T.sessions, Key: { token } }));
    return r.Item || null;
  },
  async del(token) {
    await run('sessions.del', new DeleteCommand({ TableName: T.sessions, Key: { token } }));
    return true;
  },
};

module.exports = { tickets, tasks, newsletter, sessions, TABLES: T, TASK_SEED };
