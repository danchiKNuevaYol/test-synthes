// Блок .slider — тонкий горизонтальный регулятор: название слева, значение справа.
// Разметка: <div class="slider" data-param="a.tune" data-label="ВЫСОТА" data-format="hz-a" data-default="0.4" data-channel="a"></div>
//   data-param   — путь параметра ('*' — текущая цепочка эффектов, fxTarget)
//   data-channel — тип линии заливки: a — сплошная, b — двойная, p — пунктир, * (линия текущей цепочки); без него — сплошная
//   data-sign    — знак канала перед названием: a | b | p | m (общий)
//   data-bipolar — заливка растёт от середины (панорама); data-hint — подсказка; data-format, data-default — вид значения и значение по двойному клику
//
// Управление: перетаскивание и клик по дорожке, колесо, стрелки ±0.02, Home/End, двойной клик.

import { readParam, setParam } from '../state/store.js';
import { FORMATS, clamp01 } from './format.js';
import { sign } from './signs.js';

const CHANNELS = ['a', 'b', 'p'];

export function mountSlider(el, store) {
  const d = el.dataset;
  const fmt = FORMATS[d.format] || FORMATS.percent;
  const def = d.default != null ? Number(d.default) : 0.5;
  const label = d.label || '';
  if (d.hint) el.title = d.hint;
  const bipolar = d.bipolar !== undefined;
  el.innerHTML = `
    <div class="slider__head">
      <span class="slider__label">${d.sign ? sign(d.sign) : ''}${label}</span>
      <span class="slider__value"></span>
    </div>
    <div class="slider__track" role="slider" tabindex="0" aria-label="${label || d.param}" aria-valuemin="0" aria-valuemax="100">
      <div class="slider__rail"><div class="slider__fill"></div></div>
      <div class="slider__thumb"></div>
    </div>`;

  const track = el.querySelector('.slider__track');
  const rail = el.querySelector('.slider__rail');
  const thumbEl = el.querySelector('.slider__thumb');
  const valueEl = el.querySelector('.slider__value');
  let value = 0;
  let dragging = false;

  const set = (v) => store.update((s) => setParam(s, d.param, clamp01(v)));

  // Положение курсора на дорожке → 0..1 (края отступают на радиус бегунка)
  const fromPointer = (e) => {
    const r = rail.getBoundingClientRect();
    const thumb = thumbEl.offsetWidth * (r.width / (rail.offsetWidth || 1));   // с учётом масштаба прибора
    const inner = r.width - thumb;
    return inner > 0 ? (e.clientX - r.left - thumb / 2) / inner : 0;
  };

  track.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    track.focus();
    track.setPointerCapture(e.pointerId);
    dragging = true;
    el.classList.add('is-drag');
    set(fromPointer(e));
  });
  track.addEventListener('pointermove', (e) => dragging && set(fromPointer(e)));
  const end = () => {
    dragging = false;
    el.classList.remove('is-drag');
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => { e.preventDefault(); set(value - Math.sign(e.deltaY) * 0.03); }, { passive: false });
  el.addEventListener('dblclick', () => set(def));
  track.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 0.02, ArrowRight: 0.02, ArrowDown: -0.02, ArrowLeft: -0.02 }[e.key];
    if (step) { e.preventDefault(); set(value + step); }
    if (e.key === 'Home') { e.preventDefault(); set(0); }
    if (e.key === 'End') { e.preventDefault(); set(1); }
  });

  return function update(state) {
    value = readParam(state, d.param);
    el.style.setProperty('--v', value);
    el.style.setProperty('--lo', bipolar ? Math.min(value, 0.5) : 0);
    el.style.setProperty('--hi', bipolar ? Math.max(value, 0.5) : value);
    valueEl.textContent = fmt(value);
    track.setAttribute('aria-valuenow', Math.round(value * 100));
    track.setAttribute('aria-valuetext', fmt(value));
    const color = d.channel === '*' ? state.fxTarget : d.channel;
    CHANNELS.forEach((c) => el.classList.toggle(`slider--${c}`, c === color));
  };
}
