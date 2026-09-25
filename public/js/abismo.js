// ABISMO — fondo WebGL (three.js) de hidromedusa.com
//
// Tres capas en una sola escena, detrás de todo el contenido:
//   1) el agua: shader de pantalla completa (fbm con domain-warp + un fractal
//      "kaliset" que dibuja filamentos bioluminiscentes). `uDepth` (0→1) sale del
//      scroll: arriba entra luz desde la superficie, abajo sólo queda lo que brilla.
//   2) nieve marina: puntos que suben mientras bajás (la página es un descenso).
//   3) la medusa: campana con shader (fresnel + canales + encaje fractal en el
//      borde) que late, tentáculos simulados como cadenas que arrastran y brazos
//      orales en puntos. Cada sección elige dónde nada con data-jf="right|left|off".
//
// Degrada: sin WebGL agrega .no-gl a <html> y el CSS pone un gradiente fijo.
// prefers-reduced-motion: todo más lento y sin reacción al scroll.
// API mínima: window.HM_ABISMO.pulse() → latido fuerte (lo usan los CTAs).

import * as THREE from 'three';

const root = document.documentElement;
const canvas = document.getElementById('abismo');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}

if (!canvas || !hasGL()) root.classList.add('no-gl');
else { try { init(); } catch (e) { console.warn('[abismo]', e); root.classList.add('no-gl'); } }

function init() {
  const small = () => innerWidth < 760;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x040506, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0, 0, 9);

  // ── 1) agua ──────────────────────────────────────────────────────────────
  const bgU = {
    uTime: { value: 0 }, uDepth: { value: 0 }, uPulse: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2(0.5, 0.5) },
  };
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: bgU, depthTest: false, depthWrite: false,
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform float uTime, uDepth, uPulse; uniform vec2 uRes, uMouse;
      float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0., a=.5; mat2 r=mat2(.8,-.6,.6,.8);
        for(int i=0;i<5;i++){ v+=a*noise(p); p=r*p*2.03+3.1; a*=.5; } return v; }
      // kaliset: p = |p|/dot(p,p) + c. Acumula dónde la órbita "se queda quieta" → filamentos.
      float kali(vec2 p, vec2 c){ float acc=0., prev=0.;
        for(int i=0;i<11;i++){ p=abs(p)/dot(p,p)+c; float m=length(p); acc+=exp(-abs(m-prev)*7.); prev=m; }
        return acc/11.; }
      void main(){
        float asp=uRes.x/uRes.y, t=uTime, d=uDepth;
        vec2 p=(vUv-.5)*vec2(asp,1.);
        vec2 q=vec2(fbm(p*1.5+vec2(0.,t*.03)), fbm(p*1.5+vec2(5.2,-t*.025)));
        float w=fbm(p*2.1+q*1.9+vec2(0.,d*5.));
        vec3 shallow=vec3(.018,.085,.10), mid=vec3(.010,.032,.048), deep=vec3(.004,.006,.010);
        vec3 col=mix(shallow,mid,smoothstep(0.,.4,d)); col=mix(col,deep,smoothstep(.3,.95,d));
        col*=.55+.9*w;
        // luz de superficie: rayos oblicuos que se apagan al bajar
        float ray=fbm(vec2(p.x*2.6+p.y*.8+t*.018, t*.035)); ray=pow(ray,3.)*2.4;
        col+=vec3(.20,.42,.40)*ray*smoothstep(-.7,.6,p.y)*(1.-smoothstep(0.,.45,d))*.45;
        // bioluminiscencia fractal
        vec2 c=vec2(-.79+.035*sin(t*.061), -.61+.035*cos(t*.047))+(uMouse-.5)*.025;
        vec2 kp=p*(1.25+.25*d)+q*.22+vec2(.0,d*1.6);
        float k=kali(kp,c);
        float patchy=smoothstep(.42,.72,fbm(p*1.1+vec2(t*.012,d*2.5)));
        vec3 bio=mix(vec3(.72,1.,.10),vec3(1.,.16,.52),smoothstep(.25,.95,d+.35*sin(q.x*6.28)));
        float amt=(.14+.9*d)*(1.+uPulse*1.6);
        col+=bio*pow(k,2.4)*patchy*amt*.9;
        col*=1.-.5*dot(p*vec2(.75,1.),p*vec2(.75,1.));
        gl_FragColor=vec4(col,1.);
      }`,
  }));
  bg.frustumCulled = false; bg.renderOrder = -10;
  scene.add(bg);

  // ── 2) nieve marina ──────────────────────────────────────────────────────
  const SNOW = small() ? 520 : 1100;
  const sPos = new Float32Array(SNOW * 3), sSeed = new Float32Array(SNOW);
  for (let i = 0; i < SNOW; i++) {
    sPos[i * 3] = (Math.random() - .5) * 20; sPos[i * 3 + 1] = (Math.random() - .5) * 12; sPos[i * 3 + 2] = -7 + Math.random() * 11;
    sSeed[i] = Math.random();
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  snowGeo.setAttribute('aSeed', new THREE.BufferAttribute(sSeed, 1));
  const snowU = { uTime: { value: 0 }, uOffset: { value: 0 }, uDepth: { value: 0 }, uPR: { value: pixelRatio } };
  const snow = new THREE.Points(snowGeo, new THREE.ShaderMaterial({
    uniforms: snowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime, uOffset, uPR; varying float vS; varying float vA;
      void main(){
        vec3 p=position;
        p.y=mod(p.y+6.+uTime*(.05+.12*aSeed)+uOffset*(.6+.8*aSeed),12.)-6.;
        p.x+=sin(uTime*.25+aSeed*40.)*.18;
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_PointSize=(1.2+3.2*aSeed*aSeed)*uPR*(9./-mv.z);
        gl_Position=projectionMatrix*mv; vS=aSeed; vA=smoothstep(-8.,2.,mv.z+9.);
      }`,
    fragmentShader: /* glsl */`
      uniform float uDepth; varying float vS; varying float vA;
      void main(){
        float r=length(gl_PointCoord-.5); if(r>.5) discard;
        float a=smoothstep(.5,0.,r)*(.18+.35*vS)*vA;
        vec3 c=vec3(.85,.9,.86);
        if(vS>.955) c=mix(vec3(.78,1.,.1),vec3(1.,.18,.53),step(.978,vS))*(1.+uDepth*1.5);
        gl_FragColor=vec4(c*a,a);
      }`,
  }));
  scene.add(snow);

  // ── 3) la medusa ─────────────────────────────────────────────────────────
  const ACID = new THREE.Color('#C6FF1A'), HOT = new THREE.Color('#FF2E88'), BONE = new THREE.Color('#ECE7DA');
  const jf = new THREE.Group();
  scene.add(jf);

  const bellU = {
    uTime: { value: 0 }, uC: { value: 0 }, uOpacity: { value: 1 },
    uColA: { value: ACID.clone() }, uColB: { value: new THREE.Color('#0f6b63') },
  };
  const BELL_VERT = /* glsl */`
    uniform float uTime, uC; varying vec3 vN, vV, vP; varying float vH;
    void main(){
      vec3 p=position;
      float h=clamp((1.-p.y)/1.06,0.,1.);           // 0 ápice → 1 borde
      float s=1.-uC*(.06+.30*h*h);                    // el borde se cierra más
      float ang=atan(p.z,p.x);
      p.xz*=s*(1.+sin(ang*16.+uTime*1.7)*.018*h*h);   // festón del margen
      p.y=p.y*(1.+uC*.2)*.8;
      vP=p; vH=h;
      vec4 mv=modelViewMatrix*vec4(p,1.);
      vV=-mv.xyz; vN=normalize(normalMatrix*normal);
      gl_Position=projectionMatrix*mv;
    }`;
  const bellMat = new THREE.ShaderMaterial({
    uniforms: bellU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: BELL_VERT,
    fragmentShader: /* glsl */`
      uniform float uTime, uOpacity; uniform vec3 uColA, uColB; varying vec3 vN, vV, vP; varying float vH;
      void main(){
        float fres=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.);
        float ang=atan(vP.z,vP.x);
        float canals=pow(abs(sin(ang*4.)),48.)*(1.-vH*.4);
        float rings=pow(.5+.5*sin(vH*30.-uTime*2.2),6.)*.25;
        // encaje: octavas de senos que se duplican hacia el borde (autosimilar)
        float lace=0., f=8., a=1.;
        for(int i=0;i<5;i++){ lace+=a*pow(abs(sin(ang*f+vH*f*.7-uTime*.35*float(i+1))),6.); f*=2.; a*=.6; }
        lace*=smoothstep(.55,1.,vH);
        vec3 col=mix(uColB,uColA,fres*fres)*(fres*1.05+.035)
               +uColA*canals*.55+uColA*rings*fres
               +mix(uColA,vec3(1.,.18,.53),.5)*lace*.22;
        gl_FragColor=vec4(col*uOpacity,1.);
      }`,
  });
  const bell = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 40, 0, Math.PI * 2, 0, Math.PI * 0.53), bellMat);
  jf.add(bell);
  // capa interna (subumbrella), más tenue
  const inner = new THREE.Mesh(bell.geometry, bellMat.clone());
  inner.material.uniforms = {
    ...THREE.UniformsUtils.clone(bellU), uColA: { value: HOT.clone() }, uColB: { value: new THREE.Color('#2a0a24') },
  };
  inner.scale.setScalar(0.78); inner.position.y = -0.04;
  jf.add(inner);

  // gónadas: cuatro lóbulos de puntos (trébol) dentro de la campana
  const GON = 360, gPos = new Float32Array(GON * 3);
  for (let i = 0; i < GON; i++) {
    const lobe = i % 4, a = lobe * Math.PI / 2 + (Math.random() - .5) * 0.9, r = 0.18 + Math.random() * 0.3;
    gPos[i * 3] = Math.cos(a) * r; gPos[i * 3 + 1] = 0.35 + Math.random() * 0.22 - r * 0.35; gPos[i * 3 + 2] = Math.sin(a) * r;
  }
  const dotMat = (color, size) => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uSize: { value: size }, uPR: { value: pixelRatio }, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uSize, uPR; attribute float aA; varying float vA;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=uSize*uPR*(9./-mv.z); gl_Position=projectionMatrix*mv; vA=aA; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity; varying float vA;
      void main(){ float r=length(gl_PointCoord-.5); if(r>.5) discard; float a=smoothstep(.5,0.,r)*vA*uOpacity; gl_FragColor=vec4(uColor*a,a); }`,
  });
  const gonGeo = new THREE.BufferGeometry();
  gonGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  gonGeo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(GON).fill(0.55), 1));
  const gonads = new THREE.Points(gonGeo, dotMat(HOT.clone(), 3.2));
  jf.add(gonads);

  // tentáculos marginales: cadenas de largo fijo en espacio de mundo (arrastran)
  const T = small() ? 18 : 26, S = 46, SEG = 0.075;
  const tent = [];
  for (let i = 0; i < T; i++) {
    const pts = []; for (let j = 0; j < S; j++) pts.push(new THREE.Vector3());
    tent.push({ a: (i / T) * Math.PI * 2 + Math.random() * 0.1, len: Math.floor(S * (0.55 + Math.random() * 0.45)), ph: Math.random() * 6.28, pts });
  }
  const tPos = new Float32Array(T * (S - 1) * 2 * 3), tCol = new Float32Array(T * (S - 1) * 2 * 3);
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
  const tMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const tentLines = new THREE.LineSegments(tGeo, tMat);
  tentLines.frustumCulled = false;
  scene.add(tentLines);

  // brazos orales: cuatro cadenas más gruesas, dibujadas como encaje de puntos
  const ARMS = 4, AS = 34, ASEG = 0.06, FRILL = 3;
  const arms = [];
  for (let i = 0; i < ARMS; i++) {
    const pts = []; for (let j = 0; j < AS; j++) pts.push(new THREE.Vector3());
    arms.push({ a: i * Math.PI / 2 + Math.PI / 4, ph: Math.random() * 6.28, pts });
  }
  const aCount = ARMS * AS * FRILL;
  const aPos = new Float32Array(aCount * 3), aAlpha = new Float32Array(aCount);
  const armGeo = new THREE.BufferGeometry();
  armGeo.setAttribute('position', new THREE.BufferAttribute(aPos, 3));
  armGeo.setAttribute('aA', new THREE.BufferAttribute(aAlpha, 1));
  const armPts = new THREE.Points(armGeo, dotMat(new THREE.Color('#ff5fa8'), 3.4));
  armPts.frustumCulled = false;
  scene.add(armPts);

  // ── estado ───────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let time = 0, cycle = 0, pulseBoost = 0, bio = 0;
  const mouse = new THREE.Vector2(0.5, 0.5), mouseS = new THREE.Vector2(0.5, 0.5);
  const home = new THREE.Vector3(), pos = new THREE.Vector3(2.5, 0.4, 0), vel = new THREE.Vector3();
  let fade = 1, fadeTarget = 1, depth = 0, depthS = 0, scrollOff = 0, lastScroll = scrollY, scrollV = 0;
  let viewW = 10, viewH = 6, mode = 'right';

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    bgU.uRes.value.set(w, h);
    viewH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    viewW = viewH * camera.aspect;
    jf.scale.setScalar(camera.aspect < 0.8 ? 0.8 : 1.05);
  }
  resize();
  addEventListener('resize', resize);

  const zones = () => Array.from(document.querySelectorAll('[data-jf]'));
  let zoneEls = zones();
  function readScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    depth = Math.min(1, Math.max(0, scrollY / max));
    const mid = innerHeight * 0.5;
    for (const el of zoneEls) {
      const r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) { mode = el.dataset.jf; break; }
    }
  }
  addEventListener('scroll', readScroll, { passive: true });
  setTimeout(() => { zoneEls = zones(); readScroll(); }, 400);
  readScroll();

  addEventListener('pointermove', e => { mouse.set(e.clientX / innerWidth, 1 - e.clientY / innerHeight); }, { passive: true });
  function pulse() { cycle = 0; pulseBoost = 1; bio = 1; }
  addEventListener('pointerdown', e => {
    if (e.target.closest('a,button,input,textarea,select,label,.modal,.chip')) return;
    pulse();
  }, { passive: true });
  window.HM_ABISMO = { pulse };

  // curva de latido: contracción rápida, relajación lenta
  const beat = x => x < 0.28 ? Math.sin((x / 0.28) * Math.PI / 2) : 1 - THREE.MathUtils.smootherstep(x, 0.28, 1);

  const tmp = new THREE.Vector3(), anchor = new THREE.Vector3();
  let frames = 0, acc = 0;

  function step(chain, count, seg, start, drift) {
    chain[0].copy(start);
    for (let j = 1; j < count; j++) {
      const p = chain[j], prev = chain[j - 1];
      drift(j, tmp);
      p.add(tmp);
      tmp.subVectors(p, prev);
      const l = tmp.length() || 1;
      p.copy(prev).addScaledVector(tmp, seg / l);
    }
  }
  // arranca con los tentáculos colgando
  function seedChains() {
    jf.updateMatrixWorld(true);
    for (const t of tent) { anchor.set(Math.cos(t.a), -0.04, Math.sin(t.a)).applyMatrix4(jf.matrixWorld); t.pts.forEach((p, j) => p.copy(anchor).add(tmp.set(0, -j * SEG, 0))); }
    for (const a of arms) { anchor.set(0, 0.1, 0).applyMatrix4(jf.matrixWorld); a.pts.forEach((p, j) => p.copy(anchor).add(tmp.set(0, -j * ASEG, 0))); }
  }
  jf.position.copy(pos); seedChains();

  function frame() {
    if (document.hidden) { requestAnimationFrame(frame); return; }
    const rawDt = Math.min(clock.getDelta(), 0.05);
    const dt = REDUCED ? rawDt * 0.35 : rawDt;
    time += dt;

    // scroll: velocidad para la nieve, profundidad suavizada para el agua
    scrollV = (scrollY - lastScroll); lastScroll = scrollY;
    if (!REDUCED) scrollOff += scrollV * 0.0035;
    depthS += (depth - depthS) * Math.min(1, dt * 3);
    mouseS.lerp(mouse, Math.min(1, dt * 2));

    // dónde nada la medusa según la sección
    const portrait = camera.aspect < 0.8;
    fadeTarget = 1;
    if (mode === 'left') home.set(-viewW * 0.3, viewH * 0.05, 0);
    else if (mode === 'off') { home.set(viewW * 0.62, -viewH * 0.1, -1); fadeTarget = 0; }
    else if (mode === 'center') home.set(0, viewH * 0.12, -1.5);
    else home.set(viewW * 0.28, viewH * 0.06, 0);
    if (portrait) { home.x *= 0.55; home.y = viewH * 0.22; if (mode !== 'off') fadeTarget = 0.55; }
    home.x += (mouseS.x - 0.5) * 0.9; home.y += (mouseS.y - 0.5) * 0.5;
    fade += (fadeTarget - fade) * Math.min(1, dt * (fadeTarget < fade ? 3.2 : 1.8));

    // latido + impulso (sube en cada contracción, se hunde entre latidos)
    const period = 2.7 - pulseBoost * 1.1;
    cycle += dt / period; if (cycle >= 1) cycle -= 1;
    const c = beat(cycle);
    pulseBoost = Math.max(0, pulseBoost - dt * 0.35);
    bio = Math.max(0, bio - dt * 0.6);
    const thrust = cycle < 0.28 ? (1.1 + pulseBoost * 2.2) : -0.12;
    vel.y += thrust * dt;
    tmp.subVectors(home, pos);
    vel.addScaledVector(tmp, dt * 0.55);
    vel.x += Math.sin(time * 0.31) * dt * 0.05;
    vel.multiplyScalar(1 - Math.min(1, dt * 1.6));
    pos.addScaledVector(vel, dt);
    jf.position.copy(pos);
    // se inclina hacia donde va
    const tilt = THREE.MathUtils.clamp(-vel.x * 0.5, -0.45, 0.45);
    jf.rotation.z += (tilt - jf.rotation.z) * Math.min(1, dt * 2);
    jf.rotation.x = Math.sin(time * 0.4) * 0.12;
    jf.rotation.y += dt * 0.12;
    jf.updateMatrixWorld(true);

    bellU.uTime.value = time; bellU.uC.value = c; bellU.uOpacity.value = fade;
    inner.material.uniforms.uTime.value = time; inner.material.uniforms.uC.value = c; inner.material.uniforms.uOpacity.value = fade * 0.4;
    gonads.material.uniforms.uOpacity.value = fade * (0.7 + 0.3 * c);
    gonads.scale.set(1 - c * 0.2, 1 + c * 0.15, 1 - c * 0.2);

    // tentáculos
    const s = 1 - c * 0.36, rimY = -0.05 * (1 + c * 0.2) * 0.8;
    let k = 0;
    for (let i = 0; i < T; i++) {
      const t = tent[i];
      anchor.set(Math.cos(t.a) * s, rimY, Math.sin(t.a) * s).applyMatrix4(jf.matrixWorld);
      step(t.pts, t.len, SEG, anchor, (j, out) => out.set(
        Math.sin(time * 0.9 + j * 0.2 + t.ph) * 0.0022 * j,
        -0.012 - c * 0.004,
        Math.cos(time * 0.7 + j * 0.17 + t.ph) * 0.0022 * j));
      for (let j = 0; j < S - 1; j++) {
        const on = j < t.len - 1;
        const a = t.pts[Math.min(j, t.len - 1)], b = t.pts[Math.min(j + 1, t.len - 1)];
        const f = on ? (1 - j / t.len) : 0, f2 = on ? (1 - (j + 1) / t.len) : 0;
        const col = j < 3 ? ACID : BONE;
        tPos[k] = a.x; tPos[k + 1] = a.y; tPos[k + 2] = a.z;
        tPos[k + 3] = b.x; tPos[k + 4] = b.y; tPos[k + 5] = b.z;
        const i1 = 0.55 * f * fade, i2 = 0.55 * f2 * fade;
        tCol[k] = (col.r * .5 + ACID.r * .5) * i1; tCol[k + 1] = (col.g * .5 + ACID.g * .5) * i1; tCol[k + 2] = (col.b * .5 + ACID.b * .5) * i1;
        tCol[k + 3] = (col.r * .5 + ACID.r * .5) * i2; tCol[k + 4] = (col.g * .5 + ACID.g * .5) * i2; tCol[k + 5] = (col.b * .5 + ACID.b * .5) * i2;
        k += 6;
      }
    }
    tGeo.attributes.position.needsUpdate = true; tGeo.attributes.color.needsUpdate = true;

    // brazos orales: encaje que se enrosca alrededor de la cadena
    let m = 0;
    for (let i = 0; i < ARMS; i++) {
      const a = arms[i];
      anchor.set(Math.cos(a.a) * 0.08, 0.12, Math.sin(a.a) * 0.08).applyMatrix4(jf.matrixWorld);
      step(a.pts, AS, ASEG, anchor, (j, out) => out.set(
        Math.cos(a.a) * 0.0016 * j + Math.sin(time * 1.1 + j * 0.3 + a.ph) * 0.0016 * j,
        -0.014,
        Math.sin(a.a) * 0.0016 * j));
      for (let j = 0; j < AS; j++) {
        const p = a.pts[j], w = 0.03 + 0.09 * Math.sin((j / AS) * Math.PI);
        for (let f = 0; f < FRILL; f++) {
          const ang = time * 1.4 + j * 0.55 + f * (Math.PI * 2 / FRILL) + a.ph;
          aPos[m * 3] = p.x + Math.cos(ang) * w; aPos[m * 3 + 1] = p.y; aPos[m * 3 + 2] = p.z + Math.sin(ang) * w;
          aAlpha[m] = 0.5 * (1 - j / AS) * fade;
          m++;
        }
      }
    }
    armGeo.attributes.position.needsUpdate = true; armGeo.attributes.aA.needsUpdate = true;

    bgU.uTime.value = time; bgU.uDepth.value = depthS; bgU.uPulse.value = bio + c * 0.25;
    bgU.uMouse.value.copy(mouseS);
    snowU.uTime.value = time; snowU.uOffset.value = scrollOff; snowU.uDepth.value = depthS;

    renderer.render(scene, camera);

    // calidad adaptativa: si no llega a ~40fps, bajamos resolución
    acc += rawDt; frames++;
    if (frames === 90) {
      const avg = acc / frames;
      if (avg > 0.026 && pixelRatio > 0.6) {
        pixelRatio = Math.max(0.6, pixelRatio * 0.8);
        renderer.setPixelRatio(pixelRatio); resize();
        snowU.uPR.value = pixelRatio; gonads.material.uniforms.uPR.value = pixelRatio; armPts.material.uniforms.uPR.value = pixelRatio;
      }
      frames = 0; acc = 0;
    }
    requestAnimationFrame(frame);
  }
  root.classList.add('gl-on');
  requestAnimationFrame(frame);
}
