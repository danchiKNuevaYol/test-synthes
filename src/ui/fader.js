// Блок .fader — вертикальный фейдер: волосяная дорожка и квадратный бегунок в рамке 1px.
// Разметка: <div class="fader" data-param="mix.a" data-label="A" data-channel="a" data-default="0.7"></div>
//   data-channel — тип линии заливки под бегунком: a — сплошная, b — двойная, p — пунктир; без него — сплошная тонкая
// Тянуть бегунок или кликнуть по дорожке; колесо, стрелки ↑↓ и двойной клик (значение по умолчанию) тоже работают.

import { readParam, setParam } from '../state/store.js';
import { clamp01 } from './format.js';

const THUMB = 14; // сторона бегунка, px

export function mountFader(el, store) {
  const d = el.dataset;
  const def = d.default != null ? Number(d.default) : 0.7;
  if (d.channel) el.classList.add(`fader--${d.channel}`);
  el.innerHTML = `
    <div class="fader__track" role="slider" tabindex="0" aria-orientation="vertical"
         aria-label="Громкость: ${d.label}" title="Громкость: ${d.label}" aria-valuemin="0" aria-valuemax="100">
      <div class="fader__ticks"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="fader__rail"><div class="fader__fill"></div></div>
      <div class="fader__thumb"></div>
    </div>`;

  const track = el.querySelector('.fader__track');
  let value = 0;
  let dragging = false;

  const set = (v) => store.update((s) => setParam(s, d.param, clamp01(v)));
  // Положение курсора на дорожке → 0..1 (концы отступают на половину бегунка)
  const fromY = (e) => {
    const r = track.getBoundingClientRect();
    const inner = r.height - THUMB;
    if (inner > 0) set(1 - (e.clientY - r.top - THUMB / 2) / inner);
  };

  track.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    track.focus();
    track.setPointerCapture(e.pointerId);
    dragging = true;
    el.classList.add('is-drag');
    fromY(e);
  });
  track.addEventListener('pointermove', (e) => dragging && fromY(e));
  const end = () => { dragging = false; el.classList.remove('is-drag'); };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('wheel', (e) => { e.preventDefault(); set(value - Math.sign(e.deltaY) * 0.04); }, { passive: false });
  track.addEventListener('dblclick', () => set(def));
  track.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 0.04, ArrowRight: 0.04, ArrowDown: -0.04, ArrowLeft: -0.04 }[e.key];
    if (step) { e.preventDefault(); set(value + step); }
    if (e.key === 'Home') { e.preventDefault(); set(0); }
    if (e.key === 'End') { e.preventDefault(); set(1); }
  });

  return function update(state) {
    value = readParam(state, d.param);
    el.style.setProperty('--v', value);
    track.setAttribute('aria-valuenow', Math.round(value * 100));
    track.setAttribute('aria-valuetext', `${Math.round(value * 100)}%`);
  };
}
