// Блок .weather-kit — ПОГОДА: цепочка эффектов выбранного канала.
// Сверху переключатель канала (небо / горизонт / земля), ниже четыре ступени сверху вниз:
// ЖАР (drive) → МАРЕВО (mod) → УЩЕЛЬЕ (delay) → ДАЛЬ (reverb). Ползунки правят fx.<канал>.<параметр>.

import { setParam } from '../state/store.js';
import { mountSlider } from './slider.js';

const TARGETS = [
  { id: 'a', name: 'НЕБО' },
  { id: 'b', name: 'ГОРИЗОНТ' },
  { id: 'p', name: 'ЗЕМЛЯ' },
];

// Ступени цепочки; значок — маленький «прибор»: градусник, дрожащий воздух, эхо в ущелье, туман
const STAGES = [
  { param: 'drive', name: 'ЖАР', def: 0,
    glyph: '<path d="M10 3.5a1.8 1.8 0 0 1 3.6 0v8.2a3.6 3.6 0 1 1-3.6 0z"/><path d="M11.8 7v6" /><circle cx="11.8" cy="15.4" r="1.2" fill="currentColor"/><path d="M16.4 6h2M16.4 9h1.4M16.4 12h2" opacity="0.6"/>' },
  { param: 'mod', name: 'МАРЕВО', def: 0.2,
    glyph: '<path d="M3.5 7.5c1.8-2 3.2 2 5 0s3.2 2 5 0 3.2 2 5 0"/><path d="M3.5 12c1.8-2 3.2 2 5 0s3.2 2 5 0 3.2 2 5 0" opacity="0.7"/><path d="M3.5 16.5c1.8-2 3.2 2 5 0s3.2 2 5 0 3.2 2 5 0" opacity="0.4"/>' },
  { param: 'delay', name: 'УЩЕЛЬЕ', def: 0.3,
    glyph: '<path d="M3 4v14M21 4v14" opacity="0.5"/><path d="M8.5 8.5a4.6 4.6 0 0 1 0 5" /><path d="M12 6.5a7.6 7.6 0 0 1 0 9" opacity="0.75"/><path d="M15.5 4.5a10.6 10.6 0 0 1 0 13" opacity="0.5"/><circle cx="5.6" cy="11" r="1.1" fill="currentColor"/>' },
  { param: 'reverb', name: 'ДАЛЬ', def: 0.4,
    glyph: '<path d="M3.5 6.5h17" opacity="0.35"/><path d="M5.5 10h13" opacity="0.6"/><path d="M3.5 13.5h17" opacity="0.8"/><path d="M7 17h10"/>' },
];

const ARROW = '<svg viewBox="0 0 24 12" aria-hidden="true"><path d="M12 0v7"/><path d="M8.5 4.5 12 8.2l3.5-3.7"/></svg>';

export function mountWeatherKit(el, store) {
  const seg = TARGETS.map((t) => `
    <button type="button" class="weather-kit__target weather-kit__target--${t.id}" role="radio" data-target="${t.id}" aria-checked="false">${t.name}</button>`).join('');
  const chain = STAGES.map((st, i) => `
    ${i ? `<div class="weather-kit__arrow">${ARROW}</div>` : ''}
    <div class="weather-kit__stage">
      <span class="weather-kit__icon"><svg viewBox="0 0 24 22" aria-hidden="true">${st.glyph}</svg><i class="weather-kit__n">${i + 1}</i></span>
      <div class="slider" data-param="fx.*.${st.param}" data-label="${st.name}" data-default="${st.def}" data-channel="*"></div>
    </div>`).join('');

  el.innerHTML = `
    <h2 class="weather-kit__title">ПОГОДА · ЦЕПЬ</h2>
    <div class="weather-kit__targets" role="radiogroup" aria-label="Чья цепочка эффектов">${seg}</div>
    <div class="weather-kit__chain">${chain}</div>`;

  const targets = [...el.querySelectorAll('.weather-kit__target')];
  const updates = [...el.querySelectorAll('.slider')].map((s) => mountSlider(s, store));
  const pick = (id) => store.update((s) => setParam(s, 'fxTarget', id));
  targets.forEach((b) => b.addEventListener('click', () => pick(b.dataset.target)));
  el.querySelector('.weather-kit__targets').addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = targets.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const next = targets[(i + d + targets.length) % targets.length];
    pick(next.dataset.target);
    next.focus();
  });

  return function update(state) {
    el.dataset.target = state.fxTarget;
    targets.forEach((b) => {
      const on = b.dataset.target === state.fxTarget;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on);
      b.tabIndex = on ? 0 : -1;
    });
    updates.forEach((u) => u(state));
  };
}
