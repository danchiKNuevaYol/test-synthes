// Блок .knob — регулятор-«часы»: тонкое кольцо, риска-указатель и дуга значения вокруг.
// Разметка: <div class="knob" data-param="a.tune" data-label="ВЫСОТА" data-channel="a" data-default="0.4"></div>
//   data-param   — путь параметра в состоянии ('*' — текущая цепочка эффектов)
//   data-channel — тип линии дуги: a — сплошная 2px, b — двойная, p — пунктир, * — как у текущей цепочки; без него — сплошная 1.25px
//   data-size    — диаметр в px (по умолчанию из CSS, 60); data-default — значение по двойному клику
//   data-format, data-hint — формат значения и подсказка; data-bipolar — дуга растёт от середины (панорама)
//   data-sign    — знак канала перед подписью: a | b | p | m
//
// Управление: зажать и вести курсор вокруг ручки — риска смотрит на курсор.
// Колесо, стрелки клавиатуры, Home/End, двойной клик — сброс.

import { readParam, setParam } from '../state/store.js';
import { FORMATS, clamp01 } from './format.js';
import { sign } from './signs.js';

const START = -135;  // угол минимума: 0° — вверх, по часовой стрелке
const SWEEP = 270;
const CHANNELS = ['a', 'b', 'p'];

// Точка на окружности радиуса r в системе viewBox (центр 0,0; 0° — вверх)
const at = (deg, r) => {
  const t = (deg * Math.PI) / 180;
  return [r * Math.sin(t), -r * Math.cos(t)];
};
const f = (n) => Math.round(n * 100) / 100;
// Дуга от угла a0 до a1 (a0 < a1) по часовой стрелке
function arc(a0, a1, r) {
  if (a1 - a0 < 0.4) return '';
  const [x0, y0] = at(a0, r);
  const [x1, y1] = at(a1, r);
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
}

export function mountKnob(el, store) {
  const d = el.dataset;
  const fmt = FORMATS[d.format] || FORMATS.percent;
  const def = d.default != null ? Number(d.default) : 0.5;
  const bipolar = d.bipolar != null;
  const name = d.hint || d.label || '';
  if (d.size) el.style.setProperty('--knob-size', `${d.size}px`);   // без data-size размер задаёт CSS

  // Радиусы: кольцо 21, дуга A — 26, B — две дуги 25 и 28, Ч — 26.5; фоновая дорожка — волосяная
  const [t0x, t0y] = at(START, 24), [t0x2, t0y2] = at(START, 30);
  const [t1x, t1y] = at(START + SWEEP, 24), [t1x2, t1y2] = at(START + SWEEP, 30);
  el.innerHTML = `
    <div class="knob__dial" role="slider" tabindex="0" aria-label="${name}" title="${name}" aria-valuemin="0" aria-valuemax="100">
      <svg class="knob__svg" viewBox="-32 -32 64 64" aria-hidden="true">
        <path class="knob__rail" d="${arc(START, START + SWEEP, 27)}"/>
        <path class="knob__end" d="M${f(t0x)} ${f(t0y)}L${f(t0x2)} ${f(t0y2)}M${f(t1x)} ${f(t1y)}L${f(t1x2)} ${f(t1y2)}"/>
        <path class="knob__arc knob__arc--solid"/>
        <path class="knob__arc knob__arc--b1"/>
        <path class="knob__arc knob__arc--b2"/>
        <path class="knob__arc knob__arc--dots"/>
        <circle class="knob__ring" r="20.5"/>
        <g class="knob__pointer"><path class="knob__tick" d="M0 -5V-20.5"/></g>
      </svg>
      <span class="knob__bubble" hidden></span>
    </div>
    ${d.label ? `<span class="knob__label">${d.sign ? sign(d.sign) : ''}${d.label}</span>` : ''}`;

  const dial = el.querySelector('.knob__dial');
  const pointer = el.querySelector('.knob__pointer');
  const bubble = el.querySelector('.knob__bubble');
  const arcs = {
    solid: el.querySelector('.knob__arc--solid'),
    b1: el.querySelector('.knob__arc--b1'),
    b2: el.querySelector('.knob__arc--b2'),
    dots: el.querySelector('.knob__arc--dots'),
  };
  let value = 0;
  let dragging = false;

  const set = (v) => store.update((s) => setParam(s, d.param, clamp01(v)));

  const pointAt = (e, first) => {
    const r = dial.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.08) return;           // у самого центра угол «дрожит»
    const a = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (a >= START && a <= START + SWEEP) set((a - START) / SWEEP);
    else if (!first) set(value >= 0.5 ? 1 : 0);                // «пустой» сектор снизу — упор в край
  };

  dial.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    dial.focus();
    dial.setPointerCapture(e.pointerId);
    dragging = true;
    el.classList.add('is-drag');
    bubble.hidden = false;
    pointAt(e, true);
  });
  dial.addEventListener('pointermove', (e) => dragging && pointAt(e, false));
  const end = () => {
    dragging = false;
    el.classList.remove('is-drag');
    bubble.hidden = true;
  };
  dial.addEventListener('pointerup', end);
  dial.addEventListener('pointercancel', end);
  dial.addEventListener('wheel', (e) => { e.preventDefault(); set(value - Math.sign(e.deltaY) * 0.03); }, { passive: false });
  dial.addEventListener('dblclick', () => set(def));
  dial.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 0.02, ArrowRight: 0.02, ArrowDown: -0.02, ArrowLeft: -0.02 }[e.key];
    if (step) { e.preventDefault(); set(value + step); }
    if (e.key === 'Home') { e.preventDefault(); set(0); }
    if (e.key === 'End') { e.preventDefault(); set(1); }
  });

  return function update(state) {
    value = readParam(state, d.param);
    const angle = START + SWEEP * value;
    pointer.setAttribute('transform', `rotate(${f(angle)})`);
    const mid = START + SWEEP / 2;
    const [a0, a1] = bipolar ? [Math.min(mid, angle), Math.max(mid, angle)] : [START, angle];
    arcs.solid.setAttribute('d', arc(a0, a1, 26));
    arcs.b1.setAttribute('d', arc(a0, a1, 24.8));
    arcs.b2.setAttribute('d', arc(a0, a1, 28));
    arcs.dots.setAttribute('d', arc(a0, a1, 26.5));
    dial.setAttribute('aria-valuenow', Math.round(value * 100));
    dial.setAttribute('aria-valuetext', fmt(value));
    bubble.textContent = fmt(value);
    const ch = d.channel === '*' ? state.fxTarget : d.channel;
    CHANNELS.forEach((c) => el.classList.toggle(`knob--${c}`, c === ch));
  };
}
