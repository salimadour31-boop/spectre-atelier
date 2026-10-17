// Unit tests (plain Node, no dependencies): node tests/dsp.test.js
// FFT (vs. naive DFT, Parseval), windows, STFT (1 kHz sine peaks at 1 kHz at 0 dBFS, frame timing, sweep tracking,
// cell cap), frequency scales (mel, log), note names / cents / A4 reference, peak picking, chroma + key estimate,
// stereo tools, demo signal, colour maps, settings / URL hash, rasterizers, ticks and i18n.
const assert = require('assert');
const D = require('../js/dsp.js'), CM = require('../js/colormaps.js'), ST = require('../js/settings.js'), R = require('../js/render.js'), I = require('../js/i18n.js');
let n = 0, failed = 0;
function test(name, fn) { try { fn(); n++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n    ')); } }
const near = (a, b, eps = 1e-6, msg) => assert(Math.abs(a - b) <= eps, `${msg || ''} expected ${b}, got ${a}`);
const sine = (f, sr, len, amp = 1, ph = 0) => { const x = new Float32Array(len); for (let i = 0; i < len; i++) x[i] = amp * Math.sin(2 * Math.PI * f * i / sr + ph); return x; };

console.log('FFT & windows');
test('FFT matches a naive DFT on random data (N = 64, 1024)', () => {
  const rnd = D.prng(7);
  for (const N of [64, 1024]) {
    const re = new Float64Array(N), im = new Float64Array(N), x = [], y = [];
    for (let i = 0; i < N; i++) { re[i] = x[i] = rnd() * 2 - 1; im[i] = y[i] = rnd() * 2 - 1; }
    D.fft(re, im);
    for (const k of [0, 1, 5, N / 2, N - 3]) {
      let sr = 0, si = 0;
      for (let t = 0; t < N; t++) { const a = (-2 * Math.PI * k * t) / N; sr += x[t] * Math.cos(a) - y[t] * Math.sin(a); si += x[t] * Math.sin(a) + y[t] * Math.cos(a); }
      near(re[k], sr, 1e-9 * N, `re[${k}]`); near(im[k], si, 1e-9 * N, `im[${k}]`);
    }
  }
});
test('Parseval: Σ|x|² = Σ|X|² / N (N = 16384)', () => {
  const N = 16384, rnd = D.prng(3), re = new Float64Array(N), im = new Float64Array(N);
  let e = 0;
  for (let i = 0; i < N; i++) { re[i] = rnd() - 0.5; e += re[i] * re[i]; }
  D.fft(re, im);
  let E = 0;
  for (let k = 0; k < N; k++) E += re[k] * re[k] + im[k] * im[k];
  near(E / N, e, 1e-6 * e);
});
test('FFT rejects sizes that are not powers of two', () => {
  assert.throws(() => D.fft(new Float64Array(100), new Float64Array(100)));
});
test('windows: symmetric periodic shapes with the expected values', () => {
  const N = 1024;
  for (const w of Object.keys(D.WINDOWS)) {
    const a = D.makeWindow(w, N);
    assert.strictEqual(a.length, N);
    for (let i = 1; i < N / 2; i++) near(a[i], a[N - i], 1e-6, `${w} symmetry`);
    assert(Math.max(...a) <= 1.0000001);
  }
  near(D.makeWindow('hann', N)[0], 0, 1e-9); near(D.makeWindow('hann', N)[N / 2], 1, 1e-6);
  near(D.makeWindow('hamming', N)[0], 0.08, 1e-6);
  near(D.makeWindow('blackmanharris', N)[0], 0.00006, 1e-5);
  near(D.makeWindow('rect', N)[17], 1);
});

console.log('STFT');
test('a 1 kHz sine peaks at 1 kHz (±1 Hz) and ≈ 0 dBFS, for every window and FFT size', () => {
  const sr = 48000, x = sine(1000, sr, sr);
  for (const fft of [512, 2048, 4096, 16384]) for (const w of ['hann', 'hamming', 'blackmanharris']) {
    const an = D.stft(x, sr, { fft, window: w, overlap: 0.75 });
    const spec = D.averageSpectrum(an, 0.25, 0.75), pk = D.findPeaks(spec, an.binHz, { count: 1, halfWidth: D.WINDOWS[w] })[0];
    near(pk.freq, 1000, fft >= 2048 ? 1 : 3, `${w}/${fft} freq`);
    near(pk.db, 0, 0.5, `${w}/${fft} level`);
  }
});
test('amplitude scaling: a −20 dBFS sine reads −20 dB; 0.5 amplitude reads −6 dB', () => {
  const sr = 44100;
  for (const [amp, db] of [[0.1, -20], [0.5, -6.02]]) {
    const an = D.stft(sine(2500, sr, sr, amp), sr, { fft: 8192, window: 'blackmanharris' });
    near(D.findPeaks(D.averageSpectrum(an, 0.3, 0.7), an.binHz, { count: 1, halfWidth: 4 })[0].db, db, 0.3);
  }
});
test('frame count, hop and centring follow the overlap setting', () => {
  const sr = 8000, x = new Float32Array(8000);
  for (const [ov, hop] of [[0, 1024], [0.5, 512], [0.75, 256], [0.875, 128]]) {
    const an = D.stft(x, sr, { fft: 1024, overlap: ov });
    assert.strictEqual(an.hop, hop); assert.strictEqual(an.nFrames, Math.floor(8000 / hop) + 1); assert.strictEqual(an.bins, 513);
    near(an.frameDur, hop / sr); near(an.binHz, sr / 1024);
  }
});
test('an impulse lands in the frame centred on it (frames are centred on i·hop)', () => {
  const sr = 8000, x = new Float32Array(8000);
  x[4000] = 1;
  const an = D.stft(x, sr, { fft: 512, overlap: 0.5, window: 'hann' });
  let best = -1, bestE = -Infinity;
  for (let f = 0; f < an.nFrames; f++) { const v = D.frameRow(an, f)[40]; if (v > bestE) { bestE = v; best = f; } }
  near(best * an.frameDur, 0.5, an.frameDur / 2);
});
test('a rising sweep: the per-frame peak frequency increases over time', () => {
  const sr = 22050, len = sr * 2, x = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) { const f = 200 + (4000 * i) / len; ph += (2 * Math.PI * f) / sr; x[i] = Math.sin(ph); }
  const an = D.stft(x, sr, { fft: 2048, overlap: 0.75 });
  let last = 0;
  for (const t of [0.2, 0.6, 1.0, 1.4, 1.8]) {
    const pk = D.findPeaks(D.frameRow(an, D.frameIndex(an, t)), an.binHz, { count: 1 })[0];
    near(pk.freq, 200 + 2000 * t, 30, `t=${t}`);
    assert(pk.freq > last); last = pk.freq;
  }
});
test('chunked STFT (step) gives exactly the same data as one-go STFT; maxCells caps memory', () => {
  const x = sine(440, 44100, 30000);
  const a = D.stft(x, 44100, { fft: 1024 }), job = D.createStft(x, 44100, { fft: 1024 });
  while (!job.step(7)) { /* chunks */ }
  assert.deepStrictEqual(Array.from(job.an.data.subarray(0, 2000)), Array.from(a.data.subarray(0, 2000)));
  assert(job.done); near(job.progress, 1);
  const capped = D.stft(new Float32Array(441000), 44100, { fft: 16384, overlap: 0.875, maxCells: 1e6 });
  assert(capped.nFrames * capped.bins <= 1e6 + capped.bins, 'cap'); assert(capped.hop > 2048);
});
test('silence stays at the floor value (no NaN / −Infinity)', () => {
  const an = D.stft(new Float32Array(4096), 44100, { fft: 1024 });
  for (const v of an.data) assert(v === D.FLOOR_DB);
});

console.log('scales & notes');
test('mel scale: mel(1000 Hz) ≈ 1000, round-trip, monotonic', () => {
  near(D.hzToMel(1000), 1000, 0.1); near(D.hzToMel(0), 0);
  for (const f of [20, 440, 8000, 20000]) near(D.melToHz(D.hzToMel(f)), f, 1e-6 * f);
  assert(D.hzToMel(2000) < 2 * D.hzToMel(1000));
});
test('makeScale: lin / log / mel map the range ends to 0 and 1 and invert', () => {
  for (const t of ['lin', 'log', 'mel']) {
    const sc = D.makeScale(t, 20, 20000);
    near(sc.toNorm(20), 0, 1e-9); near(sc.toNorm(20000), 1, 1e-9);
    for (const u of [0.1, 0.5, 0.9]) near(sc.toNorm(sc.fromNorm(u)), u, 1e-9);
  }
  near(D.makeScale('log', 20, 20000).toNorm(632.456), 0.5, 1e-4); // geometric middle
  near(D.makeScale('lin', 0, 1000).fromNorm(0.25), 250);
  assert(D.makeScale('log', 0, 1000).fmin >= D.LOG_MIN_HZ, 'log scale clamps 0 Hz');
});
test('note names: A4 = 440 Hz, middle C, sharps, octaves, cents', () => {
  const a = D.noteInfo(440);
  assert.strictEqual(a.label, 'A4'); assert.strictEqual(a.cents, 0); assert.strictEqual(a.nearest, 69);
  assert.strictEqual(D.noteInfo(261.6256).label, 'C4');
  assert.strictEqual(D.noteInfo(466.1638).label, 'A#4');
  assert.strictEqual(D.noteInfo(27.5).label, 'A0'); assert.strictEqual(D.noteInfo(4186.01).label, 'C8');
  assert.strictEqual(D.noteInfo(123.47).label, 'B2'); assert.strictEqual(D.noteInfo(130.81).label, 'C3');
  assert.strictEqual(D.noteInfo(445).cents, 20); assert.strictEqual(D.noteInfo(435).cents, -20);
  assert.strictEqual(D.noteInfo(0), null); assert.strictEqual(D.noteInfo(-5), null);
  assert.strictEqual(D.centsText(12), '+12 c'); assert.strictEqual(D.centsText(-7), '−7 c'); assert.strictEqual(D.centsText(0), '±0 c');
});
test('solfège names and A4 reference changes', () => {
  assert.strictEqual(D.noteInfo(440, 440, 'solf').label, 'La4');
  assert.strictEqual(D.noteInfo(293.66, 440, 'solf').label, 'Ré4');
  assert.strictEqual(D.noteInfo(432, 432).cents, 0);
  assert.strictEqual(D.noteInfo(440, 432).cents, 32);
  near(D.midiToFreq(60, 440), 261.6256, 1e-3); near(D.freqToMidi(880), 81, 1e-9);
  assert.strictEqual(D.pcName(13), 'C#'); assert.strictEqual(D.pcName(-1, 'solf'), 'Si');
});

console.log('peaks, chroma, key');
test('peak picking separates two sines and ranks them by level', () => {
  const sr = 44100, x = sine(220, sr, sr, 0.5), y = sine(1760, sr, sr, 0.1);
  for (let i = 0; i < x.length; i++) x[i] += y[i];
  const an = D.stft(x, sr, { fft: 8192 }), pk = D.findPeaks(D.averageSpectrum(an, 0.2, 0.8), an.binHz, { count: 5, halfWidth: 2 });
  near(pk[0].freq, 220, 1); near(pk[1].freq, 1760, 1); near(pk[0].db - pk[1].db, 13.98, 0.6);
  assert(pk.length <= 5);
  const lim = D.findPeaks(D.averageSpectrum(an, 0.2, 0.8), an.binHz, { count: 5, minHz: 500, maxHz: 5000 });
  near(lim[0].freq, 1760, 1, 'range limit');
});
test('chroma of an A-minor triad peaks on A, C and E', () => {
  const sr = 44100, x = new Float32Array(sr);
  for (const f of [220, 261.63, 329.63]) { const s = sine(f, sr, sr, 0.3); for (let i = 0; i < sr; i++) x[i] += s[i]; }
  const an = D.stft(x, sr, { fft: 8192 }), tot = D.chromaTotals(D.chromagram(an), an);
  const top = Array.from(tot).map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((p) => p[1]).sort((a, b) => a - b);
  assert.deepStrictEqual(top, [0, 4, 9]);
});
test('key estimate: C-major and A-minor profiles, demo signal, silence', () => {
  const cMaj = [5, 0, 3, 0, 4, 3, 0, 5, 0, 3, 0, 2], k = D.estimateKey(cMaj);
  assert.strictEqual(k.tonic, 0); assert.strictEqual(k.mode, 'major'); assert(k.r > 0.8);
  const rot = (a, n) => a.map((_, i) => a[(i - n + 12) % 12]);
  const g = D.estimateKey(rot(D.KK_MAJOR, 7)); assert.strictEqual(g.tonic, 7); near(g.r, 1, 1e-9);
  const am = D.estimateKey(rot(D.KK_MINOR, 9)); assert.strictEqual(am.tonic, 9); assert.strictEqual(am.mode, 'minor');
  assert.strictEqual(D.estimateKey(new Array(12).fill(0)), null);
  const demo = D.makeDemo(22050), an = D.stft(D.deriveChannel(demo.channels, 'mid'), demo.sr, { fft: 4096 }), dk = D.estimateKey(D.chromaTotals(D.chromagram(an), an));
  assert.strictEqual(dk.tonic, 9, 'demo is in A'); assert.strictEqual(dk.mode, 'minor');
});

console.log('stereo & demo');
test('correlation: identical +1, inverted −1, independent ≈ 0; width', () => {
  const L = sine(300, 44100, 44100), inv = L.map((v) => -v), rnd = D.prng(1), N1 = new Float32Array(44100).map(() => rnd() - 0.5), N2 = new Float32Array(44100).map(() => rnd() - 0.5);
  near(D.correlation(L, L), 1, 1e-9); near(D.correlation(L, inv), -1, 1e-9); near(D.correlation(N1, N2), 0, 0.03);
  assert.strictEqual(D.correlation(new Float32Array(10), L), 0);
  near(D.width(L, L), 0, 1e-9); assert(D.width(N1, N2) > 0.9);
});
test('deriveChannel: mid / left / right / side, mono passthrough', () => {
  const L = Float32Array.from([1, 0.5]), R = Float32Array.from([0, 0.5]);
  assert.deepStrictEqual(Array.from(D.deriveChannel([L, R], 'mid')), [0.5, 0.5]);
  assert.deepStrictEqual(Array.from(D.deriveChannel([L, R], 'side')), [0.5, 0]);
  assert.strictEqual(D.deriveChannel([L, R], 'left'), L); assert.strictEqual(D.deriveChannel([L, R], 'right'), R);
  assert.strictEqual(D.deriveChannel([L], 'side'), L);
});
test('demo signal: 8 s stereo, deterministic, −2 dBFS peak, chord / sweep / noise / plucks where expected', () => {
  const a = D.makeDemo(44100), b = D.makeDemo(44100);
  assert.strictEqual(a.channels.length, 2); assert.strictEqual(a.channels[0].length, 352800); near(a.duration, 8);
  assert.deepStrictEqual(a.channels[1].subarray(250000, 250050), b.channels[1].subarray(250000, 250050));
  let peak = 0;
  for (const c of a.channels) for (const v of c) peak = Math.max(peak, Math.abs(v));
  near(peak, 0.794, 1e-3);
  const an = D.stft(D.deriveChannel(a.channels, 'mid'), 44100, { fft: 4096 });
  const pk = (t) => D.findPeaks(D.frameRow(an, D.frameIndex(an, t)), an.binHz, { count: 1 })[0].freq;
  near(D.findPeaks(D.averageSpectrum(an, 0.5, 2.5), an.binHz, { count: 1 })[0].freq, 220, 2);
  assert(pk(3.3) < pk(4.2) && pk(4.2) < pk(5.2), 'sweep rises');
  near(pk(6.35), 440, 3);
  assert(D.correlation(a.channels[0], a.channels[1], 5.55 * 44100, 6.0 * 44100) < 0.3, 'noise burst is wide');
});

console.log('colour maps, settings, render, i18n');
test('colour maps: 256-entry LUTs, colourblind-safe "oasis" has monotonic luminance', () => {
  assert.strictEqual(CM.NAMES.length, 7);
  for (const name of CM.NAMES) assert.strictEqual(CM.lut(name).length, 768);
  for (const name of ['oasis', 'braise', 'glacier', 'sahara', 'gris']) {
    const l = CM.lut(name);
    let prev = -1;
    for (let i = 0; i < 256; i++) { const y = CM.luminance(l[i * 3], l[i * 3 + 1], l[i * 3 + 2]); assert(y >= prev - 1e-4, `${name} luminance at ${i}`); prev = y; }
  }
  const o = CM.lut('oasis');
  assert(o[2] > o[0] && o[255 * 3] > o[255 * 3 + 2], 'blue → yellow');
  assert.match(CM.gradient('braise'), /^linear-gradient\(to right, #06030a/);
});
test('settings: validation clamps / falls back, keeps dB and frequency ranges ordered', () => {
  const d = ST.validate({});
  assert.deepStrictEqual(d, ST.DEFAULTS);
  const s = ST.validate({ fft: '8192', win: 'evil', ov: '87.5', scale: 'mel', dbMin: -500, dbMax: -95, a4: 999, peaks: 0, grid: '1', piano: 'false', fmin: 5000, fmax: 100 });
  assert.strictEqual(s.fft, 8192); assert.strictEqual(s.win, 'hann'); assert.strictEqual(s.ov, 87.5); assert.strictEqual(s.scale, 'mel');
  assert.strictEqual(s.dbMin, -160); assert.strictEqual(s.dbMax, -95); assert.strictEqual(s.a4, 480); assert.strictEqual(s.peaks, 1);
  assert.strictEqual(s.grid, true); assert.strictEqual(s.piano, false); assert(s.fmax > s.fmin);
  const t = ST.validate({ dbMin: -20, dbMax: -15 }); assert(t.dbMax - t.dbMin >= 10);
  assert.strictEqual(ST.validate(null).fft, 4096); assert.strictEqual(ST.validate({ fft: 3000 }).fft, 4096);
});
test('settings: URL hash round-trip, defaults omitted, extras (lang) kept', () => {
  assert.strictEqual(ST.toHash(ST.defaults()), '');
  const s = ST.validate({ fft: 16384, win: 'blackmanharris', scale: 'lin', cmap: 'oasis', grid: true, a4: 432, fmin: 50.5, ch: 'side', spec: 'playhead' });
  const h = ST.toHash(s);
  assert.match(h, /fft=16384/); assert.match(h, /cm=oasis/); assert.match(h, /grid=1/); assert(!/win=hann/.test(h));
  const r = ST.fromHash('#' + h + '&lang=en&tf=1');
  assert.deepStrictEqual(r.settings, s); assert.strictEqual(r.extra.lang, 'en'); assert.strictEqual(r.extra.tf, '1');
  assert.deepStrictEqual(ST.fromHash('#fft=%E0%A4%A&junk').settings, ST.DEFAULTS);
});
test('renderSpectrogram: correct size, sine row is brightest, out-of-signal columns use the background', () => {
  const sr = 8000, an = D.stft(sine(1000, sr, sr), sr, { fft: 512 }), w = 60, h = 40, px = new Uint8ClampedArray(w * h * 4);
  const view = { t0: -0.5, t1: 1, scale: D.makeScale('lin', 0, 4000), dbMin: -100, dbMax: 0 };
  R.renderSpectrogram(an, view, w, h, CM.lut('gris'), px, [1, 2, 3]);
  assert.deepStrictEqual(Array.from(px.subarray(0, 4)), [1, 2, 3, 255]);
  const x = 50, rowOf = (y) => px[(y * w + x) * 4];
  let best = 0, by = 0;
  for (let y = 0; y < h; y++) if (rowOf(y) > best) { best = rowOf(y); by = y; }
  near(by, Math.floor(h * (1 - 1000 / 4000)), 1); assert(best > 240);
  for (let i = 3; i < px.length; i += 4) assert.strictEqual(px[i], 255);
});
test('renderChroma: 12 rows, the active pitch class is brightest', () => {
  const sr = 22050, an = D.stft(sine(440, sr, sr, 0.5), sr, { fft: 4096 }), ch = D.chromagram(an), w = 20, h = 24, px = new Uint8ClampedArray(w * h * 4);
  R.renderChroma(ch, an, { t0: 0, t1: 1 }, w, h, CM.lut('gris'), px, 0);
  const val = (pc) => px[(((11 - pc) * 2) * w + 10) * 4];
  for (let pc = 0; pc < 12; pc++) if (pc !== 9) assert(val(9) > val(pc), `A brighter than ${pc}`);
});
test('ticks and labels: nice steps, log decades, Hz / time formats', () => {
  assert.deepStrictEqual(R.niceTicks(0, 10, 5), [0, 2, 4, 6, 8, 10]);
  assert.deepStrictEqual(R.niceTicks(-100, 0, 4), [-100, -80, -60, -40, -20, 0]);
  const ft = R.freqTicks(D.makeScale('log', 20, 20000), 400);
  for (const f of [100, 1000, 10000]) assert(ft.major.includes(f));
  assert.strictEqual(R.formatHz(1000), '1k'); assert.strictEqual(R.formatHz(2500), '2.5k'); assert.strictEqual(R.formatHz(440), '440');
  assert.strictEqual(R.formatTime(75.25, 100), '1:15'); assert.strictEqual(R.formatTime(1.234, 2), '1.23'); assert.strictEqual(R.formatTime(-2, 10), '−2.0');
});
test('i18n: every key has FR / EN / Taqbaylit, placeholders, Tifinagh transliteration', () => {
  for (const [k, v] of Object.entries(I.S)) { assert.strictEqual(v.length, 3, k); v.forEach((s) => assert(typeof s === 'string' && s.length, k)); }
  assert.strictEqual(I.t('spectrum', 'en'), 'Spectrum'); assert.strictEqual(I.t('spectrum', 'xx'), 'Spectre');
  assert.strictEqual(I.t('exported', 'fr', { name: 'a.png' }), 'a.png exporté.');
  assert.strictEqual(I.t('spectrogram', 'kab', null, true), 'ⴰⵙⵒⴻⴽⵟⵔⵓⴳⵔⴰⵎ');
  assert.strictEqual(I.toTifinagh('FFT 4096 Hz {n} <b>tasarut</b>'), 'FFT 4096 Hz {n} <b>ⵜⴰⵙⴰⵔⵓⵜ</b>');
});

console.log(`\n${n} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
