// Место → звук. Пользователь вводит «Озеро Тишины, 4:12» — а мы детерминированно «настраиваемся» на это место.
// Идея в три шага: строка → зерно (seed) → место (название, время, погода) → полное состояние инструмента.
// Одна и та же строка всегда даёт один и тот же звук: вся «случайность» берётся из PRNG с этим зерном.

import { ARCHETYPES, TRACKS } from './scenes.js';
import { SCALES } from './music.js';

// Готовые места для быстрого выбора
export const PRESETS = [
  { query: 'Ветреный перевал, 06:40', label: 'ПЕРЕВАЛ' },
  { query: 'Дождливый сад, 14:10', label: 'САД' },
  { query: 'Гроза над полем, 19:30', label: 'ГРОЗА' },
  { query: 'Ночной лес, 02:15', label: 'ЛЕС' },
  { query: 'Кристальная планета, 00:00', label: 'ПЛАНЕТА' },
];

const MAX_LEN = 60;

// Обрезаем пробелы, схлопываем повторы, ограничиваем длину
export function normalizeQuery(q) {
  return String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN).trim();
}

// FNV-1a, 32 бита: строка → беззнаковое целое. Регистр не важен — хешируем строчные буквы.
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — маленький быстрый PRNG: зерно → последовательность чисел [0, 1)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Слова времени суток → «HH:MM» (проверяются по порядку: «полночь» раньше «ночи»)
const TIME_WORDS = [
  ['рассвет', '05:30'],
  ['утр', '08:00'],
  ['полд', '12:00'],
  ['ден', '14:00'],
  ['закат', '20:30'],
  ['вечер', '19:00'],
  ['полноч', '00:00'],
  ['ноч', '02:00'],
];

// Ключевые слова погоды; порядок = приоритет (гроза важнее дождя и т. д.)
const WEATHER_WORDS = [
  ['storm', ['гроз', 'шторм', 'гром', 'бур', 'молни', 'ураган']],
  ['rain', ['дожд', 'ливн', 'ливен', 'морос', 'луж', 'капел']],
  ['alien', ['планет', 'кристал', 'луна', 'лунн', 'марс', 'кеплер', 'космос', 'неземн', 'сон', 'сновид']],
  ['forest', ['лес', 'рощ', 'чащ', 'болот', 'сад', 'тайг', 'джунгл']],
  ['wind', ['ветер', 'ветр', 'перевал', 'степ', 'пустын', 'берег', 'мор', 'скал', 'гор', 'поле']],
];

const pad2 = (n) => String(n).padStart(2, '0');
const fmtTime = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
const TIME_RE = /(\d{1,2})[:.](\d{2})/g;

// Строка → Place: название, время суток, тип погоды. Недостающее добираем из PRNG.
export function parsePlace(query) {
  const q = normalizeQuery(query) || PRESETS[0].query;
  const low = q.toLowerCase();
  const seed = hash32(low);
  const rnd = mulberry32(seed);

  // Время: сначала «ЧЧ:ММ», потом слова, потом случайное
  let minutes = null;
  let timeMatch = null;
  for (const m of q.matchAll(TIME_RE)) {
    const h = +m[1];
    const mi = +m[2];
    if (h <= 23 && mi <= 59) {
      minutes = h * 60 + mi;
      timeMatch = m[0];
      break;
    }
  }
  if (minutes === null) {
    const hit = TIME_WORDS.find(([w]) => low.includes(w));
    if (hit) {
      const [h, mi] = hit[1].split(':').map(Number);
      minutes = h * 60 + mi;
    } else {
      minutes = Math.floor(rnd() * 1440);
    }
  }

  // Название: до первой запятой; без запятой — вся строка без времени
  let name;
  const comma = q.indexOf(',');
  if (comma >= 0) name = q.slice(0, comma).trim();
  else name = (timeMatch ? q.replace(timeMatch, '') : q).replace(/[\s,;.\-–—]+$/, '').trim();
  if (!name) name = q;
  name = name.charAt(0).toUpperCase() + name.slice(1);

  // Погода: по ключевым словам, иначе по зерну
  const found = WEATHER_WORDS.find(([, words]) => words.some((w) => low.includes(w)));
  const weather = found ? found[0] : WEATHER_WORDS[Math.floor(rnd() * WEATHER_WORDS.length)][0];

  return {
    query: q,
    name,
    time: fmtTime(minutes),
    minutes,
    weather,
    seed,
    night: minutes < 330 || minutes >= 1290,
  };
}

const WAVES = ['sine', 'triangle', 'square', 'noise'];
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

// Состояние инструмента для места: архетип погоды + сдвиг по зерну + поправка на время суток
export function placeToState(query, fxTarget = 'a') {
  const place = parsePlace(query);
  const rnd = mulberry32((place.seed ^ 0x9e3779b9) >>> 0);
  const jit = (v, amp) => clamp(v + (rnd() * 2 - 1) * amp);
  const st = JSON.parse(JSON.stringify(ARCHETYPES[place.weather]));

  // Лёгкий разброс всех ручек, чтобы два «ветреных» места не звучали одинаково
  for (const voice of [st.a, st.b]) {
    for (const k of Object.keys(voice)) if (k !== 'wave') voice[k] = jit(voice[k], 0.12);
  }
  for (const ch of Object.values(st.fx)) {
    for (const k of Object.keys(ch)) ch[k] = jit(ch[k], 0.12);
  }
  for (const k of ['a', 'b', 'p']) st.mix[k] = jit(st.mix[k], 0.08);
  for (const k of Object.keys(st.pan)) st.pan[k] = jit(st.pan[k], 0.15);
  // Темп берётся из диапазона архетипа (музыкальная часть считается отдельным PRNG ниже)
  const mus = st.music;
  delete st.music;
  const mrnd = mulberry32((place.seed ^ 0x5bd1e995) >>> 0);
  st.bpm = Math.round(mus.bpm[0] + mrnd() * (mus.bpm[1] - mus.bpm[0]));

  // Иногда голос B (а в лесу и «неземном» — и A) берёт другую форму волны.
  // Ветер, дождь и гроза держат A шумом.
  const reroll = (voice) => {
    const change = rnd() < 0.25;
    const pick = rnd();
    if (!change) return;
    const others = WAVES.filter((w) => w !== voice.wave);
    voice.wave = others[Math.floor(pick * others.length)];
  };
  if (place.weather === 'forest' || place.weather === 'alien') reroll(st.a);
  reroll(st.b);

  // Ритм: удары расставляются по музыкальным шаблонам (сильные доли, восьмые, синкопы), по зерну
  st.steps = TRACKS.map((t) => musicalRow(mrnd, PATTERNS[place.weather][t.id], t.id === 'boom' ? 3 : 16, MIN_HITS[t.id]));

  // Время суток
  if (place.night) {
    st.tone = clamp(st.tone - 0.15);
    for (const ch of Object.values(st.fx)) ch.reverb = clamp(ch.reverb + 0.1);
    st.bpm = clamp(st.bpm - 4, 40, 200);
    // Ночью в лесу и на ветру дорожка «Щелчок» читается как сверчки
    if (place.weather === 'forest' || place.weather === 'wind') {
      st.steps[1] = fillTo(rnd, st.steps[1], 6);
    }
  }
  const m = place.minutes;
  if ((m >= 300 && m < 480) || (m >= 1110 && m < 1290)) st.b.mod = clamp(st.b.mod + 0.1);

  // Тональность, мелодия, раскачка
  const key = pickKey(mrnd, mus.scales, place.night);
  const melody = makeMelody(mrnd, mus.rests, place.weather);
  const swing = clamp(mus.swing + (mrnd() - 0.5) * 0.12 + (place.night ? 0.02 : 0), 0.05, 0.35);

  // Макро-ползунки показывают, где сейчас стоят ведомые ими параметры (значения детерминированы местом)
  const macro = {
    a: { character: st.a.shape, space: st.fx.a.reverb },
    b: { character: st.b.texture, space: st.fx.b.reverb },
  };

  return { ...st, key, melody, swing, macro, scene: null, fxTarget, place };
}

// Добавляет удары в свободные шаги, пока их не станет хотя бы min
function fillTo(rnd, track, min) {
  const out = track.slice();
  const free = out.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  let need = min - out.length + free.length;
  while (need-- > 0 && free.length) out[free.splice(Math.floor(rnd() * free.length), 1)[0]] = true;
  return out;
}

// «Светлота» ладов: ночью берём самый тёмный из кандидатов, днём — самый светлый
const BRIGHTNESS = { phrygian: 0, minor: 1, minorPentatonic: 1.5, dorian: 2, pentatonic: 3, wholeTone: 3.5, major: 4, lydian: 5 };

function pickKey(rnd, scales, night) {
  const root = Math.floor(rnd() * 12);
  const sorted = scales.slice().sort((a, b) => BRIGHTNESS[a] - BRIGHTNESS[b]);
  const favorite = night ? sorted[0] : sorted[sorted.length - 1];
  const other = sorted[Math.floor(rnd() * sorted.length)];
  const scale = rnd() < 0.7 ? favorite : other;
  return { root, scale: SCALES[scale] ? scale : 'minor' };
}

// Мелодия на 16 шагов: плавное движение по ступеням 2…8, две фразы (подъём → разрешение на 8-м и 16-м шагах)
function makeMelody(rnd, restCount, weather) {
  const rests = clamp(restCount + (rnd() < 0.4 ? 1 : 0) - (rnd() < 0.4 ? 1 : 0), 3, 6);
  // Паузы чаще на слабых долях (нечётные индексы), но не на 1, 8 и 16 шагах
  const odd = shuffle(rnd, [1, 3, 5, 9, 11, 13]);
  const even = shuffle(rnd, [2, 4, 6, 10, 12, 14]);
  const restSet = new Set();
  while (restSet.size < rests) {
    const fromOdd = (rnd() < 0.7 && odd.length) || !even.length;
    restSet.add(fromOdd ? odd.pop() : even.pop());
  }
  // Опорные точки контура: [индекс, ступень]
  const res1 = rnd() < 0.65 ? 4 : 0;
  const res2 = rnd() < 0.65 ? 0 : 4;
  const start = 3 + Math.floor(rnd() * 3);
  const peak1 = 6 + Math.floor(rnd() * 2);
  const peak2 = 5 + Math.floor(rnd() * 3);
  const anchors = [[0, start], [4, peak1], [7, res1], [10, 4 + Math.floor(rnd() * 2)], [12, peak2], [15, res2]];
  const target = (i) => {
    for (let k = 1; k < anchors.length; k++) {
      if (i <= anchors[k][0]) {
        const [i0, d0] = anchors[k - 1];
        const [i1, d1] = anchors[k];
        return d0 + ((d1 - d0) * (i - i0)) / (i1 - i0);
      }
    }
    return res2;
  };
  const out = [];
  let prev = start;
  for (let i = 0; i < 16; i++) {
    let d;
    if (i === 0) d = start;
    else if (i === 7) d = res1;
    else if (i === 15) d = res2;
    else {
      const want = Math.round(target(i) + (rnd() - 0.5) * 1.6);
      d = clamp(clamp(want, prev - 2, prev + 2), 1, 9);
    }
    prev = d;
    out.push(restSet.has(i) ? null : d);
  }
  return out;
}

function shuffle(rnd, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Шаблоны ударов: [индекс шага 0…15, вероятность]. Сильные доли — 0, 4, 8, 12; восьмые «и» — 2, 6, 10, 14.
// Раскат — бочка на сильных долях, щелчок — «хэт» на восьмых, треск — «малый» на 5 и 13, капля — колокольчик на синкопах.
const PATTERNS = {
  wind: {
    boom: [[0, 0.9], [8, 0.4]],
    click: [[2, 0.45], [6, 0.4], [10, 0.45], [14, 0.4], [15, 0.12]],
    crackle: [[4, 0.35], [12, 0.5]],
    drop: [[3, 0.45], [6, 0.35], [10, 0.4], [11, 0.4], [14, 0.35]],
  },
  rain: {
    boom: [[0, 0.8], [8, 0.5], [10, 0.15]],
    click: [[2, 0.95], [6, 0.9], [10, 0.95], [14, 0.85], [1, 0.2], [5, 0.2], [9, 0.2], [13, 0.25], [15, 0.3]],
    crackle: [[4, 0.75], [12, 0.8], [7, 0.15]],
    drop: [[3, 0.6], [6, 0.55], [9, 0.4], [11, 0.6], [14, 0.5], [1, 0.2], [13, 0.3]],
  },
  storm: {
    boom: [[0, 1], [8, 0.8], [10, 0.35], [12, 0.3]],
    click: [[2, 0.25], [6, 0.2], [10, 0.25], [14, 0.3]],
    crackle: [[4, 0.9], [12, 0.75], [14, 0.2]],
    drop: [[3, 0.25], [11, 0.3], [14, 0.2]],
  },
  forest: {
    boom: [[0, 0.7], [8, 0.3]],
    click: [[2, 0.55], [6, 0.5], [10, 0.55], [14, 0.5], [3, 0.2], [7, 0.2], [11, 0.2], [15, 0.2]],
    crackle: [[4, 0.35], [12, 0.35]],
    drop: [[3, 0.5], [6, 0.45], [10, 0.4], [11, 0.45], [14, 0.4]],
  },
  alien: {
    boom: [[0, 0.6], [6, 0.4], [10, 0.4], [13, 0.3]],
    click: [[1, 0.4], [3, 0.4], [5, 0.3], [7, 0.4], [9, 0.3], [11, 0.4], [13, 0.3], [14, 0.3]],
    crackle: [[3, 0.4], [4, 0.3], [11, 0.4], [12, 0.3], [14, 0.25]],
    drop: [[2, 0.5], [5, 0.5], [7, 0.4], [9, 0.4], [11, 0.4], [14, 0.5], [15, 0.3]],
  },
};

const MIN_HITS = { drop: 1, click: 2, crackle: 1, boom: 0 };

// Дорожка из шаблона: каждый удар выпадает с заданной вероятностью, не больше max ударов
function musicalRow(rnd, pattern, max, min = 0) {
  const row = Array(16).fill(false);
  let n = 0;
  for (const [i, p] of pattern) {
    if (rnd() < p && n < max) { row[i] = true; n++; }
  }
  // Дорожка не должна оставаться пустой: добираем самые вероятные удары шаблона
  const byProb = pattern.slice().sort((a, b) => b[1] - a[1]);
  for (const [i] of byProb) {
    if (n >= min) break;
    if (!row[i]) { row[i] = true; n++; }
  }
  return row;
}
