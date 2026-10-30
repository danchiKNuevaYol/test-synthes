// Краски мира: небо и земля по времени суток и погоде (их берёт пейзаж, src/ui/world.js)
// и тема интерфейса поверх него (uiTheme → CSS-переменные, main.js ставит их на documentElement).
// Цвета — массивы [r, g, b].

// --- мелкие помощники для цвета
export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const smooth = (t) => t * t * (3 - 2 * t);
export const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scaleC = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const lumC = (c) => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;

// Опорные точки суток: минута, верх неба, низ неба (у горизонта), земля, видимость звёзд
export const DAY = [
  [0, [5, 7, 16], [14, 20, 36], [8, 10, 17], 1],
  [285, [6, 8, 20], [18, 24, 42], [9, 11, 18], 1],             // ночь
  [345, [24, 26, 58], [112, 76, 92], [36, 32, 44], 0.7],       // предрассветный сумрак
  [405, [84, 92, 138], [238, 166, 116], [66, 58, 66], 0.1],    // рассвет: пыльный оранжевый → сиреневый
  [480, [118, 148, 188], [206, 218, 222], [84, 98, 94], 0],    // день: светлый серо-голубой
  [960, [120, 148, 186], [212, 216, 212], [82, 96, 92], 0],
  [1050, [92, 80, 128], [236, 168, 96], [70, 58, 70], 0.1],    // закат: фиолетовый → янтарь
  [1125, [36, 30, 68], [152, 82, 90], [32, 26, 44], 0.6],
  [1200, [10, 12, 28], [30, 32, 56], [11, 12, 22], 1],
  [1440, [5, 7, 16], [14, 20, 36], [8, 10, 17], 1],
];

/** Краски сцены для минуты суток и погоды: { top, hor, land, stars }. Плавно между опорными точками. */
export function skyColors(minutes, weather) {
  const m = ((minutes % 1440) + 1440) % 1440;
  let i = 1;
  while (i < DAY.length - 1 && DAY[i][0] < m) i++;
  const [m0, ...k0] = DAY[i - 1], [m1, ...k1] = DAY[i];
  const t = smooth(clamp((m - m0) / (m1 - m0)));
  let top = mixC(k0[0], k1[0], t), hor = mixC(k0[1], k1[1], t), land = mixC(k0[2], k1[2], t);
  let stars = k0[3] + (k1[3] - k0[3]) * t;

  const grey = (c, d, k) => mixC(c, [lumC(c) * 255, lumC(c) * 255, lumC(c) * 255], d).map((v) => v * k);
  if (weather === 'storm') { top = grey(top, 0.6, 0.62); hor = grey(hor, 0.6, 0.68); land = grey(land, 0.4, 0.82); stars *= 0.25; }
  else if (weather === 'rain') { top = grey(top, 0.4, 0.8); hor = grey(hor, 0.4, 0.86); land = grey(land, 0.25, 0.92); stars *= 0.5; }
  else if (weather === 'forest') { land = mixC(land, [30, 56, 40], 0.4); hor = mixC(hor, [124, 154, 124], 0.12); }
  else if (weather === 'alien') {                               // чужие оттенки: бирюзовый верх, пурпурный низ
    const k = (c) => 40 + 300 * lumC(c);
    top = mixC(top, scaleC([0.2, 0.75, 0.7], k(top)), 0.55);
    hor = mixC(hor, scaleC([0.8, 0.25, 0.6], k(hor)), 0.55);
    land = mixC(land, [34, 20, 54], 0.5);
    stars = Math.max(stars, 0.25);
  }
  return { top, hor, land, stars };
}

// --- Тема интерфейса: «стекло» поверх неба. Выбираем по порогам, без плавных переходов.
const INK_LIGHT = {                                           // тёмное стекло и светлые буквы: ночь, сумерки, гроза, дождь
  '--ink': '#f1efe8',
  '--ink-soft': 'rgba(241, 239, 232, 0.72)',
  '--glass': 'rgba(14, 16, 22, 0.42)',
  '--glass-strong': 'rgba(14, 16, 22, 0.68)',
  '--glass-line': 'rgba(241, 239, 232, 0.2)',
  '--shadow': '0 10px 36px rgba(0, 0, 0, 0.38)',
  '--glow': 'rgba(255, 192, 132, 0.55)',
};
const INK_DARK = {                                            // светлое стекло и тёмные буквы: яркий день
  '--ink': '#1d1f22',
  '--ink-soft': 'rgba(29, 31, 34, 0.7)',
  '--glass': 'rgba(250, 248, 242, 0.55)',
  '--glass-strong': 'rgba(250, 248, 242, 0.82)',
  '--glass-line': 'rgba(29, 31, 34, 0.16)',
  '--shadow': '0 10px 32px rgba(30, 34, 44, 0.16)',
  '--glow': 'rgba(237, 132, 69, 0.55)',
};
const GLOW = { storm: 'rgba(160, 190, 240, 0.55)', alien: 'rgba(130, 235, 220, 0.55)' };

/**
 * Переменные темы для времени суток и погоды.
 * Тёмные буквы на светлом стекле — с 07:30 до 16:40, если не гроза, не дождь и не чужое небо
 * (там небо мрачнее). Всё остальное — светлые буквы на тёмном стекле.
 */
export function uiTheme(minutes, weather) {
  const m = ((Number(minutes) || 0) % 1440 + 1440) % 1440;
  const bright = m >= 450 && m < 1000 && weather !== 'storm' && weather !== 'rain' && weather !== 'alien';
  const theme = { ...(bright ? INK_DARK : INK_LIGHT) };
  if (GLOW[weather]) theme['--glow'] = GLOW[weather];
  return theme;
}
