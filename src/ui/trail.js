// Блок .trail — ТРОПА: 16 наблюдений частиц. Четыре строки (капля, щелчок, треск, раскат) × 16 шагов,
// справа — случайный узор, сдвиг влево/вправо, стереть. Пометки чёрной тушью: ни цвета, ни заливок.

import { TRACKS } from '../state/scenes.js';
import { sign } from './signs.js';

// Значки частиц (viewBox 16×16), всё контуром тушью: капля — штрих с точкой, щелчок — точка,
// треск — звёздочка из 3 штрихов, раскат — зигзаг
const GLYPHS = {
  drop: '<path d="M8 2.2v6"/><circle cx="8" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  click: '<circle cx="8" cy="8" r="1.9" fill="currentColor" stroke="none"/>',
  crackle: '<path d="M8 2.6v10.8M3.3 5.3l9.4 5.4M12.7 5.3l-9.4 5.4"/>',
  boom: '<path d="M1.8 10 4.9 4.2 8 11.8 11.1 4.2 14.2 10"/>',
};
const DENSITY = [0.32, 0.3, 0.26, 0.1];

const svg = (id, cls) => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">${GLYPHS[id]}</svg>`;
const randomRow = (p) => Array.from({ length: 16 }, () => Math.random() < p);
const withSteps = (s, steps) => ({ ...s, scene: null, steps });

export function mountTrail(el, store) {
  const nums = Array.from({ length: 16 }, (_, i) => `<span class="trail__num${i % 4 === 0 ? ' is-beat' : ''}">${i + 1}</span>`).join('');
  const labels = TRACKS.map((t) => `
    <div class="trail__label">${svg(t.id, 'trail__glyph')}<span>${t.name}</span></div>`).join('');
  const rows = TRACKS.map((t, r) => `
    <div class="trail__row">
      ${Array.from({ length: 16 }, (_, i) => `
        <button type="button" class="trail__cell${i % 4 === 0 ? ' is-beat' : ''}" data-row="${r}" data-step="${i}"
          aria-pressed="false" aria-label="${t.name}, шаг ${i + 1}">${svg(t.id, 'trail__mark')}</button>`).join('')}
    </div>`).join('');

  el.innerHTML = `
    <h2 class="trail__title">${sign('p')}ТРОПА · 16 НАБЛЮДЕНИЙ</h2>
    <div class="trail__body">
      <div class="trail__labels">
        <span class="trail__num-spacer"></span>
        ${labels}
      </div>
      <div class="trail__field">
        <div class="trail__now" hidden></div>
        <div class="trail__nums">${nums}</div>
        ${rows}
      </div>
      <div class="trail__tools">
        <button type="button" class="trail__tool" data-action="random" title="Случайный узор">случайно</button>
        <div class="trail__shift">
          <button type="button" class="trail__tool trail__tool--icon" data-action="left" title="Сдвинуть влево" aria-label="Сдвинуть влево">
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.2 3.7 6l3.8 3.8"/></svg></button>
          <button type="button" class="trail__tool trail__tool--icon" data-action="right" title="Сдвинуть вправо" aria-label="Сдвинуть вправо">
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.2 8.3 6l-3.8 3.8"/></svg></button>
        </div>
        <button type="button" class="trail__tool" data-action="clear" title="Стереть все наблюдения">стереть</button>
      </div>
    </div>`;

  const cells = [...el.querySelectorAll('.trail__cell')];
  const numEls = [...el.querySelectorAll('.trail__num')];
  const nowEl = el.querySelector('.trail__now');

  el.addEventListener('click', (e) => {
    const cell = e.target.closest('.trail__cell');
    if (cell) {
      const r = +cell.dataset.row, i = +cell.dataset.step;
      store.update((s) => withSteps(s, s.steps.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === i ? !v : v)) : row))));
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    const shift = (d) => (s) => withSteps(s, s.steps.map((row) => row.map((_, i) => row[(i - d + 16) % 16])));
    if (action === 'random') store.update((s) => withSteps(s, DENSITY.map(randomRow)));
    if (action === 'left') store.update(shift(-1));
    if (action === 'right') store.update(shift(1));
    if (action === 'clear') store.update((s) => withSteps(s, s.steps.map((row) => row.map(() => false))));
  });

  let now = -1;
  return {
    update(state) {
      cells.forEach((c) => {
        const on = state.steps[+c.dataset.row][+c.dataset.step];
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', on);
      });
    },
    // i — номер текущего шага, -1 когда остановлено
    setStep(i) {
      if (i === now) return;
      now = i;
      cells.forEach((c) => c.classList.toggle('is-now', +c.dataset.step === i));
      numEls.forEach((n, k) => n.classList.toggle('is-now', k === i));
      nowEl.hidden = i < 0;
      if (i >= 0) nowEl.style.transform = `translateX(${i * 100}%)`;
    },
  };
}
