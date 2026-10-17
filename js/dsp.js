/* dsp.js — Spectre Atelier signal processing core (no DOM, usable in the browser and in Node).
 * Radix-2 FFT, analysis windows, chunked STFT, frequency scales (linear / log / mel), note names,
 * peak picking with parabolic interpolation, averaged spectra, chromagram + key estimate, stereo tools
 * and the built-in synthesized demo signal. Original code, MIT licence. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpectreDSP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FLOOR_DB = -200;           // value stored for "silence" (below any display range)
  const LN10_10 = Math.LN10 / 10;  // for 10^(dB/10) = exp(dB * LN10_10)
  const LN10_20 = Math.LN10 / 20;

  // ------------------------------------------------------------------ FFT
  const tableCache = new Map();
  /** Bit-reversal permutation and twiddle factors for size n (cached). */
  function fftTables(n) {
    let t = tableCache.get(n);
    if (t) return t;
    if (!(n >= 2) || (n & (n - 1))) throw new Error('FFT size must be a power of two ≥ 2');
    const bits = Math.round(Math.log2(n)), rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0, x = i;
      for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      rev[i] = r;
    }
    const cos = new Float64Array(n >> 1), sin = new Float64Array(n >> 1);
    for (let i = 0; i < n >> 1; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
    t = { rev, cos, sin };
    tableCache.set(n, t);
    return t;
  }

  /** In-place forward complex FFT (X[k] = Σ x[n]·e^(−2πikn/N)); re and im have the same power-of-two length. */
  function fft(re, im) {
    const n = re.length, { rev, cos, sin } = fftTables(n);
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let tmp = re[i]; re[i] = re[j]; re[j] = tmp; tmp = im[i]; im[i] = im[j]; im[j] = tmp; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0, t = 0; k < half; k++, t += step) {
          const i = start + k, j = i + half, wr = cos[t], wi = sin[t];
          const xr = re[j] * wr - im[j] * wi, xi = re[j] * wi + im[j] * wr;
          re[j] = re[i] - xr; im[j] = im[i] - xi;
          re[i] += xr; im[i] += xi;
        }
      }
    }
  }

  // ------------------------------------------------------------------ windows
  /** Window types: id → mainlobe half-width in bins (used by the peak picker). */
  const WINDOWS = { hann: 2, hamming: 2, blackmanharris: 4, rect: 1 };
  /** Periodic (DFT-even) analysis window of length n. */
  function makeWindow(type, n) {
    const w = new Float32Array(n), k = (2 * Math.PI) / n;
    for (let i = 0; i < n; i++) {
      const x = k * i;
      switch (type) {
        case 'rect': w[i] = 1; break;
        case 'hamming': w[i] = 0.54 - 0.46 * Math.cos(x); break;
        case 'blackmanharris': w[i] = 0.35875 - 0.48829 * Math.cos(x) + 0.14128 * Math.cos(2 * x) - 0.01168 * Math.cos(3 * x); break;
        default: w[i] = 0.5 - 0.5 * Math.cos(x); // hann
      }
    }
    return w;
  }

  /** Single-sided amplitude spectrum in dBFS (a full-scale sine reads ≈ 0 dB) of one frame.
   *  frame: Float32Array(n) of samples; win: window(n); out: Float32Array(n/2+1); re/im: Float64Array(n) work buffers. */
  function spectrumDb(frame, win, out, re, im, wsum) {
    const n = win.length;
    if (wsum == null) { wsum = 0; for (let i = 0; i < n; i++) wsum += win[i]; }
    for (let i = 0; i < n; i++) { re[i] = frame[i] * win[i]; im[i] = 0; }
    fft(re, im);
    const g = 20 * Math.log10(2 / wsum), h = n >> 1;
    for (let k = 0; k <= h; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      let v = p > 1e-30 ? 10 * Math.log10(p) + g : FLOOR_DB;
      if (k === 0 || k === h) v -= 6.0206; // DC and Nyquist are not doubled
      out[k] = v < FLOOR_DB ? FLOOR_DB : v;
    }
    return out;
  }

  // ------------------------------------------------------------------ STFT
  /** Chunked short-time Fourier transform. Frames are centred on t = i·hop/sr (zero padding at the edges).
   *  opts: { fft, window, overlap (0…0.95), maxCells } — the hop grows if frames × bins would exceed maxCells.
   *  Call job.step(count) until it returns true (lets the UI stay responsive), or use stft() for one go. */
  function createStft(x, sr, opts) {
    const n = opts.fft || 4096, type = opts.window || 'hann', bins = (n >> 1) + 1;
    const ov = Math.min(0.95, Math.max(0, opts.overlap == null ? 0.75 : opts.overlap));
    const maxCells = opts.maxCells || 16e6;
    let hop = Math.max(1, Math.round(n * (1 - ov)));
    let nFrames = Math.floor(x.length / hop) + 1;
    if (nFrames * bins > maxCells) {
      const maxFrames = Math.max(2, Math.floor(maxCells / bins));
      hop = Math.ceil(x.length / (maxFrames - 1));
      nFrames = Math.floor(x.length / hop) + 1;
    }
    const win = makeWindow(type, n);
    let wsum = 0;
    for (let i = 0; i < n; i++) wsum += win[i];
    const data = new Float32Array(nFrames * bins);
    const frame = new Float32Array(n), re = new Float64Array(n), im = new Float64Array(n), out = new Float32Array(bins);
    const an = { fft: n, bins, hop, nFrames, sr, window: type, overlap: ov, frameDur: hop / sr, binHz: sr / n, duration: x.length / sr, data, live: false };
    let i = 0;
    const job = {
      an,
      get done() { return i >= nFrames; },
      get progress() { return i / nFrames; },
      step(count) {
        const end = Math.min(nFrames, i + Math.max(1, Math.floor(count) || 1));
        for (; i < end; i++) {
          const start = i * hop - (n >> 1);
          if (start >= 0 && start + n <= x.length) frame.set(x.subarray(start, start + n));
          else for (let j = 0; j < n; j++) { const s = start + j; frame[j] = s >= 0 && s < x.length ? x[s] : 0; }
          spectrumDb(frame, win, out, re, im, wsum);
          data.set(out, i * bins);
        }
        return i >= nFrames;
      },
    };
    return job;
  }
  function stft(x, sr, opts) { const job = createStft(x, sr, opts); job.step(Infinity); return job.an; }
  /** dB row of frame i (a view, not a copy). */
  const frameRow = (an, i) => an.data.subarray(i * an.bins, (i + 1) * an.bins);
  const frameIndex = (an, t) => Math.max(0, Math.min(an.nFrames - 1, Math.round(t / an.frameDur)));

  /** Power-averaged spectrum (dB) over the frames whose centres lie in [t0, t1]. */
  function averageSpectrum(an, t0, t1) {
    const bins = an.bins, acc = new Float64Array(bins), out = new Float32Array(bins);
    let a = Math.max(0, Math.ceil(t0 / an.frameDur - 1e-9)), b = Math.min(an.nFrames - 1, Math.floor(t1 / an.frameDur + 1e-9));
    if (b < a) { a = b = frameIndex(an, (t0 + t1) / 2); }
    for (let f = a; f <= b; f++) {
      const o = f * bins;
      for (let k = 0; k < bins; k++) acc[k] += Math.exp(an.data[o + k] * LN10_10);
    }
    const cnt = b - a + 1;
    for (let k = 0; k < bins; k++) { const p = acc[k] / cnt; out[k] = p > 1e-20 ? 10 * Math.log10(p) : FLOOR_DB; }
    return out;
  }

  // ------------------------------------------------------------------ frequency scales
  const hzToMel = (f) => 2595 * Math.log10(1 + f / 700);          // HTK formula: mel(1000 Hz) ≈ 1000
  const melToHz = (m) => 700 * (Math.pow(10, m / 2595) - 1);
  const LOG_MIN_HZ = 10;
  /** Maps frequencies of [fmin, fmax] to [0, 1] on a linear, logarithmic or mel axis (and back). */
  function makeScale(type, fmin, fmax) {
    if (type === 'log') {
      const a = Math.log(Math.max(LOG_MIN_HZ, fmin)), b = Math.log(Math.max(fmax, Math.max(LOG_MIN_HZ, fmin) * 1.01));
      return { type, fmin: Math.exp(a), fmax: Math.exp(b), toNorm: (f) => (Math.log(Math.max(f, 1e-9)) - a) / (b - a), fromNorm: (u) => Math.exp(a + u * (b - a)) };
    }
    if (type === 'mel') {
      const a = hzToMel(Math.max(0, fmin)), b = hzToMel(fmax);
      return { type, fmin: Math.max(0, fmin), fmax, toNorm: (f) => (hzToMel(f) - a) / (b - a), fromNorm: (u) => melToHz(a + u * (b - a)) };
    }
    const a = Math.max(0, fmin), b = fmax;
    return { type: 'lin', fmin: a, fmax: b, toNorm: (f) => (f - a) / (b - a), fromNorm: (u) => a + u * (b - a) };
  }

  // ------------------------------------------------------------------ notes
  const NAMES = {
    en: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    solf: ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'],
  };
  const freqToMidi = (f, a4 = 440) => 69 + 12 * Math.log2(f / a4);
  const midiToFreq = (m, a4 = 440) => a4 * Math.pow(2, (m - 69) / 12);
  const pcName = (pc, notation = 'en') => (NAMES[notation] || NAMES.en)[((pc % 12) + 12) % 12];
  /** Nearest equal-tempered note of f: name, octave (scientific pitch notation, A4 = reference), cents offset. */
  function noteInfo(f, a4 = 440, notation = 'en') {
    if (!(f > 0) || !isFinite(f)) return null;
    const m = freqToMidi(f, a4), r = Math.round(m), pc = ((r % 12) + 12) % 12, octave = Math.floor(r / 12) - 1;
    let cents = Math.round((m - r) * 100);
    if (cents === 0) cents = 0; // no "-0"
    const name = pcName(pc, notation);
    return { midi: m, nearest: r, pc, octave, cents, name, label: name + octave };
  }
  const centsText = (c) => (c > 0 ? '+' : c < 0 ? '−' : '±') + Math.abs(c) + ' c';

  // ------------------------------------------------------------------ peaks
  /** Local maxima of a dB spectrum, refined by parabolic interpolation, strongest first.
   *  opts: { count, minHz, maxHz, halfWidth (bins of the mainlobe), range (dB below the max kept) } */
  function findPeaks(db, binHz, opts = {}) {
    const count = opts.count || 10, hw = Math.max(1, opts.halfWidth || 2), range = opts.range == null ? 90 : opts.range;
    const lo = Math.max(1, Math.ceil((opts.minHz || 0) / binHz)), hi = Math.min(db.length - 2, Math.floor((opts.maxHz || Infinity) / binHz));
    let max = -Infinity;
    for (let k = lo; k <= hi; k++) if (db[k] > max) max = db[k];
    const floor = Math.max(FLOOR_DB + 1, max - range), found = [];
    for (let k = lo; k <= hi; k++) {
      const v = db[k];
      if (v < floor) continue;
      let ok = true;
      for (let d = 1; d <= hw && ok; d++) {
        if (k - d >= 0 && db[k - d] >= v) ok = false;          // strictly above the left side…
        else if (k + d < db.length && db[k + d] > v) ok = false; // …and not below the right side (plateaus count once)
      }
      if (!ok) continue;
      const a = db[k - 1], c = db[k + 1], den = a - 2 * v + c;
      const p = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
      found.push({ bin: k, freq: (k + p) * binHz, db: v - 0.25 * (a - c) * p });
    }
    found.sort((x, y) => y.db - x.db);
    return found.slice(0, count);
  }

  // ------------------------------------------------------------------ chroma & key
  /** Bin → pitch class (0 = C … 11 = B) for bins between fmin and fmax, −1 elsewhere. The low limit is raised
   *  so that a bin is never wider than about 1.5 semitones (coarse low bins would smear the classes). */
  function chromaMap(bins, binHz, a4 = 440, fmin = 55, fmax = 5000) {
    const map = new Int8Array(bins).fill(-1), lo = Math.max(fmin, 11 * binHz);
    for (let k = 1; k < bins; k++) {
      const f = k * binHz;
      if (f < lo || f > fmax) continue;
      map[k] = ((Math.round(freqToMidi(f, a4)) % 12) + 12) % 12;
    }
    return map;
  }
  /** Pitch-class energy of one dB frame (amplitude-weighted). */
  function chromaFrame(row, map, out, offset = 0) {
    for (let p = 0; p < 12; p++) out[offset + p] = 0;
    for (let k = 0; k < row.length; k++) { const pc = map[k]; if (pc >= 0) out[offset + pc] += Math.exp(row[k] * LN10_20); }
    return out;
  }
  /** Raw chroma for every frame: Float32Array(nFrames × 12). Display code normalizes per frame. */
  function chromagram(an, a4 = 440) {
    const map = chromaMap(an.bins, an.binHz, a4), out = new Float32Array(an.nFrames * 12);
    for (let f = 0; f < an.nFrames; f++) chromaFrame(frameRow(an, f), map, out, f * 12);
    return out;
  }
  /** Sum of the chroma frames in [t0, t1]. */
  function chromaTotals(chroma, an, t0 = 0, t1 = Infinity) {
    const tot = new Float64Array(12);
    const a = Math.max(0, Math.ceil(t0 / an.frameDur - 1e-9)), b = Math.min(an.nFrames - 1, Math.floor(t1 / an.frameDur + 1e-9));
    for (let f = a; f <= b; f++) for (let p = 0; p < 12; p++) tot[p] += chroma[f * 12 + p];
    return tot;
  }
  // Krumhansl–Kessler key profiles (probe-tone ratings, C major / C minor).
  const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function pearson(a, b) {
    const n = a.length;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
  }
  /** Krumhansl–Schmuckler key estimate: best of the 24 rotated profiles. Returns null for silence. */
  function estimateKey(totals) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += totals[i];
    if (!(sum > 0)) return null;
    const ranking = [];
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const mode of ['major', 'minor']) {
        const prof = mode === 'major' ? KK_MAJOR : KK_MINOR, rot = new Array(12);
        for (let i = 0; i < 12; i++) rot[i] = prof[(i - tonic + 12) % 12];
        ranking.push({ tonic, mode, r: pearson(totals, rot) });
      }
    }
    ranking.sort((x, y) => y.r - x.r);
    return { tonic: ranking[0].tonic, mode: ranking[0].mode, r: ranking[0].r, ranking };
  }

  // ------------------------------------------------------------------ stereo
  /** Signal analysed for a channel mode: mid (L+R)/2, left, right or side (L−R)/2. Mono sources return channel 0. */
  function deriveChannel(chs, mode) {
    const L = chs[0], R = chs[1];
    if (!R || mode === 'left') return L;
    if (mode === 'right') return R;
    const out = new Float32Array(L.length), s = mode === 'side' ? -1 : 1;
    for (let i = 0; i < L.length; i++) out[i] = 0.5 * (L[i] + s * R[i]);
    return out;
  }
  /** Pearson-style phase correlation Σ L·R / √(Σ L² · Σ R²) over [a, b): +1 mono, 0 uncorrelated, −1 out of phase. */
  function correlation(L, R, a = 0, b = L.length) {
    let lr = 0, ll = 0, rr = 0;
    a = Math.max(0, a | 0); b = Math.min(L.length, b | 0);
    for (let i = a; i < b; i++) { const l = L[i], r = R[i]; lr += l * r; ll += l * l; rr += r * r; }
    return ll > 1e-12 && rr > 1e-12 ? lr / Math.sqrt(ll * rr) : 0;
  }
  /** Stereo width: side RMS / mid RMS over [a, b). */
  function width(L, R, a = 0, b = L.length) {
    let m = 0, s = 0;
    for (let i = Math.max(0, a | 0); i < Math.min(L.length, b | 0); i++) { const mi = L[i] + R[i], si = L[i] - R[i]; m += mi * mi; s += si * si; }
    return m > 1e-12 ? Math.sqrt(s / m) : 0;
  }

  // ------------------------------------------------------------------ demo signal
  /** Small deterministic PRNG (mulberry32). */
  function prng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** 8 s stereo test signal, generated in code: A-minor chord with bass (0–3 s), exponential sine sweep
   *  40 Hz → 18 kHz (3–5.5 s), wide stereo noise burst (5.5–6.2 s), ping-pong plucked arpeggio A4-C5-E5-A5 (6.3–8 s). */
  function makeDemo(sr = 44100) {
    const len = Math.round(8 * sr), L = new Float32Array(len), R = new Float32Array(len), rnd = prng(20261017);
    const add = (i, v, pan) => { L[i] += v * Math.cos((pan + 1) * Math.PI / 4); R[i] += v * Math.sin((pan + 1) * Math.PI / 4); };
    const tone = (f, t0, t1, amp, pan, harm, decay) => {
      const a = Math.round(t0 * sr), b = Math.min(len, Math.round(t1 * sr));
      for (let i = a; i < b; i++) {
        const t = (i - a) / sr, rel = (b - i) / sr;
        const env = Math.min(1, t / 0.015) * Math.min(1, rel / 0.08) * (decay ? Math.exp(-t / decay) : 1);
        let v = 0;
        for (let h = 1; h <= harm; h++) if (f * h < sr / 2) v += Math.sin(2 * Math.PI * f * h * t) / Math.pow(h, 1.3);
        add(i, amp * env * v, pan);
      }
    };
    // chord: A2 bass + A3 C4 E4
    tone(110, 0, 3, 0.16, 0, 6, 0);
    tone(220, 0.05, 3, 0.12, 0, 5, 0);
    tone(261.63, 0.1, 3, 0.1, -0.5, 5, 0);
    tone(329.63, 0.15, 3, 0.1, 0.5, 5, 0);
    // exponential sweep
    { const a = Math.round(3 * sr), b = Math.round(5.5 * sr), T = (b - a) / sr, f0 = 40, f1 = 18000, k = Math.log(f1 / f0);
      for (let i = a; i < b; i++) {
        const t = (i - a) / sr, ph = (2 * Math.PI * f0 * T / k) * (Math.exp((t / T) * k) - 1);
        const env = Math.min(1, t / 0.02) * Math.min(1, (T - t) / 0.02);
        add(i, 0.32 * env * Math.sin(ph), 0);
      } }
    // decorrelated noise burst (one-pole low-pass, exponential decay)
    { const a = Math.round(5.5 * sr), b = Math.round(6.2 * sr); let yl = 0, yr = 0;
      for (let i = a; i < b; i++) {
        const t = (i - a) / sr, env = Math.min(1, t / 0.003) * Math.exp(-t / 0.18);
        yl += 0.35 * ((rnd() * 2 - 1) - yl); yr += 0.35 * ((rnd() * 2 - 1) - yr);
        L[i] += 0.5 * env * yl; R[i] += 0.5 * env * yr;
      } }
    // ping-pong plucks
    [440, 523.25, 659.26, 880].forEach((f, j) => tone(f, 6.3 + j * 0.42, 6.3 + j * 0.42 + 0.9 > 8 ? 8 : 6.3 + j * 0.42 + 0.9, 0.22, j % 2 ? 0.7 : -0.7, 8, 0.25));
    // normalize to −2 dBFS peak
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const g = 0.794 / peak;
    for (let i = 0; i < len; i++) { L[i] *= g; R[i] *= g; }
    return { name: 'demo', sr, channels: [L, R], duration: len / sr };
  }

  return {
    FLOOR_DB, WINDOWS, NAMES, KK_MAJOR, KK_MINOR,
    fft, fftTables, makeWindow, spectrumDb, createStft, stft, frameRow, frameIndex, averageSpectrum,
    hzToMel, melToHz, makeScale, LOG_MIN_HZ, freqToMidi, midiToFreq, pcName, noteInfo, centsText, findPeaks,
    chromaMap, chromaFrame, chromagram, chromaTotals, pearson, estimateKey,
    deriveChannel, correlation, width, prng, makeDemo,
  };
});
