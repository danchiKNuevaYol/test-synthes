// Точка входа: собирает рисунок (мир) и прибор под ним из разметки index.html.
// Каждый блок интерфейса — модуль в src/ui/ с тем же именем, что и CSS-класс блока.

import { createStore } from './state/store.js';
import { PRESETS, placeToState, normalizeQuery } from './state/place.js';
import { engine } from './audio/engine.js';
import { uiTheme } from './world/palette.js';
import { mountWorld } from './ui/world.js';
import { mountHud } from './ui/hud.js';
import { mountPlaceBar, tuneTo } from './ui/place-bar.js';
import { mountWaveSwitch } from './ui/wave-switch.js';
import { mountKnob } from './ui/knob.js';
import { mountFader } from './ui/fader.js';
import { mountMeter } from './ui/meter.js';
import { sign } from './ui/signs.js';
import { mountWeatherKit } from './ui/weather-kit.js';
import { mountTrail } from './ui/trail.js';
import { mountRecorder } from './ui/recorder.js';
import { mountHintLine } from './ui/hint-line.js';
import { degreeName } from './state/music.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// Место берётся из адреса (?place=Озеро Тишины, 4:12) — так прибором делятся ссылкой
const startQuery = normalizeQuery(new URLSearchParams(location.search).get('place') || '') || PRESETS[0].query;
const store = createStore(placeToState(startQuery));
const live = { state: store.get(), step: -1, playing: false, recording: false };   // для пейзажа (p5) и заголовка

// --- блоки. Всё, что в index.html размечено атрибутами data-*, подключается по классу
const world = mountWorld($('.world'), store, live);
const hud = mountHud($('.hud'));
const placeBar = mountPlaceBar($('.place-bar'), store);
const recorder = mountRecorder($('.recorder'), store, { play, stop, toggleRec, save });   // раньше ручек: в нём живёт ручка РАСКАЧКА
const waveSwitches = $$('.wave-switch[data-param]').map((el) => mountWaveSwitch(el, store));
const knobs = $$('.knob').map((el) => mountKnob(el, store));
const faders = $$('.fader').map((el) => mountFader(el, store));
const meters = $$('[data-meter]').map((el) => ({ id: el.dataset.meter, update: mountMeter(el) }));
const weatherKit = mountWeatherKit($('.weather-kit'), store);   // ручки погоды рисует он сам (.knob внутри него)
const trail = mountTrail($('.trail'), store);
mountHintLine($('.hint-line'));
// знаки каналов в заголовках модулей и подписях полос микшера (SVG, а не символы шрифта)
$$('.instrument [data-sign]').forEach((el) => { if (!el.classList.contains('knob')) el.insertAdjacentHTML('afterbegin', sign(el.dataset.sign)); });

// --- прибор рисуется в фиксированном размере (--instrument-w × --instrument-h в stage.css) и целиком
// масштабируется под окно: ни один модуль не может выйти из рамки. Рисунку остаётся всё остальное место.
const GUTTER = 12;
const designSize = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 1;
function fit() {
  const w = designSize('--instrument-w'), h = designSize('--instrument-h');
  const k = Math.min(1.25, (innerWidth - 2 * GUTTER) / w, (innerHeight * 0.5) / h);   // прибор — не больше половины высоты
  document.documentElement.style.setProperty('--k', String(Math.max(0.3, k).toFixed(4)));
}
fit();
window.addEventListener('resize', fit);

// --- тема времени суток: CSS-переменные на <html> при смене времени или погоды
let themeKey = '';
function applyTheme(place) {
  const key = `${place.minutes}|${place.weather}`;
  if (key === themeKey) return;
  themeKey = key;
  const vars = uiTheme(place.minutes, place.weather);
  Object.entries(vars).forEach(([name, value]) => document.documentElement.style.setProperty(name, value));
}

const views = [world, placeBar, ...waveSwitches, ...knobs, ...faders, weatherKit, trail.update];
function render(state) {
  live.state = state;
  applyTheme(state.place);
  views.forEach((update) => update(state));
  hud(state, live);
  engine.apply(state);
}
store.subscribe(render);
render(store.get());

// сыгранная нота (по мелодии или с клавиш) на мгновение появляется в строке места
const DEFAULT_KEY = { root: 9, scale: 'minor' };
if (typeof engine.onNote === 'function') {
  engine.onNote((n) => hud.flash(degreeName(live.state.key || DEFAULT_KEY, n.degree)));
}
// для проверок: движок доступен в консоли только при ?debug в адресе
if (/[?&]debug\b/.test(location.search)) window.__engine = engine;

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

// --- каждый кадр: индикаторы уровня микшера (в покое — ноль) и таймер записи
(function loop() {
  const levels = transport.playing ? engine.meters() : null;
  meters.forEach((m) => m.update(levels ? levels[m.id] : 0));
  if (transport.rec === 'recording') recorder.tick(engine.recElapsed());
  requestAnimationFrame(loop);
})();

// --- горячие клавиши для живого исполнения
const FX_KEYS = { KeyQ: 'a', KeyW: 'b', KeyE: 'p' };
// живая игра: нижний ряд клавиш — ступени лада 0…7 голосом B (по e.code, поэтому работает и в русской раскладке)
const NOTE_KEYS = { KeyZ: 0, KeyX: 1, KeyC: 2, KeyV: 3, KeyB: 4, KeyN: 5, KeyM: 6, Comma: 7 };
const typing = (t) => t instanceof Element && t.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
window.addEventListener('keydown', (e) => {
  // в поле ввода клавиши — это текст («Ветер 1»), а не команды; Escape возвращает управление
  if (typing(e.target)) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.key === 'Escape') {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); transport.playing ? stop() : play(); return; }
  if (e.code in NOTE_KEYS) {
    if (typeof engine.playNote === 'function') engine.playNote(NOTE_KEYS[e.code]);
    return;
  }
  if (e.code === 'KeyR') { toggleRec(); return; }
  if (FX_KEYS[e.code]) { store.update((s) => ({ ...s, fxTarget: FX_KEYS[e.code] })); return; }
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
