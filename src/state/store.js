// Минимальное хранилище состояния: одно дерево, подписка на изменения.
// Параметры адресуются строкой-путём: 'a.tune', 'fx.b.delay', 'mix.master'.

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    update(fn) {
      const next = fn(state);
      if (next === state) return;
      state = next;
      subs.forEach((s) => s(state));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export const getPath = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);

export function setPath(obj, path, value) {
  const [k, ...rest] = path.split('.');
  return { ...obj, [k]: rest.length ? setPath(obj[k], rest.join('.'), value) : value };
}

// Микшер не «ломает» сцену, а правка звука (волна, ручки голосов, эффекты, сетка) — снимает подсветку сцены
const KEEPS_SCENE = ['mix.', 'pan.', 'tone', 'fxTarget'];

// Макро-ползунки: один ползунок ведёт сразу несколько параметров цепочки голоса.
//   ХАРАКТЕР: A — плотность облака (shape) и порывы (mod); B — зерно (texture) и дрожь (mod).
//   ПРОСТРАНСТВО: даль (reverb) и эхо-ущелье (delay) цепочки того же голоса.
// Каждая запись — функция v (0..1) → поля состояния, которые выставляются вместе с макро-значением.
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const MACROS = {
  'macro.a.character': (v) => ({ 'a.shape': v, 'a.mod': 0.15 + 0.7 * v }),
  'macro.b.character': (v) => ({ 'b.texture': v, 'b.mod': 0.1 + 0.75 * v }),
  'macro.a.space': (v) => ({ 'fx.a.reverb': v, 'fx.a.delay': 0.6 * v }),
  'macro.b.space': (v) => ({ 'fx.b.reverb': v, 'fx.b.delay': 0.6 * v }),
};

/** Меняет параметр по пути. Звёздочка в пути — текущая цепочка эффектов (fxTarget). */
export function setParam(state, path, value) {
  const real = path.replace('*', state.fxTarget);
  let next = setPath(state, real, value);
  const macro = MACROS[real];
  if (macro) {
    // ведомые параметры считаем по таблице и зажимаем в 0..1
    for (const [target, v] of Object.entries(macro(clamp01(value)))) next = setPath(next, target, clamp01(v));
  }
  return KEEPS_SCENE.some((p) => real.startsWith(p)) ? next : { ...next, scene: null };
}

export const readParam = (state, path) => getPath(state, path.replace('*', state.fxTarget));
