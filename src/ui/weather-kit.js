// Блок .weather-kit — ПОГОДА: цепочка эффектов выбранного канала.
// Сверху вкладки канала (небо ○ / горизонт ═ / земля ⁘), ниже четыре горизонтальных ползунка по порядку цепи:
// ЖАР (drive) → МАРЕВО (mod) → УЩЕЛЬЕ (delay) → ДАЛЬ (reverb). Ползунки правят fx.<канал>.<параметр>;
// линия заливки (сплошная / двойная / пунктир) показывает, чья это цепочка.

import { setParam } from '../state/store.js';
import { mountSlider } from './slider.js';
import { sign } from './signs.js';

const TARGETS = [
  { id: 'a', name: 'НЕБО' },
  { id: 'b', name: 'ГОРИЗОНТ' },
  { id: 'p', name: 'ЗЕМЛЯ' },
];

// Ступени цепочки: жар, дрожащий воздух, эхо в ущелье, даль
const STAGES = [
  { param: 'drive', name: 'ЖАР', def: 0 },
  { param: 'mod', name: 'МАРЕВО', def: 0.2 },
  { param: 'delay', name: 'УЩЕЛЬЕ', def: 0.3 },
  { param: 'reverb', name: 'ДАЛЬ', def: 0.4 },
];

export function mountWeatherKit(el, store) {
  const seg = TARGETS.map((t) => `
    <button type="button" class="weather-kit__target weather-kit__target--${t.id}" role="radio" data-target="${t.id}" aria-checked="false">${sign(t.id)}<span>${t.name}</span></button>`).join('');
  const chain = STAGES.map((st, i) => `
    <div class="slider" data-param="fx.*.${st.param}" data-label="${i + 1} ${st.name}" data-default="${st.def}" data-channel="*"></div>`).join('');

  el.innerHTML = `
    <h2 class="weather-kit__title visually-hidden">ПОГОДА · ЦЕПЬ</h2>
    <div class="weather-kit__targets" role="radiogroup" aria-label="Чья цепочка эффектов">${seg}</div>
    <div class="weather-kit__chain">${chain}</div>`;

  const targets = [...el.querySelectorAll('.weather-kit__target')];
  const updates = [...el.querySelectorAll('.slider')].map((k) => mountSlider(k, store));
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
