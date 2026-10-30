// Блок .meter — индикатор уровня канала: столбик маленьких квадратов-контуров, горящие залиты тушью.
// Разметка: <div class="meter" data-meter="a"></div>; значение 0..1 подаёт main.js из engine.meters() каждый кадр.

const SEGMENTS = 12;

export function mountMeter(el) {
  el.setAttribute('role', 'meter');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.innerHTML = Array.from({ length: SEGMENTS }, () => '<i class="meter__cell"></i>').join('');
  const cells = [...el.children].reverse();      // зажигаем снизу вверх
  let lit = -1;
  return function update(level = 0) {
    const n = Math.round(Math.min(1, Math.max(0, level) * 2.2) * SEGMENTS);
    if (n === lit) return;
    lit = n;
    cells.forEach((c, i) => c.classList.toggle('is-on', i < n));
    el.setAttribute('aria-valuenow', Math.round((n / SEGMENTS) * 100));
  };
}
