// Блок .hud — название места крупно поверх неба: надпись-оверлайн, место, «время · погода · шаг».
// mountHud(el) → update(state, live). Шаг обновляется отдельно и дёшево — меняется только текст.

const WEATHER = { wind: 'ВЕТЕР', rain: 'ДОЖДЬ', storm: 'ГРОЗА', forest: 'ЛЕС', alien: 'ЧУЖОЕ НЕБО' };
const two = (n) => String(n).padStart(2, '0');

export function mountHud(el) {
  el.innerHTML = `
    <p class="hud__overline">EXPERIMENTAL SOUND SYNTHESIZER · ПОЛЕВОЙ РЕКОРДЕР НЕСУЩЕСТВУЮЩИХ МЕСТ</p>
    <h1 class="hud__place"></h1>
    <p class="hud__meta"><span class="hud__info"></span><span class="hud__step"></span></p>
    <p class="hud__hint">ПРОБЕЛ — НАСТРОИТЬСЯ НА МЕСТО</p>`;
  const place = el.querySelector('.hud__place');
  const info = el.querySelector('.hud__info');
  const stepEl = el.querySelector('.hud__step');
  const hint = el.querySelector('.hud__hint');
  let key = '', step = null;      // что сейчас выведено: чтобы не трогать DOM зря

  return function update(state, live = {}) {
    const p = state.place || {};
    const k = `${p.name}|${p.time}|${p.weather}`;
    if (k !== key) {
      key = k;
      place.textContent = p.name || '';
      info.textContent = `${p.time || ''} · ${WEATHER[p.weather] || String(p.weather || '').toUpperCase()}`;
    }
    const s = live.playing && live.step >= 0 ? ` · ШАГ ${two(live.step + 1)}/16` : '';
    if (s !== step) { step = s; stepEl.textContent = s; }
    hint.hidden = !!live.playing;
  };
}
