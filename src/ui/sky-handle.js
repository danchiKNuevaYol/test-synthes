// Блок .sky-handle — облако в небе = голос A · ВОЗДУХ.
// Слой на весь экран ничего не ловит; ловит только кольцо-ручка на месте облака (рисует его p5, см. world.js).
// Тянем облако: x — ВЫСОТА (a.tune), y — ПЛОТНОСТЬ (a.shape). Клик без сдвига открывает лист наблюдения.

import { cloudPos, cloudFromPoint } from '../world/geometry.js';
import { FORMATS, clamp01 } from './format.js';

const STEP = 0.02;      // шаг стрелок
const CLICK_SLOP = 4;   // сдвиг меньше 4px — это клик, а не перетаскивание

export function mountSkyHandle(el, store, ui) {
  el.innerHTML = `
    <div class="sky-handle__grip" role="slider" tabindex="0" aria-orientation="horizontal"
         aria-label="Облако — голос A: высота и плотность" aria-valuemin="0" aria-valuemax="100">
      <svg class="sky-handle__ring" viewBox="0 0 64 64" aria-hidden="true">
        <circle class="sky-handle__circle" cx="32" cy="32" r="30"/>
        <path class="sky-handle__tick" d="M32 3v6M32 55v6M3 32h6M55 32h6"/>
      </svg>
      <span class="sky-handle__caption">
        <span class="sky-handle__name">ВОЗДУХ</span>
        <span class="sky-handle__values"></span>
      </span>
    </div>`;
  const grip = el.querySelector('.sky-handle__grip');
  const values = el.querySelector('.sky-handle__values');

  let drag = null;   // { id, x0, y0, moved }

  // Ставим a.tune и a.shape одним обновлением; рука держит облако ровно под курсором
  function moveTo(clientX, clientY) {
    const { tune, shape } = cloudFromPoint(clientX / innerWidth, clientY / innerHeight);
    store.update((s) => (s.a.tune === tune && s.a.shape === shape
      ? s
      : { ...s, a: { ...s.a, tune, shape }, scene: null }));
  }

  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    grip.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
    grip.classList.add('is-drag');
    e.preventDefault();
    grip.focus({ preventScroll: true });
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < CLICK_SLOP) return;
    drag.moved = true;
    moveTo(e.clientX, e.clientY);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const wasClick = !drag.moved && e.type === 'pointerup';
    drag = null;
    grip.classList.remove('is-drag');
    if (wasClick) ui.openSheet('a');
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  grip.addEventListener('mouseenter', () => grip.classList.add('is-hover'));
  grip.addEventListener('mouseleave', () => grip.classList.remove('is-hover'));

  grip.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: ['tune', -1], ArrowRight: ['tune', 1], ArrowDown: ['shape', -1], ArrowUp: ['shape', 1] }[e.key];
    if (d) {
      e.preventDefault();
      store.update((s) => ({ ...s, a: { ...s.a, [d[0]]: clamp01(s.a[d[0]] + d[1] * STEP) }, scene: null }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      ui.openSheet('a');
    }
  });

  return function update(state) {
    const { x, y } = cloudPos(state.a);
    grip.style.left = `${x * 100}%`;
    grip.style.top = `${y * 100}%`;
    const text = `ВЫСОТА ${FORMATS['hz-a'](state.a.tune)} · ПЛОТНОСТЬ ${FORMATS.percent(state.a.shape)}`;
    if (values.textContent !== text) values.textContent = text;
    grip.setAttribute('aria-valuenow', Math.round(state.a.tune * 100));
    grip.setAttribute('aria-valuetext', text.toLowerCase());
  };
}
