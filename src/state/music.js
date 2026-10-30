// Музыкальная основа: лады, ноты, ступени. Тональность места — { root: 0..11, scale }.
// Ступени мелодии идут по ладу вверх и переходят через октаву: в пентатонике ступень 5 = тоника + октава.

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
};

export const SCALE_NAMES = {
  major: 'МАЖОР',
  minor: 'МИНОР',
  dorian: 'ДОРИЙСКИЙ',
  phrygian: 'ФРИГИЙСКИЙ',
  lydian: 'ЛИДИЙСКИЙ',
  pentatonic: 'ПЕНТАТОНИКА',
  minorPentatonic: 'МИН. ПЕНТАТОНИКА',
  wholeTone: 'ЦЕЛОТОНОВЫЙ',
};

export const NOTE_NAMES = ['ДО', 'ДО♯', 'РЕ', 'РЕ♯', 'МИ', 'ФА', 'ФА♯', 'СОЛЬ', 'СОЛЬ♯', 'ЛЯ', 'ЛЯ♯', 'СИ'];

export const MELODY_DEGREES = 12; // ступени 0..11

const scaleOf = (key) => SCALES[key && key.scale] || SCALES.minor;
const rootOf = (key) => (((key && key.root) | 0) % 12 + 12) % 12;

/** MIDI-нота ступени: ступени идут по ладу вверх, через октаву по длине лада. octave 4 → до = 60. */
export function degreeToMidi(key, degree, octave = 4) {
  const scale = scaleOf(key);
  const n = scale.length;
  const d = Math.round(degree) || 0;
  const oct = Math.floor(d / n);
  const idx = ((d % n) + n) % n;
  return 12 * (octave + 1) + rootOf(key) + scale[idx] + 12 * oct;
}

/** Название ноты ступени: 'ЛЯ', 'СИ♯'… */
export function degreeName(key, degree) {
  const scale = scaleOf(key);
  const n = scale.length;
  const idx = ((Math.round(degree) % n) + n) % n;
  return NOTE_NAMES[(rootOf(key) + scale[idx]) % 12];
}

/** Подпись тональности: 'ЛЯ МИНОР'. */
export function keyLabel(key) {
  return `${NOTE_NAMES[rootOf(key)]} ${SCALE_NAMES[key && key.scale] || SCALE_NAMES.minor}`;
}

/** Нота лада, ближайшая к заданному числу полутонов от тоники (при равенстве — верхняя). Для аккордов. */
export function nearestScaleSemitone(key, target) {
  let best = 0;
  let bestD = Infinity;
  for (const s of scaleOf(key)) {
    const d = Math.abs(s - target);
    if (d <= bestD) { best = s; bestD = d; }
  }
  return best;
}
