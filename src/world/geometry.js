// Общая геометрия визуала. Пейзаж (p5, src/ui/world.js) берёт отсюда, где стоят облако и горизонт.
// Координаты нормированы: x — доля ширины холста, y — доля высоты холста (0 — верх).

const lerp = (a, b, t) => a + (b - a) * t;
const unlerp = (a, b, v) => (v - a) / (b - a);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Зоны экрана. Интерфейсные блоки стоят по краям и не заходят в центр неба и на горизонт.
export const ZONES = {
  sky:     { top: 0.30, bottom: 0.38, left: 0.56, right: 0.80 }, // где летает облако (голос A): правая половина неба, ниже строки места и правее названия
  horizon: { high: 0.60, low: 0.74 },                      // где ходит горизонт (голос B) — нижняя треть визуала; выше — просторное небо
  ground:  { top: 0.74 },                                  // земля, трава, частицы
};

// --- Небо = голос A · ВОЗДУХ: облако. x — ВЫСОТА (a.tune), y — ПЛОТНОСТЬ (a.shape: выше = плотнее)
export function cloudPos(a) {
  const s = ZONES.sky;
  return { x: lerp(s.left, s.right, a.tune), y: lerp(s.bottom, s.top, a.shape) };
}
export function cloudFromPoint(x, y) {
  const s = ZONES.sky;
  return { tune: clamp01(unlerp(s.left, s.right, x)), shape: clamp01(unlerp(s.bottom, s.top, y)) };
}

// --- Горизонт = голос B · СТИХИЯ: высота линии горизонта — ВЫСОТА свиста (b.tune)
export function horizonY(b) {
  return lerp(ZONES.horizon.low, ZONES.horizon.high, b.tune);
}
export function tuneFromHorizonY(y) {
  return clamp01(unlerp(ZONES.horizon.low, ZONES.horizon.high, y));
}
