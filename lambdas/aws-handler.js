// AWS Lambda entrypoint (Lambda Function URL) for Hidromedusa.
// Routes HTTP requests to the MetaCall-style handlers (which return {status, body}).
// Storage: DynamoDB on-demand via lib/store.js, using the Lambda execution-role creds.
// AWS SDK v3 is provided by the Node.js Lambda runtime — no node_modules to bundle.

const tickets = require('./tickets/index');
const newsletter = require('./newsletter/index');

// path → handler. `params` names map regex capture groups onto req.params.
const ROUTES = [
  { m: 'POST', re: /^\/tickets\/request$/,        fn: tickets.request },
  { m: 'POST', re: /^\/tickets\/capture$/,        fn: tickets.capture },
  { m: 'POST', re: /^\/tickets\/redeem$/,         fn: tickets.redeem },
  { m: 'POST', re: /^\/tickets\/issue$/,          fn: tickets.issue },
  { m: 'GET',  re: /^\/tickets$/,                 fn: tickets.list },
  { m: 'POST', re: /^\/tickets\/([^/]+)\/free$/,  fn: tickets.free,      params: ['id'] },
  { m: 'POST', re: /^\/tickets\/([^/]+)\/scan$/,  fn: tickets.scan,      params: ['id'] },
  { m: 'GET',  re: /^\/tickets\/([^/]+)$/,        fn: tickets.getTicket, params: ['id'] },
  { m: 'POST', re: /^\/newsletter\/subscribe$/,   fn: newsletter.subscribe },
  { m: 'GET',  re: /^\/newsletter\/list$/,        fn: newsletter.list },
];

// CORS is handled by the Function URL CORS config (restricted to the site domain),
// so the handler must NOT emit Access-Control-* headers (would duplicate them).
function reply(status, body, extra) {
  return {
    statusCode: status || 200,
    headers: { 'Content-Type': 'application/json', ...(extra || {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const method = event?.requestContext?.http?.method || event?.httpMethod || 'GET';
  const path = (event?.rawPath || event?.path || '/').replace(/\/+$/, '') || '/';

  if (method === 'OPTIONS') return { statusCode: 204, body: '' };  // preflight (usually handled by Function URL)

  let body = {};
  if (event && event.body) {
    try {
      const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
      body = raw ? JSON.parse(raw) : {};
    } catch (e) { body = {}; }
  }
  const query = event?.queryStringParameters || {};

  for (const r of ROUTES) {
    if (r.m !== method) continue;
    const match = path.match(r.re);
    if (!match) continue;
    const params = {};
    (r.params || []).forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
    try {
      const out = await r.fn({ body, params, query, headers: event.headers || {} });
      return reply(out.status, out.body, out.headers);
    } catch (err) {
      console.error('handler error:', err);
      return reply(500, { error: err.message });
    }
  }
  return reply(404, { error: 'Not found', path, method });
};
