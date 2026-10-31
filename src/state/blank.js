// Чистый лист: состояние прибора при первом заходе без ?place=. Места нет, тропа и мелодия пусты, ручки — на рабочих
// нейтральных положениях. Дальше пользователь либо выбирает место (клавиши 1–5), либо собирает звук сам.

import { setParam } from './store.js';

// Нейтральное «место»: мир его рисует (тихий день, ветер), но названия нет и ни один пресет не выбран
export const BLANK_PLACE = { query: '', name: '', time: '12:00', minutes: 720, weather: 'wind', seed: 1, night: false };

const row = () => Array(16).fill(false);

export function blankState() {
  const fx = (delay, reverb) => ({ drive: 0, mod: 0, delay, reverb });
  let st = {
    bpm: 90,
    tone: 0.75,
    swing: 0.1,
    key: { root: 9, scale: 'minor' },          // ЛЯ МИНОР
    a: { wave: 'sine', tune: 0.4, shape: 0, mod: 0, level: 0.65 },        // ГУЛ
    b: { wave: 'sine', tune: 0.45, texture: 0, mod: 0, level: 0.7 },      // СВИСТ
    fx: { a: fx(0, 0), b: fx(0, 0), p: fx(0.15, 0.3) },
    mix: { a: 0.7, b: 0.75, p: 0.7, master: 0.8 },
    pan: { a: 0.5, b: 0.5, p: 0.5 },
    steps: [row(), row(), row(), row()],
    melody: Array(16).fill(null),
    macro: { a: {}, b: {} },
    scene: null,
    fxTarget: 'a',
    place: { ...BLANK_PLACE },
  };
  // макро-ползунки ведут свои параметры по той же таблице, что и при движении ползунка
  for (const v of ['a', 'b']) {
    st = setParam(st, `macro.${v}.character`, 0.3);
    st = setParam(st, `macro.${v}.space`, 0.3);
  }
  return st;
}
