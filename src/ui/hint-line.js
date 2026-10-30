// Блок .hint-line — нижняя строка с клавишами. Только текст, состояния нет.

const KEYS = [
  ['ПРОБЕЛ', 'звук'],
  ['R', 'запись'],
  ['/', 'место'],
  ['1–5', 'места'],
  ['Q W E', 'цепь погоды'],
  ['Z–M', 'ноты'],
];

export function mountHintLine(el) {
  el.innerHTML = KEYS.map(([k, what]) => `<span class="hint-line__item"><kbd class="hint-line__key">${k}</kbd> ${what}</span>`).join('');
}
