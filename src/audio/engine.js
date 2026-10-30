// Звуковой движок на Tone.js. Никаких записей и сэмплов: тембры собираются из шума и простых волн,
// а структура музыкальная: одна тональность на место, аккорд-«воздух», мелодия, ритм-секция из частиц.
//
//   ГОЛОС A «ВОЗДУХ»  : аккорд на тонике (волны) + ветер из розового шума → фильтр (LFO в такт) ──► КАНАЛ A ─┐
//   ГОЛОС B «СТИХИЯ»  : мелодия state.melody — MonoSynth (+ дыхание из шума, вибрато) ─────────────► КАНАЛ B ─┤
//   ЧАСТИЦЫ           : капля = колокольчик, щелчок = хэт, треск = малый, раскат = бочка ─────────► КАНАЛ Ч ─┤
//                                                                                                           ▼
//   каждый КАНАЛ: Драйв → Хорус → Эхо (в такт) → Реверб → громкость → панорама     ОБЩИЙ КАНАЛ: яркость →
//                                                                                громкость → лимитер → выход
//
// Задуманный баланс (дБ относительно полной шкалы, при ползунках пресетов):
//   мелодия ≈ −14 RMS (главный голос) · аккорд ≈ −23 (под мелодией) · бочка пик ≈ −13 · малый ≈ −20 ·
//   хэт ≈ −26 · колокольчик ≈ −22. Всё вместе не выше −4 дБ, лимитер на −1 ловит редкие пики.

import * as Tone from 'tone';
import { encodeWav } from './wav.js';
import { degreeToMidi, nearestScaleSemitone, SCALES } from '../state/music.js';

const expo = (a, b, t) => a * Math.pow(b / a, t);
const fader = (v) => v * v * 1.4;                    // положение фейдера → усиление
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const DEFAULT_KEY = { root: 9, scale: 'minor' };
const BELL_DEGREES = [7, 9, 11, 8, 10, 7, 9, 12];    // ступени колокольчика (от номера шага, тон лада)
const B_OCTAVES = [-1, 0, 1, 2];                     // ВЫСОТА голоса B → сдвиг мелодии в октавах
const LIVE_HOLD = 2200;                              // мс тишины, после которых живая игра гасит общий выход

// Тембры мелодии по форме волны: СВИСТ, ВОЛНА, ВИБРАЦИЯ, РАСКАТ
const WB = {
  sine: { osc: 'sine', env: { attack: 0.025, decay: 0.2, sustain: 0.75, release: 0.35 }, vib: 1, legato: true, port: 0.045, breath: [-34, -14], bq: 1.5 },
  triangle: { osc: 'triangle', env: { attack: 0.05, decay: 0.25, sustain: 0.55, release: 0.45 }, vib: 0.5, legato: true, port: 0.06, breath: [-46, -30], bq: 1 },
  square: { osc: 'fmsquare', env: { attack: 0.006, decay: 0.18, sustain: 0.5, release: 0.18 }, vib: 0.6, legato: true, port: 0.02, breath: [-60, -44], bq: 1 },
  noise: { osc: 'triangle', env: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }, vib: 0, legato: false, port: 0, breath: [-18, -6], bq: 0.7 },
};

// Аккорд голоса A: полутоны от тоники (ближайшие к чистой квинте, терции, септиме, нона — всегда внутри лада)
function chordSemitones(key) {
  const scaleKey = { root: 0, scale: SCALES[key.scale] ? key.scale : 'minor' };
  const n = (t) => nearestScaleSemitone(scaleKey, t);
  return [0, n(7), n(3.5) + 12, n(10.5), n(2) + 12]; // тоника, квинта, терция, септима, нона
}

// Характер «пространства» у каждого канала свой: длина хвоста реверберации и доля эхо
const SPACE = {
  a: { decay: 6, echo: 0.75 },   // атмосфера — длинный хвост, эхо на пунктирную восьмую
  b: { decay: 4, echo: 0.5 },    // элементы — эхо на восьмую
  p: { decay: 2.5, echo: 0.375 } // частицы — короткое пространство
};

/** Канал микшера со своей цепочкой эффектов. */
class Channel {
  constructor(id, destination) {
    this.id = id;
    this.input = new Tone.Gain(1);
    this.drive = new Tone.Distortion({ distortion: 0.6, wet: 0 });
    this.mod = new Tone.Chorus({ frequency: 1.4, delayTime: 3.5, depth: 0.7, wet: 0 }).start();
    this.delay = new Tone.FeedbackDelay({ delayTime: 0.3, feedback: 0.42, wet: 0 });
    this.reverb = new Tone.Reverb({ decay: SPACE[id].decay, wet: 0 });
    this.level = new Tone.Gain(0);
    this.pan = new Tone.Panner(0);
    this.meter = new Tone.Meter({ normalRange: true, smoothing: 0.85 });
    this.input.chain(this.drive, this.mod, this.delay, this.reverb, this.level, this.pan, destination);
    this.pan.connect(this.meter);
  }

  ready() {
    return this.reverb.generate();
  }

  /** fx — {drive, mod, delay, reverb} от 0 до 1; level и pan — положения фейдера и ручки панорамы. */
  apply(fx, level, pan, bpm) {
    this.drive.wet.rampTo(fx.drive, 0.1);
    this.mod.wet.rampTo(fx.mod, 0.1);
    this.delay.wet.rampTo(fx.delay * 0.7, 0.1);
    this.delay.delayTime.rampTo((60 / bpm) * SPACE[this.id].echo, 0.2);
    this.reverb.wet.rampTo(fx.reverb * 0.9, 0.1);
    this.level.gain.rampTo(fader(level), 0.08);
    this.pan.pan.rampTo(pan * 2 - 1, 0.1);
  }
}

class Engine {
  ready = false;
  playing = false;
  recording = false;
  take = null;                // последняя запись (WAV Blob)
  state = null;
  stepIndex = 0;
  stepListeners = new Set();
  triggerListeners = new Set();
  noteListeners = new Set();
  recStartedAt = 0;
  initPromise = null;
  aSig = null;                // подпись текущего аккорда A (тональность + октава)
  aTimer = null;
  liveTimer = null;
  bWave = null;

  /** Создаёт аудиограф. Вызывать из обработчика клика (политика автовоспроизведения браузера). */
  init() {
    this.initPromise ||= this.#build();
    return this.initPromise;
  }

  async #build() {
    await Tone.start();

    // --- общий канал: яркость → громкость → плавный старт/стоп → лимитер → выход и запись
    this.masterTone = new Tone.Filter({ type: 'lowpass', frequency: 12000, rolloff: -12 });
    this.masterLevel = new Tone.Gain(1);
    this.fade = new Tone.Gain(0);
    this.limiter = new Tone.Limiter(-1);
    this.masterMeter = new Tone.Meter({ normalRange: true, smoothing: 0.85 });
    this.recorder = new Tone.Recorder();
    this.fft = new Tone.FFT(32);
    this.masterTone.chain(this.masterLevel, this.fade, this.limiter);
    this.limiter.toDestination();
    this.limiter.connect(this.recorder);
    this.limiter.connect(this.fft);
    this.limiter.connect(this.masterMeter);

    // --- три канала, у каждого своя цепочка эффектов
    this.ch = {
      a: new Channel('a', this.masterTone),
      b: new Channel('b', this.masterTone),
      p: new Channel('p', this.masterTone),
    };
    await Promise.all(Object.values(this.ch).map((c) => c.ready()));

    this.#buildVoiceA();
    this.#buildVoiceB();
    this.#buildParticles();

    // --- секвенсор: 16 шагов по 1/16, раскачка шестнадцатых задаётся в apply()
    Tone.getTransport().swingSubdivision = '16n';
    Tone.getTransport().scheduleRepeat((time) => this.#tick(time), '16n');

    this.ready = true;
    if (this.state) this.apply(this.state);
  }

  // Голос A · Воздух: пять осцилляторов-тонов аккорда (тоника, квинта, терция, септима, нона)
  // через мягкий фильтр + ветер (розовый шум через полосовой фильтр, который следует за аккордом).
  // Тоны не перезапускаются: смена тональности — короткое приглушение, перестройка и возврат (без щелчков).
  #buildVoiceA() {
    const A = (this.A = {});
    A.tones = [0, 1, 2, 3, 4].map((k) => {
      const osc = new Tone.Oscillator({ type: 'sine', frequency: 110 }).start();
      osc.detune.value = [0, 4, -5, 6, -3][k]; // чуть «плывущие» тона, как у живого пэда
      const gain = new Tone.Gain(0);
      osc.connect(gain);
      return { osc, gain };
    });
    A.bus = new Tone.Gain(1);
    A.padFilter = new Tone.Filter({ type: 'lowpass', frequency: 600, Q: 1 });
    A.noise = new Tone.Noise('pink').start();
    A.windGain = new Tone.Gain(0.2);
    A.wind = new Tone.Filter({ type: 'bandpass', frequency: 600, Q: 2 });
    A.swell = new Tone.Gain(1);   // приглушение при смене тональности
    A.level = new Tone.Gain(0);
    A.gate = new Tone.Gain(0);    // закрыт, пока транспорт стоит (живая игра слышит только мелодию)
    A.lfo = new Tone.LFO({ frequency: 0.1, min: -1200, max: 1200, amplitude: 0.5 }).start();
    A.tones.forEach((t) => t.gain.connect(A.bus));
    A.bus.chain(A.padFilter, A.swell);
    A.noise.chain(A.windGain, A.wind, A.swell);
    A.swell.chain(A.level, A.gate, this.ch.a.input);
    A.lfo.connect(A.padFilter.detune);
    A.lfo.connect(A.wind.detune);
    A.rootHz = 110;
  }

  // Голос B · Стихия: мелодия. MonoSynth с портаменто (легато) + «дыхание» из шума + вибрато.
  #buildVoiceB() {
    const B = (this.B = {});
    B.synth = new Tone.MonoSynth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.7, release: 0.3 },
      filter: { type: 'lowpass', Q: 1, rolloff: -12 },
      filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.5, baseFrequency: 1200, octaves: 2 },
      portamento: 0.04,
    });
    B.synth.volume.value = -3;
    B.breath = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.03, decay: 0.12, sustain: 0.4, release: 0.15 } });
    B.breath.volume.value = -30;
    B.breathBp = new Tone.Filter({ type: 'bandpass', frequency: 1200, Q: 1.5 });
    B.sum = new Tone.Gain(1);
    B.level = new Tone.Gain(0);
    B.vib = new Tone.LFO({ frequency: 5, min: -35, max: 35, amplitude: 0 }).start();
    B.synth.connect(B.sum);
    B.breath.chain(B.breathBp, B.sum);
    B.sum.chain(B.level, this.ch.b.input);
    B.vib.connect(B.synth.detune);
    B.held = false;
  }

  // Частицы → ритм-секция в тональности: колокольчик, хэт, малый, бочка
  #buildParticles() {
    const P = (this.P = {});
    const out = this.ch.p.input;
    P.drop = new Tone.FMSynth({
      harmonicity: 3.01, modulationIndex: 5,
      oscillator: { type: 'sine' }, modulation: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.55, sustain: 0, release: 0.4 },
      modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.2 },
    });
    P.click = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0 } });
    P.clickHp = new Tone.Filter(7000, 'highpass');
    P.crackle = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.14, sustain: 0 } });
    P.crackleHp = new Tone.Filter(1800, 'highpass');
    P.body = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 2.5, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 } });
    P.boom = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 5, envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.15 } });
    P.drop.volume.value = -14;
    P.click.volume.value = -17;
    P.crackle.volume.value = -12;
    P.body.volume.value = -12;
    P.boom.volume.value = -4;
    P.drop.connect(out);
    P.click.chain(P.clickHp, out);
    P.crackle.chain(P.crackleHp, out);
    P.body.connect(out);
    P.boom.connect(out);
  }

  // Сила удара: сильные доли (1, 5, 9, 13 шаги) громче, слабые мягче
  #accent(i) {
    const base = i === 0 ? 1 : i % 8 === 0 ? 0.92 : i % 4 === 0 ? 0.82 : i % 2 === 0 ? 0.65 : 0.52;
    return clamp(base * (0.94 + Math.random() * 0.06), 0.05, 1);
  }

  #tick(time) {
    const i = this.stepIndex;
    this.stepIndex = (i + 1) % 16;
    const st = this.state;
    if (st) {
      const key = st.key || DEFAULT_KEY;
      const vel = this.#accent(i);
      const s = st.steps;
      if (s) {
        if (s[0][i]) {
          const midi = degreeToMidi(key, BELL_DEGREES[(i * 3) % 8], 4);
          this.P.drop.triggerAttackRelease(mtof(midi), '16n', time, vel);
          this.#emit('drop', time);
        }
        if (s[1][i]) { this.P.click.triggerAttackRelease('64n', time, vel); this.#emit('click', time); }
        if (s[2][i]) {
          // малый/клэп: двойной шумовой хлопок + короткое «тело» на тонике
          this.P.crackle.triggerAttackRelease('32n', time, vel);
          this.P.crackle.triggerAttackRelease('64n', time + 0.012, vel * 0.7);
          this.P.body.triggerAttackRelease(mtof(degreeToMidi(key, 0, 3)), '32n', time, vel * 0.8);
          this.#emit('crackle', time);
        }
        if (s[3][i]) {
          let m = 24 + (key.root % 12);
          if (m < 29) m += 12; // не ниже ≈ 44 Гц, чтобы бочку было слышно
          this.P.boom.triggerAttackRelease(mtof(m), '8n', time, vel);
          this.#emit('boom', time);
        }
      }
      this.#melodyStep(i, time, st, key, vel);
    }
    Tone.getDraw().schedule(() => this.stepListeners.forEach((fn) => fn(i)), time);
  }

  // Шаг мелодии: null — пауза; подряд идущие разные ноты — легато (портаменто), иначе — отдельные ноты
  #melodyStep(i, time, st, key, vel) {
    const B = this.B;
    const mel = st.melody;
    const deg = mel ? mel[i] : null;
    if (deg == null) {
      if (B.held) { B.synth.triggerRelease(time); B.held = false; }
      return;
    }
    const cfg = WB[st.b.wave] || WB.sine;
    const midi = this.#bMidi(key, deg, st);
    const freq = mtof(midi);
    const sixteenth = 60 / st.bpm / 4;
    const next = mel[(i + 1) % 16];
    const tie = cfg.legato && next != null && next !== deg;
    if (cfg.legato && B.held) B.synth.setNote(freq, time);
    else B.synth.triggerAttack(freq, time, clamp(vel + 0.1, 0.3, 1));
    B.held = true;
    const len = i % 2 === 0 ? sixteenth * 1.7 : sixteenth * 1.15; // от шестнадцатой до восьмой
    if (!tie) { B.synth.triggerRelease(time + len); B.held = false; }
    this.#breath(freq, len, time, vel);
    Tone.getDraw().schedule(() => this.noteListeners.forEach((fn) => fn({ degree: deg, midi, live: false })), time);
  }

  #breath(freq, len, time, vel) {
    const B = this.B;
    const f = clamp(freq * 2, 400, 9000);
    if (time === undefined) B.breathBp.frequency.value = f;
    else B.breathBp.frequency.setValueAtTime(f, time);
    B.breath.triggerAttackRelease(Math.min(len, 0.25), time, vel * 0.8);
  }

  #bMidi(key, degree, st) {
    const shift = B_OCTAVES[clamp(Math.floor(st.b.tune * 4), 0, 3)];
    return degreeToMidi(key, clamp(Math.round(degree), 0, 11), 4 + shift);
  }

  // Событие частицы для дисплея: вызывается в момент, когда звук реально слышен
  #emit(trackId, time) {
    Tone.getDraw().schedule(() => this.triggerListeners.forEach((fn) => fn(trackId)), time);
  }

  /** Подписка на срабатывание частиц: fn('drop' | 'click' | 'crackle' | 'boom'). Возвращает отписку. */
  onTrigger(fn) {
    this.triggerListeners.add(fn);
    return () => this.triggerListeners.delete(fn);
  }

  /** Подписка на ноты мелодии (и живой игры): fn({ degree, midi, live }). Возвращает отписку. */
  onNote(fn) {
    this.noteListeners.add(fn);
    return () => this.noteListeners.delete(fn);
  }

  /** Сыграть ступень лада голосом B прямо сейчас (живая игра); работает и при остановленном транспорте. */
  async playNote(degree) {
    await this.init();
    const st = this.state;
    if (!this.ready || !st) return;
    this.#openLive();
    const key = st.key || DEFAULT_KEY;
    const deg = clamp(Math.round(Number(degree) || 0), 0, 11);
    const midi = this.#bMidi(key, deg, st);
    const freq = mtof(midi);
    const B = this.B;
    B.held = false;
    B.synth.triggerAttackRelease(freq, 0.3, undefined, 0.9);
    this.#breath(freq, 0.2, undefined, 0.9);
    this.noteListeners.forEach((fn) => fn({ degree: deg, midi, live: true }));
  }

  // Общий выход открыт, пока играют руками; через пару секунд тишины закрывается (если транспорт стоит)
  #openLive() {
    if (this.playing) return;
    this.fade.gain.rampTo(1, 0.05);
    clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => {
      if (!this.playing) this.fade.gain.rampTo(0, 0.5);
    }, LIVE_HOLD);
  }

  /** Применяет состояние интерфейса к звуку. Можно вызывать до init() — значения запомнятся. */
  apply(st) {
    this.state = st;
    if (!this.ready) return;
    const { a, b, fx, mix, pan, bpm, tone } = st;
    const { A, B } = this;
    const key = st.key || DEFAULT_KEY;
    const tr = Tone.getTransport();
    tr.bpm.rampTo(bpm, 0.2);
    tr.swing = clamp(st.swing ?? 0, 0, 1);
    tr.swingSubdivision = '16n';

    // --- Голос A: ВЫСОТА → регистр аккорда (октавы 2…4); ПЛОТНОСТЬ → терция, септима, нона;
    //     форма волны → тембр; ПОРЫВЫ → глубина фильтра, скорость в такт; СИЛА → громкость
    const oct = 2 + Math.round(a.tune * 2);
    const sig = `${key.root}|${key.scale}|${oct}`;
    if (this.aSig === null) {
      this.aSig = sig;
      this.#retuneA(key, oct);
    } else if (sig !== this.aSig) {
      this.aSig = sig;
      A.swell.gain.rampTo(0, 0.1);
      clearTimeout(this.aTimer);
      this.aTimer = setTimeout(() => {
        this.#retuneA(this.state.key || DEFAULT_KEY, 2 + Math.round(this.state.a.tune * 2));
        this.#filterA(this.state);
        A.swell.gain.rampTo(1, 0.25);
      }, 130);
    }
    const noiseA = a.wave === 'noise';
    const wave = noiseA ? 'sine' : a.wave;
    const comp = noiseA ? 0.55 : a.wave === 'square' ? 0.45 : a.wave === 'triangle' ? 0.9 : 1; // выравнивание громкости волн
    const ramp = (x, lo) => clamp((x - lo) / 0.2, 0, 1);
    const weights = [1, 0.8, 0.8 * ramp(a.shape, 0.15), 0.7 * ramp(a.shape, 0.4), 0.6 * ramp(a.shape, 0.65)];
    A.tones.forEach((t, k) => {
      if (t.osc.type !== wave) t.osc.type = wave;
      t.gain.gain.rampTo(0.18 * comp * weights[k], 0.15);
    });
    A.windGain.gain.rampTo(noiseA ? 1.6 : 0.22, 0.2); // ветер слышен на любой волне, на ВЕТРЕ — главный
    this.#filterA(st);
    A.level.gain.rampTo(a.level * a.level * 0.9, 0.08);

    // --- Голос B: ВЫСОТА → октава мелодии (в #bMidi); ЗЕРНО → дыхание и яркость; ДРОЖЬ → вибрато; СИЛА → громкость
    const cfg = WB[b.wave] || WB.sine;
    if (this.bWave !== b.wave) {
      this.bWave = b.wave;
      B.synth.oscillator.type = cfg.osc;
      Object.assign(B.synth.envelope, cfg.env);
      B.synth.portamento = cfg.port;
      B.breathBp.Q.rampTo(cfg.bq, 0.1);
      if (!cfg.legato && B.held) { B.synth.triggerRelease(); B.held = false; }
    }
    const shift = B_OCTAVES[clamp(Math.floor(b.tune * 4), 0, 3)];
    const base = clamp(250 * Math.pow(2, b.texture * 3.5 + shift * 0.8), 200, 6000);
    B.synth.filterEnvelope.baseFrequency = base;
    B.synth.filterEnvelope.octaves = Math.min(2.5, Math.log2(18000 / base));
    B.breath.volume.rampTo(cfg.breath[0] + b.texture * (cfg.breath[1] - cfg.breath[0]), 0.1);
    B.vib.amplitude.rampTo(b.mod * cfg.vib, 0.2);
    B.vib.frequency.rampTo(3.5 + b.mod * 4.5, 0.2);
    B.level.gain.rampTo(Math.pow(b.level, 1.5) * 1.4, 0.08);

    // Каналы со своими цепочками
    for (const id of ['a', 'b', 'p']) this.ch[id].apply(fx[id], mix[id], pan[id], bpm);

    // Общий канал
    this.masterTone.frequency.rampTo(expo(1200, 18000, tone), 0.1);
    this.masterLevel.gain.rampTo(fader(mix.master), 0.08);
  }

  // Частоты аккорда A; вызывается при первом применении и в середине приглушения при смене тональности
  #retuneA(key, oct) {
    const A = this.A;
    const base = degreeToMidi({ root: key.root, scale: 'major' }, 0, oct); // только тоника: считаем от неё
    const semis = chordSemitones(key);
    A.tones.forEach((t, k) => { t.osc.frequency.value = mtof(base + semis[k]); });
    A.rootHz = mtof(base);
    A.wind.frequency.value = clamp(A.rootHz * 4, 200, 4000);
  }

  // Фильтр A: срез привязан к тонике, чтобы ПОРЫВЫ (LFO) «открывали» и «закрывали» верхние тона аккорда
  #filterA(st) {
    const A = this.A;
    const { a, bpm } = st;
    const mult = { sine: 3.2, triangle: 5, square: 4, noise: 3.5 }[a.wave] || 3.5;
    A.padFilter.frequency.rampTo(clamp(A.rootHz * mult, 120, 12000), 0.15);
    A.padFilter.Q.rampTo(a.wave === 'square' ? 0.7 : 1.2, 0.15);
    A.wind.Q.rampTo(1.5 + a.shape * 4, 0.15);
    // ПОРЫВЫ: глубина = a.mod; скорость в такт: 2 такта, 1 такт или половинная нота
    const hz = a.mod < 0.34 ? bpm / 480 : a.mod < 0.67 ? bpm / 240 : bpm / 120;
    A.lfo.amplitude.rampTo(a.mod, 0.2);
    A.lfo.frequency.rampTo(hz, 0.3);
  }

  async play() {
    await this.init();
    if (this.playing) return;
    clearTimeout(this.liveTimer);
    this.stepIndex = 0;
    Tone.getTransport().start('+0.05');
    this.A.gate.gain.rampTo(1, 0.3);
    this.fade.gain.rampTo(1, 1.2);
    this.playing = true;
  }

  stop() {
    if (!this.ready || !this.playing) return;
    this.fade.gain.rampTo(0, 0.4);
    this.A.gate.gain.rampTo(0, 0.4);
    Tone.getTransport().stop();
    if (this.B.held) { this.B.synth.triggerRelease(); this.B.held = false; }
    this.playing = false;
    this.stepListeners.forEach((fn) => fn(-1));
  }

  onStep(fn) {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  // --- запись
  startRec() {
    if (!this.ready || this.recording) return false;
    this.recorder.start();
    this.recording = true;
    this.take = null;
    this.recStartedAt = performance.now();
    return true;
  }

  /** Останавливает запись и возвращает WAV Blob. */
  async stopRec() {
    if (!this.recording) return null;
    this.recording = false;
    const blob = await this.recorder.stop();
    const buffer = await Tone.getContext().decodeAudioData(await blob.arrayBuffer());
    this.take = encodeWav(buffer);
    return this.take;
  }

  recElapsed() {
    return this.recording ? (performance.now() - this.recStartedAt) / 1000 : 0;
  }

  /** Уровни каналов 0…1 для индикаторов микшера и дисплея. */
  meters() {
    if (!this.ready) return null;
    const val = (m) => Math.min(1, Number(m.getValue()) || 0);
    return { a: val(this.ch.a.meter), b: val(this.ch.b.meter), p: val(this.ch.p.meter), master: val(this.masterMeter) };
  }

  /** Спектр общего выхода (дБ) для дисплея. */
  spectrum() {
    return this.ready ? this.fft.getValue() : null;
  }
}

export const engine = new Engine();
