// Parejas de barra: cada persona con palabra queda en UNA sola pareja con alguien que
// comparte una de sus dos palabras → 1 consumición por pareja.
// Determinístico (mismo input → mismas parejas), así el PDF y /listas/ coinciden.
// Las personas de una entrada "x 2" cuentan por separado, pero no se emparejan entre ellas.
//
// Exports:
//   personas(name) -> 1, o N si el nombre termina en " x N"
//   pairUp(paid)   -> { pairs:[{ a, b, word }], unpaired:[claim] }   (paid = [{ claim, buyerName }])

function personas(name) {
  const m = /\bx\s*(\d+)\s*$/i.exec(name || '');
  return m ? Number(m[1]) : 1;
}

const shareWord = (a, b) => a.split('-').find((w) => b.split('-').includes(w)) || null;

// Greedy de grado mínimo: siempre se empareja primero a quien le quedan menos opciones,
// con la opción que a su vez tiene menos. Empates por orden alfabético.
function pairUp(paid) {
  const people = [];
  for (const t of [...paid].sort((x, y) => x.claim.localeCompare(y.claim))) {
    for (let i = 0; i < personas(t.buyerName); i++) people.push(t.claim);
  }
  const adj = people.map((c, i) => people.map((d, j) => j).filter((j) => people[j] !== c && shareWord(c, people[j])));
  const free = new Set(people.map((c, i) => i));
  const deg = (i) => adj[i].filter((j) => free.has(j)).length;
  const pairs = [];
  for (;;) {
    let u = -1;
    for (const i of free) if (deg(i) > 0 && (u < 0 || deg(i) < deg(u))) u = i;
    if (u < 0) break;
    let v = -1;
    for (const j of adj[u]) if (free.has(j) && (v < 0 || deg(j) < deg(v))) v = j;
    free.delete(u); free.delete(v);
    const [a, b] = [people[u], people[v]].sort();
    pairs.push({ a, b, word: shareWord(a, b) });
  }
  pairs.sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  return { pairs, unpaired: [...free].map((i) => people[i]).sort() };
}

module.exports = { pairUp, personas };
