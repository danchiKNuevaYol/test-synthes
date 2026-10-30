// Знаки каналов: A — ○, B — ═, Ч — ⁘, ОБЩИЙ — □. Рисуем SVG (не символами шрифта):
// цвет берут от currentColor, а стиль штриха (.sign__ink / .sign__halo) задаёт base.css.
// halo: подложка цвета бумаги под знаком, чтобы он читался поверх штриховки мира.

const SHAPES = {
  a: '<circle cx="8" cy="8" r="4.8"/>',
  b: '<path d="M2.8 5.6h10.4M2.8 10.4h10.4"/>',
  p: '<circle class="dot" cx="8" cy="3.6" r="1.2"/><circle class="dot" cx="3.6" cy="8" r="1.2"/>'
   + '<circle class="dot" cx="12.4" cy="8" r="1.2"/><circle class="dot" cx="8" cy="12.4" r="1.2"/>',
  m: '<rect x="3.4" y="3.4" width="9.2" height="9.2"/>',
};

/** SVG-знак канала: id — 'a' | 'b' | 'p' | 'm' (общий). */
export function sign(id, cls = '', halo = false) {
  const shapes = SHAPES[id] || SHAPES.m;
  return `<svg class="sign sign--${id} ${cls}" viewBox="0 0 16 16" aria-hidden="true">`
    + `${halo ? `<g class="sign__halo">${shapes}</g>` : ''}<g class="sign__ink">${shapes}</g></svg>`;
}
