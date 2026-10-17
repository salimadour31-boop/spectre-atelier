/* settings.js — Spectre Atelier settings: defaults, validation (clamping) and the shareable URL hash.
 * Original code, MIT licence. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpectreSettings = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const FFTS = [512, 1024, 2048, 4096, 8192, 16384];
  const WINDOWS = ['hann', 'hamming', 'blackmanharris', 'rect'];
  const OVERLAPS = [0, 50, 75, 87.5];
  const SCALES = ['lin', 'log', 'mel'];
  const CMAPS = ['braise', 'oasis', 'glacier', 'sahara', 'prisme', 'gris', 'encre'];
  const CHANNELS = ['mid', 'left', 'right', 'side'];
  const SPEC_MODES = ['avg', 'playhead'];
  const NOTATIONS = ['auto', 'en', 'solf'];
  const PNG_SIZES = ['1920x1080', '3000x1500', '4096x2048'];
  const DEFAULTS = { fft: 4096, win: 'hann', ov: 75, scale: 'log', dbMin: -100, dbMax: 0, cmap: 'braise', fmin: 20, fmax: 20000,
    ch: 'mid', a4: 440, grid: false, piano: true, peaks: 10, spec: 'avg', nt: 'auto', png: '3000x1500' };
  // short keys used in the URL hash
  const HASH = { fft: 'fft', win: 'win', ov: 'ov', scale: 'sc', dbMin: 'db0', dbMax: 'db1', cmap: 'cm', fmin: 'f0', fmax: 'f1',
    ch: 'ch', a4: 'a4', grid: 'grid', piano: 'piano', peaks: 'pk', spec: 'sp', nt: 'nt', png: 'png' };

  const defaults = () => ({ ...DEFAULTS });
  const num = (v, d, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const pick = (v, list, d) => (list.includes(v) ? v : list.includes(Number(v)) ? Number(v) : d);
  const bool = (v, d) => (v === true || v === 'true' || v === '1' || v === 1 ? true : v === false || v === 'false' || v === '0' || v === 0 ? false : d);

  /** Returns a complete, valid settings object from any partial / untrusted input. */
  function validate(input) {
    const i = input && typeof input === 'object' ? input : {}, d = DEFAULTS;
    const s = {
      fft: pick(i.fft, FFTS, d.fft), win: pick(i.win, WINDOWS, d.win), ov: pick(i.ov, OVERLAPS, d.ov), scale: pick(i.scale, SCALES, d.scale),
      dbMin: Math.round(num(i.dbMin, d.dbMin, -160, -10)), dbMax: Math.round(num(i.dbMax, d.dbMax, -100, 20)),
      cmap: pick(i.cmap, CMAPS, d.cmap), fmin: num(i.fmin, d.fmin, 0, 95000), fmax: num(i.fmax, d.fmax, 10, 96000),
      ch: pick(i.ch, CHANNELS, d.ch), a4: Math.round(num(i.a4, d.a4, 400, 480) * 10) / 10, grid: bool(i.grid, d.grid), piano: bool(i.piano, d.piano),
      peaks: Math.round(num(i.peaks, d.peaks, 1, 30)), spec: pick(i.spec, SPEC_MODES, d.spec), nt: pick(i.nt, NOTATIONS, d.nt), png: pick(i.png, PNG_SIZES, d.png),
    };
    if (s.dbMax - s.dbMin < 10) s.dbMin = s.dbMax - 10;
    if (s.fmax <= s.fmin + 1) s.fmax = Math.min(96000, s.fmin + 100);
    s.fmin = Math.round(s.fmin * 10) / 10; s.fmax = Math.round(s.fmax * 10) / 10;
    return s;
  }
  /** Settings → "fft=4096&win=hann&…" (only values that differ from the defaults). */
  function toHash(s) {
    const p = [];
    for (const k of Object.keys(DEFAULTS)) if (s[k] !== DEFAULTS[k]) p.push(HASH[k] + '=' + encodeURIComponent(typeof s[k] === 'boolean' ? (s[k] ? 1 : 0) : s[k]));
    return p.join('&');
  }
  /** "#fft=8192&sc=mel…" → validated settings plus the extra keys (lang, tfng) found. */
  function fromHash(hash) {
    const raw = {}, extra = {}, inv = {};
    for (const k of Object.keys(HASH)) inv[HASH[k]] = k;
    String(hash || '').replace(/^#/, '').split('&').forEach((pair) => {
      if (!pair) return;
      const [k, v = ''] = pair.split('=');
      let val;
      try { val = decodeURIComponent(v); } catch (e) { val = v; }
      if (inv[k]) raw[inv[k]] = val; else extra[k] = val;
    });
    return { settings: validate(raw), extra, count: Object.keys(raw).length };
  }
  return { FFTS, WINDOWS, OVERLAPS, SCALES, CMAPS, CHANNELS, SPEC_MODES, NOTATIONS, PNG_SIZES, DEFAULTS, defaults, validate, toHash, fromHash };
});
