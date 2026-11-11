// Deterministic pixel-art jellyfish generator.
// Each noun→bell shape, each adjective→tentacle style. Same pair = same jellyfish.
//
// Usage:
//   const handle = JellyfishGen.render(canvas, 'medusa', 'violeta');
//   handle.stop(); // cancel animation
//   JellyfishGen.preview(canvas, 'medusa', 'violeta'); // single frame, no animation
//
// Niveles: cada fecha a la que vuelve con su medusa, sube uno y gana un rasgo.
//   JellyfishGen.render(canvas, 'medusa', 'violeta', { level: 2, rasgos: ['velo'] });
//   Nivel 1 = el pixel art original (28×44). Desde el 2, la MISMA medusa (mismo derive)
//   con el doble de definición (56×88), pulso continuo y sus rasgos.
//   JellyfishGen.draw(ctx, n, a, opts, segundos) dibuja un cuadro suelto (videos).

;((root) => {
  'use strict';

  const SCALE  = 5;   // actual pixels per grid cell
  const GRID_W = 28;
  const GRID_H = 44;

  // ── Word lists (mirror claimcode.js) ────────────────────────────────────────
  const NOUNS = [
    'medusa','abismo','corriente','marea','plancton','kraken',
    'coral','oleaje','sirena','arrecife','profundidad','tentaculo',
    'cardumen','fosforo','bioluz','remolino','espuma','naufragio',
  ];
  const ADJECTIVES = [
    'violeta','fosforescente','abisal','salado','electrico','nocturno',
    'profundo','turquesa','magnetico','brillante','lunar','sonico',
    'hipnotico','iridiscente','subacuatico','pulsante','neon','cosmico',
  ];

  // ── FNV-1a hash → stable integer from a string ──────────────────────────────
  function fnv(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  // ── Color helpers ────────────────────────────────────────────────────────────
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.min(100, Math.max(0, s));
    l = Math.min(100, Math.max(0, l));
    return `hsl(${h|0},${s|0}%,${l|0}%)`;
  }
  function hsla(h, s, l, a) {
    h = ((h % 360) + 360) % 360;
    s = Math.min(100, Math.max(0, s));
    l = Math.min(100, Math.max(0, l));
    return `hsla(${h|0},${s|0}%,${l|0}%,${+a.toFixed(2)})`;
  }

  // ── Fill one grid cell ───────────────────────────────────────────────────────
  function dot(ctx, gx, gy, fill) {
    if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return;
    ctx.fillStyle = fill;
    ctx.fillRect(gx * SCALE, gy * SCALE, SCALE, SCALE);
  }

  // ── Derive all visual parameters from the two hashes ────────────────────────
  function derive(nHash, aHash) {
    const nb = (i) => (nHash >>> i) & 0xFF; // noun byte slice
    const ab = (i) => (aHash  >>> i) & 0xFF; // adjective byte slice

    return {
      // Bell (from noun)
      bellW:     10 + (nb(0)  % 5) * 2,       // 10,12,14,16,18
      bellH:     8  + (nb(8)  % 4) * 2,        // 8,10,12,14
      topStyle:  nb(16) % 3,                   // 0=dome 1=flat 2=pointed
      edgeStyle: nb(20) % 3,                   // 0=smooth 1=bumpy 2=fringe
      innerPat:  nb(24) % 3,                   // 0=none 1=spots 2=stripes
      bellHue:   (nb(0) * 47 + nb(4) * 13) % 360,
      bellSat:   62 + nb(12) % 18,             // 62-80
      bellLit:   46 + nb(14) % 14,             // 46-60

      // Tentacles (from adjective)
      tentN:     3 + ab(0) % 4,                // 3,4,5,6
      tentLen:   10 + (ab(8) % 4) * 3,         // 10,13,16,19
      tentStyle: ab(16) % 3,                   // 0=straight 1=wave 2=curl
      tentThick: 1 + ab(20) % 2,               // 1,2
      tentHue:   (ab(0) * 53 + ab(4) * 17) % 360,
      tentSat:   65 + ab(12) % 15,             // 65-80
    };
  }

  // ── Draw one animation frame ─────────────────────────────────────────────────
  function drawFrame(ctx, p, frame) {
    ctx.clearRect(0, 0, GRID_W * SCALE, GRID_H * SCALE);

    // Frame mutations (frame 1 = contract, frame 2 = expand)
    const wAdj = frame === 2 ?  2 : (frame === 1 ? -1 : 0);
    const hAdj = frame === 1 ?  1 : (frame === 2 ? -1 : 0);

    const W  = Math.max(4, p.bellW + wAdj);
    const H  = Math.max(4, p.bellH + hAdj);
    const R  = W / 2;
    const cx = GRID_W / 2;       // horizontal center
    const bellTop = 2;

    // Bell colors
    const mainC  = hsl(p.bellHue, p.bellSat,      p.bellLit);
    const hlC    = hsl(p.bellHue, p.bellSat - 15,  p.bellLit + 20);
    const shadeC = hsl(p.bellHue, p.bellSat + 8,   p.bellLit - 14);
    const glowC  = hsl(p.bellHue, p.bellSat - 25,  p.bellLit + 30);
    const rimC   = hsl(p.bellHue, p.bellSat + 5,   p.bellLit - 22);

    // ── Bell body ──
    let lastHW = 0;
    for (let dy = 0; dy < H; dy++) {
      const t = dy / H;  // 0=top, 1=bottom
      let hw;
      switch (p.topStyle) {
        case 0: hw = R * Math.sin(t * Math.PI / 2);              break; // dome
        case 1: hw = R * (0.38 + 0.62 * Math.sin(t * Math.PI / 2)); break; // flat-top
        case 2: hw = R * Math.pow(Math.sin(t * Math.PI / 2), 1.9); break; // pointed
      }
      hw = Math.round(hw);
      if (hw < 1 && dy > 0) hw = 1;
      lastHW = hw;

      const rowL = Math.round(cx - hw);
      const rowR = Math.round(cx + hw);
      const gy   = bellTop + dy;

      for (let gx = rowL; gx <= rowR; gx++) {
        const xn = (gx - cx) / Math.max(1, R); // -1..1

        let col;
        if (xn < -0.6)       col = hlC;      // left highlight
        else if (xn > 0.45)  col = shadeC;   // right shadow
        else if (Math.abs(xn) < 0.22 && dy < 3) col = glowC; // top inner glow
        else                 col = mainC;

        // Inner pattern
        if (p.innerPat === 1 && dy > 2) {     // scattered spots
          if ((gx * 3 + dy * 5) % 9 === 0 && Math.abs(xn) < 0.6) col = shadeC;
        } else if (p.innerPat === 2 && dy > 2) { // diagonal stripes
          if ((gx - dy * 1) % 5 === 0) col = hlC;
        }

        dot(ctx, gx, gy, col);
      }
    }

    // ── Rim ──
    const rimY = bellTop + H;
    for (let gx = Math.round(cx - lastHW); gx <= Math.round(cx + lastHW); gx++) {
      dot(ctx, gx, rimY, rimC);
    }

    // ── Edge decoration ──
    let fringeH = 0;
    switch (p.edgeStyle) {
      case 1: // bumpy
        for (let gx = Math.round(cx - lastHW); gx <= Math.round(cx + lastHW); gx++) {
          if (gx % 3 === 1) dot(ctx, gx, rimY + 1, rimC);
        }
        fringeH = 1;
        break;
      case 2: // fringe
        for (let gx = Math.round(cx - lastHW); gx <= Math.round(cx + lastHW); gx++) {
          if (gx % 2 === 0) dot(ctx, gx, rimY + 1, rimC);
          if (gx % 4 === 0) dot(ctx, gx, rimY + 2, rimC);
        }
        fringeH = 2;
        break;
    }

    // ── Tentacles ──
    const tentTop = rimY + fringeH + 1;
    const N       = p.tentN;
    const spread  = Math.max(1, lastHW - 1);
    const lenMod  = frame === 1 ? 3 : (frame === 2 ? -2 : 0);
    const tLen    = Math.max(3, p.tentLen + lenMod);

    for (let i = 0; i < N; i++) {
      const xBase = N === 1 ? cx
        : cx - spread + (i * 2 * spread / (N - 1));
      // frame 1: tentacles spread outward slightly
      const splayMod = frame === 1 ? (i - (N - 1) / 2) * 0.9 : 0;

      for (let dy = 0; dy < tLen; dy++) {
        const prog = dy / tLen;
        let xOff = splayMod;

        switch (p.tentStyle) {
          case 0: // gentle natural drift
            xOff += (i % 2 === 0 ? 1 : -1) * prog * prog * 1.2;
            break;
          case 1: // sine wave
            xOff += Math.sin(prog * Math.PI * 3 + i * 1.1 + frame * 0.8) * 1.5;
            break;
          case 2: // curl (alternating direction)
            xOff += (i % 2 === 0 ? 1 : -1) * Math.pow(prog, 1.4) * 2.5;
            break;
        }

        const gx    = Math.round(xBase + xOff);
        const gy    = tentTop + dy;
        const alpha = Math.max(0.12, 1 - prog * 0.7);
        const col   = hsla(p.tentHue, p.tentSat, 58, alpha);

        if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
          ctx.fillStyle = col;
          ctx.fillRect(gx * SCALE, gy * SCALE, p.tentThick * SCALE, SCALE);
        }
      }
    }
  }

  // ── Nivel 2 en adelante ─────────────────────────────────────────────────────
  // Los mismos parámetros de derive() con el doble de definición: grilla de 56×88,
  // más tonos con tramado, borde suave, canales y manubrio por dentro, brillo propio,
  // pulso continuo (contracción rápida, relajación lenta) y los rasgos ganados.
  const HD = 2, HD_W = GRID_W * HD, HD_H = GRID_H * HD;
  const HD_FPS = 12;     // sigue viéndose pixelada
  const PERIOD = 1.5;    // s por latido
  const RASGOS = ['corona', 'espiral', 'destello', 'aura', 'velo', 'brazos', 'trebol', 'lunares', 'cometa', 'faro'];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

  const smooth  = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  // mulberry32: posiciones fijas por medusa (lunares, destellos)
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Medio ancho de la campana (0..1) a la altura t (0 = tope, 1 = borde); igual que en drawFrame
  function profile(style, t) {
    const s = Math.sin(t * Math.PI / 2);
    return style === 0 ? s : style === 1 ? 0.38 + 0.62 * s : Math.pow(s, 1.9);
  }

  function drawHD(ctx, p, rasgos, seed, time, S) {
    const has = (r) => rasgos.indexOf(r) >= 0;
    const ph  = (time / PERIOD) % 1;
    const k   = ph < 0.3 ? smooth(ph / 0.3) : 1 - smooth((ph - 0.3) / 0.7);   // 0 reposo → 1 contraída
    ctx.clearRect(0, 0, HD_W * S, HD_H * S);

    const dith = (gx, gy) => BAYER[(gy & 3) * 4 + (gx & 3)];
    // una celda, con la luz en escalones y tramado ordenado (sigue siendo pixel art)
    const px = (x, y, h, s, l, a) => {
      const gx = Math.floor(x), gy = Math.floor(y);
      if (gx < 0 || gx >= HD_W || gy < 0 || gy >= HD_H || a < 0.03) return;
      const lq = Math.round((l + dith(gx, gy) * 7) / 7) * 7;
      ctx.fillStyle = hsla(h, s, lq, Math.min(1, a));
      ctx.fillRect(gx * S, gy * S, S, S);
    };
    // luz de puntitos: la celda va entera o no va, según el tramado (halos y haces)
    const speck = (x, y, h, s, l, a) => {
      const gx = Math.floor(x), gy = Math.floor(y);
      if (gx >= 0 && gy >= 0 && a > dith(gx, gy) + 0.5) px(gx, gy, h, s, l, 0.9);
    };
    // para trazos: cada celda una sola vez (si no, el alfa se acumula)
    const trail = () => {
      const seen = new Set();
      return (x, y, h, s, l, a) => {
        const key = Math.floor(x) + ',' + Math.floor(y);
        if (!seen.has(key)) { seen.add(key); px(x, y, h, s, l, a); }
      };
    };
    // brillo suave; el radio se achica para que se apague antes del borde del lienzo
    const glow = (x, y, r, h, s, l, a) => {
      r = Math.min(r, x, HD_W - x, y, HD_H - y);
      if (r < 1 || a <= 0) return;
      const g = ctx.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
      g.addColorStop(0, hsla(h, s, l, a));
      g.addColorStop(1, hsla(h, s, l, 0));
      ctx.fillStyle = g;
      ctx.fillRect((x - r) * S, (y - r) * S, 2 * r * S, 2 * r * S);
    };

    // Medidas en reposo (para que lo que se sortea no salte entre cuadros) y latiendo
    const TOP = 6, H0 = p.bellH * HD, R0 = (p.bellW * HD) / 2;
    const fringeH = [0, 2, 4][p.edgeStyle];
    const cx   = HD_W / 2;
    const R    = R0 * (1 - 0.12 * k);
    const H    = H0 * (1 + 0.1 * k);
    const top  = TOP - 1.5 * k;              // al latir sube un poco
    const rimY = Math.floor(top + H);
    const hwAt = (t) => profile(p.topStyle, clamp01(t)) * R;
    const hwR  = hwAt(1);
    const tTop = rimY + fringeH + 1;
    const tLen = p.tentLen * HD + 6 * k - (has('espiral') ? 6 : 0);

    glow(cx, top + H * 0.5, R * 1.9, p.bellHue, 85, 60, 0.16 + 0.1 * k);

    if (has('aura')) {     // halo del color opuesto alrededor de toda la medusa, con una onda por latido
      const yEnd = Math.min(HD_H - 2, tTop + tLen), ay = (top + yEnd) / 2, ah = p.bellHue + 180;
      const rx = Math.min(cx - 0.5, R + 10), ry = Math.min(ay - 0.5, HD_H - ay - 0.5, (yEnd - top) / 2 + 8);
      ctx.save();
      ctx.translate(cx * S, ay * S);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * S);
      g.addColorStop(0, hsla(ah, 90, 60, 0.42 + 0.12 * k));
      g.addColorStop(0.55, hsla(ah, 90, 55, 0.2 + 0.08 * k));
      g.addColorStop(1, hsla(ah, 90, 50, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-rx * S, -rx * S, 2 * rx * S, 2 * rx * S);
      ctx.restore();
      for (let gy = 0; gy < HD_H; gy++)
        for (let gx = 0; gx < HD_W; gx++) {
          const d = Math.hypot((gx + 0.5 - cx) / rx, (gy + 0.5 - ay) / ry);
          const w = Math.max(0, 1 - Math.abs(d - 0.55 - 0.4 * ph) * 9) * (1 - ph);
          if (w > 0) speck(gx, gy, ah, 90, 76, 0.8 * w);
        }
    }

    const fy = top + H * 0.45;
    if (has('faro')) {     // dos haces que giran, detrás de la campana
      const th = time * 1.1 - 1.23;
      for (let gy = 0; gy < HD_H; gy++)
        for (let gx = 0; gx < HD_W; gx++) {
          const dx = gx + 0.5 - cx, dy = gy + 0.5 - fy, d = Math.hypot(dx, dy);
          if (d < 2 || d > 26) continue;
          let da = Math.abs(((Math.atan2(dy, dx) - th) % Math.PI + Math.PI) % Math.PI);
          da = Math.min(da, Math.PI - da);
          const a = (1 - da / 0.28) * (1 - d / 26);
          if (a > 0) speck(gx, gy, 48, 100, 84, a * 1.6);
        }
    }

    // ── Tentáculos: mismo número, largo y estilo, con luz y sombra ──
    const N      = p.tentN;
    const spread = Math.max(1, hwR - 2);
    const tw     = p.tentThick === 2 ? 3 : 2;
    const tl     = tw === 3 ? [72, 58, 44] : [66, 48];
    for (let i = 0; i < N; i++) {
      const xb   = N === 1 ? cx : cx - spread + (i * 2 * spread) / (N - 1);
      const side = i % 2 === 0 ? 1 : -1;
      const len  = tLen - (has('espiral') && i % 2 ? 5 : 0);
      const pts  = [];
      for (let s = 0; s <= len; s += 0.5) {
        const pr = s / len;
        let x = xb - tw / 2 + (i - (N - 1) / 2) * 1.8 * k;
        if (p.tentStyle === 0)      x += side * pr * pr * 2.4;
        else if (p.tentStyle === 1) x += Math.sin(pr * Math.PI * 3 + i * 1.1 - ph * Math.PI * 2) * 3;
        else                        x += side * Math.pow(pr, 1.4) * 5;
        x += Math.sin(time * 1.3 + i * 2.1 + pr * 2) * 0.8 * pr;     // deriva
        pts.push([x, tTop + s, pr, 0]);
      }
      if (has('espiral')) {   // la punta se enrolla hacia afuera
        const out = xb < cx ? -1 : xb > cx ? 1 : side;
        const [xe, ye] = pts[pts.length - 1], r0 = 3.6, ox = xe + out * r0, A = Math.PI * 2.4;
        for (let a = 0.1; a <= A; a += 0.08) {
          const r = r0 * (1 - 0.7 * a / A);
          pts.push([ox - out * r * Math.cos(a), ye + r * Math.sin(a), 1, 1]);
        }
      }
      const put = trail();
      pts.forEach(([x, y, pr, curl], j) => {
        const a = curl ? 0.95 : Math.max(0.15, 1 - pr * (has('espiral') ? 0.4 : 0.7));
        const n = curl || pr > 0.88 ? 1 : pr > 0.7 ? Math.max(1, tw - 1) : tw;   // la punta se afina
        if (j % 16 === 8) put(x, y, p.tentHue, p.tentSat - 20, 88, a);       // nematocistos
        for (let w = 0; w < n; w++) put(x + w, y, p.tentHue, p.tentSat, tl[w] - (curl ? -6 : 8 * pr), a);
      });
    }

    if (has('cometa')) {   // un tentáculo central larguísimo, con chispas que bajan
      const put = trail(), len = HD_H - 2 - tTop, hue = p.tentHue + 30;
      const at  = (u) => cx - 1 + Math.sin(u * Math.PI * 2.2 - time * 1.6) * 2.4 * u;
      for (let s = 0; s <= len; s += 0.5) {
        const pr = s / len;
        put(at(pr), tTop + s, hue, 95, 92 - 20 * pr, 1 - 0.35 * pr);
        put(at(pr) + 1, tTop + s, hue, 90, 70 - 14 * pr, 1 - 0.4 * pr);
      }
      for (let j = 0; j < 5; j++) {
        const u = (time * 0.3 + j / 5) % 1, y = tTop + u * len, x = at(u) + (j % 2 ? 3 : -2.5);
        px(x, y, hue, 60, 98, 1 - 0.7 * u);
        px(x + 1, y, hue, 80, 84, 0.8 * (1 - 0.7 * u));
        px(x, y - 1, hue, 80, 84, 0.8 * (1 - 0.7 * u));
        px(x, y - 2, hue, 80, 70, 0.4 * (1 - u));
      }
    }

    if (has('brazos')) {   // cuatro brazos orales con volados
      for (let j = 0; j < 4; j++) {
        const put = trail(), len = H * 1.3 + 4 * k, x0 = cx - 4.5 + j * 2.4, out = j < 2 ? -1 : 3;
        for (let s = 0; s <= len; s += 0.5) {
          const pr = s / len, a = 0.95 - 0.4 * pr;
          const x = x0 + (j - 1.5) * 2.6 * pr + Math.sin(pr * Math.PI * 2.5 - time * 1.4 + j * 1.7) * 1.6 * pr;
          if (Math.floor(s) % 3 !== 2) put(x + out, rimY + s, p.bellHue + 10, p.bellSat - 15, p.bellLit + 30, a * 0.85);
          put(x, rimY + s, p.bellHue + 10, p.bellSat - 5, p.bellLit + 20 - 10 * pr, a);
          put(x + 1, rimY + s, p.bellHue + 10, p.bellSat, p.bellLit + 6 - 10 * pr, a);
          put(x + 2, rimY + s, p.bellHue + 10, p.bellSat + 5, p.bellLit - 8 - 10 * pr, a);
        }
      }
    }

    // ── Campana: la paleta del nivel 1 (luz a la izquierda, sombra a la derecha, brillo arriba) en degradé ──
    const canals = [-0.62, -0.22, 0.22, 0.62];
    const pick = (salt, n, minD, fn) => {   // n puntos al azar fijo, separados entre sí (en reposo)
      const r = rng(seed ^ salt), out = [];
      for (let j = 0; j < 80 && out.length < n; j++) {
        const q = fn(r);
        if (q && out.every((o) => Math.hypot((o[0] - q[0]) * R0, (o[1] - q[1]) * H0) > minD)) out.push(q);
      }
      return out;
    };
    const spots = p.innerPat === 1 ? pick(0x5A, 7, 4, (r) => [r() * 1.2 - 0.6, 0.3 + r() * 0.55]) : [];
    for (let gy = Math.floor(top); gy < rimY; gy++) {
      const y = gy + 0.5, t = clamp01((y - top) / H), hw = hwAt(t);
      if (y < top) continue;
      for (let gx = Math.floor(cx - hw); gx <= Math.ceil(cx + hw); gx++) {
        const dx = gx + 0.5 - cx;
        if (Math.abs(dx) > hw + 0.5) continue;
        const xn = dx / R;
        const hl = smooth((-xn - 0.3) / 0.45);
        const sh = smooth((xn - 0.2) / 0.5);
        const gl = (1 - smooth(Math.abs(xn) / 0.4)) * (1 - smooth(t / 0.35));
        let h = p.bellHue;
        let s = p.bellSat - 15 * hl + 8 * sh - 25 * gl;
        let l = p.bellLit + 20 * hl - 14 * sh + 30 * gl - 8 * smooth((t - 0.7) / 0.3);
        const sp = Math.hypot((xn + 0.45) / 0.16, (t - 0.3) / 0.12);         // reflejo
        if (sp < 1) { l += 22 * (1 - sp); s -= 20 * (1 - sp); }
        if (t > 0.15 && t < 0.92 && canals.some((c) => Math.abs(dx - c * hw) < 0.5)) l += 7;
        if (t > 0.45 && Math.abs(dx) < 1.6 + 0.5 * k) { h += 14; l -= 4; s += 6; }   // manubrio
        if (p.innerPat === 2 && t > 0.2 && ((gx - gy) % 10 + 10) % 10 < 2) { l += 14; s -= 10; }   // rayas
        for (const [sx, sy] of spots) if (Math.hypot(dx - sx * hw, (t - sy) * H) < 1.5) { l -= 14; s += 8; }
        px(gx, gy, h, s, l, 1);
      }
    }

    if (has('lunares')) {
      pick(0x51, 5, 7, (r) => [r() * 1.5 - 0.75, 0.28 + r() * 0.58]).forEach(([xr, t]) => {
        const ox = Math.floor(cx + xr * Math.max(0, hwAt(t) - 3)) + 0.5, oy = Math.floor(top + t * H) + 0.5;
        for (let gy = Math.floor(oy - 3); gy <= oy + 3; gy++)
          for (let gx = Math.floor(ox - 3); gx <= ox + 3; gx++) {
            const dx = gx + 0.5 - ox, dy = gy + 0.5 - oy, d = Math.hypot(dx, dy);
            if (d < 2.4) px(gx, gy, p.tentHue, p.tentSat + 10, dx < 0 && dy < 0 ? 84 : d > 1.6 ? 54 : 66, 1);
          }
      });
    }

    if (has('trebol')) {   // las cuatro gónadas, en trébol
      const cy = top + H * 0.56, d = Math.max(2.5, R * (p.topStyle === 2 ? 0.26 : 0.32)), rr = Math.max(1.6, R * 0.16);
      [[-d, 0], [d, 0], [0, -d * 0.75], [0, d * 0.75]].forEach(([ox, oy]) => {
        const x0 = cx + ox, y0 = cy + oy;
        for (let gy = Math.floor(y0 - rr - 1); gy <= y0 + rr + 1; gy++)
          for (let gx = Math.floor(x0 - rr - 1); gx <= x0 + rr + 1; gx++) {
            const dd = Math.hypot(gx + 0.5 - x0, gy + 0.5 - y0);
            if (Math.abs(dd - rr) < 0.6) px(gx, gy, p.tentHue, 88, 72, 1);
            else if (dd < rr) px(gx, gy, p.tentHue, 70, 50, 0.55);
          }
      });
    }

    if (has('faro')) {     // núcleo que se prende con cada latido
      const rx = Math.max(1.6, R * 0.28), ry = Math.max(1.6, H * 0.16);
      for (let gy = Math.floor(fy - ry - 1); gy <= fy + ry + 1; gy++)
        for (let gx = Math.floor(cx - rx - 1); gx <= cx + rx + 1; gx++) {
          const d = Math.hypot((gx + 0.5 - cx) / rx, (gy + 0.5 - fy) / ry);
          if (d < 1) px(gx, gy, 48, 100, 97 - 22 * d, 1);
          else if (d < 1.5) px(gx, gy, 48, 100, 70, (1.5 - d) * (0.8 + 0.4 * k));
        }
    }

    // ── Borde: canal anular claro, labio oscuro y el borde de siempre ──
    for (let gx = Math.floor(cx - hwR); gx < Math.ceil(cx + hwR); gx++) {
      px(gx, rimY - 1, p.bellHue, p.bellSat, p.bellLit + 14, 1);
      px(gx, rimY, p.bellHue, p.bellSat + 5, p.bellLit - 22, 1);
    }
    if (p.edgeStyle === 1) {          // lóbulos
      for (let x = cx - hwR + 1.5; x <= cx + hwR - 1.5; x += 4)
        for (let gy = rimY + 1; gy <= rimY + 2; gy++)
          for (let gx = Math.floor(x - 2); gx <= x + 2; gx++)
            if (Math.hypot(gx + 0.5 - x, gy - rimY - 0.5) < 1.9) px(gx, gy, p.bellHue, p.bellSat + 5, p.bellLit - (gy === rimY + 1 ? 8 : 16), 1);
    } else if (p.edgeStyle === 2) {   // flecos
      for (let gx = Math.floor(cx - hwR); gx < cx + hwR; gx += 2) {
        const len = gx % 4 === 0 ? 4 : 2;
        for (let s = 1; s <= len; s++)
          px(gx + Math.sin(time * 3 + gx * 0.7) * 0.5 * (s / len), rimY + s, p.bellHue, p.bellSat + 5, p.bellLit - 18 + 4 * s, 1 - 0.15 * s);
      }
    }

    if (has('velo')) {     // membrana que ondula bajo el borde, con el canto claro
      for (let gx = Math.floor(cx - hwR * 0.96); gx < Math.ceil(cx + hwR * 0.96); gx++) {
        const d = Math.round(4 + Math.sin(gx * 0.6 + time * 3.2) * 1.2 + 1.5 * k);
        for (let j = 1; j <= d; j++)
          px(gx, rimY + j, p.bellHue + 25, p.bellSat - 10, j === d ? p.bellLit + 32 : p.bellLit + 18, j === d ? 0.95 : 0.45);
      }
    }

    if (has('corona')) {   // cuentas de luz por el contorno de arriba, a distancias iguales
      const path = [];
      for (let u = -1; u <= 1.0001; u += 0.02) {
        const t = Math.abs(u) * 0.6;
        path.push([cx + Math.sign(u) * hwAt(t), top + t * H]);
      }
      let acc = 2.1, j = 0;
      for (let i = 1; i < path.length - 1; i++) {
        acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
        if (acc < 4.2) continue;
        acc = 0;
        let nx = path[i + 1][1] - path[i - 1][1], ny = path[i - 1][0] - path[i + 1][0];
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        if (ny > 0) { nx = -nx; ny = -ny; }   // hacia afuera
        const bx = path[i][0] + nx * 2.4, by = path[i][1] + ny * 2.4;
        const a = 0.6 + 0.4 * Math.sin(time * 4 + j++ * 1.3);
        px(bx, by, p.tentHue, 40, 97, a);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([u, v]) => px(bx + u, by + v, p.tentHue, 90, 70, a * 0.85));
      }
    }

    if (has('destello')) { // estrellitas que titilan alrededor, nunca encima de la campana
      pick(0xD5, 7, 9, (r) => {
        const x = 3 + r() * (HD_W - 6), y = 3 + r() * (TOP + H0 + fringeH + p.tentLen * HD - 3), t = (y - TOP) / H0;
        return t > -0.2 && t < 1.2 && Math.abs(x - cx) < profile(p.topStyle, clamp01(t)) * R0 + 4 ? null : [x / R0, y / H0];
      }).forEach(([xr, yr], j) => {
        const sx = xr * R0, sy = yr * H0, tw = Math.sin(time * 2.2 + j * 2.4);
        if (tw <= 0) return;
        const arm = tw > 0.75 ? 3 : tw > 0.4 ? 2 : 1;
        px(sx, sy, p.tentHue, 40, 98, 1);
        for (let d = 1; d <= arm; d++)
          [[d, 0], [-d, 0], [0, d], [0, -d]].forEach(([u, v]) => px(sx + u, sy + v, p.tentHue, 60, 90 - 6 * d, tw * (1 - (d - 1) / 3)));
        if (arm === 3) [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([u, v]) => px(sx + u, sy + v, p.tentHue, 60, 80, 0.5));
      });
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Render with animation. Returns {stop()}.
  // Hold times: frame 0 = rest (500ms), frame 1 = contract (160ms), frame 2 = expand (200ms)
  const HOLDS = [500, 160, 200];

  // opts = { level, rasgos, scale }. scale (px por celda) solo cambia del nivel 2 en adelante.
  function opt(o) {
    o = o || {};
    return {
      level:  Math.max(1, o.level | 0),
      rasgos: (o.rasgos || []).filter((r) => RASGOS.indexOf(r) >= 0),
      scale:  o.scale || SCALE,
    };
  }

  // Tamaño del lienzo: 140×220 el nivel 1; 280×440 del 2 en adelante (con scale 5).
  function size(o) {
    o = opt(o);
    return o.level < 2 ? { w: GRID_W * SCALE, h: GRID_H * SCALE } : { w: HD_W * o.scale, h: HD_H * o.scale };
  }

  // Un cuadro en el instante `time` (s), en un lienzo dimensionado con size(): para videos.
  function draw(ctx, noun, adjective, o, time) {
    o = opt(o);
    const p = derive(fnv(noun), fnv(adjective));
    if (o.level >= 2) return drawHD(ctx, p, o.rasgos, fnv(noun + '-' + adjective), time, o.scale);
    let ms = (time * 1000) % (HOLDS[0] + HOLDS[1] + HOLDS[2]), f = 0;
    while (ms >= HOLDS[f]) { ms -= HOLDS[f]; f++; }
    drawFrame(ctx, p, f);
  }

  function render(canvas, noun, adjective, o) {
    o = opt(o);
    const { w, h } = size(o);
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const p   = derive(fnv(noun), fnv(adjective));
    let tid    = null;
    let active = true;

    if (o.level >= 2) {
      const seed = fnv(noun + '-' + adjective), t0 = Date.now();
      (function tick() {
        if (!active) return;
        drawHD(ctx, p, o.rasgos, seed, (Date.now() - t0) / 1000, o.scale);
        tid = setTimeout(tick, 1000 / HD_FPS);
      })();
    } else {
      let frame = 0;
      (function tick() {
        if (!active) return;
        drawFrame(ctx, p, frame);
        tid   = setTimeout(tick, HOLDS[frame]); // hold current frame, then advance
        frame = (frame + 1) % 3;
      })();
    }

    return {
      stop() { active = false; clearTimeout(tid); },
    };
  }

  // Draw a single static frame (no animation). Useful for email/print.
  function preview(canvas, noun, adjective, o) {
    o = opt(o);
    const { w, h } = size(o);
    canvas.width  = w;
    canvas.height = h;
    draw(canvas.getContext('2d'), noun, adjective, o, o.level >= 2 ? PERIOD * 0.98 : 0);
  }

  // Nombre para mostrar de un rasgo
  const rasgoLabel = (r) => (r === 'trebol' ? 'trébol' : r);

  root.JellyfishGen = { render, preview, draw, size, rasgoLabel, NOUNS, ADJECTIVES, RASGOS, SCALE, GRID_W, GRID_H };
})(typeof window !== 'undefined' ? window : globalThis);
