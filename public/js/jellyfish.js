// Deterministic pixel-art jellyfish generator.
// Each noun→bell shape, each adjective→tentacle style. Same pair = same jellyfish.
//
// Usage:
//   const handle = JellyfishGen.render(canvas, 'medusa', 'violeta');
//   handle.stop(); // cancel animation
//   JellyfishGen.preview(canvas, 'medusa', 'violeta'); // single frame, no animation

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

  // ── Public API ───────────────────────────────────────────────────────────────

  // Render with animation. Returns {stop()}.
  // Hold times: frame 0 = rest (500ms), frame 1 = contract (160ms), frame 2 = expand (200ms)
  const HOLDS = [500, 160, 200];

  function render(canvas, noun, adjective) {
    canvas.width  = GRID_W * SCALE;
    canvas.height = GRID_H * SCALE;
    const ctx = canvas.getContext('2d');
    const p   = derive(fnv(noun), fnv(adjective));
    let frame  = 0;
    let tid    = null;
    let active = true;

    function tick() {
      if (!active) return;
      drawFrame(ctx, p, frame);
      tid   = setTimeout(tick, HOLDS[frame]); // hold current frame, then advance
      frame = (frame + 1) % 3;
    }
    tick();

    return {
      stop() { active = false; clearTimeout(tid); },
    };
  }

  // Draw a single static frame (no animation). Useful for email/print.
  function preview(canvas, noun, adjective) {
    canvas.width  = GRID_W * SCALE;
    canvas.height = GRID_H * SCALE;
    const ctx = canvas.getContext('2d');
    drawFrame(ctx, derive(fnv(noun), fnv(adjective)), 0);
  }

  root.JellyfishGen = { render, preview, NOUNS, ADJECTIVES, SCALE, GRID_W, GRID_H };
})(typeof window !== 'undefined' ? window : globalThis);
