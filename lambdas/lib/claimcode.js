// Claim codes — two-word Spanish phrases (noun-adjective) for ticket pickup.
// Oceanic / rave themed. No Math.random restriction here (lambdas, not workflows).
//
// Exports:
//   makePhrase() -> "<noun>-<adjective>"   e.g. "medusa-violeta"
//   normalize(s) -> lowercase, accent-stripped, spaces -> '-'

const NOUNS = [
  'medusa', 'abismo', 'corriente', 'marea', 'plancton', 'kraken',
  'coral', 'oleaje', 'sirena', 'arrecife', 'profundidad', 'tentaculo',
  'cardumen', 'fosforo', 'bioluz', 'remolino', 'espuma', 'naufragio',
];

const ADJECTIVES = [
  'violeta', 'fosforescente', 'abisal', 'salado', 'electrico', 'nocturno',
  'profundo', 'turquesa', 'magnetico', 'brillante', 'lunar', 'sonico',
  'hipnotico', 'iridiscente', 'subacuatico', 'pulsante', 'neon', 'cosmico',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Build a fresh claim phrase. Already in normalized form (lowercase, no accents).
function makePhrase() {
  return `${pick(NOUNS)}-${pick(ADJECTIVES)}`;
}

// Canonicalize a user-typed phrase for lookup/storage:
// lowercase, strip accents (NFD), trim, collapse whitespace to single '-'.
function normalize(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // drop combining accent marks
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-');
}

module.exports = { makePhrase, normalize, NOUNS, ADJECTIVES };
