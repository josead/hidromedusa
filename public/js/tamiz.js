// EL TAMIZ — cómo elegimos, como simulación (three.js)
//
// Cada punto es un tema. Entran de todos los géneros (gusto variado) y caen por
// cinco membranas, una por criterio (cuerpo, profundidad, paciencia, lugar,
// mutación). Cada tema trae un puntaje por criterio; si no alcanza, rebota y se
// disuelve. Lo que atraviesa las cinco se junta abajo y arma la forma de una
// medusa: el set. Los números en pantalla son los de esta simulación, en vivo.
//
// El DOM define todo lo que se lee: las etapas (.tz-stage[data-stage]) y los
// chips de género (.tz-chip[data-g]). Tocar un chip sigue a ese género.

import * as THREE from 'three';

const wrap = document.getElementById('tz-stage-gl');
const canvas = document.getElementById('tz-canvas');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const GENRES = [
  { k: 'techno',  c: '#C6FF1A', bias: [ .06, -.02,  .00, .02, .00] },
  { k: 'house',   c: '#5EF2D6', bias: [ .08,  .02, -.02, .00, .00] },
  { k: 'dub',     c: '#3D8BFF', bias: [-.02,  .08,  .06, .00, .00] },
  { k: 'breaks',  c: '#FF2E88', bias: [ .06, -.02, -.04, .02, .02] },
  { k: 'ambient', c: '#B7A6FF', bias: [-.10,  .10,  .08, .00, .00] },
  { k: 'idm',     c: '#FFB347', bias: [-.04,  .06,  .00, -.02, .06] },
  { k: 'latin',   c: '#FF6B4A', bias: [ .10, -.02,  .00, .00, .02] },
  { k: 'jungle',  c: '#ECE7DA', bias: [ .04,  .02, -.06, .00, .04] },
];
const MEMB_Y = [2.35, 1.15, -0.05, -1.25, -2.45];
const TH = 0.42;              // umbral por membrana (~6% atraviesa las cinco)
const SPAWN_Y = 3.9, SET_Y = -3.75, R = 1.75;

function hasGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}
if (wrap && canvas && hasGL()) { try { init(); } catch (e) { console.warn('[tamiz]', e); } }

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  let pr = Math.min(devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
  camera.position.set(0, 1.9, 10.2);
  camera.lookAt(0, -0.35, 0);

  // ── membranas ────────────────────────────────────────────────────────────
  const membranes = MEMB_Y.map((y, i) => {
    const u = { uTime: { value: 0 }, uHi: { value: 0 }, uHit: { value: 0 }, uIdx: { value: i } };
    const m = new THREE.Mesh(new THREE.CircleGeometry(2.15, 128), new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; uniform float uTime, uHi, uHit, uIdx;
        void main(){
          vec2 p=(vUv-.5)*2.; float r=length(p), a=atan(p.y,p.x);
          // cada membrana es más cerrada que la anterior: más rayos, más anillos
          float n=5.+uIdx*2.;
          float spokes=pow(abs(cos(a*n+r*2.)),70.);
          float rings=pow(abs(sin(r*(5.+uIdx*2.2)*3.14159-uTime*.25)),40.);
          // subdivisión autosimilar: un segundo tejido a escala doble, más tenue
          float fine=pow(abs(cos(a*n*2.)),90.)*pow(abs(sin(r*(10.+uIdx*4.4)*3.14159)),20.);
          float web=(max(spokes,rings)+fine*.6)*(1.-smoothstep(.86,1.,r));
          float edge=smoothstep(.95,.99,r)*(1.-smoothstep(.99,1.,r));
          vec3 col=mix(vec3(.93,.9,.85),vec3(.78,1.,.1),uHi);
          float amt=web*(.10+uHi*.45+uHit*.25)+edge*(.35+uHi*.9);
          gl_FragColor=vec4(col*amt,amt);
        }`,
    }));
    m.rotation.x = -Math.PI / 2; m.position.y = y;
    scene.add(m);
    return { m, u, y, arrived: 0, passed: 0 };
  });

  // ── temas ────────────────────────────────────────────────────────────────
  const MAX = 1100, SET_MAX = 80;
  const P = {
    pos: new Float32Array(MAX * 3), vel: new Float32Array(MAX * 3), col: new Float32Array(MAX * 3),
    alpha: new Float32Array(MAX), size: new Float32Array(MAX),
    state: new Uint8Array(MAX),      // 0 libre, 1 cayendo, 2 descartado, 3 en el set, 4 saliendo
    stage: new Uint8Array(MAX), genre: new Uint8Array(MAX), score: new Float32Array(MAX * 5),
    slot: new Int16Array(MAX).fill(-1), ph: new Float32Array(MAX),
  };
  const colors = GENRES.map(g => new THREE.Color(g.c));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P.pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(P.col, 3));
  geo.setAttribute('aA', new THREE.BufferAttribute(P.alpha, 1));
  geo.setAttribute('aS', new THREE.BufferAttribute(P.size, 1));
  const ptsU = { uPR: { value: pr } };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: ptsU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aA, aS; attribute vec3 color; uniform float uPR; varying float vA; varying vec3 vC;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=aS*uPR*(10./-mv.z); gl_Position=projectionMatrix*mv; vA=aA; vC=color; }`,
    fragmentShader: /* glsl */`
      varying float vA; varying vec3 vC;
      void main(){ float r=length(gl_PointCoord-.5); if(r>.5) discard;
        float core=smoothstep(.5,.0,r), a=core*vA; gl_FragColor=vec4(vC*a*(1.+core),a); }`,
  }));
  points.frustumCulled = false;
  scene.add(points);

  // lugares en el set: campana (fibonacci sobre casquete) + cuatro hebras
  const slots = [];
  const BELL_N = 52;
  for (let i = 0; i < BELL_N; i++) {
    const y = 1 - (i / (BELL_N - 1)) * 0.55, rr = Math.sqrt(1 - y * y), th = i * 2.39996;
    slots.push({ x: Math.cos(th) * rr, y: y - 0.6, z: Math.sin(th) * rr, bell: true });
  }
  for (let i = 0; slots.length < SET_MAX; i++) {
    const strand = i % 4, j = Math.floor(i / 4), a = strand * Math.PI / 2 + Math.PI / 4;
    slots.push({ x: Math.cos(a) * 0.45, y: -0.55 - j * 0.16, z: Math.sin(a) * 0.45, bell: false, j, a });
  }
  const slotOwner = new Int32Array(SET_MAX).fill(-1);
  let slotCursor = 0;

  const stats = { in: 0, out: 0, byGenre: new Array(GENRES.length).fill(0) };
  let focus = -1, activeStage = -1, time = 0, spawnAcc = 0;

  function spawn() {
    for (let i = 0; i < MAX; i++) {
      if (P.state[i]) continue;
      const g = (Math.random() * GENRES.length) | 0, a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
      P.state[i] = 1; P.stage[i] = 0; P.genre[i] = g; P.slot[i] = -1; P.ph[i] = Math.random() * 6.28;
      P.pos[i * 3] = Math.cos(a) * r; P.pos[i * 3 + 1] = SPAWN_Y + Math.random() * 0.4; P.pos[i * 3 + 2] = Math.sin(a) * r;
      P.vel[i * 3] = 0; P.vel[i * 3 + 1] = -(0.75 + Math.random() * 0.45); P.vel[i * 3 + 2] = 0;
      for (let s = 0; s < 5; s++) P.score[i * 5 + s] = Math.random() + GENRES[g].bias[s];
      P.alpha[i] = 0;
      stats.in++;
      return;
    }
  }
  function toSet(i) {
    let s = slotCursor; slotCursor = (slotCursor + 1) % SET_MAX;
    const prev = slotOwner[s];
    if (prev >= 0 && P.state[prev] === 3) { P.state[prev] = 4; P.slot[prev] = -1; P.vel[prev * 3 + 1] = -0.4; }
    slotOwner[s] = i; P.slot[i] = s; P.state[i] = 3;
    stats.out++; stats.byGenre[P.genre[i]]++;
  }

  // ── tamaño / visibilidad ─────────────────────────────────────────────────
  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // en pantallas anchas y bajas, alejamos un poco la cámara para que entre todo
    camera.position.z = camera.aspect > 0.9 ? 10.2 + (camera.aspect - 0.9) * 2.5 : 10.2 + (0.9 - camera.aspect) * 7;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  let visible = false;
  new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; if (visible) clock.getDelta(); }), { rootMargin: '120px' }).observe(wrap);

  // etapas del texto → membrana resaltada
  const stageEls = Array.from(document.querySelectorAll('.tz-stage[data-stage]'));
  const pickStage = () => {
    const mid = innerHeight * (innerWidth < 900 ? 0.78 : 0.55); let best = -1, bd = 1e9;
    for (const el of stageEls) {
      const r = el.getBoundingClientRect(); const d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (r.bottom > 0 && r.top < innerHeight && d < bd) { bd = d; best = +el.dataset.stage; }
    }
    if (best !== activeStage) {
      activeStage = best;
      stageEls.forEach(el => el.classList.toggle('on', +el.dataset.stage === best));
    }
  };
  addEventListener('scroll', pickStage, { passive: true }); pickStage();

  // chips de género
  const chips = Array.from(document.querySelectorAll('.tz-chip[data-g]'));
  chips.forEach(ch => ch.addEventListener('click', () => {
    const g = GENRES.findIndex(x => x.k === ch.dataset.g);
    focus = focus === g ? -1 : g;
    chips.forEach(c => c.classList.toggle('on', focus >= 0 && c.dataset.g === GENRES[focus].k));
    wrap.classList.toggle('focusing', focus >= 0);
  }));

  // etiquetas HTML pegadas a cada membrana
  const labels = Array.from(wrap.querySelectorAll('.tz-label[data-m]'));
  const v3 = new THREE.Vector3();

  // DOM de contadores (cada medio segundo, no por frame)
  const elIn = document.getElementById('tz-in'), elOut = document.getElementById('tz-out');
  const fmt = n => n.toLocaleString('es-AR');
  setInterval(() => {
    if (!visible) return;
    if (elIn) elIn.textContent = fmt(stats.in);
    if (elOut) elOut.textContent = fmt(stats.out);
    chips.forEach(ch => {
      const g = GENRES.findIndex(x => x.k === ch.dataset.g), n = ch.querySelector('.n');
      if (n && g >= 0) n.textContent = stats.byGenre[g];
    });
    labels.forEach(l => {
      const mb = membranes[+l.dataset.m], pct = l.querySelector('.pct');
      if (pct) pct.textContent = mb.arrived ? Math.round(100 * mb.passed / mb.arrived) + '% pasa' : '—';
      l._w = 0;
    });
  }, 500);

  // ── loop ─────────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  // precalienta la simulación para que el set no arranque vacío
  for (let i = 0; i < 1400; i++) tick(1 / 30);

  function tick(dt) {
    time += dt;
    spawnAcc += dt * (REDUCED ? 7 : 19);
    while (spawnAcc >= 1) { spawn(); spawnAcc -= 1; }
    const setPulse = Math.pow(Math.max(0, Math.sin(time * 2.2)), 3);

    for (let i = 0; i < MAX; i++) {
      const st = P.state[i]; if (!st) { P.alpha[i] = 0; continue; }
      const i3 = i * 3;
      let x = P.pos[i3], y = P.pos[i3 + 1], z = P.pos[i3 + 2];
      const g = P.genre[i], dim = focus >= 0 && focus !== g;
      if (st === 1) {
        x += Math.sin(time * 0.8 + P.ph[i]) * 0.12 * dt; z += Math.cos(time * 0.7 + P.ph[i]) * 0.12 * dt;
        const ny = y + P.vel[i3 + 1] * dt, s = P.stage[i];
        if (s < 5 && y >= MEMB_Y[s] && ny < MEMB_Y[s]) {
          const mb = membranes[s]; mb.arrived++;
          if (P.score[i * 5 + s] >= TH) { P.stage[i]++; mb.passed++; mb.u.uHit.value = Math.min(1, mb.u.uHit.value + 0.08); }
          else {
            P.state[i] = 2;
            const rr = Math.hypot(x, z) || 1;
            P.vel[i3] = (x / rr) * (0.9 + Math.random()); P.vel[i3 + 1] = 0.5 + Math.random() * 0.5; P.vel[i3 + 2] = (z / rr) * (0.9 + Math.random());
          }
        }
        y = ny;
        if (P.state[i] === 1 && P.stage[i] >= 5 && y < SET_Y + 0.9) toSet(i);
        P.alpha[i] = Math.min(1, P.alpha[i] + dt * 2) * 0.8;
        P.size[i] = 3.2 + P.stage[i] * 0.45;
      } else if (st === 2) {
        P.vel[i3 + 1] -= 1.6 * dt;
        x += P.vel[i3] * dt; y += P.vel[i3 + 1] * dt; z += P.vel[i3 + 2] * dt;
        P.alpha[i] -= dt * 0.9; P.size[i] = Math.max(1, P.size[i] - dt * 2.5);
        if (P.alpha[i] <= 0) P.state[i] = 0;
      } else if (st === 3) {
        const sl = slots[P.slot[i]];
        const k = sl.bell ? (1 - setPulse * 0.14 * (1 - sl.y - 0.6)) : 1;
        const sway = sl.bell ? 0 : Math.sin(time * 1.3 - sl.j * 0.45) * 0.06 * sl.j;
        const rot = time * 0.25;
        const lx = sl.x * k + (sl.bell ? 0 : Math.cos(sl.a + Math.PI / 2) * sway), lz = sl.z * k + (sl.bell ? 0 : Math.sin(sl.a + Math.PI / 2) * sway);
        const tx = lx * Math.cos(rot) - lz * Math.sin(rot), tz = lx * Math.sin(rot) + lz * Math.cos(rot);
        const ty = SET_Y + sl.y * (sl.bell ? 0.8 : 1) + setPulse * 0.06;
        const e = Math.min(1, dt * 3);
        x += (tx - x) * e; y += (ty - y) * e; z += (tz - z) * e;
        P.alpha[i] = Math.min(1, P.alpha[i] + dt * 2); P.size[i] = 5.5;
      } else if (st === 4) {
        y += P.vel[i3 + 1] * dt; P.alpha[i] -= dt * 0.6;
        if (P.alpha[i] <= 0) P.state[i] = 0;
      }
      P.pos[i3] = x; P.pos[i3 + 1] = y; P.pos[i3 + 2] = z;
      const cc = colors[g], a = dim ? 0.12 : 1;
      P.col[i3] = cc.r * a; P.col[i3 + 1] = cc.g * a; P.col[i3 + 2] = cc.b * a;
      if (dim) P.size[i] *= 0.9;
    }
    membranes.forEach((mb, i) => {
      mb.u.uTime.value = time;
      mb.u.uHi.value += ((activeStage === i + 1 ? 1 : 0) - mb.u.uHi.value) * Math.min(1, dt * 4);
      mb.u.uHit.value *= 1 - Math.min(1, dt * 2);
    });
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05) * (REDUCED ? 0.5 : 1);
    tick(dt);
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    geo.attributes.aA.needsUpdate = true; geo.attributes.aS.needsUpdate = true;
    scene.rotation.y = Math.sin(time * 0.1) * 0.25;
    renderer.render(scene, camera);
    // etiquetas: al borde derecho de cada membrana, proyectado a pantalla
    const w = wrap.clientWidth, h = wrap.clientHeight;
    labels.forEach(l => {
      const mb = membranes[+l.dataset.m];
      v3.set(2.2, mb.y, 0).applyMatrix4(scene.matrixWorld).project(camera);
      const lx = Math.min((v3.x * .5 + .5) * w, w - (l._w || (l._w = l.offsetWidth)) - 14);
      l.style.transform = `translate(${Math.round(lx)}px, ${Math.round((-v3.y * .5 + .5) * h)}px)`;
      l.classList.toggle('on', activeStage === +l.dataset.m + 1);
    });
  }
  wrap.classList.add('gl-on');
  requestAnimationFrame(frame);
}
