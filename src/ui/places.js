// Блок .places — готовые места-пресеты (клавиши 1–5). Лежит внутри рекордера, между таймером и транспортом.
// Одно и то же место всегда настраивает один и тот же звук. Поиска по строке нет: свои места — только через ?place=… в адресе.
// mountPlaces(el, store) → update(state); tuneTo(store, query) — настроить прибор и записать место в адрес.

import { PRESETS, placeToState, normalizeQuery } from '../state/place.js';

/** Настроить прибор на место и записать его в адрес страницы (?place=…). */
export function tuneTo(store, query) {
  const q = normalizeQuery(query);
  if (!q) return;
  store.update((s) => placeToState(q, s.fxTarget));
  try {
    history.replaceState(null, '', `${location.pathname}?place=${encodeURIComponent(q)}${location.hash}`);
  } catch { /* адрес менять нельзя (например, во встроенном окне) — не страшно */ }
}

export function mountPlaces(el, store) {
  el.innerHTML = PRESETS.map((p, i) => `
    <button type="button" class="places__item" data-index="${i}" aria-pressed="false" title="${p.query} — клавиша ${i + 1}">
      <span class="places__name">${p.label}</span>
    </button>`).join('');

  const items = [...el.querySelectorAll('.places__item')];
  items.forEach((item) => item.addEventListener('click', () => tuneTo(store, PRESETS[Number(item.dataset.index)].query)));

  return function update(state) {
    const current = state.place?.query ?? '';
    items.forEach((b, i) => {
      const on = current === PRESETS[i].query;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
}
