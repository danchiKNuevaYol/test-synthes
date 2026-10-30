// Блок .recorder — запись экспедиции: кнопка REC, таймер, старт/стоп/скачать, темп, ОБЩИЙ и СОЛНЦЕ.
// mountRecorder(el, store, actions) → { update(ui), tick(seconds) }; actions = { play, stop, toggleRec, save }.
// Все значки — инлайн SVG (символы вроде «⭳» в системных шрифтах нет).

import { mountSlider } from './slider.js';

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const BPM = { min: 40, max: 200, step: 2 };

const ICONS = {
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5v11l9-5.5z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="currentColor"/></svg>',
  save: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13.5h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function mountRecorder(el, store, actions) {
  el.innerHTML = `
    <h2 class="recorder__title">РЕКОРДЕР · ЭКСПЕДИЦИЯ</h2>
    <div class="recorder__main">
      <button type="button" class="recorder__rec" aria-pressed="false" aria-label="Запись (R)" title="Запись — R">
        <svg viewBox="0 0 48 48" aria-hidden="true"><circle class="recorder__ring" cx="24" cy="24" r="22" fill="none" stroke-width="1.5"/><circle class="recorder__core" cx="24" cy="24" r="14"/></svg>
      </button>
      <div class="recorder__readout">
        <output class="recorder__time" aria-live="off">00:00</output>
        <span class="recorder__status" aria-live="polite">ГОТОВ К ЗАПИСИ</span>
      </div>
    </div>
    <div class="recorder__row">
      <div class="recorder__transport">
        <button type="button" class="recorder__btn" data-action="play" aria-label="Старт" title="Старт — пробел">${ICONS.play}</button>
        <button type="button" class="recorder__btn" data-action="stop" aria-label="Стоп" title="Стоп — пробел">${ICONS.stop}</button>
        <button type="button" class="recorder__btn" data-action="save" aria-label="Скачать запись (WAV)" title="Скачать запись (WAV)">${ICONS.save}</button>
      </div>
      <div class="recorder__tempo" role="group" aria-label="Темп">
        <span class="recorder__label">ТЕМП</span>
        <button type="button" class="recorder__step" data-bpm="-1" aria-label="Темп медленнее">−</button>
        <output class="recorder__bpm">78</output>
        <button type="button" class="recorder__step" data-bpm="1" aria-label="Темп быстрее">+</button>
      </div>
    </div>
    <div class="recorder__sliders">
      <div class="slider" data-param="mix.master" data-label="ОБЩИЙ" data-default="0.8"></div>
      <div class="slider" data-param="tone" data-label="СОЛНЦЕ" data-default="0.75"></div>
    </div>`;

  const q = (s) => el.querySelector(s);
  const rec = q('.recorder__rec'), time = q('.recorder__time'), status = q('.recorder__status');
  const play = q('[data-action="play"]'), stop = q('[data-action="stop"]'), save = q('[data-action="save"]');
  const bpm = q('.recorder__bpm');

  rec.addEventListener('click', () => actions.toggleRec());
  play.addEventListener('click', () => actions.play());
  stop.addEventListener('click', () => actions.stop());
  save.addEventListener('click', () => actions.save());

  // темп: шаг 2 в пределах 40..200
  el.querySelectorAll('[data-bpm]').forEach((b) => b.addEventListener('click', () => {
    const d = Number(b.dataset.bpm) * BPM.step;
    store.update((s) => {
      const v = Math.min(BPM.max, Math.max(BPM.min, s.bpm + d));
      return v === s.bpm ? s : { ...s, bpm: v };
    });
  }));

  // ползунки рисует slider.js; значения берут из хранилища
  const sliders = [...el.querySelectorAll('.slider')].map((s) => mountSlider(s, store));
  function onState(state) {
    bpm.textContent = String(state.bpm);
    sliders.forEach((u) => u?.(state));
  }
  store.subscribe(onState);
  onState(store.get());

  return {
    update({ playing, rec: mode, hasTake }) {
      const recording = mode === 'recording';
      rec.classList.toggle('is-on', recording);
      rec.setAttribute('aria-pressed', String(recording));
      rec.disabled = mode === 'saving';
      play.classList.toggle('is-on', playing);
      save.disabled = !hasTake || recording;
      status.textContent = recording ? 'ИДЁТ ЗАПИСЬ' : mode === 'saving' ? 'СОХРАНЕНИЕ…' : hasTake ? 'ЗАПИСЬ ГОТОВА' : 'ГОТОВ К ЗАПИСИ';
    },
    tick(seconds) {
      time.textContent = mmss(seconds);
    },
  };
}
