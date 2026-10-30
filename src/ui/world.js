// Блок .world — пейзаж места на весь экран, рисуется p5.js (instance mode).
// Небо и свет зависят от времени суток, хребты — от зерна места (place.seed), погода красит сцену.
// Горизонт и облако стоят там, где их держат ручки: координаты берём из src/world/geometry.js.
// Звук управляет картинкой: голос A — облако и ветер в траве, голос B — светящаяся линия «свиста» вдоль горизонта,
// частицы приходят из engine.onTrigger, «ДАЛЬ» — туман от реверберации, «ЖАР» — марево от драйва.
// Текста на холсте нет: подписи рисует DOM. Нижняя четверть спокойная и тёмная — там лежат панели.

import p5 from 'p5';
import { engine } from '../audio/engine.js';
import { cloudPos, horizonY } from '../world/geometry.js';
import { skyColors, mixC, scaleC, lumC, clamp } from '../world/palette.js';

const MAX_PARTS = 200;
const STEP = 6;                                               // шаг по x у хребтов, px
const GROUND_TOP = 0.7;                                       // с этой высоты (доля окна) начинается трава
const DEFAULT_PLACE = { name: '', time: '12:00', minutes: 720, weather: 'wind', seed: 1, night: false };
const WEATHERS = ['wind', 'rain', 'storm', 'forest', 'alien'];
const CLOUDS = { wind: 0.35, rain: 0.7, storm: 1, forest: 0.25, alien: 0.15 };   // сколько фоновых облаков
const RAIN_RATE = { rain: 55, storm: 95 };                    // капель дождя в секунду
const BLUE = [117, 168, 219], ORANGE = [237, 132, 69], YELLOW = [227, 179, 76];

const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

/** Своё зерно случайных чисел (mulberry32): раскладка звёзд, травы и облаков повторяется для одного места. */
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

/** Рельеф места: три хребта, поля, звёзды, облака, трава и деревья — всё из зерна, в долях окна. */
function buildTerrain(p, seed, W, H) {
  const rnd = rng(seed);
  p.noiseSeed(seed);
  const cols = Math.ceil(W / STEP) + 1;
  const spec = [                                              // дальний, средний, ближний: отступ от горизонта и размах (доли высоты)
    { off: 0.085, amp: 0.17, freq: 3.0, rough: 0.1 },
    { off: 0.04, amp: 0.13, freq: 4.6, rough: 0.2 },
    { off: 0.0, amp: 0.085, freq: 6.6, rough: 0.3 },
  ];
  const ridges = spec.map((L) => {
    const o = rnd() * 900, f = L.freq * (0.8 + rnd() * 0.5), amp = L.amp * (0.85 + rnd() * 0.35);
    const h = Array.from({ length: cols }, (_, i) => {
      const u = i / (cols - 1);
      const n = p.noise(o + u * f) + (p.noise(o + 70 + u * f * 3.4) - 0.5) * L.rough;
      return Math.pow(p.map(n, 0.22, 0.78, 0, 1, true), 1.15);
    });
    return { off: L.off, amp, h };
  });

  const stars = Array.from({ length: Math.round(W / 11) }, () => ({ u: rnd(), v: Math.pow(rnd(), 1.3) * 0.5, r: 0.5 + rnd() * 0.9, ph: rnd() * 6.28, sp: 0.8 + rnd() * 2.2 }));
  const ambient = Array.from({ length: 8 }, () => ({ u: rnd(), v: 0.06 + rnd() * 0.34, w: 0.11 + rnd() * 0.17, h: 0.3 + rnd() * 0.3, a: 0.08 + rnd() * 0.09, sp: 0.6 + rnd() * 0.8 }));
  const planet = { u: 0.2 + rnd() * 0.55, v: 0.12 + rnd() * 0.12 };
  const craters = Array.from({ length: 3 }, () => ({ x: (rnd() - 0.5) * 0.5, y: (rnd() - 0.5) * 0.5, r: 0.07 + rnd() * 0.1 }));

  // облако голоса A: кучка мягких пятен вокруг центра (в единицах радиуса) и редкие «порывы»-клочья
  const puffs = Array.from({ length: 15 }, (_, i) => {
    const t = (i / 14) * 2 - 1, edge = 1 - Math.abs(t);
    return { ox: t * 1.45 + (rnd() - 0.5) * 0.3, oy: -Math.pow(edge, 1.3) * 0.4 * (0.4 + rnd() * 0.9) + (rnd() - 0.5) * 0.12, r: (0.42 + 0.4 * edge) * (0.8 + rnd() * 0.35), ph: rnd() * 6.28, sp: 0.15 + rnd() * 0.25 };
  });
  const wisps = Array.from({ length: 10 }, () => ({ oy: (rnd() - 0.5) * 1.5, r: 0.2 + rnd() * 0.28, ph: rnd(), sp: 0.6 + rnd() * 0.8 }));

  // поля: полосы с волнистой кромкой, ближе к зрителю — шире (перспектива)
  const bands = Array.from({ length: 9 }, (_, k) => ({ t: k / 9, tint: rnd(), warm: rnd(), ph: rnd() * 6.28, fr: 2 + rnd() * 4, wob: 0.002 + rnd() * 0.006 }));

  const blades = Array.from({ length: Math.round(W / 5.2) }, () => ({ u: rnd(), d: Math.pow(rnd(), 0.85), h: 0.55 + rnd() * rnd() * 1.1, w: 0.7 + rnd() * 0.9, lean: (rnd() - 0.5) * 0.012, ph: rnd() * 6.28, shade: 0.75 + rnd() * 0.5, glow: rnd() < 0.2 }))
    .sort((a, b) => a.d - b.d);
  const treesBack = Array.from({ length: 16 }, (_, i) => ({ u: (i + 0.2 + rnd() * 0.6) / 16, dy: 0.004 + rnd() * 0.035, h: 0.045 + rnd() * 0.07, pick: rnd() }));
  const treesFront = [0.025, 0.075, 0.935, 0.985].map((u) => ({ u: u + (rnd() - 0.5) * 0.02, h: 0.4 + rnd() * 0.2 }));

  return { ridges, stars, ambient, planet, craters, puffs, wisps, bands, blades, treesBack, treesFront, cols };
}

function sketch(store, live, bridge) {
  return (p) => {
    let W = 0, H = 0, U = 1, terrain = null, terrainKey = '';
    let clock = 0, ease = 0, lastMs = 0, rainAcc = 0, hyN = null;
    let flashAt = -1e9, bolt = null, dirty = true, lastState = null;
    const lv = { a: 0, b: 0, p: 0 };                          // сглаженные уровни каналов 0…1
    const parts = [];
    const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const ctx = () => p.drawingContext;
    const F = (c, a = 255) => p.fill(c[0], c[1], c[2], a);
    const S = (c, a = 255) => p.stroke(c[0], c[1], c[2], a);
    let cur = { hy: 0, weather: 'wind', still: false };       // то, что нужно частицам в момент рождения

    // --- градиенты рисуем напрямую в 2D-контексте внутри push/pop, чтобы не сбить кэш цвета p5
    function vGradient(y, h, stops) {
      if (h <= 0) return;
      p.push();
      const g = ctx().createLinearGradient(0, y, 0, y + h);
      stops.forEach(([t, c, a]) => g.addColorStop(t, css(c, a === undefined ? 1 : a)));
      ctx().fillStyle = g;
      ctx().fillRect(0, y, W, h);
      p.pop();
    }
    function glow(x, y, r, c, a) {
      p.push();
      const g = ctx().createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, css(c, a));
      g.addColorStop(1, css(c, 0));
      ctx().fillStyle = g;
      ctx().fillRect(x - r, y - r, r * 2, r * 2);
      p.pop();
    }
    // мягкое пятно (эллипс с затухающим краем); вызывать внутри push/pop
    function blob(x, y, rx, ry, c, a, hard = 0.5) {
      const g = ctx();
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, css(c, a));
      gr.addColorStop(hard, css(c, a * (1 - hard * 0.8)));
      gr.addColorStop(1, css(c, 0));
      g.fillStyle = gr;
      g.fillRect(-rx, -rx, rx * 2, rx * 2);
      g.restore();
    }

    const add = (o) => { if (parts.length < (motion.matches ? 60 : MAX_PARTS)) parts.push(o); };

    // --- частицы: приходят от движка в момент, когда звук слышен
    function spawn(id) {
      if (!live.playing || !terrain || !W) return;
      const hy = cur.hy, ground0 = Math.max(hy + 0.04 * H, GROUND_TOP * H);
      if (id === 'drop') {
        const gy = ground0 + Math.random() * (0.88 * H - ground0);
        add({ k: 'drop', x: (0.08 + Math.random() * 0.84) * W, y: gy - (0.13 + Math.random() * 0.1) * H, vy: 1.05 * H, gy });
      } else if (id === 'click') {
        add({ k: 'fly', x: (0.06 + Math.random() * 0.88) * W, y: hy + (0.05 + Math.random() * 0.3) * (H - hy), vx: (Math.random() - 0.5) * 0.03 * W, vy: (Math.random() - 0.6) * 0.03 * H, age: 0, life: 3 + Math.random() * 2.5 });
      } else if (id === 'crackle') {
        const x = (0.08 + Math.random() * 0.84) * W, y = ground0 + Math.random() * (0.86 * H - ground0);
        const n = 4 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) add({ k: 'spark', x, y, vx: (Math.random() - 0.5) * 0.2 * H, vy: -(0.12 + Math.random() * 0.26) * H, age: 0, life: 0.4 + Math.random() * 0.5 });
      } else if (id === 'boom') {
        flashAt = p.millis();
        bolt = null;
        if (cur.weather === 'storm' || cur.weather === 'rain') {   // зубчатая молния сверху до хребтов
          let x = (0.15 + Math.random() * 0.7) * W, y = -0.02 * H;
          const pts = [[x, y]];
          const end = hy - 0.06 * H;
          while (y < end) { y += (0.025 + Math.random() * 0.04) * H; x += (Math.random() - 0.5) * 0.06 * H; pts.push([x, Math.min(y, end)]); }
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
          const g0 = Math.max(cur.hy + 0.02 * H, 0.5 * H);
          add({ k: 'rain', x: (Math.random() * 1.2 - 0.1) * W, y: -0.03 * H, vx: -0.16 * H, vy: (1.2 + Math.random() * 0.4) * H, gy: g0 + Math.random() * (0.95 * H - g0) });
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
          o.x += (o.vx || 0) * dt; o.y += (o.vy || 0) * dt;
          if (o.k === 'spark') o.vy += 1.4 * H * dt;
          if (o.k === 'fly') { o.vx += (Math.random() - 0.5) * 0.12 * W * dt; o.vy += (Math.random() - 0.5) * 0.12 * H * dt; }
          if (o.age >= o.life) parts.splice(i, 1);
        }
      }
    }

    function drawParts(pale, daylight) {
      p.noFill();
      for (const o of parts) {
        if (o.k === 'drop') { S(pale, 215); p.strokeWeight(1.4 * U); p.line(o.x, o.y - 0.012 * H, o.x, o.y); }
        else if (o.k === 'rain') { S(pale, 95); p.strokeWeight(1 * U); p.line(o.x, o.y, o.x - o.vx * 0.025, o.y - o.vy * 0.025); }
        else if (o.k === 'ripple') {
          const t = o.age / o.life, r = 2 + t * o.r;
          S(pale, Math.pow(1 - t, 1.5) * 190); p.strokeWeight(1.1 * U);
          p.ellipse(o.x, o.y, r * 2, r * 0.55);
          if (t > 0.25) { S(pale, Math.pow(1 - t, 1.6) * 110); p.ellipse(o.x, o.y, r * 1.2, r * 0.33); }
        } else if (o.k === 'fly') {
          const a = Math.sin(Math.PI * o.age / o.life) * (1 - daylight * 0.45);
          const tw = 0.75 + 0.25 * Math.sin(clock * 9 + o.x);
          glow(o.x, o.y, 0.02 * H, YELLOW, 0.55 * a * tw);
          p.noStroke(); F([255, 234, 170], 255 * a * tw); p.circle(o.x, o.y, 3 * U);
          p.noFill();
        } else if (o.k === 'spark') {
          p.noStroke(); F(o.age < o.life * 0.4 ? [255, 214, 130] : ORANGE, 255 * (1 - o.age / o.life));
          p.circle(o.x, o.y, 2.6 * U);
          p.noFill();
        }
      }
      p.noStroke();
    }

    // --- небо: градиент, звёзды, солнце и луна (идут по дуге от горизонта до горизонта)
    function drawSky(sc, minutes, weather, hy) {
      vGradient(0, hy, [[0, sc.top], [0.55, mixC(sc.top, sc.hor, 0.4)], [1, sc.hor]]);
      p.noStroke(); F(sc.hor); p.rect(0, hy - 1, W, H - hy + 2);          // всё, что ниже неба, залито цветом горизонта

      if (sc.stars > 0.02) {                                              // звёзды мерцают только на тёмном небе
        for (const s of terrain.stars) {
          const tw = 0.55 + 0.45 * Math.sin(clock * s.sp + s.ph);
          F([232, 236, 255], 255 * sc.stars * tw * (1 - s.v * 1.3));
          p.circle(s.u * W, s.v * H, s.r * 2 * U);
        }
      }

      const vis = weather === 'storm' ? 0.3 : weather === 'rain' ? 0.5 : 1;
      const top = 0.1 * H;
      const arc = (t) => ({ x: p.lerp(0.1 * W, 0.9 * W, t), y: hy - Math.sin(Math.PI * t) * (hy - top), k: Math.sin(Math.PI * t) });
      const ts = (minutes - 360) / 720, tm = (((minutes - 1080) % 1440 + 1440) % 1440) / 720;
      if (ts >= 0 && ts <= 1) {
        const s = arc(ts), c = mixC([255, 150, 84], [255, 238, 205], Math.pow(s.k, 0.6));
        const col = weather === 'alien' ? mixC(c, [255, 190, 230], 0.5) : c;
        glow(s.x, s.y, H * (0.2 + (1 - s.k) * 0.16), col, 0.45 * vis);
        F(col, 255 * vis); p.circle(s.x, s.y, 0.07 * H);
      }
      if (tm >= 0 && tm <= 1) {
        const s = arc(tm), alien = weather === 'alien', R = 0.065 * H;
        const col = alien ? [150, 235, 225] : [228, 228, 214];
        glow(s.x, s.y, H * 0.17, alien ? [120, 220, 210] : [150, 175, 230], 0.3 * vis);
        F(col, 255 * vis); p.circle(s.x, s.y, R);
        F(mixC(col, sc.top, 0.4), 150 * vis);
        for (const c of terrain.craters) p.circle(s.x + c.x * R, s.y + c.y * R, c.r * R);
      }
      if (weather === 'alien') {                                          // вторая «луна» — планета с кольцом
        const px = terrain.planet.u * W, py = terrain.planet.v * H, R = 0.09 * H, a = 0.6 + 0.4 * sc.stars;
        p.push();
        p.translate(px, py); p.rotate(-0.35);
        p.noStroke();
        F([196, 96, 164], 150 * a); p.circle(0, 0, R);
        F([120, 40, 110], 90 * a); p.circle(R * 0.17, R * 0.13, R * 0.66);
        p.noFill(); S([240, 210, 236], 130 * a); p.strokeWeight(1.4 * U); p.ellipse(0, 0, R * 1.95, R * 0.34);
        p.pop();
        p.noStroke();
      }
    }

    // --- слабые фоновые облака: еле видны, плывут по ветру
    function drawAmbient(cloudCol, weather, windAmp) {
      const n = Math.round((CLOUDS[weather] ?? 0.3) * 6) + 2, boost = weather === 'storm' ? 2.2 : 1;
      p.push();
      terrain.ambient.slice(0, n).forEach((c) => {
        const w = c.w * W, span = W + w * 2.4;
        const x = ((c.u * W + clock * c.sp * (0.004 + windAmp * 0.012) * W + w * 1.2) % span + span) % span - w * 1.2;
        const y = c.v * H, a = c.a * boost;
        for (let j = 0; j < 4; j++) blob(x + (j - 1.5) * w * 0.3, y + Math.sin(j * 1.7) * w * 0.03, w * (0.42 - Math.abs(j - 1.5) * 0.07), w * c.h * 0.3, cloudCol, a);
      });
      p.pop();
    }

    function drawRidge(r, hy, col) {
      const base = hy - r.off * H;
      p.noStroke(); F(col);
      p.beginShape();
      p.vertex(0, hy + 2);
      for (let i = 0; i < terrain.cols; i++) p.vertex(i * STEP, base - (0.004 + r.amp * r.h[i]) * H);
      p.vertex(W, hy + 2);
      p.endShape(p.CLOSE);
    }

    // шаблон сосны, чтобы не пересчитывать контур каждый кадр
    const PINE = pine(1, 0.2);
    function tree(x, y, h, col, sway) {
      F(col);
      p.beginShape();
      for (const [px, py] of PINE) p.vertex(x + px * h + sway * Math.pow(-py, 1.6) * h, y + py * h);
      p.endShape(p.CLOSE);
    }

    // --- марево над горизонтом: полоски холста смещаются волной
    function drawHeat(amount, hy) {
      if (amount < 0.02) return;
      vGradient(hy - 0.16 * H, 0.32 * H, [[0, ORANGE, 0], [0.5, ORANGE, 0.12 * amount], [1, ORANGE, 0]]);
      if (motion.matches) return;
      const cnv = ctx().canvas, d = p.pixelDensity(), ys = hy - 0.14 * H, ye = hy + 0.12 * H, sh = 3;
      for (let y = ys; y < ye; y += sh) {
        const w = 1 - Math.abs(y - hy) / (0.14 * H);
        if (w <= 0) continue;
        const dx = Math.sin(y * 0.4 + clock * 9) * (0.6 + 0.4 * Math.sin(y * 0.09 + clock * 2.3)) * amount * 6 * w * U;
        ctx().drawImage(cnv, 0, Math.round(y * d), W * d, Math.round(sh * d), dx, y, W, sh);
      }
    }

    // --- земля под горизонтом: поля полосами, дальше — трава
    function drawFields(sc, hy, plainCol, groundCol) {
      const yG = GROUND_TOP * H;
      vGradient(hy, H - hy + 1, [[0, plainCol], [(yG - hy) / (H - hy), groundCol], [1, scaleC(groundCol, 0.55)]]);
      p.noStroke();
      terrain.bands.forEach((b, k) => {
        const t = Math.pow(b.t, 1.5), t1 = Math.pow((k + 1) / terrain.bands.length, 1.5);
        const y0 = hy + (yG - hy) * t;
        if (k === 0) return;
        const depth = clamp(t1 * 0.5 + t * 0.5);
        let col = mixC(plainCol, groundCol, Math.pow(depth, 0.8));
        col = mixC(col, mixC([110, 118, 80], [66, 76, 72], b.warm), 0.14 * (0.5 + b.tint));
        col = scaleC(col, 0.93 + b.tint * 0.14);
        F(col);
        p.beginShape();
        p.vertex(0, H + 2);
        for (let x = 0; x <= W + 24; x += 24) p.vertex(x, y0 + Math.sin(x / W * b.fr * 6.283 + b.ph) * b.wob * H * (0.4 + t * 2.2));
        p.vertex(W + 24, H + 2);
        p.endShape(p.CLOSE);
      });
    }

    const sway = (x, ph, k) => (Math.sin(clock * 1.7 + x * 0.006 + ph) * 0.7 + Math.sin(clock * 3.3 + x * 0.013) * 0.3) * k;

    function drawBlades(groundCol, hy, windAmp, weather, share) {
      const yG = GROUND_TOP * H, tint = clamp(lv.a * 0.9) * 0.3, hot = mixC(ORANGE, groundCol, 0.45);
      const list = terrain.blades, n = Math.round(list.length * share);
      p.noStroke();
      for (let i = 0; i < n; i++) {
        const b = list[i];
        const y = yG + b.d * (H * 1.01 - yG), x = b.u * W;
        const hgt = (0.018 + 0.06 * b.d) * H * b.h;              // ближе — выше
        const w = (1.4 + 3.4 * b.d) * b.w * U;
        const dark = 1 - 0.35 * b.d;                              // книзу темнее — низ спокойный
        const c = mixC(scaleC(mixC(groundCol, [150, 160, 120], 0.22), b.shade * dark * 1.1), hot, tint * (0.3 + 0.7 * hgt / (0.08 * H)));
        const dxTip = b.lean * H + sway(x, b.ph, windAmp) * hgt * 0.9, dxMid = dxTip * 0.3;
        F(c);
        p.beginShape();
        p.vertex(x - w / 2, y);
        p.vertex(x - w * 0.35 + dxMid, y - hgt * 0.55);
        p.vertex(x + dxTip, y - hgt);
        p.vertex(x + w * 0.35 + dxMid, y - hgt * 0.55);
        p.vertex(x + w / 2, y);
        p.endShape(p.CLOSE);
        if (weather === 'alien' && b.glow) {                      // светящиеся кончики чужого тростника
          const a = 0.5 + 0.5 * Math.sin(clock * 2 + b.ph);
          F([120, 255, 230], 40 * a); p.circle(x + dxTip, y - hgt, 0.012 * H);
          F([170, 255, 240], 190 * a); p.circle(x + dxTip, y - hgt, 0.004 * H);
        }
      }
    }

    // --- облако голоса A: мягкое, дышит от уровня A, порывы по ПОРЫВАМ (a.mod), тянется к оранжевому от громкости
    function drawCloud(sc, weather, a, cloudCol) {
      const pos = cloudPos(a), cx = pos.x * W, cy = pos.y * H;
      const dens = clamp(a.shape);
      const R = Math.min(W * 0.065, H * 0.11) * (0.7 + 0.7 * dens) * (1 + 0.07 * lv.a);
      const tint = clamp(lv.a * 0.5);
      const lit = mixC(cloudCol, ORANGE, tint * 0.6), shade = mixC(scaleC(cloudCol, 0.7), scaleC(ORANGE, 0.7), tint * 0.5);
      const alpha = 0.34 + 0.5 * dens;
      const still = motion.matches ? 0.3 : 1;
      p.push();
      glow(cx, cy, R * 2.6, lit, 0.1 + 0.1 * dens);              // общая дымка вокруг
      const pf = terrain.puffs;
      for (const f of pf) blob(cx + (f.ox + Math.sin(clock * f.sp + f.ph) * 0.06 * still) * R, cy + (f.oy + 0.2) * R, f.r * R * 1.1, f.r * R * 0.9, shade, alpha * 0.6, 0.62);
      for (const f of pf) blob(cx + (f.ox + Math.sin(clock * f.sp + f.ph) * 0.06 * still) * R, cy + (f.oy + Math.cos(clock * f.sp * 0.8 + f.ph) * 0.03 * still) * R, f.r * R, f.r * R * 0.85, lit, alpha, 0.62);
      // порывы: клочья плывут вправо через облако, чем больше a.mod и громче A — тем быстрее и плотнее
      const speed = 0.02 + a.mod * 0.14 + lv.a * 0.1;
      for (const w of terrain.wisps) {
        const f = ((clock * speed * w.sp + w.ph) % 1 + 1) % 1;
        const env = Math.pow(Math.sin(Math.PI * f), 1.4);
        const x = cx + (f - 0.5) * 5.4 * R, y = cy + w.oy * R * 0.8 + Math.sin(f * 6.283 + w.ph * 9) * 0.1 * R;
        blob(x, y, w.r * R * 1.9, w.r * R * 0.62, lit, (0.18 + 0.3 * dens + 0.4 * a.mod * 0.5) * env);
      }
      p.pop();
    }

    // --- голос B: тонкая светящаяся линия точно по горизонту
    function drawVoiceB(hy, b) {
      const n = Math.ceil(W / 6) + 1, cyc = p.lerp(1.5, 12, clamp(b.tune));
      const amp = H * (0.0035 + lv.b * 0.04), ph = clock * (2.2 + lv.b * 3);
      const vis = 0.35 + 0.65 * ease;
      const ys = new Array(n);
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), env = Math.pow(Math.sin(Math.PI * u), 0.8);
        ys[i] = hy + (Math.sin(u * cyc * 6.283 + ph) + 0.25 * Math.sin(u * cyc * 5.1 * 6.283 - ph * 0.7)) * amp * env;
      }
      vGradient(hy - 0.07 * H, 0.14 * H, [[0, BLUE, 0], [0.5, BLUE, (0.05 + 0.11 * lv.b) * vis], [1, BLUE, 0]]);
      p.push();
      const g = ctx();
      g.lineJoin = 'round'; g.lineCap = 'round';
      const line = (wgt, col, al) => {
        const gr = g.createLinearGradient(0, 0, W, 0);
        gr.addColorStop(0, css(col, 0)); gr.addColorStop(0.1, css(col, al * vis)); gr.addColorStop(0.9, css(col, al * vis)); gr.addColorStop(1, css(col, 0));
        g.strokeStyle = gr; g.lineWidth = wgt;
        g.beginPath();
        for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * W; if (i) g.lineTo(x, ys[i]); else g.moveTo(x, ys[i]); }
        g.stroke();
      };
      line(9 * U, BLUE, 0.1); line(4 * U, BLUE, 0.28); line(1.5 * U, mixC(BLUE, [235, 245, 255], 0.65), 0.92);
      p.pop();
    }

    // ------------------------------------------------------------------------------------------
    function fit() {
      const w = Math.max(320, window.innerWidth), h = Math.max(240, window.innerHeight);
      if (w === W && h === H) return false;
      W = w; H = h; U = Math.max(0.6, H / 900);
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const d = clamp(Math.sqrt(4.2e6 / (W * H)), 0.6, dpr);      // ограничиваем число пикселей: холст на весь экран тяжёл
      p.resizeCanvas(W, H, true);
      if (Math.abs(p.pixelDensity() - d) > 0.01) p.pixelDensity(d);
      terrainKey = '';
      return true;
    }

    p.setup = () => {
      W = Math.max(320, window.innerWidth); H = Math.max(240, window.innerHeight); U = Math.max(0.6, H / 900);
      p.createCanvas(W, H);
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      p.pixelDensity(clamp(Math.sqrt(4.2e6 / (W * H)), 0.6, dpr));
      p.frameRate(30);
      lastMs = p.millis();
      bridge.unsubscribe = engine.onTrigger(spawn);
    };
    const remove = p.remove;
    p.remove = () => { bridge.unsubscribe && bridge.unsubscribe(); remove.call(p); };
    bridge.touch = () => { dirty = true; };

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
        && state === lastState && !dirty && now - flashAt > 400) return;
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
      const heat = clamp(fx[state.fxTarget] ? fx[state.fxTarget].drive : 0);
      const aMod = state.a ? state.a.mod : 0;
      const calm = motion.matches ? 0.3 : 1;
      const windAmp = clamp(0.1 + lv.a * (0.5 + aMod * 1.2) + (weather === 'storm' ? 0.3 : weather === 'wind' ? 0.12 : 0), 0, 1.5) * calm;

      const sc = skyColors(minutes, weather);
      const daylight = clamp(lumC(sc.hor) * 1.4);
      const farCol = mixC(sc.hor, sc.land, 0.3), midCol = mixC(sc.hor, sc.land, 0.55), nearCol = mixC(sc.hor, sc.land, 0.8);
      const groundCol = scaleC(sc.land, 0.7), plainCol = mixC(nearCol, sc.hor, 0.42);
      const cloudCol = weather === 'storm' ? mixC(sc.top, [74, 80, 92], 0.45)
        : scaleC(mixC(sc.hor, [255, 255, 255], 0.45), 0.5 + 0.5 * Math.min(1, lumC(sc.hor) * 1.5));
      const pale = mixC([205, 222, 236], sc.hor, 0.15);

      p.noStroke();
      drawSky(sc, minutes, weather, hy);
      drawAmbient(cloudCol, weather, windAmp);

      const fl = 1 - (p.millis() - flashAt) / 300;                 // вспышка молнии тает ~300 мс
      if (bolt && p.millis() - flashAt < 170) {                    // молния за хребтами
        p.noFill(); S([235, 240, 255], 90); p.strokeWeight(6 * U);
        p.beginShape(); bolt.forEach(([x, y]) => p.vertex(x, y)); p.endShape();
        S([255, 255, 255], 240); p.strokeWeight(1.6 * U);
        p.beginShape(); bolt.forEach(([x, y]) => p.vertex(x, y)); p.endShape();
        p.noStroke();
      }

      drawRidge(terrain.ridges[0], hy, farCol);
      drawRidge(terrain.ridges[1], hy, midCol);
      // «ДАЛЬ»: туман между средним и ближним хребтом (чуть дымки есть всегда — воздух)
      const fogCol = mixC(sc.hor, [255, 255, 255], 0.14), fogA = 0.1 + 0.8 * far;
      vGradient(hy - 0.24 * H, 0.26 * H, [[0, fogCol, 0], [0.6, fogCol, fogA * 0.55], [1, fogCol, fogA * 0.85]]);
      drawRidge(terrain.ridges[2], hy, nearCol);

      // деревья вдали (в лесу и под дождём) стоят у горизонта
      if (weather === 'forest' || weather === 'rain') {
        const share = weather === 'forest' ? 1 : 0.4;
        p.noStroke();
        const tc = mixC(nearCol, sc.land, 0.55);
        for (const t of terrain.treesBack) {
          if (t.pick > share) continue;
          tree(t.u * W, hy + t.dy * H, t.h * H, tc, sway(t.u * W, 0, windAmp) * 0.1);
        }
      }

      drawFields(sc, hy, plainCol, groundCol);
      // дымка у горизонта над полем
      vGradient(hy - 0.02 * H, 0.16 * H, [[0, fogCol, fogA * 0.4], [1, fogCol, 0]]);

      drawCloud(sc, weather, state.a, cloudCol);
      drawHeat(clamp((heat - 0.3) / 0.7) * ease, hy);
      drawVoiceB(hy, state.b);

      // передний план: трава, а в лесу ещё и большие сосны по краям
      if (weather === 'forest') {
        const dc = scaleC(sc.land, 0.4);
        for (const t of terrain.treesFront) tree(t.u * W, H * 1.02, t.h * H, dc, sway(t.u * W, 1, windAmp) * 0.05);
      }
      drawBlades(groundCol, hy, windAmp, weather, weather === 'forest' ? 0.6 : 1);

      // низ экрана спокойный и потемнее: там лежат панели
      vGradient(GROUND_TOP * H, H - GROUND_TOP * H + 1, [[0, [4, 6, 10], 0], [0.45, [4, 6, 10], 0.12 + 0.1 * (1 - daylight)], [1, [4, 6, 10], 0.38 + 0.12 * (1 - daylight)]]);

      updateParts(dt, weather, playing);
      drawParts(pale, daylight);

      if (fl > 0) {                                                // вспышка на весь экран
        const flashCol = weather === 'alien' ? [210, 255, 244] : [226, 233, 246];
        p.noStroke(); F(flashCol, fl * fl * (weather === 'storm' ? 150 : 110) * (motion.matches ? 0.4 : 1));
        p.rect(0, 0, W, H);
      }
      // в покое всё приглушено
      p.noStroke(); F([4, 6, 10], (1 - ease) * 46); p.rect(0, 0, W, H);
    };
  };
}

export function mountWorld(el, store, live) {
  const bridge = { state: null, unsubscribe: null, touch: null };
  new p5(sketch(store, live, bridge), el);
  return function update(state) {
    bridge.state = state;
    if (bridge.touch) bridge.touch();
  };
}
