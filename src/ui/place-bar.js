// Блок .place-bar — строка «Куда отправимся?»: место и время, пресеты-места (клавиши 1–5).
// Строка лежит в верхнем ряду прибора. Одна и та же строка всегда настраивает один и тот же звук.

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

export function mountPlaceBar(el, store) {
  el.innerHTML = `
    <input class="place-bar__input" type="text" spellcheck="false" autocomplete="off" maxlength="60"
      placeholder="Куда отправимся? Место и время…" aria-label="Место и время, например: Озеро Тишины, 4:12">
    <button type="submit" class="place-bar__go" title="Настроить прибор на это место — Enter">НАСТРОИТЬ ↵</button>
    <i class="place-bar__sep" aria-hidden="true"></i>
    <span class="place-bar__chips">${PRESETS.map((p, i) => `
    <button type="button" class="place-bar__chip" data-index="${i}" title="${p.query} — клавиша ${i + 1}">${p.label}</button>`).join('')}</span>`;

  const input = el.querySelector('.place-bar__input');
  const chips = [...el.querySelectorAll('.place-bar__chip')];
  let current = '';

  // форма: Enter и кнопка «Настроить»
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = normalizeQuery(input.value);
    input.blur();
    if (q) tuneTo(store, q);
    else input.value = current;
  });

  chips.forEach((chip) => chip.addEventListener('click', () => {
    const { query } = PRESETS[Number(chip.dataset.index)];
    input.value = query;
    input.blur();
    tuneTo(store, query);
  }));

  // недописанный текст не остаётся в поле: после ухода фокуса снова видно, где мы сейчас
  input.addEventListener('blur', () => { input.value = current; });

  return function update(state) {
    current = state.place?.query ?? '';
    chips.forEach((c, i) => c.classList.toggle('is-on', current === PRESETS[i].query));
    if (document.activeElement !== input) input.value = current;
  };
}
