// GET /jellyfish/:noun/:adjective → image/svg+xml
// Deterministic pixel-art jellyfish as static SVG (frame 0 / rest pose).
// Mirrors the logic in public/js/jellyfish.js — same hash, same params, same shapes.
// No native deps: pure JS, works in any Lambda Node.js runtime.

const SCALE  = 5;
const GRID_W = 28;
const GRID_H = 44;

function fnv(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.min(100, Math.max(0, s));
  l = Math.min(100, Math.max(0, l));
  return `hsl(${h|0},${s|0}%,${l|0}%)`;
}
function hsla(h, s, l, a) {
  h = ((h % 360) + 360) % 360;
  return `hsla(${h|0},${Math.min(100,Math.max(0,s))|0}%,${Math.min(100,Math.max(0,l))|0}%,${+a.toFixed(2)})`;
}

function derive(nHash, aHash) {
  const nb = (i) => (nHash >>> i) & 0xFF;
  const ab = (i) => (aHash  >>> i) & 0xFF;
  return {
    bellW:     10 + (nb(0)  % 5) * 2,
    bellH:      8 + (nb(8)  % 4) * 2,
    topStyle:  nb(16) % 3,
    edgeStyle: nb(20) % 3,
    innerPat:  nb(24) % 3,
    bellHue:   (nb(0) * 47 + nb(4) * 13) % 360,
    bellSat:   62 + nb(12) % 18,
    bellLit:   46 + nb(14) % 14,
    tentN:     3 + ab(0) % 4,
    tentLen:   10 + (ab(8) % 4) * 3,
    tentStyle: ab(16) % 3,
    tentThick: 1 + ab(20) % 2,
    tentHue:   (ab(0) * 53 + ab(4) * 17) % 360,
    tentSat:   65 + ab(12) % 15,
  };
}

function generateSVG(noun, adjective) {
  const nHash = fnv(noun);
  const aHash = fnv(adjective);
  const p = derive(nHash, aHash);
  const rects = [];

  function dot(gx, gy, fill) {
    if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return;
    rects.push(`<rect x="${gx * SCALE}" y="${gy * SCALE}" width="${SCALE}" height="${SCALE}" fill="${fill}"/>`);
  }

  const cx = GRID_W / 2;
  const bellTop = 2;
  const W = p.bellW;
  const H = p.bellH;
  const R = W / 2;

  const mainC  = hsl(p.bellHue, p.bellSat,      p.bellLit);
  const hlC    = hsl(p.bellHue, p.bellSat - 15,  p.bellLit + 20);
  const shadeC = hsl(p.bellHue, p.bellSat + 8,   p.bellLit - 14);
  const glowC  = hsl(p.bellHue, p.bellSat - 25,  p.bellLit + 30);
  const rimC   = hsl(p.bellHue, p.bellSat + 5,   p.bellLit - 22);

  let lastHW = 0;
  for (let dy = 0; dy < H; dy++) {
    const t = dy / H;
    let hw;
    switch (p.topStyle) {
      case 0: hw = R * Math.sin(t * Math.PI / 2);                        break;
      case 1: hw = R * (0.38 + 0.62 * Math.sin(t * Math.PI / 2));        break;
      case 2: hw = R * Math.pow(Math.sin(t * Math.PI / 2), 1.9);         break;
    }
    hw = Math.round(hw);
    if (hw < 1 && dy > 0) hw = 1;
    lastHW = hw;

    const rowL = Math.round(cx - hw);
    const rowR = Math.round(cx + hw);
    const gy   = bellTop + dy;

    for (let gx = rowL; gx <= rowR; gx++) {
      const xn = (gx - cx) / Math.max(1, R);
      let col;
      if (xn < -0.6)      col = hlC;
      else if (xn > 0.45) col = shadeC;
      else if (Math.abs(xn) < 0.22 && dy < 3) col = glowC;
      else                col = mainC;

      if (p.innerPat === 1 && dy > 2) {
        if ((gx * 3 + dy * 5) % 9 === 0 && Math.abs(xn) < 0.6) col = shadeC;
      } else if (p.innerPat === 2 && dy > 2) {
        if ((gx - dy) % 5 === 0) col = hlC;
      }
      dot(gx, gy, col);
    }
  }

  const rimY = bellTop + H;
  for (let gx = Math.round(cx - lastHW); gx <= Math.round(cx + lastHW); gx++) {
    dot(gx, rimY, rimC);
  }

  let fringeH = 0;
  switch (p.edgeStyle) {
    case 1:
      for (let gx = Math.round(cx - lastHW); gx <= Math.round(cx + lastHW); gx++) {
        if (gx % 3 === 1) dot(gx, rimY + 1, rimC);
      }
      fringeH = 1; break;
    case 2:
      for (let gx = Math.round(cx - lastHW); gx <= Math.round(cx + lastHW); gx++) {
        if (gx % 2 === 0) dot(gx, rimY + 1, rimC);
        if (gx % 4 === 0) dot(gx, rimY + 2, rimC);
      }
      fringeH = 2; break;
  }

  const tentTop = rimY + fringeH + 1;
  const N      = p.tentN;
  const spread = Math.max(1, lastHW - 1);

  for (let i = 0; i < N; i++) {
    const xBase = N === 1 ? cx : cx - spread + (i * 2 * spread / (N - 1));
    for (let dy = 0; dy < p.tentLen; dy++) {
      const prog = dy / p.tentLen;
      let xOff = 0;
      switch (p.tentStyle) {
        case 0: xOff = (i % 2 === 0 ? 1 : -1) * prog * prog * 1.2; break;
        case 1: xOff = Math.sin(prog * Math.PI * 3 + i * 1.1) * 1.5; break;
        case 2: xOff = (i % 2 === 0 ? 1 : -1) * Math.pow(prog, 1.4) * 2.5; break;
      }
      const gx = Math.round(xBase + xOff);
      const gy = tentTop + dy;
      const alpha = Math.max(0.12, 1 - prog * 0.7);
      if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
        rects.push(`<rect x="${gx * SCALE}" y="${gy * SCALE}" width="${p.tentThick * SCALE}" height="${SCALE}" fill="${hsla(p.tentHue, p.tentSat, 58, alpha)}"/>`);
      }
    }
  }

  const PX_W = GRID_W * SCALE;
  const PX_H = GRID_H * SCALE;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PX_W}" height="${PX_H}" viewBox="0 0 ${PX_W} ${PX_H}">`,
    `<rect width="${PX_W}" height="${PX_H}" fill="#060607"/>`,
    ...rects,
    `</svg>`,
  ].join('');
}

async function serve(req) {
  const noun = String(req.params?.noun || '').toLowerCase().trim();
  const adjective = String(req.params?.adjective || '').toLowerCase().trim();
  if (!noun || !adjective) {
    return { status: 400, body: 'missing noun or adjective', headers: { 'Content-Type': 'text/plain' } };
  }
  return {
    status: 200,
    body: generateSVG(noun, adjective),
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  };
}

module.exports = { serve, generateSVG };
