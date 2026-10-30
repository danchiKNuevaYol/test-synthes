// Стиль «ЛИНИИ»: цветов в мире нет — только чёрная тушь по бумаге.
// Здесь две вещи: (1) густота штриховки неба по времени суток и погоде (её берёт пейзаж, src/ui/world.js)
// и (2) тема интерфейса (uiTheme → CSS-переменные, main.js ставит их на documentElement).

// --- мелкие помощники
export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const smooth = (t) => t * t * (3 - 2 * t);
export const lerp = (a, b, t) => a + (b - a) * t;

// «Ночность» суток: 0 — день (небо почти пустое), 1 — глухая ночь (плотная штриховка).
// Опорные точки: минута, ночность.
const NIGHT = [
  [0, 1], [285, 1],                                           // ночь
  [345, 0.8], [405, 0.5],                                     // предрассветный сумрак, рассвет
  [480, 0], [960, 0],                                         // день
  [1050, 0.45], [1125, 0.8],                                  // закат, сумерки
  [1200, 1], [1440, 1],
];

/** Ночность 0…1 для минуты суток; между опорными точками плавно. */
export function nightness(minutes) {
  const m = ((Number(minutes) || 0) % 1440 + 1440) % 1440;
  let i = 1;
  while (i < NIGHT.length - 1 && NIGHT[i][0] < m) i++;
  const [m0, v0] = NIGHT[i - 1], [m1, v1] = NIGHT[i];
  return lerp(v0, v1, smooth(clamp((m - m0) / (m1 - m0))));
}

/**
 * Штриховка неба для минуты суток и погоды:
 * night — ночность 0…1, gap — расстояние между линиями неба (доля высоты окна),
 * alpha — прозрачность туши линий неба, stars — сколько звёзд видно 0…1.
 * День — редкие линии, рассвет и закат — средние, ночь — плотно.
 */
export function skyHatch(minutes, weather) {
  let night = nightness(minutes);
  if (weather === 'storm') night = Math.max(night, 0.66);     // гроза: небо рванее и плотнее
  else if (weather === 'rain') night = Math.max(night, 0.4);
  else if (weather === 'alien') night = Math.max(night, 0.3);
  const gap = lerp(0.031, 0.0086, Math.pow(night, 0.85));
  const alpha = lerp(0.38, 0.5, night);
  const cover = weather === 'storm' ? 0.2 : weather === 'rain' ? 0.5 : 1;   // облака закрывают звёзды
  const stars = clamp((nightness(minutes) - 0.55) / 0.45) * cover;
  return { night, gap, alpha, stars };
}

// --- Тема интерфейса: всегда одна и та же — тушь по бумаге. Ключи совместимы с прежними.
const THEME = {
  '--paper': '#f3f2ee',
  '--ink': '#111111',
  '--ink-soft': 'rgba(17, 17, 17, 0.58)',
  '--ink-faint': 'rgba(17, 17, 17, 0.22)',
  '--hair': 'rgba(17, 17, 17, 0.14)',
  '--glass': 'rgba(243, 242, 238, 0.92)',
  '--glass-strong': 'rgba(243, 242, 238, 0.97)',
  '--glass-line': '#111111',
  '--shadow': 'none',
  '--glow': '#111111',
};

/** Переменные темы. Время суток и погода на интерфейс не влияют: он всегда чёрно-белый. */
export function uiTheme() {
  return { ...THEME };
}
