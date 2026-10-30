// Блок .horizon-handle — линия горизонта = голос B · СТИХИЯ.
// Тянем горизонт вверх-вниз: его высота — ВЫСОТА свиста (b.tune). Клик без сдвига открывает лист наблюдения.
// Полоса-ловушка занимает только середину экрана (22%…78%), чтобы не закрывать панели по краям.

import { horizonY, tuneFromHorizonY } from '../world/geometry.js';
import { FORMATS, clamp01 } from './format.js';
import { sign } from './signs.js';

const STEP = 0.02;
const CLICK_SLOP = 4;

export function mountHorizonHandle(el, store, ui) {
  el.innerHTML = `
    <div class="horizon-handle__strip" role="slider" tabindex="0" aria-orientation="vertical"
         aria-label="Горизонт — голос B: высота" aria-valuemin="0" aria-valuemax="100">
      <span class="horizon-handle__line" aria-hidden="true"></span>
      <span class="horizon-handle__grip" aria-hidden="true">
        <svg viewBox="0 0 36 18" width="36" height="18">
          <rect class="horizon-handle__pill" x="0.5" y="0.5" width="35" height="17"/>
          <path class="horizon-handle__arrows" d="M9 3.5v11M6.2 6.3 9 3.5l2.8 2.8M6.2 11.7 9 14.5l2.8-2.8M16 6.5h14M16 11.5h14"/>
        </svg>
      </span>
      <span class="horizon-handle__caption">
        <span class="horizon-handle__name">${sign('b')}СТИХИЯ</span>
        <span class="horizon-handle__values"></span>
      </span>
    </div>`;
  const strip = el.querySelector('.horizon-handle__strip');
  const values = el.querySelector('.horizon-handle__values');

  let drag = null;

  function moveTo(clientY) {
    const tune = tuneFromHorizonY(clientY / innerHeight);
    store.update((s) => (s.b.tune === tune ? s : { ...s, b: { ...s.b, tune }, scene: null }));
  }

  strip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    strip.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
    strip.classList.add('is-drag');
    e.preventDefault();
    strip.focus({ preventScroll: true });
  });
  strip.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < CLICK_SLOP) return;
    drag.moved = true;
    moveTo(e.clientY);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const wasClick = !drag.moved && e.type === 'pointerup';
    drag = null;
    strip.classList.remove('is-drag');
    if (wasClick) ui.openSheet('b');
  };
  strip.addEventListener('pointerup', end);
  strip.addEventListener('pointercancel', end);
  strip.addEventListener('mouseenter', () => strip.classList.add('is-hover'));
  strip.addEventListener('mouseleave', () => strip.classList.remove('is-hover'));

  strip.addEventListener('keydown', (e) => {
    const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];   // выше горизонт — выше свист
    if (dir) {
      e.preventDefault();
      store.update((s) => ({ ...s, b: { ...s.b, tune: clamp01(s.b.tune + dir * STEP) }, scene: null }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      ui.openSheet('b');
    }
  });

  return function update(state) {
    strip.style.top = `${horizonY(state.b) * 100}%`;
    const text = `ВЫСОТА ${FORMATS['hz-b'](state.b.tune)}`;
    if (values.textContent !== text) values.textContent = text;
    strip.setAttribute('aria-valuenow', Math.round(state.b.tune * 100));
    strip.setAttribute('aria-valuetext', text.toLowerCase());
  };
}
