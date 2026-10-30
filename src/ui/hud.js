// Блок .hud — название места крупно поверх неба: надпись-оверлайн, место, «время · погода · тональность · шаг».
// mountHud(el) → update(state, live); update.flash(имя ноты) — на мгновение показывает сыгранную ноту.
// Шаг обновляется отдельно и дёшево — меняется только текст.

import { keyLabel } from '../state/music.js';

const WEATHER = { wind: 'ВЕТЕР', rain: 'ДОЖДЬ', storm: 'ГРОЗА', forest: 'ЛЕС', alien: 'ЧУЖОЕ НЕБО' };
const DEFAULT_KEY = { root: 9, scale: 'minor' };   // пока в состоянии нет тональности — ЛЯ МИНОР
const two = (n) => String(n).padStart(2, '0');

export function mountHud(el) {
  el.innerHTML = `
    <p class="hud__overline">EXPERIMENTAL SOUND SYNTHESIZER · ПОЛЕВОЙ РЕКОРДЕР НЕСУЩЕСТВУЮЩИХ МЕСТ</p>
    <h1 class="hud__place"></h1>
    <p class="hud__meta"><span class="hud__info"></span><span class="hud__step"></span><span class="hud__note" aria-hidden="true"></span></p>
    <p class="hud__hint">ПРОБЕЛ — НАСТРОИТЬСЯ НА МЕСТО</p>`;
  const place = el.querySelector('.hud__place');
  const info = el.querySelector('.hud__info');
  const stepEl = el.querySelector('.hud__step');
  const noteEl = el.querySelector('.hud__note');
  const hint = el.querySelector('.hud__hint');
  let shown = '', step = null, noteTimer = 0;      // что сейчас выведено: чтобы не трогать DOM зря

  function update(state, live = {}) {
    const p = state.place || {};
    const key = state.key || DEFAULT_KEY;
    const k = `${p.name}|${p.time}|${p.weather}|${key.root}|${key.scale}`;
    if (k !== shown) {
      shown = k;
      place.textContent = p.name || '';
      info.textContent = `${p.time || ''} · ${WEATHER[p.weather] || String(p.weather || '').toUpperCase()} · ${keyLabel(key)}`;
    }
    const s = live.playing && live.step >= 0 ? ` · ШАГ ${two(live.step + 1)}/16` : '';
    if (s !== step) { step = s; stepEl.textContent = s; }
    hint.hidden = !!live.playing;
  }
  // имя только что сыгранной ноты — на 450 мс в конце строки
  update.flash = (name) => {
    noteEl.textContent = name ? ` · ♪ ${name}` : '';
    clearTimeout(noteTimer);
    if (name) noteTimer = setTimeout(() => { noteEl.textContent = ''; }, 450);
  };
  return update;
}
