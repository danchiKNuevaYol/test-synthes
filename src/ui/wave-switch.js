// Блок .wave-switch — выбор формы волны голоса: четыре значка с названием звука под каждым.
// Разметка: <div class="wave-switch" data-param="a.wave" data-channel="a"></div>
// Название звука зависит от голоса: для a.* — ГУЛ/ШЕЛЕСТ/…, для b.* — СВИСТ/ВОЛНА/…

import { WAVES, WAVE_TITLES, NAMES_A, NAMES_B } from '../state/scenes.js';
import { readParam, setParam } from '../state/store.js';

const ICONS = {
  sine: 'M2 11 C 7 -1, 11 -1, 16 11 S 25 23, 30 11',
  triangle: 'M2 17 L9 5 L23 17 L30 5',
  square: 'M2 16V6h9v10h10V6h9',
  noise: 'M2 11l2-4 2 8 2-11 2 14 2-12 2 10 2-9 2 9 2-7 2 8 2-5 2 4',
};

export function mountWaveSwitch(el, store) {
  const { param, channel } = el.dataset;
  const names = param.startsWith('b.') ? NAMES_B : NAMES_A;
  el.setAttribute('role', 'radiogroup');
  el.setAttribute('aria-label', 'Форма волны');
  if (channel) el.classList.add(`wave-switch--${channel}`);
  el.innerHTML = WAVES.map((w) => `
    <button type="button" class="wave-switch__item" role="radio" data-wave="${w}" title="${WAVE_TITLES[w]}" aria-label="${names[w]} — ${WAVE_TITLES[w]}" aria-checked="false">
      <svg class="wave-switch__icon" viewBox="0 0 32 22" aria-hidden="true"><path d="${ICONS[w]}"/></svg>
      <span class="wave-switch__name">${names[w]}</span>
    </button>`).join('');

  const items = [...el.querySelectorAll('.wave-switch__item')];
  const pick = (w) => store.update((s) => setParam(s, param, w));
  items.forEach((it) => it.addEventListener('click', () => pick(it.dataset.wave)));

  // Стрелки двигают выбор, как в обычной группе радиокнопок
  el.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = items.findIndex((it) => it.getAttribute('aria-checked') === 'true');
    const next = items[(i + d + items.length) % items.length];
    pick(next.dataset.wave);
    next.focus();
  });

  return function update(state) {
    const current = readParam(state, param);
    items.forEach((it) => {
      const on = it.dataset.wave === current;
      it.classList.toggle('is-on', on);
      it.setAttribute('aria-checked', on);
      it.tabIndex = on ? 0 : -1; // в группе в фокусе один пункт
    });
  };
}
