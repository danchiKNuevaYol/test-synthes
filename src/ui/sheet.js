// Блок .sheet — ЛИСТ НАБЛЮДЕНИЯ: выезжающая слева панель точных настроек голоса A (воздух) или B (стихия).
// open(voice) рисует свежие ручки внутри и переводит фокус на «Закрыть»; close() возвращает фокус туда, где он был.

import { mountSlider } from './slider.js';
import { mountWaveSwitch } from './wave-switch.js';
import { sign } from './signs.js';

const VOICES = {
  a: {
    title: 'Воздух',
    text: 'Небо места: ветер, гул, шелест. Облако в небе — это он.',
    sliders: [
      { param: 'a.tune', label: 'ВЫСОТА', format: 'hz-a', def: 0.4 },
      { param: 'a.shape', label: 'ПЛОТНОСТЬ', def: 0.5 },
      { param: 'a.mod', label: 'ПОРЫВЫ', def: 0.4 },
      { param: 'a.level', label: 'СИЛА', def: 0.7 },
    ],
  },
  b: {
    title: 'Стихия',
    text: 'Горизонт: свист, вибрации, раскаты. Линия горизонта — это он.',
    sliders: [
      { param: 'b.tune', label: 'ВЫСОТА', format: 'hz-b', def: 0.5 },
      { param: 'b.texture', label: 'ЗЕРНО', def: 0.4 },
      { param: 'b.mod', label: 'ДРОЖЬ', def: 0.4 },
      { param: 'b.level', label: 'СИЛА', def: 0.5 },
    ],
  },
};

const CLOSE_ICON = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8"/></svg>';
const SIGN = { a: 'a', b: 'b' };   // знак голоса: A — ○ (сплошная линия), B — ═ (двойная)
const FADE_MS = 200;

export function mountSheet(el, store) {
  let voice = null;
  let opened = false;
  let updates = [];
  let returnTo = null;
  let hideTimer = 0;
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function render(v) {
    const cfg = VOICES[v];
    el.dataset.voice = v;
    el.setAttribute('aria-label', `Лист наблюдения — ${cfg.title}`);
    el.innerHTML = `
      <button type="button" class="sheet__close" aria-label="Закрыть" title="Закрыть (Esc)">${CLOSE_ICON}</button>
      <p class="sheet__overline">ЛИСТ НАБЛЮДЕНИЯ</p>
      <div class="sheet__head">${sign(SIGN[v])}<h2 class="sheet__headline">${cfg.title}</h2></div>
      <p class="sheet__text">${cfg.text}</p>
      <p class="sheet__caption">ФОРМА ЗВУКА</p>
      <div class="wave-switch" data-param="${v}.wave" data-channel="${v}"></div>
      <div class="sheet__sliders">
        ${cfg.sliders.map((s) => `<div class="slider" data-param="${s.param}" data-label="${s.label}" data-channel="${v}"
          data-default="${s.def}"${s.format ? ` data-format="${s.format}"` : ''}></div>`).join('')}
      </div>`;
    updates = [
      mountWaveSwitch(el.querySelector('.wave-switch'), store),
      ...[...el.querySelectorAll('.slider')].map((s) => mountSlider(s, store)),
    ];
    updates.forEach((u) => u(store.get()));
    el.querySelector('.sheet__close').addEventListener('click', close);
  }

  function open(v) {
    if (!VOICES[v]) return;
    clearTimeout(hideTimer);
    if (!opened) returnTo = document.activeElement;
    opened = true;
    voice = v;
    render(v);
    el.hidden = false;
    document.body.classList.add('is-sheet-open');   // план местности уступает место листу
    if (reduced()) el.classList.add('is-open');
    else {
      el.classList.remove('is-open');
      void el.offsetWidth; // чтобы переход сработал с начала
      requestAnimationFrame(() => el.classList.add('is-open'));
    }
    el.querySelector('.sheet__close').focus({ preventScroll: true });
  }

  function close() {
    if (!opened) return;
    opened = false;
    voice = null;
    document.body.classList.remove('is-sheet-open');
    el.classList.remove('is-open');
    const hide = () => { if (!opened) { el.hidden = true; updates = []; } };
    if (reduced()) hide();
    else hideTimer = setTimeout(hide, FADE_MS);
    const back = returnTo;
    returnTo = null;
    if (back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
  }

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && opened) { e.stopPropagation(); close(); }
  });

  return {
    update(state) { if (opened) updates.forEach((u) => u(state)); },
    open,
    close,
    isOpen: () => opened,
  };
}
