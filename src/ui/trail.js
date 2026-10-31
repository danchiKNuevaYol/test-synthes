// Блок .trail — ТРОПА: 16 наблюдений частиц. Четыре строки (капля, щелчок, треск, раскат) × 16 шагов,
// под ними — сдвиг влево, стереть, сдвиг вправо. Пометки чёрной тушью: ни цвета, ни заливок.

import { TRACKS } from '../state/scenes.js';
import { engine } from '../audio/engine.js';
import { degreeName } from '../state/music.js';

// Мелодия: 16 шагов, null — пауза, 0..11 — ступень лада. Пока «звук» не положил поля в состояние, берём запасные
const DEGREES = 12;
const DEFAULT_KEY = { root: 9, scale: 'minor' };
const emptyMelody = () => Array(16).fill(null);
const PAD = 8;           // отступ столбика сверху и снизу, % высоты: нижняя ступень чуть выше края
const dashTop = (deg) => PAD + ((DEGREES - 1 - deg) / (DEGREES - 1)) * (100 - 2 * PAD);   // положение черты, % от верха
const clampDeg = (d) => Math.max(0, Math.min(DEGREES - 1, d));
const preview = (deg) => { try { engine.playNote && engine.playNote(deg); } catch { /* звук необязателен для рисования */ } };

// Значки частиц (viewBox 16×16), всё контуром тушью: капля — штрих с точкой, щелчок — точка,
// треск — звёздочка из 3 штрихов, раскат — зигзаг
const GLYPHS = {
  drop: '<path d="M8 2.2v6"/><circle cx="8" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  click: '<circle cx="8" cy="8" r="1.9" fill="currentColor" stroke="none"/>',
  crackle: '<path d="M8 2.6v10.8M3.3 5.3l9.4 5.4M12.7 5.3l-9.4 5.4"/>',
  boom: '<path d="M1.8 10 4.9 4.2 8 11.8 11.1 4.2 14.2 10"/>',
};

const svg = (id, cls) => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">${GLYPHS[id]}</svg>`;
const withSteps = (s, steps) => ({ ...s, scene: null, steps });

export function mountTrail(el, store) {
  // подписаны только доли: 1 · 5 · 9 · 13
  const nums = Array.from({ length: 16 }, (_, i) => `<span class="trail__num${i % 4 === 0 ? ' is-beat' : ''}">${i % 4 === 0 ? i + 1 : ''}</span>`).join('');
  const labels = TRACKS.map((t) => `
    <div class="trail__label">${t.name}</div>`).join('');
  const melodyLabel = `<div class="trail__label trail__label--melody">МЕЛОДИЯ</div>`;
  const melodyCells = Array.from({ length: 16 }, (_, i) => `
        <button type="button" class="trail__mcell${i % 4 === 0 ? ' is-beat' : ''}" data-mstep="${i}" aria-label="Мелодия, шаг ${i + 1}: пауза"><i class="trail__dash"></i></button>`).join('');
  const rows = TRACKS.map((t, r) => `
    <div class="trail__row">
      ${Array.from({ length: 16 }, (_, i) => `
        <button type="button" class="trail__cell${i % 4 === 0 ? ' is-beat' : ''}" data-row="${r}" data-step="${i}"
          aria-pressed="false" aria-label="${t.name}, шаг ${i + 1}">${svg(t.id, 'trail__mark')}</button>`).join('')}
    </div>`).join('');

  el.innerHTML = `
    <h2 class="trail__title visually-hidden">ТРОПА · 16 НАБЛЮДЕНИЙ</h2>
    <div class="trail__body">
      <div class="trail__labels">
        <span class="trail__num-spacer"></span>
        ${melodyLabel}
        ${labels}
      </div>
      <div class="trail__field">
        <div class="trail__now" hidden></div>
        <div class="trail__nums">${nums}</div>
        <div class="trail__melody" role="group" aria-label="Мелодия — 16 шагов; тяните по клеткам вверх и вниз, двойной клик — пауза">
          <svg class="trail__line" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true"><path d=""/></svg>
          ${melodyCells}
        </div>
        ${rows}
      </div>
      <div class="trail__tools">
        <button type="button" class="trail__tool trail__tool--icon" data-action="left" title="Сдвинуть всё влево" aria-label="Сдвинуть влево">
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.2 3.7 6l3.8 3.8"/></svg></button>
        <button type="button" class="trail__tool" data-action="clear" title="Стереть наблюдения. Shift — стереть и мелодию">стереть</button>
        <button type="button" class="trail__tool trail__tool--icon" data-action="right" title="Сдвинуть всё вправо" aria-label="Сдвинуть вправо">
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.2 8.3 6l-3.8 3.8"/></svg></button>
      </div>
    </div>`;

  const cells = [...el.querySelectorAll('.trail__cell')];
  const mcells = [...el.querySelectorAll('.trail__mcell')];
  const melodyEl = el.querySelector('.trail__melody');
  const linePath = el.querySelector('.trail__line path');
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
    const rot = (row, d) => row.map((_, i) => row[(i - d + 16) % 16]);
    const shift = (d) => (s) => ({ ...withSteps(s, s.steps.map((row) => rot(row, d))), melody: rot(s.melody || emptyMelody(), d) });
    if (action === 'left') store.update(shift(-1));
    if (action === 'right') store.update(shift(1));
    if (action === 'clear') {   // Shift — заодно и мелодия
      const all = e.shiftKey;
      store.update((s) => ({ ...withSteps(s, s.steps.map((row) => row.map(() => false))), ...(all ? { melody: emptyMelody() } : {}) }));
    }
  });

  // --- мелодия. Ставит ступени «карандашом»: нажать и вести по столбикам, высота курсора = ступень
  const melodyOf = () => store.get().melody || emptyMelody();
  // записывает ступени {индекс: значение}; одной заменой массива, сцена сбрасывается
  function setNotes(changes) {
    store.update((s) => {
      const m = (s.melody || emptyMelody()).slice();
      let diff = false;
      for (const [i, v] of changes) if (m[i] !== v) { m[i] = v; diff = true; }
      return diff ? { ...s, scene: null, melody: m } : s;
    });
  }
  const degreeAt = (e) => {
    const r = melodyEl.getBoundingClientRect();
    const top = r.top + (r.height * PAD) / 100, h = r.height * (1 - (2 * PAD) / 100);
    return clampDeg(Math.round((1 - (e.clientY - top) / h) * (DEGREES - 1)));
  };
  const stepAt = (e) => {
    const r = melodyEl.getBoundingClientRect();
    return Math.max(0, Math.min(15, Math.floor(((e.clientX - r.left) / r.width) * 16)));
  };
  let pen = null, lastPreview = 0;                            // pen: { col, deg } — где карандаш был в прошлый раз
  const ping = (deg, force) => {                              // предпрослушка, при рисовании — не чаще раза в 70 мс
    const t = performance.now();
    if (force || t - lastPreview > 70) { lastPreview = t; preview(deg); }
  };
  melodyEl.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const col = stepAt(e);
    mcells[col].focus({ preventScroll: true });
    if (e.altKey) { e.preventDefault(); setNotes([[col, null]]); return; }
    e.preventDefault();
    melodyEl.setPointerCapture(e.pointerId);
    const deg = degreeAt(e);
    pen = { col, deg };
    setNotes([[col, deg]]);
    ping(deg, true);
    melodyEl.classList.add('is-drawing');
  });
  melodyEl.addEventListener('pointermove', (e) => {
    if (!pen) return;
    const col = stepAt(e), deg = degreeAt(e);
    if (col === pen.col && deg === pen.deg) return;
    const changes = [];
    const n = Math.abs(col - pen.col);
    for (let k = 1; k <= n; k++) {                            // быстро проведённый курсор не оставляет дыр между столбиками
      const c = pen.col + Math.sign(col - pen.col) * k;
      changes.push([c, Math.round(pen.deg + ((deg - pen.deg) * k) / n)]);
    }
    if (!n) changes.push([col, deg]);
    setNotes(changes);
    if (col !== pen.col || deg !== pen.deg) ping(deg, false);
    pen = { col, deg };
  });
  const lift = () => { pen = null; melodyEl.classList.remove('is-drawing'); };
  melodyEl.addEventListener('pointerup', lift);
  melodyEl.addEventListener('pointercancel', lift);
  melodyEl.addEventListener('dblclick', (e) => { setNotes([[stepAt(e), null]]); });
  // колесо над столбиком: ступень ±1 (с паузы — от ближайшей слева ноты)
  melodyEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const i = stepAt(e), m = melodyOf();
    let next;
    if (m[i] == null) {                                       // с паузы первый щелчок колеса ставит ближайшую слева ноту (или ступень 3)
      next = 3;
      for (let k = i - 1; k >= 0; k--) if (m[k] != null) { next = m[k]; break; }
    } else next = clampDeg(m[i] + (e.deltaY < 0 ? 1 : -1));
    setNotes([[i, next]]);
    ping(next, true);
  }, { passive: false });
  // клавиатура на столбике: ↑↓ ступень, Delete — пауза, ←→ соседний столбик, Enter — с паузы поставить ноту / сыграть ноту
  melodyEl.addEventListener('keydown', (e) => {
    const cell = e.target.closest('.trail__mcell');
    if (!cell) return;
    const i = +cell.dataset.mstep, m = melodyOf();
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = clampDeg((m[i] == null ? (e.key === 'ArrowUp' ? -1 : DEGREES) : m[i]) + (e.key === 'ArrowUp' ? 1 : -1));
      setNotes([[i, next]]);
      ping(next, true);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); setNotes([[i, null]]);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault(); mcells[Math.max(0, Math.min(15, i + (e.key === 'ArrowLeft' ? -1 : 1)))].focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (m[i] == null) { setNotes([[i, 0]]); preview(0); } else preview(m[i]);
    }
  });

  let now = -1, melodySig = '';
  return {
    update(state) {
      const m = state.melody || emptyMelody(), key = state.key || DEFAULT_KEY;
      const sig = `${m.join(',')}|${key.root}|${key.scale}`;
      if (sig !== melodySig) {
        melodySig = sig;
        mcells.forEach((c, i) => {
          const deg = m[i];
          c.classList.toggle('is-on', deg != null);
          c.style.setProperty('--top', deg == null ? '' : `${dashTop(deg).toFixed(2)}%`);
          c.setAttribute('aria-label', `Мелодия, шаг ${i + 1}: ${deg == null ? 'пауза' : degreeName(key, deg)}`);
          c.title = deg == null ? 'пауза' : degreeName(key, deg);
        });
        // волосяная линия соединяет соседние ноты; пауза разрывает её
        let d = '', pen2 = false;
        m.forEach((deg, i) => {
          if (deg == null) { pen2 = false; return; }
          d += `${pen2 ? 'L' : 'M'}${i * 10 + 5} ${dashTop(deg).toFixed(2)}`;
          pen2 = true;
        });
        linePath.setAttribute('d', d);
      }
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
      mcells.forEach((c, k) => c.classList.toggle('is-now', k === i));
      numEls.forEach((n, k) => n.classList.toggle('is-now', k === i));
      nowEl.hidden = i < 0;
      if (i >= 0) nowEl.style.transform = `translateX(${i * 100}%)`;
    },
  };
}
