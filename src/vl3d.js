// Vista 3D del videolaringoscopio — vía aérea procedural, cámara en la hoja, luz LED y lente.
// Se compila con esbuild a vl3d.min.js (ver build.sh). Expone window.VL3D.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const bump = (x, c, w) => Math.exp(-((x - c) * (x - c)) / (w * w));

// ---------------------------------------------------------------------------
// Trayectoria curva: recta (boca) → arco (orofaringe) → recta (hipofaringe).
// Coordenadas anatómicas: s = profundidad, u = lateral (+ = derecha de la pantalla
// = derecha del paciente), v = anterior (+ = arriba en la pantalla).
// ---------------------------------------------------------------------------
const PATH = { s1: 3.2, R: 4.0, th: 48 * DEG };
function frame(s, P, T, N) {
  const { s1, R, th } = PATH, s2 = s1 + R * th;
  if (s <= s1) { P.set(0, 0, -s); T.set(0, 0, -1); N.set(0, 1, 0); return; }
  const a = Math.min(s - s1, R * th) / R, ca = Math.cos(a), sa = Math.sin(a);
  P.set(0, R - R * ca, -s1 - R * sa); T.set(0, sa, -ca); N.set(0, ca, sa);
  if (s > s2) P.addScaledVector(T, s - s2);
}
const _P = new THREE.Vector3(), _T = new THREE.Vector3(), _N = new THREE.Vector3();
function M(s, u, v, out) { frame(s, _P, _T, _N); return out.set(u, _P.y + v * _N.y, _P.z + v * _N.z); }

// Perfiles de la luz de la vía aérea (semiejes) a lo largo de s.
function prof(k) {
  const n = k.length;
  return s => {
    if (s <= k[0][0]) return k[0][1];
    if (s >= k[n - 1][0]) return k[n - 1][1];
    let i = 0; while (s > k[i + 1][0]) i++;
    const s0 = k[i][0], y0 = k[i][1], s1 = k[i + 1][0], y1 = k[i + 1][1];
    const m0 = i > 0 ? (y1 - k[i - 1][1]) / (s1 - k[i - 1][0]) : (y1 - y0) / (s1 - s0);
    const m1 = i < n - 2 ? (k[i + 2][1] - y0) / (k[i + 2][0] - s0) : (y1 - y0) / (s1 - s0);
    const h = s1 - s0, t = (s - s0) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
  };
}
const PA = prof([[-0.3, 2.25], [0.3, 2.35], [1.5, 2.3], [3.0, 2.05], [4.0, 1.85], [4.6, 1.68], [5.5, 1.7], [6.8, 1.65], [7.8, 1.6], [8.6, 1.55], [9.2, 1.45], [9.6, 1.1], [10.0, 0.75], [10.4, 0.45], [10.7, 0.1]]);
const PBu = prof([[-0.3, 1.45], [0.3, 1.15], [1.0, 0.92], [2.5, 0.9], [4.0, 0.98], [5.5, 1.05], [6.8, 1.2], [7.8, 1.45], [8.5, 1.7], [8.9, 1.7], [9.3, 1.2], [9.6, 0.28], [10.0, 0.16], [10.4, 0.1], [10.7, 0.04]]);
const PBd = prof([[-0.3, 1.45], [0.3, 1.55], [1.5, 1.6], [3.0, 1.55], [4.0, 1.4], [4.3, 1.25], [5.5, 1.25], [6.8, 1.2], [7.8, 1.1], [8.6, 1.0], [9.2, 0.9], [9.6, 0.45], [10.0, 0.3], [10.4, 0.16], [10.7, 0.04]]);
const PC = prof([[-0.3, 0], [8.4, 0], [9.0, -0.4], [9.6, -1.45], [10.2, -1.6], [10.7, -1.62]]);
const tongueW = s => sstep(4.8, 6.4, s) * (1 - sstep(8.3, 8.8, s));
const LIFT_DISP = 0.55;
function topWallV(s, liftE) { return PC(s) + PBu(s) + LIFT_DISP * liftE * tongueW(s); }

// ---------------------------------------------------------------------------
// Texturas procedurales de mucosa (color casi blanco + vasos) y relieve.
// ---------------------------------------------------------------------------
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, P) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const m = a => ((a % P) + P) % P;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(m(xi), m(yi)), b = hash2(m(xi + 1), m(yi)), c = hash2(m(xi), m(yi + 1)), d = hash2(m(xi + 1), m(yi + 1));
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, P, oct) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, P * f); f *= 2; a *= 0.5; } return s; }
let _seed = 7; const rnd = () => { _seed = (_seed * 9301 + 49297) % 233280; return _seed / 233280; };

function makeTextures() {
  const S = 512, NS = 128;
  const cMap = document.createElement('canvas'); cMap.width = cMap.height = S;
  const cBump = document.createElement('canvas'); cBump.width = cBump.height = S;
  const g = cMap.getContext('2d'), gb = cBump.getContext('2d');
  // ruido base a baja resolución, escalado
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = NS;
  const tb = document.createElement('canvas'); tb.width = tb.height = NS;
  const id = tmp.getContext('2d').createImageData(NS, NS), ib = tb.getContext('2d').createImageData(NS, NS);
  for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
    const n = fbm(x / 16, y / 16, 8, 4), f = fbm(x / 4 + 9, y / 4 + 3, 32, 2);
    const k = (y * NS + x) * 4;
    id.data[k] = 238 + n * 17; id.data[k + 1] = 222 + n * 26 - f * 10; id.data[k + 2] = 220 + n * 22 - f * 8; id.data[k + 3] = 255;
    const bv = 110 + n * 70 + f * 60 + (hash2(x, y) > 0.93 ? 40 : 0);
    ib.data[k] = ib.data[k + 1] = ib.data[k + 2] = bv; ib.data[k + 3] = 255;
  }
  tmp.getContext('2d').putImageData(id, 0, 0); tb.getContext('2d').putImageData(ib, 0, 0);
  g.imageSmoothingEnabled = true; gb.imageSmoothingEnabled = true;
  g.drawImage(tmp, 0, 0, S, S); gb.drawImage(tb, 0, 0, S, S);
  // vasos sanguíneos ramificados (repetidos en los bordes para que la textura sea continua)
  _seed = 11;
  const vessel = (x, y, ang, len, w, depth) => {
    const pts = [[x, y]]; let a = ang;
    for (let i = 0; i < len; i++) { a += (rnd() - 0.5) * 0.7; x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]); }
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      g.strokeStyle = `rgba(150,25,40,${0.2 + 0.25 * w / 3})`; g.lineWidth = w; g.lineCap = 'round'; g.beginPath();
      gb.strokeStyle = `rgba(200,200,200,0.35)`; gb.lineWidth = w + 1; gb.beginPath();
      pts.forEach(([px, py], i) => { if (i) { g.lineTo(px + ox, py + oy); gb.lineTo(px + ox, py + oy); } else { g.moveTo(px + ox, py + oy); gb.moveTo(px + ox, py + oy); } });
      g.stroke(); gb.stroke();
    }
    if (depth < 3) for (let b = 0; b < 2; b++) { const p = pts[Math.floor(rnd() * (pts.length - 2)) + 1]; vessel(p[0], p[1], a + (rnd() - 0.5) * 2.2, Math.floor(len * 0.6), w * 0.62, depth + 1); }
  };
  for (let i = 0; i < 9; i++) vessel(rnd() * S, rnd() * S, rnd() * Math.PI * 2, 26 + Math.floor(rnd() * 20), 2.6, 0);
  const map = new THREE.CanvasTexture(cMap); map.colorSpace = THREE.SRGBColorSpace;
  const bmp = new THREE.CanvasTexture(cBump);
  for (const t of [map, bmp]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return { map, bmp };
}

// ---------------------------------------------------------------------------
// Estado de la escena
// ---------------------------------------------------------------------------
let renderer, scene, cam, post, rt, wallMesh, wallMat, tissueMat, cordMat, larynx, leafMesh, leafRim, tubeGroup, teethUpper = [], spot, blade, uvula;
let W = 400, H = 320, DPR = 1, useRT = true;
const U = { lift: { value: 0 } };
const POST = { fog: 0, red: 0, t: 0 };
const AE = { target: 1, cur: 1 };
let TUBE_NEAR = 99;
const L0 = { petS: 9.12, petV: 0.95, L: 1.85, comp: 0 }; // epiglotis (coordenadas locales del grupo laríngeo, sin desplazamiento)
const SREF = 9.0;
let laryShift = 0, leafGamma = 68 * DEG;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

function colorOf(hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }
function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

// Pared principal: boca → orofaringe → hipofaringe → esófago (con hueco para la entrada laríngea)
function buildWall() {
  const S0 = -0.3, S1 = 10.7, DS = 0.05, COLS = 88;
  const rows = Math.round((S1 - S0) / DS) + 1, n = rows * (COLS + 1);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2), dsp = new Float32Array(n * 3);
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3();
  const cPh = colorOf('#d3756e'), cTon = colorOf('#e3a39a'), cPal = colorOf('#ecb6ad'), cLip = colorOf('#b0585f'), cEso = colorOf('#a04643'), cEnd = colorOf('#5a1c1f'), cPyr = colorOf('#8c3a3a'), cVal = colorOf('#c26460'), cPost = colorOf('#cb6c66');
  let k = 0;
  for (let r = 0; r < rows; r++) {
    const s = Math.min(S1, S0 + r * DS); frame(s, P, T, N);
    const a = PA(s), bu = PBu(s), bd = PBd(s), c = PC(s), tw = tongueW(s);
    for (let j = 0; j <= COLS; j++, k++) {
      const ph = j / COLS * Math.PI * 2, cs = Math.cos(ph), sn = Math.sin(ph), acs = Math.abs(cs);
      let uu = a * cs;
      let vv = (sn >= 0 ? bu : bd) * sn;
      uu *= 1 - 0.17 * bump(s, 4.35, 0.5) * acs * acs * acs;                       // amígdalas y pilares
      if (sn < 0) vv *= 1 - 0.18 * bump(s, 4.1, 0.22) * sn * sn;                     // borde del paladar blando
      if (sn > 0 && cs < 0) vv *= 1 - 0.14 * sstep(0.6, 1.4, s) * (1 - sstep(3.8, 5, s)) * sn * (-cs); // lengua barrida a la izquierda
      if (sn > 0) vv *= 1 - 0.05 * bump(s, 6.6, 0.9) * (0.5 + 0.5 * Math.sin(s * 9 + ph * 7)) * sn; // amígdala lingual
      if (s > 9.8) { const f = 1 + 0.14 * Math.sin(ph * 7 + 1.3) * sstep(9.8, 10.4, s); uu *= f; vv *= f; } // pliegues del esófago
      const nz = 1 + 0.035 * Math.sin(s * 2.1 + ph * 2.0) * Math.sin(s * 1.3 - ph * 3.0) + 0.015 * Math.sin(s * 4.7 + ph * 5.0) * Math.cos(s * 3.1);
      uu *= nz; vv *= nz; vv += c;
      pos[k * 3] = uu; pos[k * 3 + 1] = P.y + vv * N.y; pos[k * 3 + 2] = P.z + vv * N.z;
      const w = tw * Math.pow(Math.max(0, sn), 1.5);
      dsp[k * 3 + 1] = N.y * w; dsp[k * 3 + 2] = N.z * w;
      // color por región
      let C = cPh;
      if (s > 4.2) C = mix3(C, cPost, sstep(-0.2, -0.7, sn));
      C = mix3(C, cTon, sstep(0.1, 0.5, sn) * (1 - sstep(7.0, 7.9, s)));
      C = mix3(C, cPal, sstep(-0.2, -0.6, sn) * (1 - sstep(3.9, 4.3, s)));
      C = mix3(C, cVal, bump(s, 8.5, 0.4) * sstep(0.3, 0.8, sn));
      C = mix3(C, cPyr, bump(s, 9.45, 0.35) * sstep(0.55, 0.95, acs));
      C = mix3(C, cEso, sstep(9.5, 10.2, s));
      C = mix3(C, cEnd, sstep(10.2, 10.65, s));
      C = mix3(C, cLip, 1 - sstep(0.05, 0.4, s));
      col[k * 3] = C[0]; col[k * 3 + 1] = C[1]; col[k * 3 + 2] = C[2];
      uv[k * 2] = s / 1.6; uv[k * 2 + 1] = j / COLS * 4;
    }
  }
  const idx = [];
  for (let r = 0; r < rows - 1; r++) {
    const s = S0 + (r + 0.5) * DS;
    for (let j = 0; j < COLS; j++) {
      const ph = (j + 0.5) / COLS * Math.PI * 2;
      if (s > 8.8 && s < 9.58 && Math.sin(ph) > 0.45) continue; // entrada laríngea
      const a = r * (COLS + 1) + j, b = a + COLS + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aDisp', new THREE.BufferAttribute(dsp, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

// Malla "loft" entre lazos cerrados (para la laringe). loops: funciones θ → [u, v, s]
function loft(loops, cols, colorFn, sub) {
  const rowsDef = [];
  for (let i = 0; i < loops.length - 1; i++) for (let k = 0; k < sub; k++) rowsDef.push([i, k / sub]);
  rowsDef.push([loops.length - 1, 0]);
  const n = rowsDef.length * (cols + 1);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let k = 0;
  rowsDef.forEach(([i, t], r) => {
    const nL = loops.length, cr = (a, b, c, d, x) => 0.5 * (2 * b + (-a + c) * x + (2 * a - 5 * b + 4 * c - d) * x * x + (-a + 3 * b - 3 * c + d) * x * x * x);
    for (let j = 0; j <= cols; j++, k++) {
      const th = j / cols * Math.PI * 2;
      const A0 = loops[Math.max(0, i - 1)](th), A = loops[i](th), B = loops[Math.min(nL - 1, i + 1)](th), B2 = loops[Math.min(nL - 1, i + 2)](th);
      const u = cr(A0[0], A[0], B[0], B2[0], t), v = cr(A0[1], A[1], B[1], B2[1], t), s = cr(A0[2], A[2], B[2], B2[2], t);
      pos[k * 3] = u; pos[k * 3 + 1] = v; pos[k * 3 + 2] = -(s - SREF);
      const C = colorFn(i + t, th);
      col[k * 3] = C[0]; col[k * 3 + 1] = C[1]; col[k * 3 + 2] = C[2];
      uv[k * 2] = (i + t) * 0.35; uv[k * 2 + 1] = j / cols * 3;
    }
  });
  const idx = [];
  for (let r = 0; r < rowsDef.length - 1; r++) for (let j = 0; j < cols; j++) { const a = r * (cols + 1) + j, b = a + cols + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
function triR(th, apex, base, hw) {
  const dx = Math.cos(th), dy = Math.sin(th); let best = 1e9;
  for (const [x1, y1, x2, y2] of [[0, apex, hw, base], [hw, base, -hw, base], [-hw, base, 0, apex]]) {
    const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
    const t = (x1 * ey - y1 * ex) / den, kk = (x1 * dy - y1 * dx) / den;
    if (t > 0 && kk >= -1e-6 && kk <= 1 + 1e-6) best = Math.min(best, t);
  }
  return best;
}
const GC = -0.05, GA = 0.75, GP = -0.85; // centro, comisura anterior y posterior (locales)
const el = (rx, ryU, ryD, sFn) => th => { const sn = Math.sin(th), w = 1 + 0.035 * Math.sin(3 * th + rx * 7) + 0.02 * Math.sin(5 * th + 1.7); return [rx * Math.cos(th) * w, GC + (sn >= 0 ? ryU : ryD) * sn * w, sFn(th)]; };

function buildLarynx() {
  const g = new THREE.Group();
  const cRim = colorOf('#dd9089'), cVest = colorOf('#d07b75'), cFalse = colorOf('#c35b58'), cVent = colorOf('#5f1b1f'), cCord = colorOf('#f3ece6'), cPostC = colorOf('#cf8079'), cSub = colorOf('#b2615d'), cPyr = colorOf('#6f2427'), cSkin = colorOf('#cd7570');
  // Vestíbulo → bandas ventriculares → ventrículo → cuerdas vocales → subglotis
  const tri = th => { const r = triR(th, GA - GC, GP - GC, 0.5); return [r * Math.cos(th), GC + r * Math.sin(th), 9.5]; };
  const triUp = th => { const r = triR(th, GA - GC, GP - GC, 0.5), e = Math.hypot(0.62 * Math.cos(th), 0.8 * Math.sin(th)); const rr = lerp(e, r, 0.72); return [rr * Math.cos(th), GC + rr * Math.sin(th), 9.47]; };
  const inner = [
    el(0.8, 1.02, 0.95, th => 9.16 - 0.2 * Math.sin(th)),
    el(0.7, 0.93, 0.9, th => 9.26 - 0.12 * Math.sin(th)),
    el(0.6, 0.86, 0.84, th => 9.34 - 0.06 * Math.sin(th)),
    el(0.66, 0.85, 0.83, () => 9.42),
    triUp, tri,
    th => [0.55 * Math.cos(th), GC + 0.55 * Math.sin(th), 9.8],
    th => [0.56 * Math.cos(th), GC + 0.56 * Math.sin(th), 10.1],
  ];
  const innerCol = (x, th) => {
    const sn = Math.sin(th), cordZone = sstep(-0.8, -0.6, sn);
    if (x < 1) return mix3(cRim, cVest, x);
    if (x < 2) return mix3(cVest, cFalse, x - 1);
    if (x < 3) return mix3(cFalse, cVent, sstep(0.3, 1, x - 2));
    const shelf = mix3(cPostC, colorOf('#e2c3bb'), cordZone), edge = mix3(cPostC, cCord, cordZone);
    if (x < 4) return mix3(cVent, shelf, sstep(3.0, 3.8, x));
    if (x < 5) return mix3(shelf, edge, sstep(4.3, 5, x));
    if (x < 6) return mix3(edge, cSub, sstep(5.0, 5.5, x));
    return mix3(cSub, colorOf('#8a3d3c'), x - 6);
  };
  g.add(new THREE.Mesh(loft(inner, 72, innerCol, 4), tissueMat));
  // Pliegues aritenoepiglóticos hacia afuera (senos piriformes)
  const outer = [
    el(0.8, 1.02, 0.95, th => 9.16 - 0.2 * Math.sin(th)),
    th => { const sn = Math.sin(th), f = 1 - 0.75 * Math.max(0, sn); return [lerp(0.8, 0.92, f) * Math.cos(th), GC + (sn >= 0 ? lerp(1.02, 1.12, f) : 1.04) * sn, 9.16 - 0.2 * sn - 0.07 * f]; },
    th => { const sn = Math.sin(th), cs = Math.cos(th); return [1.15 * cs, GC + (sn >= 0 ? 1.4 : 1.15) * sn, 9.18 - 0.28 * sn + 0.38 * cs * cs]; },
    th => { const sn = Math.sin(th), cs = Math.cos(th); return [1.78 * cs, GC + (sn >= 0 ? 1.85 : 1.62) * sn, 9.15 - 0.5 * sn]; },
  ];
  const outerCol = (x, th) => { const cs = Math.abs(Math.cos(th)), sn = Math.sin(th); const pyr = sstep(0.4, 0.9, cs) * sstep(1.0, 2.0, x) * (sn < 0.5 ? 1 : 0.3); return mix3(mix3(mix3(cRim, cSkin, sstep(0.5, 2, x)), cPyr, pyr * 0.25), colorOf('#d3756e'), sstep(1.4, 2.6, x)); };
  g.add(new THREE.Mesh(loft(outer, 72, outerCol, 4), tissueMat));
  // Cuerdas vocales verdaderas (bordes blancos)
  for (const sgn of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(sgn * lerp(0.0, 0.47, t), lerp(GA - 0.03, GP + 0.07, t), -(9.49 - SREF))); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.045, 8, false), cordMat));
  }
  // Aritenoides, corniculados y cuneiformes
  const sph = new THREE.SphereGeometry(1, 24, 16);
  const blob = (u, v, s, sx, sy, sz, hex) => { const m = new THREE.Mesh(sph, tissueMat.clone()); m.material.vertexColors = false; m.material.color = new THREE.Color(hex); m.position.set(u, v, -(s - SREF)); m.scale.set(sx, sy, sz); g.add(m); return m; };
  for (const sgn of [-1, 1]) {
    blob(sgn * 0.43, GP - 0.17, 9.38, 0.24, 0.16, 0.22, '#d98f86');
    blob(sgn * 0.33, GP - 0.06, 9.33, 0.085, 0.075, 0.085, '#e3a296');
  }
  // Tráquea con anillos
  const tr = [];
  const TR = th => s => { const sn = Math.sin(th), ring = 0.5 + 0.5 * Math.cos((s - 10.1) / 0.36 * Math.PI * 2), post = sstep(-0.55, -0.8, sn); return 0.56 - 0.045 * ring * (1 - post) - 0.08 * post * (-sn); };
  const trLoops = []; for (let i = 0; i <= 50; i++) { const s = 10.1 + i * 0.12; trLoops.push(th => { const r = TR(th)(s); return [r * Math.cos(th), GC + r * Math.sin(th) + (s - 10.1) * 0.06, s]; }); }
  const trCol = (x, th) => { const s = 10.1 + x * 0.12, ring = 0.5 + 0.5 * Math.cos((s - 10.1) / 0.36 * Math.PI * 2), post = sstep(-0.55, -0.8, Math.sin(th)); return mix3(mix3(colorOf('#a5524f'), colorOf('#e2b1a8'), ring * 0.7 * (1 - post)), colorOf('#8a3a3a'), post * 0.6); };
  g.add(new THREE.Mesh(loft(trLoops, 48, trCol, 1), tissueMat));
  // Epiglotis (se actualiza por cuadro)
  const lg = new THREE.BufferGeometry();
  const LR = 16, LC = 15; lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LR * LC * 3), 3));
  const lcol = new Float32Array(LR * LC * 3), luv = new Float32Array(LR * LC * 2);
  const ce = colorOf('#e29a8f'), cb = colorOf('#cf7d76');
  for (let r = 0; r < LR; r++) for (let c = 0; c < LC; c++) { const k = r * LC + c, C = mix3(ce, cb, r / (LR - 1)); lcol.set(C, k * 3); luv[k * 2] = c / (LC - 1); luv[k * 2 + 1] = r / (LR - 1) * 1.5; }
  lg.setAttribute('color', new THREE.BufferAttribute(lcol, 3)); lg.setAttribute('uv', new THREE.BufferAttribute(luv, 2));
  const li = []; for (let r = 0; r < LR - 1; r++) for (let c = 0; c < LC - 1; c++) { const a = r * LC + c, b = a + LC; li.push(a, b, a + 1, b, b + 1, a + 1); }
  lg.setIndex(li); lg.userData = { LR, LC };
  leafMesh = new THREE.Mesh(lg, tissueMat); g.add(leafMesh);
  leafRim = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshPhysicalMaterial({ color: '#e7a598', roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.2 }));
  return g;
}

// Punto de la epiglotis en coordenadas locales: t = 0 (punta libre) … 1 (pecíolo), i = −1 … 1 (ancho)
function leafLocal(t, i, gamma, out) {
  const { petS, petV, L } = L0;
  const tipS = petS - L * Math.cos(gamma), tipV = petV - L * Math.sin(gamma);
  const dS = Math.cos(gamma), dV = Math.sin(gamma);   // dirección punta → pecíolo
  const nS = -dV, nV = dS;                             // normal hacia la lengua
  let s = lerp(tipS, petS, t), v = lerp(tipV, petV, t);
  s += nS * 0.13 * Math.sin(Math.PI * t); v += nV * 0.13 * Math.sin(Math.PI * t);
  const hw = 0.2 + 0.46 * (1 - sstep(0.55, 1.0, t)) - 0.08 * Math.pow(1 - t, 6);
  const curl = 0.34 * i * i * (1 - 0.55 * t), round = 0.3 * i * i * Math.pow(1 - t, 3);
  s += -nS * curl + dS * round; v += -nV * curl + dV * round;
  v += L0.comp * Math.pow(1 - t, 1.2); // la punta queda sostenida por la hoja aunque la laringe se desplace
  return out.set(hw * i * (1 - 0.15 * i * i * (1 - t)), v, -(s - SREF));
}
function updateLeaf() {
  const geo = leafMesh.geometry, { LR, LC } = geo.userData, p = geo.attributes.position.array;
  for (let r = 0; r < LR; r++) for (let c = 0; c < LC; c++) {
    const t = r / (LR - 1), i = c / (LC - 1) * 2 - 1; leafLocal(t, i, leafGamma, _v);
    const k = (r * LC + c) * 3; p[k] = _v.x; p[k + 1] = _v.y; p[k + 2] = _v.z;
  }
  geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
}

function buildMouth(skinMat, lipMat, toothMat) {
  const g = new THREE.Group();
  const sh = new THREE.Shape(); sh.moveTo(-40, -40); sh.lineTo(40, -40); sh.lineTo(40, 40); sh.lineTo(-40, 40); sh.lineTo(-40, -40);
  const hole = new THREE.Path(); hole.absellipse(0, 0, 2.25, 1.5, 0, Math.PI * 2, true); sh.holes.push(hole);
  const face = new THREE.Mesh(new THREE.ShapeGeometry(sh, 48), skinMat); face.position.z = 0.25; g.add(face);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 18, 72), lipMat); lip.scale.set(2.42, 1.66, 1.6); lip.position.z = 0.05; g.add(lip);
  const tooth = new THREE.SphereGeometry(1, 18, 14);
  const addTooth = (ang, rx, ry, z, sx, sy, upper) => {
    const m = new THREE.Mesh(tooth, upper ? toothMat.clone() : toothMat); m.position.set(rx * Math.cos(ang), ry * Math.sin(ang), z);
    m.rotation.z = ang - Math.PI / 2; m.scale.set(sx, sy, 0.1); g.add(m); if (upper) teethUpper.push(m);
  };
  for (let i = 0; i < 6; i++) addTooth((247 + i * 9.2) * DEG, 1.85, 1.28, -0.3, 0.19, 0.3, true);   // incisivos superiores (abajo en la pantalla)
  for (let i = 0; i < 6; i++) addTooth((68 + i * 8.8) * DEG, 1.75, 1.22, -0.42, 0.15, 0.24, false); // incisivos inferiores (arriba)
  return g;
}

function buildBlade() {
  // Hoja vista desde la cámara: placa curva en la parte superior que termina en la punta.
  const geo = new THREE.BufferGeometry(); const R = 22, C = 11; const pos = [], idx = [];
  for (let r = 0; r < R; r++) {
    const t = r / (R - 1), z = -1.3 - t * 1.3, y = 0.42 + 0.3 * (-z) - 0.12 * t * t;
    const tc = 0.7, rnd = t > tc ? Math.sqrt(Math.max(0, 1 - Math.pow((t - tc) / (1 - tc), 2))) : 1, hw = lerp(0.36, 0.26, t) * rnd;
    for (let c = 0; c < C; c++) { const i = c / (C - 1) * 2 - 1; pos.push(i * hw, y + 0.08 * i * i, z); }
  }
  for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) { const a = r * C + c, b = a + C; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#737c84', roughness: 0.55, metalness: 0.25, clearcoat: 0.25, side: THREE.DoubleSide }));
}

// ---------------------------------------------------------------------------
// Post-proceso: lente gran angular, aberración, empañamiento, viñeta y grano.
// ---------------------------------------------------------------------------
function buildPost() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uFog: { value: 0 }, uRed: { value: 0 }, uK: { value: 0.22 }, uExp: { value: 1.0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime,uFog,uRed,uK,uExp; varying vec2 vUv;
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }
      vec3 srgb(vec3 c){ return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-0.055, step(vec3(0.0031308),c)); }
      float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      vec2 dist(vec2 uv,float k){ float a=uRes.x/uRes.y; vec2 p=uv-.5; p.x*=a; float r2=dot(p,p); float rm=(a*a+1.)*0.25; p*=(1.+k*r2)/(1.+k*rm); p.x/=a; return p+.5; }
      vec3 tap(vec2 uv){ if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) return vec3(0.); return texture2D(tDiffuse,uv).rgb; }
      void main(){
        float a=uRes.x/uRes.y;
        vec2 g=dist(vUv,uK);
        vec3 col=vec3(tap(dist(vUv,uK*1.035)).r, tap(g).g, tap(dist(vUv,uK*0.965)).b);
        if(uFog>0.002){ vec3 b=vec3(0.); float rad=0.018*uFog;
          for(int i=0;i<16;i++){ float fi=float(i); float an=fi*2.39996; float rr=rad*sqrt((fi+0.5)/16.)*1.6; b+=tap(g+vec2(cos(an)/a,sin(an))*rr); }
          b/=16.; float l=dot(b,vec3(.3,.5,.2)); col=mix(col, b*0.7+vec3(l)*0.45+0.05, clamp(uFog,0.,1.)); }
        col*=uExp; col=aces(col);
        vec2 q=(vUv-.5)*vec2(a,1.); float rr=length(q)/max(0.5*a,0.62);
        col*=1.-smoothstep(0.7,1.3,rr)*0.75;
        col=mix(col, vec3(0.85,0.08,0.08), uRed*0.22);
        col=srgb(col);
        col+= (hash(vUv*uRes+fract(uTime*7.31))-.5)*0.03;
        gl_FragColor=vec4(col,1.);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(quad);
  return { scene: sc, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------
function init(canvas) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 no disponible');
  } catch (e) { console.warn('VL3D:', e); return false; }
  renderer.setClearColor(0x050101, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0e0203, 4.5, 15);
  cam = new THREE.PerspectiveCamera(68, 1.25, 0.03, 40);
  scene.add(cam);
  const tex = makeTextures();
  tissueMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, map: tex.map, bumpMap: tex.bmp, bumpScale: 0.35, roughness: 0.45, clearcoat: 0.55, clearcoatRoughness: 0.16, side: THREE.DoubleSide });
  wallMat = tissueMat.clone();
  wallMat.onBeforeCompile = sh => {
    sh.uniforms.uLift = U.lift;
    sh.vertexShader = 'attribute vec3 aDisp;\nuniform float uLift;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += aDisp * uLift;');
  };
  cordMat = new THREE.MeshPhysicalMaterial({ color: '#f7f2ec', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#c99079', roughness: 0.65 });
  const lipMat = new THREE.MeshPhysicalMaterial({ color: '#a9505a', roughness: 0.4, clearcoat: 0.5 });
  const toothMat = new THREE.MeshPhysicalMaterial({ color: '#efe7d6', roughness: 0.22, clearcoat: 0.7, emissive: '#000000' });
  wallMesh = new THREE.Mesh(buildWall(), wallMat); scene.add(wallMesh);
  scene.add(buildMouth(skinMat, lipMat, toothMat));
  // úvula
  const uv0 = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.5, 8, 16), new THREE.MeshPhysicalMaterial({ color: '#e1968e', roughness: 0.38, clearcoat: 0.7, bumpMap: tex.bmp, bumpScale: 0.8, map: tex.map }));
  const s0 = 4.38; frame(s0, _P, _T, _N); M(s0, 0, PC(s0) - PBd(s0) * 0.62, uv0.position);
  uv0.up.copy(_N); const mt = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), _N.clone(), _T.clone().negate()); uv0.quaternion.setFromRotationMatrix(mt); uv0.rotateX(-0.35);
  uvula = uv0; scene.add(uv0);
  larynx = buildLarynx(); scene.add(larynx); placeLarynx();
  const back = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), new THREE.MeshBasicMaterial({ color: (window.__dbgBack||'#1c0405'), side: THREE.BackSide, fog: false })); M(9.4, 0, -0.4, back.position); scene.add(back);
  tubeGroup = new THREE.Group(); scene.add(tubeGroup);
  // luz LED de la hoja (sigue a la cámara)
  spot = new THREE.SpotLight(0xfff1e6, 34, 0, 0.95, 0.75, 2);
  spot.position.set(0.12, 0.08, 0); cam.add(spot);
  const tgt = new THREE.Object3D(); tgt.position.set(0, -0.1, -3); cam.add(tgt); spot.target = tgt;
  scene.add(new THREE.HemisphereLight(0xffe8e4, 0x2a0505, 0.22));
  blade = buildBlade(); cam.add(blade);
  post = buildPost();
  updateLeaf();
  VL3D.ready = true;
  return true;
}
function placeLarynx() {
  frame(SREF, _P, _T, _N);
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), _N.clone(), _T.clone().negate());
  larynx.quaternion.setFromRotationMatrix(m);
  M(SREF, 0, laryShift, larynx.position);
}
const QUAL = [{ dpr: 1.0, samples: 0 }, { dpr: 1.3, samples: 2 }, { dpr: 1.75, samples: 4 }];
let qLevel = 2, devDpr = 1;
function setQuality(q) { qLevel = clamp(q, 0, 2); resize(W, H, devDpr); return qLevel; }
function resize(w, h, dpr) {
  if (!renderer) return;
  devDpr = dpr || 1; W = w; H = h; DPR = Math.min(devDpr, QUAL[qLevel].dpr);
  renderer.setPixelRatio(DPR); renderer.setSize(w, h, false);
  cam.aspect = w / h; cam.fov = w / h > 1.45 ? 58 : 68; cam.updateProjectionMatrix();
  const bw = Math.round(w * DPR), bh = Math.round(h * DPR);
  if (rt) rt.dispose();
  const gl = renderer.getContext();
  const half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  rt = new THREE.WebGLRenderTarget(bw, bh, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: QUAL[qLevel].samples, depthBuffer: true });
  post.mat.uniforms.uRes.value.set(bw, bh);
}
// Pose de la cámara a partir del estado del laringoscopio
function setPose(st) {
  const tipS = st.d * 10.5, camS = tipS - 2.6;
  const cu = st.lat * 1.5, cv = 0.12 + st.lift * 0.32;
  M(camS, cu, cv, cam.position);
  frame(camS, _P, _T, _N); cam.up.copy(_N);
  M(camS + 4.2, st.lat * 2.4, -0.25 + st.lift * 0.22, _w); cam.lookAt(_w);
  cam.updateMatrixWorld(true);
  U.lift.value = LIFT_DISP * (st.liftE || 0);
  leafLocal(0.05, 0, leafGamma, _v); _v.applyMatrix4(larynx.matrixWorld);
  let near = _v.distanceTo(cam.position);
  near = Math.min(near, 0.6 + Math.max(0, topWallV(camS + 1.2, st.liftE || 0) - PC(camS + 1.2) - cv) * 1.2);
  near = Math.min(near, TUBE_NEAR + 1.2);
  AE.target = clamp(Math.pow(near / 2.2, 1.4), 0.14, 1.0);
  blade.visible = tipS > 1.2;
}
function setLeaf(gammaRad, comp) { comp = comp || 0; if (Math.abs(gammaRad - leafGamma) > 1e-4 || Math.abs(comp - L0.comp) > 1e-4) { leafGamma = gammaRad; L0.comp = comp; updateLeaf(); } }
function setLarynxShift(v) { if (Math.abs(v - laryShift) > 1e-4) { laryShift = v; placeLarynx(); larynx.updateMatrixWorld(true); } }
function setBend(deg) {
  PATH.th = deg * DEG;
  if (!renderer) return;
  wallMesh.geometry.dispose(); wallMesh.geometry = buildWall();
  const s0 = 4.38; frame(s0, _P, _T, _N); M(s0, 0, PC(s0) - PBd(s0) * 0.62, uvula.position);
  const mt = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), _N.clone(), _T.clone().negate()); uvula.quaternion.setFromRotationMatrix(mt); uvula.rotateX(-0.35);
  placeLarynx();
}
const tubeMat = { body: null, cuff: null, band: null, tip: null };
function setTube(pts, opt) {
  // pts: [{x(u), y(v), z(s), cm}] desde la punta hacia atrás
  tubeGroup.children.forEach(m => m.geometry.dispose()); tubeGroup.clear(); TUBE_NEAR = 99;
  if (!pts || pts.length < 3) return;
  if (!tubeMat.body) {
    const c = document.createElement('canvas'); c.width = 8; c.height = 128; const g2 = c.getContext('2d');
    g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, 8, 128); g2.fillStyle = '#2f6fe6'; g2.fillRect(0, 22, 8, 9);
    const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace;
    tubeMat.body = new THREE.MeshPhysicalMaterial({ color: '#2a3134', emissive: '#66757a', emissiveMap: tt, map: tt, roughness: 0.35, clearcoat: 0.35, clearcoatRoughness: 0.25, specularIntensity: 0.35, transparent: true, opacity: 0.9 });
    tubeMat.cuff = new THREE.MeshPhysicalMaterial({ color: '#33424c', emissive: '#4f6a7c', roughness: 0.2, clearcoat: 0.5, specularIntensity: 0.4, transparent: true, opacity: 0.6 });
    tubeMat.band = new THREE.MeshStandardMaterial({ color: '#111216', roughness: 0.5 });
    tubeMat.line = new THREE.MeshStandardMaterial({ color: '#2a6be0', roughness: 0.4 });
  }
  let world = pts.map(p => M(p.z, p.x, p.y, new THREE.Vector3()));
  const keep = world.map(w => _w.copy(w).applyMatrix4(cam.matrixWorldInverse).z < -0.25);
  TUBE_NEAR = Math.min(...world.map(w => w.distanceTo(cam.position)));
  pts = pts.filter((p, i) => keep[i]); world = world.filter((w, i) => keep[i]);
  if (world.length < 3) return;
  const seg = (a, b) => { const out = []; pts.forEach((p, i) => { if (p.cm >= a && p.cm <= b) out.push(world[i]); }); return out; };
  const add = (arr, r, mat, n) => { if (arr.length < 2) return; const c = new THREE.CatmullRomCurve3(arr); tubeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(c, n || Math.max(4, arr.length * 2), r, 14, false), mat)); };
  add(world, 0.31, tubeMat.body, 60);
  add(seg(1.0, 4.2), opt && opt.cuff ? 0.52 : 0.36, tubeMat.cuff, 24);
  add(seg(5.3, 6.0), 0.318, tubeMat.band, 6);
}
function setLever(on) { POST.red = on ? 1 : 0; teethUpper.forEach(m => m.material.emissive.set(on ? '#7a0000' : '#000000')); }
function setFog(f) { POST.fog = f; }
function render(dt) {
  if (!renderer) return;
  POST.t += dt || 0.016;
  if (rt) {
    renderer.setRenderTarget(rt); renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    AE.cur += (AE.target - AE.cur) * Math.min(1, (dt || 0.016) * 3.5);
    const u = post.mat.uniforms; u.uExp.value = AE.cur; u.tDiffuse.value = rt.texture; u.uTime.value = POST.t; u.uFog.value = POST.fog; u.uRed.value = POST.red;
    renderer.render(post.scene, post.cam);
  } else renderer.render(scene, cam);
}
// Proyección (u, v, s) → píxeles de pantalla. Respeta el desplazamiento laríngeo si local=true
function project(u, v, s) {
  M(s, u, v, _v); _w.copy(_v).applyMatrix4(cam.matrixWorldInverse);
  if (_w.z > -0.02) return null;
  _v.project(cam);
  // distorsión de la lente (misma que el post-proceso, invertida aproximadamente)
  return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H };
}
function leafWorld(t, i) { leafLocal(t, i, leafGamma, _v); _v.applyMatrix4(larynx.matrixWorld); return _v; }
function projectWorld(p) { _w.copy(p).applyMatrix4(cam.matrixWorldInverse); if (_w.z > -0.02) return null; const q = p.clone().project(cam); return { x: (q.x + 1) / 2 * W, y: (1 - q.y) / 2 * H }; }
// v (anterior, con desplazamiento) de la línea media de la epiglotis a la profundidad s
function leafVAt(s) {
  let best = null;
  for (let k = 0; k <= 20; k++) { leafLocal(k / 20, 0, leafGamma, _v); const ss = SREF - _v.z; if (best === null || Math.abs(ss - s) < Math.abs(best[0] - s)) best = [ss, _v.y]; }
  return { s: best[0], v: best[1] + laryShift, tipS: L0.petS - L0.L * Math.cos(leafGamma), tipV: L0.petV - L0.L * Math.sin(leafGamma) + laryShift + L0.comp };
}
function leafScreenMaxY() {
  let m = -1e9, any = false;
  for (const t of [0, 0.06, 0.15, 0.3, 0.45, 0.6, 0.8]) for (const i of [-0.7, -0.35, 0, 0.35, 0.7]) {
    const p = projectWorld(leafWorld(t, i).clone()); if (p) { any = true; m = Math.max(m, p.y); }
  }
  return any ? m : null;
}

const VL3D = { ready: false, init, resize, setQuality, get quality() { return qLevel; }, setPose, setLeaf, setLarynxShift, setBend, setTube, setLever, setFog, render, project, topWallV, leafVAt, leafScreenMaxY, LEAF: L0, get W() { return W; }, get H() { return H; } };
window.VL3D = VL3D;
