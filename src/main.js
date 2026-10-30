// Точка входа: собирает пейзаж и ручки внутри него из разметки index.html.
// Каждый блок интерфейса — модуль в src/ui/ с тем же именем, что и CSS-класс блока.

import { createStore } from './state/store.js';
import { PRESETS, placeToState, normalizeQuery } from './state/place.js';
import { engine } from './audio/engine.js';
import { uiTheme } from './world/palette.js';
import { mountWorld } from './ui/world.js';
import { mountSkyHandle } from './ui/sky-handle.js';
import { mountHorizonHandle } from './ui/horizon-handle.js';
import { mountHud } from './ui/hud.js';
import { mountPlaceBar, tuneTo } from './ui/place-bar.js';
import { mountSheet } from './ui/sheet.js';
import { mountWeatherKit } from './ui/weather-kit.js';
import { mountFieldMap } from './ui/field-map.js';
import { mountTrail } from './ui/trail.js';
import { mountRecorder } from './ui/recorder.js';
import { mountHintLine } from './ui/hint-line.js';

const $ = (s) => document.querySelector(s);

// Место берётся из адреса (?place=Озеро Тишины, 4:12) — так прибором делятся ссылкой
const startQuery = normalizeQuery(new URLSearchParams(location.search).get('place') || '') || PRESETS[0].query;
const store = createStore(placeToState(startQuery));
const live = { state: store.get(), step: -1, playing: false, recording: false };   // для пейзажа (p5) и заголовка

// --- блоки: порядок монтирования важен только для стопки слоёв (она задана в CSS)
const ui = { openSheet: (voice) => sheet.open(voice) };   // sheet появится ниже — к клику он уже есть
const world = mountWorld($('.world'), store, live);
const skyHandle = mountSkyHandle($('.sky-handle'), store, ui);
const horizonHandle = mountHorizonHandle($('.horizon-handle'), store, ui);
const hud = mountHud($('.hud'));
const placeBar = mountPlaceBar($('.place-bar'), store);
const sheet = mountSheet($('.sheet'), store);
const weatherKit = mountWeatherKit($('.weather-kit'), store);
const fieldMap = mountFieldMap($('.field-map'), store);
const trail = mountTrail($('.trail'), store);
const recorder = mountRecorder($('.recorder'), store, { play, stop, toggleRec, save });
mountHintLine($('.hint-line'));

// --- нижняя кромка .hud в пикселях: по ней лист наблюдения (CSS-переменная --hud-bottom) узнаёт, докуда ему расти вверх
function syncHudBottom() {
  const bottom = Math.ceil($('.hud').getBoundingClientRect().bottom);
  document.documentElement.style.setProperty('--hud-bottom', `${bottom}px`);
}
// ResizeObserver ловит смену места, подсказки при простое и перенос строк; resize — на случай смены окна
if (typeof ResizeObserver === 'function') new ResizeObserver(syncHudBottom).observe($('.hud'));
window.addEventListener('resize', syncHudBottom);

// --- тема времени суток: CSS-переменные на <html> при смене времени или погоды
let themeKey = '';
function applyTheme(place) {
  const key = `${place.minutes}|${place.weather}`;
  if (key === themeKey) return;
  themeKey = key;
  const vars = uiTheme(place.minutes, place.weather);
  Object.entries(vars).forEach(([name, value]) => document.documentElement.style.setProperty(name, value));
}

const views = [world, skyHandle, horizonHandle, placeBar, sheet.update, weatherKit, fieldMap.update, trail.update];
function render(state) {
  live.state = state;
  applyTheme(state.place);
  views.forEach((update) => update(state));
  hud(state, live);
  syncHudBottom();
  engine.apply(state);
}
store.subscribe(render);
render(store.get());

engine.onStep((i) => { live.step = i; trail.setStep(i); hud(live.state, live); });

// --- транспорт и запись
const transport = { playing: false, rec: 'idle', hasTake: false };
function setUi(patch) {
  Object.assign(transport, patch);
  live.playing = transport.playing;
  live.recording = transport.rec === 'recording';
  if (!transport.playing) { live.step = -1; trail.setStep(-1); }
  recorder.update(transport);
  hud(live.state, live);
  syncHudBottom();   // подсказка в .hud появляется только при простое
}
setUi({});

async function play() {
  await engine.play();
  setUi({ playing: true });
}
async function finishRec() {
  setUi({ rec: 'saving' });
  await engine.stopRec();
  setUi({ rec: 'idle', hasTake: true });
}
async function stop() {
  if (transport.rec === 'recording') await finishRec();
  engine.stop();
  setUi({ playing: false });
}
async function toggleRec() {
  if (transport.rec === 'recording') return finishRec();
  if (transport.rec !== 'idle') return;
  await play();
  if (engine.startRec()) {
    recorder.tick(0);
    setUi({ rec: 'recording', hasTake: false });
  }
}
// «Озеро Тишины 04-12 — ESS.wav»: без символов, которые нельзя в имени файла
function takeFileName(place) {
  const clean = (t) => String(t).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = place ? `${clean(place.name)} ${clean(String(place.time).replace(':', '-'))}`.trim() : '';
  return `${base || 'Место'} — ESS.wav`;
}
function save() {
  if (!engine.take) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(engine.take);
  a.download = takeFileName(store.get().place);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// --- каждый кадр: уровни на плане местности и таймер записи
(function loop() {
  fieldMap.setLevels(transport.playing ? engine.meters() : null);
  if (transport.rec === 'recording') recorder.tick(engine.recElapsed());
  requestAnimationFrame(loop);
})();

// --- горячие клавиши для живого исполнения
const FX_KEYS = { KeyQ: 'a', KeyW: 'b', KeyE: 'p' };
const typing = (t) => t instanceof Element && t.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
window.addEventListener('keydown', (e) => {
  // в поле ввода клавиши — это текст («Ветер 1»), а не команды; Escape возвращает управление
  if (typing(e.target)) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.key === 'Escape') {
    if (sheet.isOpen()) sheet.close();
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); transport.playing ? stop() : play(); return; }
  if (e.code === 'KeyR') { toggleRec(); return; }
  if (FX_KEYS[e.code]) { store.update((s) => ({ ...s, fxTarget: FX_KEYS[e.code] })); return; }
  if (e.code === 'KeyA' || e.code === 'KeyB') { sheet.open(e.code === 'KeyA' ? 'a' : 'b'); return; }
  if (e.key === '/' || e.code === 'Slash') {
    e.preventDefault();
    const input = $('.place-bar__input');
    input.focus();
    input.select();
    return;
  }
  const n = Number(e.key);
  if (n >= 1 && n <= PRESETS.length) tuneTo(store, PRESETS[n - 1].query);
});
// пробел не должен «нажимать» кнопку, на которой остался фокус
window.addEventListener('keyup', (e) => { if (e.code === 'Space' && !typing(e.target)) e.preventDefault(); });
