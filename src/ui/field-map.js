// Блок .field-map — план местности = микшер.
// Слушатель стоит внизу по центру, три источника (ВОЗДУХ, СТИХИЯ, ЧАСТИЦЫ) — вокруг него.
// Ближе — громче (mix.<канал>), левее/правее — панорама (pan.<канал>). Общую громкость и тон здесь не трогаем.

import { setParam } from '../state/store.js';
import { FORMATS, clamp01 } from './format.js';

const CHANNELS = [
  { id: 'a', letter: 'A', name: 'ВОЗДУХ' },
  { id: 'b', letter: 'B', name: 'СТИХИЯ' },
  { id: 'p', letter: 'Ч', name: 'ЧАСТИЦЫ' },
];
const STEP = 0.03;
const DEFAULT = { pan: 0.5, mix: 0.7 };

// Неровные кольца-горизонтали: центр — слушатель (внизу посередине). Растягиваем по размеру карты.
const RINGS = [
  'M110 118 C 140 112 160 96 154 80 C 148 66 120 62 100 66 C 76 70 62 86 72 102 C 80 114 96 120 110 118 Z',
  'M110 124 C 160 118 196 96 188 66 C 180 38 134 30 98 36 C 56 44 30 72 44 100 C 56 122 84 126 110 124 Z',
  'M110 128 C 178 124 226 92 214 52 C 204 14 150 6 100 12 C 40 20 6 58 18 98 C 28 124 70 130 110 128 Z',
];

export function mountFieldMap(el, store) {
  el.innerHTML = `
    <h2 class="field-map__title">ПЛАН МЕСТНОСТИ</h2>
    <div class="field-map__area">
      <svg class="field-map__contours" viewBox="0 0 220 130" preserveAspectRatio="none" aria-hidden="true">
        ${RINGS.map((d) => `<path d="${d}"/>`).join('')}
        <path class="field-map__axis" d="M110 0V130"/>
      </svg>
      <div class="field-map__plane">
        ${CHANNELS.map((c) => `
          <div class="field-map__marker field-map__marker--${c.id}" data-ch="${c.id}" role="slider" tabindex="0"
               aria-label="${c.name}: расстояние и сторона" aria-valuemin="0" aria-valuemax="100"
               title="${c.name} — ближе: громче, в сторону: панорама">
            <span class="field-map__ring" aria-hidden="true"></span>
            <span class="field-map__dot" aria-hidden="true"></span>
            <span class="field-map__label" aria-hidden="true">${c.letter}<span class="field-map__full"> ${c.name}</span></span>
          </div>`).join('')}
      </div>
      <div class="field-map__listener" aria-hidden="true">
        <svg viewBox="0 0 28 18" width="28" height="18">
          <path class="field-map__ear" d="M5 14a9 9 0 0 1 18 0M9 14a5 5 0 0 1 10 0"/>
          <circle class="field-map__you" cx="14" cy="14.5" r="2.4"/>
        </svg>
        <span class="field-map__you-label">ВЫ</span>
      </div>
    </div>
    <p class="field-map__legend">ближе — громче · в сторону — панорама</p>`;

  const plane = el.querySelector('.field-map__plane');
  const markers = Object.fromEntries(CHANNELS.map((c) => [c.id, el.querySelector(`.field-map__marker--${c.id}`)]));
  const levels = { a: -1, b: -1, p: -1 };   // что сейчас записано в --level (-1 — ещё ничего)

  // Пан и громкость канала — одним обновлением состояния
  function place(ch, pan, mix) {
    pan = clamp01(pan); mix = clamp01(mix);
    store.update((s) => (s.pan[ch] === pan && s.mix[ch] === mix
      ? s
      : setParam(setParam(s, `pan.${ch}`, pan), `mix.${ch}`, mix)));
  }

  CHANNELS.forEach(({ id }) => {
    const m = markers[id];
    let drag = null;   // { pointerId, dx, dy }: смещение курсора от центра маркера в момент хвата

    m.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = plane.getBoundingClientRect();
      const s = store.get();
      m.setPointerCapture(e.pointerId);
      drag = {
        pointerId: e.pointerId,
        dx: e.clientX - (r.left + s.pan[id] * r.width),
        dy: e.clientY - (r.top + (1 - s.mix[id]) * r.height),
      };
      m.classList.add('is-drag');
      m.focus({ preventScroll: true });
      e.preventDefault();
    });
    m.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const r = plane.getBoundingClientRect();
      place(id, (e.clientX - drag.dx - r.left) / r.width, 1 - (e.clientY - drag.dy - r.top) / r.height);
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      drag = null;
      m.classList.remove('is-drag');
    };
    m.addEventListener('pointerup', end);
    m.addEventListener('pointercancel', end);
    m.addEventListener('mouseenter', () => m.classList.add('is-hover'));
    m.addEventListener('mouseleave', () => m.classList.remove('is-hover'));
    m.addEventListener('dblclick', () => place(id, DEFAULT.pan, DEFAULT.mix));

    // ←→ — панорама, ↑↓ — расстояние (стрелка вверх уводит источник дальше, как на карте)
    m.addEventListener('keydown', (e) => {
      const s = store.get();
      const d = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }[e.key];
      if (d) {
        e.preventDefault();
        place(id, s.pan[id] + d[0], s.mix[id] + d[1]);
      }
    });
  });

  function update(state) {
    CHANNELS.forEach(({ id }) => {
      const m = markers[id];
      const pan = state.pan[id], mix = state.mix[id];
      m.style.left = `${pan * 100}%`;
      m.style.top = `${(1 - mix) * 100}%`;
      m.classList.toggle('is-right', pan > 0.6);
      m.setAttribute('aria-valuenow', Math.round(mix * 100));
      m.setAttribute('aria-valuetext', `громкость ${FORMATS.percent(mix)}, панорама ${FORMATS.pan(pan)}`);
    });
  }

  // Уровни каналов от движка (0..1) — кольцо вокруг маркера; null — тишина, кольца нет
  function setLevels(meters) {
    CHANNELS.forEach(({ id }) => {
      const v = meters ? Math.round(clamp01(meters[id] ?? 0) * 100) / 100 : 0;
      if (v === levels[id]) return;
      levels[id] = v;
      markers[id].style.setProperty('--level', v);
      markers[id].classList.toggle('has-level', v > 0.01);
    });
  }

  return { update, setLevels };
}
