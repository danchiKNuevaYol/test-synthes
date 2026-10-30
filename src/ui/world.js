// Блок .world — пейзаж места на весь экран, рисуется p5.js (instance mode) в стиле «ЛИНИИ»:
// только чёрная тушь по бумаге, всё поле — горизонтальные линии, как запись самописца.
// Небо — редкие линии (ночью — плотная штриховка), горы — гряды из параллельных линий, приподнятых шумом места
// (каждая линия закрашивает бумагой всё под собой — дальние не просвечивают сквозь ближние),
// земля — линии с перспективой. Облако голоса A закручивает линии неба, горизонт голоса B — двойная линия.
// Горизонт и облако стоят там, где их держат ручки: координаты берём из src/world/geometry.js.
// Звук управляет картинкой: A — облако и ветер в траве, B — дрожь горизонта, частицы приходят из engine.onTrigger,
// «ДАЛЬ» рвёт линии над горизонтом пунктиром, «ЖАР» заставляет линии у горизонта мелко дрожать.
// Раскат — мгновенная инверсия холста (белое по чёрному). В покое рисунок замирает и не перерисовывается.
// Текста на холсте нет: подписи рисует DOM.

import p5 from 'p5';
import { engine } from '../audio/engine.js';
import { cloudPos, horizonY } from '../world/geometry.js';
import { skyHatch, clamp, smooth } from '../world/palette.js';

const MAX_PARTS = 200;
// Клубы облака: [сдвиг по x, сдвиг по y, радиус] в долях R; 3, 4 или 5 клубов — по плотности
const LOBES = [
  [[-1.3, 0.2, 0.75], [0, -0.1, 1], [1.4, 0.2, 0.62]],
  [[-2.0, 0.3, 0.55], [-0.8, -0.25, 0.85], [0.4, 0.1, 1], [1.7, -0.1, 0.7]],
  [[-2.3, 0.3, 0.5], [-1.2, -0.25, 0.8], [-0.1, 0.1, 1], [1.1, -0.2, 0.72], [2.2, 0.28, 0.48]],
];
const STEP = 5;                                               // шаг по x у гряд, px
const GROUND_TOP = 0.7;                                       // с этой высоты (доля окна) начинается трава
const DEFAULT_PLACE = { name: '', time: '12:00', minutes: 720, weather: 'wind', seed: 1, night: false };
const WEATHERS = ['wind', 'rain', 'storm', 'forest', 'alien'];
const RAIN_RATE = { rain: 55, storm: 95 };                    // капель дождя в секунду
const HAIR = 1, MAIN = 1.25, BOLD = 2;                        // семья толщин линий, px
let paperHex = '#f3f2ee', paperRgb = [243, 242, 238];   // тон бумаги берём из CSS-переменной --paper
const ink = (a = 1) => `rgba(17,17,17,${a})`;

/** Своё зерно случайных чисел (mulberry32): раскладка гор, звёзд и травы повторяется для одного места. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// сосна: контур задан относительно основания (x = 0, y = 0 — земля), вершина вверху
function pine(h, hw) {
  const T = 5, th = (h * 0.88) / T, right = [], left = [];
  for (let t = 0; t < T; t++) {
    const y0 = -h + t * th * 0.8, yb = y0 + th * 1.2, w = hw * (t + 1) / T;
    right.push([w * 0.4, y0 + th * 0.3], [w, yb]);
    left.unshift([-w, yb], [-w * 0.4, y0 + th * 0.3]);
  }
  const yl = right[right.length - 1][1];
  return [[0, -h], ...right, [hw * 0.07, yl], [hw * 0.07, 0], [-hw * 0.07, 0], [-hw * 0.07, yl], ...left];
}
const PINE = pine(1, 0.2);

/** Рельеф места: три гряды (высоты вдоль x), холмы земли, звёзды, трава, деревья — всё из зерна. */
function buildTerrain(p, seed, W, H) {
  const rnd = rng(seed);
  p.noiseSeed(seed);
  const cols = Math.ceil(W / STEP) + 2;
  // дальняя, средняя, ближняя: число линий, отступ подножия от горизонта, размах, частота, острота (доли высоты)
  const spec = [
    { n: 6, off: 0.075, amp: 0.2, freq: 2.4, sharp: 0.5, gap: 0.0062 },
    { n: 8, off: 0.042, amp: 0.16, freq: 3.6, sharp: 0.4, gap: 0.0068 },
    { n: 10, off: 0.014, amp: 0.125, freq: 5.4, sharp: 0.3, gap: 0.0072 },
  ];
  const ridges = spec.map((L) => {
    const o = rnd() * 900, f = L.freq * (0.85 + rnd() * 0.4), amp = L.amp * (0.88 + rnd() * 0.3);
    const h = Array.from({ length: cols }, (_, i) => {
      const u = i / (cols - 1);
      const n = p.noise(o + u * f) * 0.78 + (p.noise(o + 70 + u * f * 3.6) - 0.5) * 0.3;
      const ridged = 1 - Math.abs(p.noise(o + 140 + u * f * 1.7) * 2 - 1);   // острые хребты
      return Math.pow(clamp(((n * (1 - L.sharp) + ridged * L.sharp) - 0.28) / 0.5), 1.2);
    });
    return { ...L, amp, h };
  });

  // холмы земли: четыре дорожки шума; соседние линии земли смешивают соседние дорожки — рельеф плавный
  const hills = Array.from({ length: 4 }, (_, j) => Array.from({ length: cols }, (_, i) => p.noise(60 * j + 5 + (i / (cols - 1)) * (2.2 + j * 0.7)) - 0.5));

  const stars = Array.from({ length: Math.round(W / 14) }, () => ({ u: rnd(), v: Math.pow(rnd(), 1.2) * 0.62, r: 1.6 + rnd() * 1.7, ph: rnd() * 6.28, sp: 0.8 + rnd() * 2.2 }));
  const planet = { u: 0.2 + rnd() * 0.55, v: 0.15 + rnd() * 0.1 };
  const cloudMix = Array.from({ length: 64 }, () => rnd());   // по ним у каждой строки облака свой край

  const blades = Array.from({ length: Math.round(W / 6.5) }, () => ({ u: rnd(), d: Math.pow(rnd(), 0.85), h: 0.55 + rnd() * rnd() * 1.1, lean: (rnd() - 0.5) * 0.03, ph: rnd() * 6.28 }))
    .sort((a, b) => a.d - b.d);
  const treesBack = Array.from({ length: 34 }, (_, i) => ({ u: (i + 0.15 + rnd() * 0.7) / 34, h: 0.035 + rnd() * 0.05, pick: rnd() }));
  const treesFront = [0.03, 0.085, 0.92, 0.975].map((u) => ({ u: u + (rnd() - 0.5) * 0.02, h: 0.26 + rnd() * 0.12 }));

  return { ridges, hills, stars, planet, cloudMix, blades, treesBack, treesFront, cols };
}

function sketch(store, live, bridge, el) {
  return (p) => {
    let W = 0, H = 0, terrain = null, terrainKey = '';
    let clock = 0, ease = 0, lastMs = 0, rainAcc = 0, hyN = null;
    let flashAt = -1e9, bolt = null, dirty = true, lastState = null;
    const lv = { a: 0, b: 0, p: 0 };                          // сглаженные уровни каналов 0…1
    const parts = [];
    const ripples = [];                                       // всплески горизонта от нот: { t, x (доля ширины), h (px) }
    const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const ctx = () => p.drawingContext;
    let cur = { hy: 0, weather: 'wind' };                     // то, что нужно частицам в момент рождения

    const add = (o) => { if (parts.length < (motion.matches ? 60 : MAX_PARTS)) parts.push(o); };

    // --- нота голоса B: горизонт вздрагивает; высота всплеска — от ступени, место идёт по ширине вместе с шагом
    let noteN = 0;
    function onNote(n) {
      if (!W || !H) return;
      const deg = Math.max(0, Math.min(11, Number(n && n.degree) || 0));
      const x = n && n.live ? 0.1 + 0.8 * (deg / 11) : (live.step >= 0 ? 0.06 + 0.88 * (live.step / 15) : 0.06 + 0.88 * ((noteN % 16) / 15));
      noteN++;
      ripples.push({ t: p.millis(), x, h: (0.014 + 0.05 * (deg / 11)) * H });
      if (ripples.length > 12) ripples.shift();
      dirty = true;
    }

    // --- частицы: приходят от движка в момент, когда звук слышен
    function spawn(id) {
      if (!live.playing || !terrain || !W) return;
      const hy = cur.hy, ground0 = Math.max(hy + 0.05 * H, GROUND_TOP * H);
      if (id === 'drop') {
        const gy = ground0 + Math.random() * (0.86 * H - ground0);
        add({ k: 'drop', x: (0.1 + Math.random() * 0.8) * W, y: gy - (0.14 + Math.random() * 0.1) * H, vy: 1.0 * H, gy });
      } else if (id === 'click') {
        add({ k: 'click', x: (0.08 + Math.random() * 0.84) * W, y: hy + (0.06 + Math.random() * 0.3) * (H - hy), age: 0, life: 0.9 });
      } else if (id === 'crackle') {
        const x = (0.1 + Math.random() * 0.8) * W, y = ground0 + Math.random() * (0.84 * H - ground0);
        const n = 3 + Math.floor(Math.random() * 3), a0 = Math.random() * 6.28;
        for (let i = 0; i < n; i++) add({ k: 'spark', x, y, ang: a0 + (i / n) * 6.28 + (Math.random() - 0.5) * 0.5, r0: 2 + Math.random() * 3, len: 6 + Math.random() * 9, v: (0.05 + Math.random() * 0.07) * H, age: 0, life: 0.42 + Math.random() * 0.3 });
      } else if (id === 'boom') {
        flashAt = p.millis();
        bolt = null;
        if (cur.weather === 'storm' || cur.weather === 'rain') {   // ломаная молния сверху до гряд
          let x = (0.15 + Math.random() * 0.7) * W, y = -0.02 * H;
          const pts = [[x, y]];
          const end = hy - 0.12 * H;
          while (y < end) { y += (0.022 + Math.random() * 0.04) * H; x += (Math.random() - 0.5) * 0.07 * H; pts.push([x, Math.min(y, end)]); }
          bolt = pts;
        }
      }
    }

    function updateParts(dt, weather, playing) {
      const calm = motion.matches ? 0.3 : 1;
      if (playing && RAIN_RATE[weather] && parts.length < MAX_PARTS - 40) {   // фоновый дождь
        rainAcc += RAIN_RATE[weather] * calm * (W / 1600) * dt;
        while (rainAcc >= 1) {
          rainAcc -= 1;
          const g0 = Math.max(cur.hy + 0.03 * H, 0.5 * H);
          add({ k: 'rain', x: (Math.random() * 1.2 - 0.1) * W, y: -0.03 * H, vx: -0.17 * H, vy: (1.2 + Math.random() * 0.4) * H, gy: g0 + Math.random() * (0.95 * H - g0) });
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const o = parts[i];
        if (o.k === 'drop' || o.k === 'rain') {
          o.x += (o.vx || 0) * dt; o.y += o.vy * dt;
          if (o.y >= o.gy) {
            parts.splice(i, 1);
            if (o.k === 'drop') add({ k: 'ripple', x: o.x, y: o.gy, age: 0, life: 1.3, r: 0.05 * H });
            else if (Math.random() < 0.25) add({ k: 'ripple', x: o.x, y: o.gy, age: 0, life: 0.5, r: 0.014 * H });
          }
        } else {
          o.age += dt;
          if (o.k === 'spark') o.r0 += o.v * dt;
          if (o.age >= o.life) parts.splice(i, 1);
        }
      }
    }

    // частицы: всё контуром и штрихом
    function drawParts() {
      const g = ctx();
      g.lineCap = 'round';
      // дождь — одним путём
      g.strokeStyle = ink(0.5); g.lineWidth = HAIR;
      g.beginPath();
      for (const o of parts) if (o.k === 'rain') { g.moveTo(o.x, o.y); g.lineTo(o.x - o.vx * 0.022, o.y - o.vy * 0.022); }
      g.stroke();
      for (const o of parts) {
        if (o.k === 'drop') {                                  // падающий штрих с точкой на конце
          g.strokeStyle = ink(0.9); g.lineWidth = MAIN;
          g.beginPath(); g.moveTo(o.x, o.y - 0.026 * H); g.lineTo(o.x, o.y - 5); g.stroke();
          g.fillStyle = ink(0.9); g.beginPath(); g.arc(o.x, o.y, 2, 0, 6.2832); g.fill();
        } else if (o.k === 'ripple') {                         // рябь: расходящиеся эллипсы-контуры
          const t = o.age / o.life, r = 2 + t * o.r;
          g.strokeStyle = ink(Math.pow(1 - t, 1.4) * 0.9); g.lineWidth = MAIN;
          g.beginPath(); g.ellipse(o.x, o.y, r, r * 0.3, 0, 0, 6.2832); g.stroke();
          if (t > 0.2) { g.strokeStyle = ink(Math.pow(1 - t, 1.6) * 0.55); g.lineWidth = HAIR; g.beginPath(); g.ellipse(o.x, o.y, r * 0.58, r * 0.17, 0, 0, 6.2832); g.stroke(); }
        } else if (o.k === 'click') {                          // щелчок: точка-вспышка с кольцом
          const t = o.age / o.life;
          g.fillStyle = ink(1 - t * t); g.beginPath(); g.arc(o.x, o.y, 3.2 - 1.4 * t, 0, 6.2832); g.fill();
          g.strokeStyle = ink((1 - t) * 0.7); g.lineWidth = HAIR;
          g.beginPath(); g.arc(o.x, o.y, 4 + t * 16, 0, 6.2832); g.stroke();
        } else if (o.k === 'spark') {                          // треск: короткие штрихи-искры от центра
          const t = o.age / o.life, c = Math.cos(o.ang), s = Math.sin(o.ang);
          g.strokeStyle = ink(1 - t); g.lineWidth = MAIN;
          g.beginPath(); g.moveTo(o.x + c * o.r0, o.y + s * o.r0); g.lineTo(o.x + c * (o.r0 + o.len * (1 - t * 0.6)), o.y + s * (o.r0 + o.len * (1 - t * 0.6))); g.stroke();
        }
      }
    }

    // --- вспомогательное: линия-пунктир на «ДАЛЬ»; w — близость к горизонту 0…1
    function farStyle(g, alpha, w, far) {
      const k = clamp((far - 0.3) / 0.7) * w;                 // у типичной «дали» (~0.5) эффект едва заметен
      g.strokeStyle = ink(alpha * (1 - 0.55 * k));
      if (k > 0.4) g.setLineDash([Math.max(3, 16 * (1 - k)), 2 + 26 * (k - 0.35)]); else g.setLineDash([]);
    }

    // --- небо: горизонтальные линии, облако голоса A, звёзды, светила, чужая планета
    function drawSky(S) {
      const { hy, hatch, state, minutes, weather } = S, g = ctx();
      const gap = hatch.gap * H, rowAlpha = hatch.alpha;
      const a = state.a, dens = clamp(a.shape);
      const pos = cloudPos(a), cx = pos.x * W, cy = pos.y * H;
      const R = Math.min(W * 0.07, H * 0.115) * (0.6 + 0.9 * dens) * (1 + 0.1 * lv.a);
      const swirl = (0.9 + 1.5 * dens) * (1 + 0.16 * Math.sin(clock * (0.5 + a.mod * 1.6))) + lv.a * 0.4;
      const bulge = 0.12 + 0.2 * dens;
      // облако — вытянутая гряда из 3–5 клубов разного размера; соседние клубы закручены в разные стороны
      const nLobes = 3 + (dens > 0.35 ? 1 : 0) + (dens > 0.7 ? 1 : 0);
      const lobes = LOBES[nLobes - 3].map(([dx, dy, r], i) => {
        const br = 1 + 0.07 * Math.sin(clock * 0.9 + i * 1.7) * (0.4 + lv.a);   // каждый клуб «дышит» по-своему
        return { x: cx + dx * 1.3 * R, y: cy + dy * R + Math.sin(clock * 0.4 + i) * R * 0.04 * a.mod, rr: r * R * br, sw: (i % 2 ? -1 : 1) * swirl * (0.7 + 0.3 * r) };
      });
      const wp = [0, 0];
      const warp = (x, y) => {                                // сдвиг точки линии неба закрученными клубами
        for (const L of lobes) {
          const dx = x - L.x, dy = y - L.y, r2 = (dx * dx + dy * dy) / (L.rr * L.rr);
          if (r2 >= 6) continue;
          const e = Math.exp(-r2 * 1.1), th = L.sw * e, c = Math.cos(th), s = Math.sin(th), k = 1 + bulge * e;
          x = L.x + (dx * c - dy * s) * k; y = L.y + (dx * s + dy * c) * k;
        }
        wp[0] = x; wp[1] = y;
      };
      const lobeD2 = (x, y) => {                              // расстояние до ближнего клуба в его радиусах (в квадрате)
        let m = 1e9;
        for (const L of lobes) { const dx = x - L.x, dy = y - L.y, r2 = (dx * dx + dy * dy) / (L.rr * L.rr); if (r2 < m) m = r2; }
        return m;
      };
      const spanX = 4.9 * R, spanY = 2.8 * R;
      const wind = (0.5 + S.windAmp * 3.4) * (weather === 'storm' ? 1.6 : 1);
      const rough = weather === 'storm' ? 1 : weather === 'rain' ? 0.25 : 0;
      const alien = weather === 'alien';
      const pl = terrain.planet, plx = pl.u * W, ply = pl.v * H, plr = 0.075 * H, hole = 0.5 * H;
      const lastY = S.rTop;                                   // ниже этой высоты небо закрыто дальней грядой
      const nExtra = 1 + Math.round(dens * 2);

      g.lineWidth = HAIR; g.lineJoin = 'round'; g.lineCap = 'butt';
      let rowIdx = 0;
      for (let y0 = gap * 0.8; y0 < lastY; y0 += gap, rowIdx++) {
        const w = clamp(1 - (hy - y0) / (0.3 * H));           // близость к горизонту — для «ДАЛИ»
        const al = rowAlpha * (0.75 + 0.25 * (1 - y0 / hy));
        farStyle(g, al, w, S.far);
        const nearCloud = Math.abs(y0 - cy) < spanY;
        g.beginPath();
        let pen = false;
        for (let x = -8; x <= W + 8; x += (nearCloud && Math.abs(x - cx) < spanX) ? 2.5 : 8) {
          let px = x, py = y0 + Math.sin(x * 0.0042 + y0 * 0.011 + clock * 0.45 + rowIdx * 0.3) * wind;
          if (rough) py += (Math.sin(x * 0.031 + rowIdx * 1.7 + clock * 3.1) * Math.sin(x * 0.011 - rowIdx * 0.9 + clock * 1.3)) * 3.4 * rough;
          if (alien) {
            const ddx = x - plx, ddy = y0 - ply;
            if (ddx * ddx + ddy * ddy < hole * hole) { pen = false; continue; }   // внутри «планеты» линии уступают место кольцам
          }
          if (nearCloud && Math.abs(x - cx) < spanX) { warp(px, py); px = wp[0]; py = wp[1]; }
          if (pen) g.lineTo(px, py); else { g.moveTo(px, py); pen = true; }
        }
        g.stroke();

        // облако: между строк добавлены короткие строки, они уплотняют линии в закрученной массе
        if (nearCloud || Math.abs(y0 + gap * 0.5 - cy) < spanY) {
          g.setLineDash([]);
          for (let j = 1; j <= nExtra; j++) {
            const ye = y0 + (gap * j) / (nExtra + 1), thr = 0.9 + 1.3 * terrain.cloudMix[(rowIdx * 5 + j) & 63] * (0.6 + 0.6 * dens);
            if (Math.abs(ye - cy) > spanY) continue;
            g.strokeStyle = ink(Math.min(0.85, rowAlpha + 0.22));
            g.beginPath();
            let pe = false;
            for (let x = cx - spanX; x <= cx + spanX; x += 2.5) {
              const py0 = ye + Math.sin(x * 0.0042 + ye * 0.011 + clock * 0.45 + rowIdx * 0.3) * wind;
              if (lobeD2(x, py0) > thr) { pe = false; continue; }
              warp(x, py0);
              const px = wp[0], py = wp[1];
              if (pe) g.lineTo(px, py); else { g.moveTo(px, py); pe = true; }
            }
            g.stroke();
          }
        }
      }
      g.setLineDash([]);

      // чужое небо: концентрические кольца вокруг планеты (обрезаны по горизонту)
      if (alien) {
        g.save();
        g.beginPath(); g.rect(0, 0, W, hy); g.clip();
        g.lineWidth = HAIR;
        let k = 0;
        for (let r = plr * 2.5; r < hole; r += gap * 1.1, k++) {
          const dashed = k % 5 === 3;
          g.strokeStyle = ink(rowAlpha + 0.1);
          g.setLineDash(dashed ? [3, 7] : []);
          g.lineDashOffset = dashed ? -clock * 14 * (k % 2 ? 1 : -1) : 0;
          g.beginPath(); g.arc(plx, ply, r, 0, 6.2832); g.stroke();
        }
        g.setLineDash([]);
        g.restore();
      }

      // звёзды — крошечные крестики на пустом месте (линии вокруг них стёрты)
      if (hatch.stars > 0.3) {
        for (const s of terrain.stars) {
          const sy = s.v * H;
          if (sy > lastY - 6) continue;
          if (Math.hypot((s.u * W - cx) / 2, sy - cy) < 2.5 * R) continue;
          if (alien && Math.hypot(s.u * W - plx, sy - ply) < hole * 1.05) continue;
          const tw = 0.5 + 0.5 * Math.sin(clock * s.sp + s.ph);
          const al = clamp(hatch.stars * (0.55 + 0.45 * tw) * (1 - s.v * 0.5));
          if (al < 0.05) continue;
          const sx = s.u * W, rr = s.r * (0.85 + 0.25 * tw);
          g.fillStyle = paperHex; g.beginPath(); g.arc(sx, sy, rr + 3.5, 0, 6.2832); g.fill();
          g.strokeStyle = ink(al); g.lineWidth = HAIR;
          g.beginPath(); g.moveTo(sx - rr, sy - rr); g.lineTo(sx + rr, sy + rr); g.moveTo(sx + rr, sy - rr); g.lineTo(sx - rr, sy + rr); g.stroke();
        }
      }

      // светила идут по дуге от горизонта до горизонта
      const vis = weather === 'storm' ? 0.4 : weather === 'rain' ? 0.65 : 1;
      const top = 0.1 * H;
      const arc = (t) => ({ x: p.lerp(0.1 * W, 0.9 * W, t), y: hy - Math.sin(Math.PI * t) * (hy - top) });
      const ts = (minutes - 360) / 720, tm = (((minutes - 1080) % 1440 + 1440) % 1440) / 720;
      if (ts >= 0 && ts <= 1) {                               // солнце — окружность-контур с кольцом-ореолом
        const s = arc(ts), r = 0.044 * H;
        g.fillStyle = paperHex; g.beginPath(); g.arc(s.x, s.y, r * 1.75, 0, 6.2832); g.fill();
        g.strokeStyle = ink(vis); g.lineWidth = BOLD;
        g.beginPath(); g.arc(s.x, s.y, r, 0, 6.2832); g.stroke();
        g.strokeStyle = ink(0.55 * vis); g.lineWidth = HAIR; g.setLineDash([2, 5]); g.lineDashOffset = -clock * 6;
        g.beginPath(); g.arc(s.x, s.y, r * 1.42, 0, 6.2832); g.stroke(); g.setLineDash([]);
      }
      if (tm >= 0 && tm <= 1) {                               // луна — окружность со штриховкой внутри
        const s = arc(tm), r = 0.036 * H;
        g.fillStyle = paperHex; g.beginPath(); g.arc(s.x, s.y, r * 1.7, 0, 6.2832); g.fill();
        g.save();
        g.beginPath(); g.arc(s.x, s.y, r, 0, 6.2832); g.clip();
        g.strokeStyle = ink(0.8 * vis); g.lineWidth = HAIR;
        g.beginPath();
        for (let d = -2 * r; d < 2 * r; d += 3.6) { g.moveTo(s.x + d - r, s.y + r); g.lineTo(s.x + d + r, s.y - r); }
        g.stroke();
        g.restore();
        g.strokeStyle = ink(vis); g.lineWidth = MAIN;
        g.beginPath(); g.arc(s.x, s.y, r, 0, 6.2832); g.stroke();
      }
      if (alien) {                                            // планета с кольцом: заднее полукольцо, диск, переднее
        const rot = -0.35;
        const ring = (a0, a1) => { g.beginPath(); g.ellipse(plx, ply, plr * 2, plr * 0.4, rot, a0, a1); g.stroke(); };
        g.strokeStyle = ink(1); g.lineWidth = MAIN;
        g.fillStyle = paperHex; g.beginPath(); g.ellipse(plx, ply, plr * 2.1, plr * 0.5, rot, 0, 6.2832); g.fill();
        ring(Math.PI, 6.2832);
        g.fillStyle = paperHex; g.beginPath(); g.arc(plx, ply, plr, 0, 6.2832); g.fill();
        g.save(); g.beginPath(); g.arc(plx, ply, plr, 0, 6.2832); g.clip();
        g.strokeStyle = ink(0.7); g.lineWidth = HAIR; g.beginPath();
        for (let yy = ply - plr + 4; yy < ply + plr; yy += 4.2) { g.moveTo(plx - plr, yy); g.lineTo(plx + plr, yy); }
        g.stroke(); g.restore();
        g.strokeStyle = ink(1); g.lineWidth = MAIN;
        g.beginPath(); g.arc(plx, ply, plr, 0, 6.2832); g.stroke();
        ring(0, Math.PI);
      }
    }

    // верхняя линия гряды r в точке колонки i (px)
    const ridgeTopY = (r, hy, i) => hy - r.off * H - (r.n - 1) * r.gap * H - r.amp * H * r.h[i];

    // --- гряды: пачка параллельных линий; чем выше линия в пачке, тем сильнее её поднял шум.
    // Рисуем от дальней к ближней, каждая линия закрашивает бумагой всё под собой.
    function drawRidges(S) {
      const { hy, far } = S, g = ctx(), cols = terrain.cols;
      const wInt = [0.62, 0.82, 1];
      g.lineJoin = 'round';
      terrain.ridges.forEach((r, ri) => {
        const foot = hy - r.off * H, gp = r.gap * H, last = r.n - 1;
        for (let i = 0; i < r.n; i++) {
          const flat = foot - (last - i) * gp, t = (last - i) / last;
          g.beginPath();
          for (let c = 0; c < cols; c++) {
            const x = c * STEP;
            let y = flat - r.amp * H * r.h[c] * t;
            if (S.heat > 0 && ri === 2) y += Math.sin(x * 0.45 + clock * 31 + i * 2.1) * S.heat * 1.3;
            if (c) g.lineTo(x, y); else g.moveTo(x, y);
          }
          // закраска бумагой: до следующей линии пачки, у последней — до горизонта
          g.save();
          g.lineTo((cols - 1) * STEP, i === last ? hy + 1 : flat + gp + 1);
          g.lineTo(0, i === last ? hy + 1 : flat + gp + 1);
          g.closePath();
          g.fillStyle = paperHex; g.fill();
          g.restore();
          // линия поверх (путь уже замкнут — рисуем заново только верхнюю кромку)
          g.beginPath();
          for (let c = 0; c < cols; c++) {
            const x = c * STEP;
            let y = flat - r.amp * H * r.h[c] * t;
            if (S.heat > 0 && ri === 2) y += Math.sin(x * 0.45 + clock * 31 + i * 2.1) * S.heat * 1.3;
            if (c) g.lineTo(x, y); else g.moveTo(x, y);
          }
          const main = i === 0;
          g.lineWidth = main ? MAIN : HAIR;
          farStyle(g, (main ? 1 : 0.72) * wInt[ri], [1, 0.5, 0.15][ri], far);
          g.stroke();
        }
      });
      g.setLineDash([]);
    }

    // --- лес: контурные сосны на ближней гряде (в лесу — густо, под дождём — реже) и большие по краям
    function drawTrees(S) {
      const { hy, weather } = S, g = ctx(), r = terrain.ridges[2];
      if (weather !== 'forest' && weather !== 'rain') return;
      const share = weather === 'forest' ? 1 : 0.4;
      g.lineJoin = 'miter'; g.strokeStyle = ink(1); g.lineWidth = MAIN; g.fillStyle = paperHex;
      const tree = (x, y, h, sw) => {
        g.beginPath();
        PINE.forEach(([qx, qy], i) => { const X = x + qx * h + sw * Math.pow(-qy, 1.6) * h, Y = y + qy * h; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
        g.closePath(); g.fill(); g.stroke();
      };
      for (const t of terrain.treesBack) {
        if (t.pick > share) continue;
        const ci = Math.min(terrain.cols - 1, Math.round((t.u * W) / STEP));
        tree(t.u * W, ridgeTopY(r, hy, ci) + r.gap * H * 1.4, t.h * H, S.sway(t.u * W, 0) * 0.08);
      }
      if (weather === 'forest') {
        g.lineWidth = MAIN;
        for (const t of terrain.treesFront) tree(t.u * W, H * 1.02, t.h * H, S.sway(t.u * W, 1) * 0.04);
      }
    }

    // --- земля: линии с перспективой (сгущаются к горизонту), холмы растут к зрителю
    function drawGround(S) {
      const { hy } = S, g = ctx(), L = H - hy, sH = H / 900;
      const hills = terrain.hills, cols = terrain.cols;
      const rows = [];
      let c = 9 * sH, step = 3.4 * sH;
      while (c < L + step * 2) { rows.push(c); c += step; step *= 1.07; }
      const n = rows.length;
      g.lineJoin = 'round';
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1), pos = t * 2.999, j = Math.floor(pos), f = smooth(pos - j);
        const amp = H * (0.0016 + 0.026 * Math.pow(t, 1.5));
        const flat = hy + rows[k], next = hy + (rows[k + 1] ?? rows[k] + step);
        const fade = 1 - 0.45 * smooth(clamp((flat - 0.8 * H) / (0.2 * H)));   // низ экрана тише: там лежат панели
        g.beginPath();
        for (let ci = 0; ci < cols; ci++) {
          const x = ci * STEP;
          let y = flat + amp * (hills[j][ci] * (1 - f) + hills[j + 1][ci] * f) * 2;
          if (k < 7) y += S.hWave(x) * Math.exp(-k * 0.5) * 0.7;           // голос B встряхивает землю у горизонта
          if (S.heat > 0 && k < 14) y += Math.sin(x * 0.45 + clock * 31 + k * 2.1) * S.heat * 1.2 * (1 - k / 14);
          if (ci) g.lineTo(x, y); else g.moveTo(x, y);
        }
        const sx = (cols - 1) * STEP;
        g.save();
        g.lineTo(sx, next + 1); g.lineTo(0, next + 1); g.closePath();
        g.fillStyle = paperHex; g.fill();
        g.restore();
        g.beginPath();
        for (let ci = 0; ci < cols; ci++) {
          const x = ci * STEP;
          let y = flat + amp * (hills[j][ci] * (1 - f) + hills[j + 1][ci] * f) * 2;
          if (k < 7) y += S.hWave(x) * Math.exp(-k * 0.5) * 0.7;
          if (S.heat > 0 && k < 14) y += Math.sin(x * 0.45 + clock * 31 + k * 2.1) * S.heat * 1.2 * (1 - k / 14);
          if (ci) g.lineTo(x, y); else g.moveTo(x, y);
        }
        const edge = k % 6 === 5;                                          // каждая шестая линия — межа поля
        g.lineWidth = edge ? MAIN : HAIR;
        g.strokeStyle = ink((edge ? 0.78 : 0.14 + 0.5 * t) * fade);
        g.stroke();
      }
    }

    // --- трава: короткие вертикальные штрихи у нижнего края, качаются от ветра
    function drawBlades(S) {
      const { hy, weather } = S, g = ctx();
      const yG = Math.max(0.72 * H, hy + 0.08 * H);
      const share = weather === 'forest' ? 0.6 : 1, list = terrain.blades, n = Math.round(list.length * share);
      g.lineCap = 'round'; g.lineWidth = HAIR; g.strokeStyle = ink(0.85);
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const b = list[i], x = b.u * W, y = yG + b.d * (H * 1.01 - yG);
        const hgt = (0.014 + 0.05 * b.d) * H * b.h;
        const tip = b.lean * H + S.sway(x, b.ph) * hgt * 0.9;
        g.moveTo(x, y); g.quadraticCurveTo(x + tip * 0.08, y - hgt * 0.6, x + tip, y - hgt);
      }
      g.stroke();
    }

    // --- горизонт = голос B: двойная линия (2px + волосяная в 4px ниже), вибрирует от B
    function drawHorizon(S) {
      const { hy } = S, g = ctx();
      g.lineCap = 'butt'; g.lineJoin = 'round';
      const n = Math.ceil(W / 5) + 1;
      g.strokeStyle = ink(1); g.lineWidth = BOLD;
      g.beginPath();
      for (let i = 0; i < n; i++) { const x = Math.min(W, i * 5); const y = hy + S.hWave(x); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      g.lineWidth = HAIR; g.strokeStyle = ink(0.9);
      g.beginPath();
      for (let i = 0; i < n; i++) { const x = Math.min(W, i * 5); const y = hy + 4.5 + S.hWave(x - 14) * 0.9; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }

    // ------------------------------------------------------------------------------------------
    // размер холста = размер контейнера .world (рисунок занимает верхнюю часть экрана)
    const box = () => ({ w: Math.max(320, el.clientWidth || window.innerWidth), h: Math.max(200, el.clientHeight || window.innerHeight) });
    function readPaper() {
      const v = (getComputedStyle(el).getPropertyValue('--paper') || '').trim();
      const m = /^#([0-9a-f]{6})$/i.exec(v);
      if (!m) return;
      paperHex = v; paperRgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    }
    function fit() {
      const { w, h } = box();
      if (w === W && h === H) return false;
      W = w; H = h;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const d = clamp(Math.sqrt(4.2e6 / (W * H)), 0.6, dpr);      // ограничиваем число пикселей
      p.resizeCanvas(W, H, true);
      if (Math.abs(p.pixelDensity() - d) > 0.01) p.pixelDensity(d);
      terrainKey = '';
      return true;
    }

    p.setup = () => {
      ({ w: W, h: H } = box());
      readPaper();
      p.createCanvas(W, H);
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      p.pixelDensity(clamp(Math.sqrt(4.2e6 / (W * H)), 0.6, dpr));
      p.frameRate(30);
      lastMs = p.millis();
      const offTrigger = engine.onTrigger(spawn);
      const offNote = typeof engine.onNote === 'function' ? engine.onNote(onNote) : null;
      bridge.unsubscribe = () => { offTrigger && offTrigger(); offNote && offNote(); };
    };
    const remove = p.remove;
    p.remove = () => { bridge.unsubscribe && bridge.unsubscribe(); remove.call(p); };
    bridge.touch = () => { dirty = true; };
    bridge.resize = () => { readPaper(); dirty = true; };

    p.draw = () => {
      const state = bridge.state || store.get();
      const playing = !!live.playing;
      const now = p.millis(), dt = Math.min(0.1, (now - lastMs) / 1000);
      lastMs = now;
      if (fit()) dirty = true;

      // горизонт плавно едет к новому месту (~150 мс): ручка в DOM стоит уже на целевой высоте
      const target = horizonY(state.b);
      if (hyN === null) hyN = target;
      const dHy = target - hyN;
      const moving = Math.abs(dHy) > 0.0003;

      // покой: ничего не меняется — экран не перерисовываем
      if (!playing && ease < 0.004 && lv.a + lv.b + lv.p < 0.004 && !parts.length && !moving
        && state === lastState && !dirty && now - flashAt > 400 && !ripples.length) return;
      dirty = false; lastState = state;

      hyN = moving ? hyN + dHy * (1 - Math.exp(-dt / 0.045)) : target;
      const hy = hyN * H;

      const place = state.place || DEFAULT_PLACE;
      const weather = WEATHERS.includes(place.weather) ? place.weather : 'wind';
      const seed = (Number(place.seed) >>> 0) || 1;
      const key = `${seed}|${W}|${H}`;
      if (!terrain || terrainKey !== key) { terrain = buildTerrain(p, seed, W, H); terrainKey = key; parts.length = 0; }
      const minutes = Number.isFinite(place.minutes) ? ((place.minutes % 1440) + 1440) % 1440 : 720;
      cur = { hy, weather };

      // время сцены идёт, только пока прибор звучит
      ease += ((playing ? 1 : 0) - ease) * (1 - Math.exp(-dt * 3));
      if (!playing && ease < 0.004) ease = 0;
      clock += dt * ease * (motion.matches ? 0.4 : 1);
      const m = playing ? engine.meters() : null;
      const sm = 1 - Math.exp(-dt * 7);
      for (const id of ['a', 'b', 'p']) { lv[id] += ((m ? clamp(m[id] * 3.2) : 0) - lv[id]) * sm; if (lv[id] < 0.002 && !m) lv[id] = 0; }

      const fx = state.fx || {};
      const far = clamp(fx.a ? fx.a.reverb : 0);
      const heat = clamp(((fx[state.fxTarget] ? fx[state.fxTarget].drive : 0) - 0.3) / 0.7) * ease * (motion.matches ? 0 : 1);
      const aMod = state.a ? state.a.mod : 0;
      const calm = motion.matches ? 0.3 : 1;
      const windAmp = clamp(0.1 + lv.a * (0.5 + aMod * 1.2) + (weather === 'storm' ? 0.3 : weather === 'wind' ? 0.12 : 0), 0, 1.5) * calm;

      // голос B: волна вдоль горизонта; число волн — b.tune, размах — уровень B
      const cyc = p.lerp(1.5, 12, clamp(state.b.tune));
      const hAmp = ease * (0.7 + lv.b * 0.016 * H) * calm, hPh = clock * (2.2 + lv.b * 3);
      const hWave = (x) => {
        const u = x / W, env = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(u))), 0.7);
        return (Math.sin(u * cyc * 6.283 + hPh) + 0.25 * Math.sin(u * cyc * 5.1 * 6.283 - hPh * 0.7)) * hAmp * env;
      };
      for (let i = ripples.length - 1; i >= 0; i--) if (now - ripples[i].t > 900) ripples.splice(i, 1);
      const rip = ripples.map((r) => ({ x: r.x * W, a: -r.h * Math.exp(-(now - r.t) / 250) }));
      const sigma = Math.max(40, W * 0.05);
      const bump = (x) => {                                   // всплеск: колокол с рябью, затухает за ~250 мс
        let y = 0;
        for (const r of rip) { const d = (x - r.x) / sigma; if (d > -4 && d < 4) y += r.a * Math.exp(-d * d) * Math.cos(d * 2.4); }
        return y;
      };
      const sway = (x, ph) => (Math.sin(clock * 1.7 + x * 0.006 + ph) * 0.7 + Math.sin(clock * 3.3 + x * 0.013) * 0.3) * windAmp;

      const hatch = skyHatch(minutes, weather);
      const r0 = terrain.ridges[0];
      // небо ниже верха дальней гряды закрыто — эти строки не рисуем
      const rTop = hy - r0.off * H - (r0.n - 1) * r0.gap * H + 2;
      const S = { hy, hatch, state, minutes, weather, far, heat, windAmp, rTop, hWave: rip.length ? (x) => hWave(x) + bump(x) : hWave, sway };

      const g = ctx();
      g.save();
      p.background(paperRgb[0], paperRgb[1], paperRgb[2]);

      drawSky(S);

      const fl = 1 - (p.millis() - flashAt) / 320;               // молния после вспышки тает ~300 мс
      if (bolt && fl > 0) {
        g.lineJoin = 'miter'; g.lineCap = 'butt';
        g.beginPath(); bolt.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.strokeStyle = paperHex; g.lineWidth = 9; g.stroke();
        g.strokeStyle = ink(Math.min(1, fl * 1.6)); g.lineWidth = BOLD; g.stroke();
      }

      drawRidges(S);
      drawTrees(S);
      drawGround(S);
      drawBlades(S);
      drawHorizon(S);

      updateParts(dt, weather, playing);
      drawParts();

      // раскат: на ~120 мс весь холст инвертируется (тушь ↔ бумага)
      if (p.millis() - flashAt < 120) {
        g.globalCompositeOperation = 'difference';
        g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      }
      g.restore();
    };
  };
}

export function mountWorld(el, store, live) {
  const bridge = { state: null, unsubscribe: null, touch: null, resize: null };
  new p5(sketch(store, live, bridge, el), el);
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => bridge.resize && bridge.resize()).observe(el);
  return function update(state) {
    bridge.state = state;
    if (bridge.touch) bridge.touch();
  };
}
