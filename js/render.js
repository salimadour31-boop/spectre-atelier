/* render.js — Spectre Atelier drawing: spectrogram / chromagram rasterization into RGBA buffers (pure, testable)
 * and canvas helpers for axes, note grid, piano ruler, colour bar and the high-resolution PNG export.
 * Original code, MIT licence. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dsp.js'));
  else root.SpectreRender = factory(root.SpectreDSP);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  const BLACK_KEYS = [false, true, false, true, false, false, true, false, true, false, true, false];

  /** Rasterizes the spectrogram view into px (RGBA, w × h). view = { t0, t1, scale (from makeScale), dbMin, dbMax }.
   *  Several frames / bins per pixel → maximum (no peak is lost when zoomed out); less than one bin per pixel →
   *  linear interpolation between bins. Columns outside the signal get the background colour bg. */
  function renderSpectrogram(an, view, w, h, lut, px, bg = [8, 10, 14]) {
    const bins = an.bins, binHz = an.binHz, sc = view.scale, k255 = 255 / Math.max(1e-6, view.dbMax - view.dbMin), dbMin = view.dbMin;
    const rA = new Int32Array(h), rB = new Int32Array(h), rF = new Float32Array(h);
    let minBin = bins - 1, maxBin = 0;
    for (let y = 0; y < h; y++) {
      const fTop = sc.fromNorm(1 - y / h), fBot = sc.fromNorm(1 - (y + 1) / h), fc = sc.fromNorm(1 - (y + 0.5) / h);
      const bLo = fBot / binHz, bHi = fTop / binHz;
      if (bHi - bLo < 1) {
        const b = Math.min(bins - 1, Math.max(0, fc / binHz));
        rA[y] = Math.min(bins - 2, Math.floor(b)); rB[y] = -1; rF[y] = b - rA[y];
        minBin = Math.min(minBin, rA[y]); maxBin = Math.max(maxBin, rA[y] + 1);
      } else {
        rA[y] = Math.min(bins - 1, Math.max(0, Math.ceil(bLo))); rB[y] = Math.min(bins - 1, Math.max(rA[y], Math.floor(bHi)));
        minBin = Math.min(minBin, rA[y]); maxBin = Math.max(maxBin, rB[y]);
      }
    }
    const col = new Float32Array(bins), dt = (view.t1 - view.t0) / w, fd = an.frameDur;
    for (let x = 0; x < w; x++) {
      const tA = view.t0 + x * dt, tB = tA + dt;
      if (tB < -fd / 2 || tA > an.duration + fd / 2) {
        for (let y = 0; y < h; y++) { const o = (y * w + x) * 4; px[o] = bg[0]; px[o + 1] = bg[1]; px[o + 2] = bg[2]; px[o + 3] = 255; }
        continue;
      }
      let fa = Math.max(0, Math.ceil(tA / fd - 1e-9)), fb = Math.min(an.nFrames - 1, Math.ceil(tB / fd - 1e-9) - 1), row;
      if (fb <= fa) row = D.frameRow(an, fb < fa ? D.frameIndex(an, (tA + tB) / 2) : fa);
      else {
        col.fill(-Infinity, minBin, maxBin + 1);
        for (let f = fa; f <= fb; f++) {
          const o = f * bins, d = an.data;
          for (let k = minBin; k <= maxBin; k++) { const v = d[o + k]; if (v > col[k]) col[k] = v; }
        }
        row = col;
      }
      for (let y = 0; y < h; y++) {
        let v;
        const a = rA[y], b = rB[y];
        if (b < 0) v = row[a] + (row[a + 1] - row[a]) * rF[y];
        else { v = row[a]; for (let k = a + 1; k <= b; k++) if (row[k] > v) v = row[k]; }
        let i = ((v - dbMin) * k255) | 0;
        i = i < 0 ? 0 : i > 255 ? 255 : i;
        const o = (y * w + x) * 4;
        px[o] = lut[i * 3]; px[o + 1] = lut[i * 3 + 1]; px[o + 2] = lut[i * 3 + 2]; px[o + 3] = 255;
      }
    }
    return px;
  }

  /** Chromagram raster: 12 rows (C at the bottom), each column normalized to its loudest pitch class.
   *  Quiet columns (below gate, relative to the loudest column of the file) are dimmed. */
  function renderChroma(chroma, an, view, w, h, lut, px, gateMax, bg = [8, 10, 14]) {
    const dt = (view.t1 - view.t0) / w, fd = an.frameDur, acc = new Float64Array(12);
    for (let x = 0; x < w; x++) {
      const tA = view.t0 + x * dt, tB = tA + dt;
      let fa = Math.max(0, Math.ceil(tA / fd - 1e-9)), fb = Math.min(an.nFrames - 1, Math.ceil(tB / fd - 1e-9) - 1);
      const out = tB < -fd / 2 || tA > an.duration + fd / 2;
      if (fb < fa) fa = fb = D.frameIndex(an, (tA + tB) / 2);
      acc.fill(0);
      if (!out) for (let f = fa; f <= fb; f++) for (let p = 0; p < 12; p++) acc[p] += chroma[f * 12 + p];
      let m = 0;
      for (let p = 0; p < 12; p++) m = Math.max(m, acc[p]);
      const level = gateMax > 0 ? Math.min(1, Math.sqrt(m / (fb - fa + 1) / gateMax) * 1.6) : 1;
      for (let y = 0; y < h; y++) {
        const o = (y * w + x) * 4;
        if (out) { px[o] = bg[0]; px[o + 1] = bg[1]; px[o + 2] = bg[2]; px[o + 3] = 255; continue; }
        const pc = 11 - Math.min(11, Math.floor((y * 12) / h));
        const i = m > 0 ? Math.max(0, Math.min(255, Math.round(255 * (acc[pc] / m) * (acc[pc] / m) * level))) : 0;
        px[o] = lut[i * 3]; px[o + 1] = lut[i * 3 + 1]; px[o + 2] = lut[i * 3 + 2]; px[o + 3] = 255;
      }
    }
    return px;
  }

  // ------------------------------------------------------------------ ticks & labels
  /** "Nice" linear ticks (1, 2, 5 × 10^k steps) covering [a, b] with about count intervals. */
  function niceTicks(a, b, count) {
    if (!(b > a)) return [a];
    const raw = (b - a) / Math.max(1, count), p = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / p;
    const step = (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p, out = [];
    for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + step * 1e-9; v += step) out.push(Math.round(v / step) * step || 0);
    return out;
  }
  /** Frequency ticks for a scale on an axis of px pixels: { major: [Hz…], minor: [Hz…] }. */
  function freqTicks(sc, px) {
    if (sc.type === 'lin') return { major: niceTicks(sc.fmin, sc.fmax, Math.max(2, px / 55)), minor: [] };
    const major = [], minor = [], lo = Math.max(sc.type === 'mel' ? 20 : 1, sc.fmin), hi = sc.fmax;
    const dense = px / Math.max(1, sc.toNorm(hi) - sc.toNorm(lo));
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
      const d = Math.pow(10, e);
      for (let m = 1; m < 10; m++) {
        const f = m * d;
        if (f < lo * 0.999 || f > hi * 1.001) continue;
        const y = (sc.toNorm(f) - sc.toNorm(m === 1 ? f : (m - 1) * d)) * dense;
        if (m === 1 || m === 2 || m === 5 || (y > 26 && m !== 7 && m !== 9)) major.push(f); else minor.push(f);
      }
    }
    // prune labels that would overlap
    const kept = [];
    let last = -Infinity;
    for (const f of major) { const y = sc.toNorm(f) * px; if (y - last >= 16) { kept.push(f); last = y; } else minor.push(f); }
    return { major: kept, minor };
  }
  const formatHz = (f) => (f >= 1000 ? +(f / 1000).toFixed(f % 1000 === 0 ? 0 : f >= 10000 ? 1 : 2) + 'k' : String(+f.toFixed(f < 10 ? 1 : 0)));
  /** Seconds → label adapted to the visible span ("1.25", "1:02.5"). */
  function formatTime(t, span = 10) {
    const dec = span < 0.5 ? 3 : span < 5 ? 2 : span < 60 ? 1 : 0, sign = t < -1e-9 ? '−' : '', a = Math.abs(t);
    if (a >= 60) { const m = Math.floor(a / 60), s = a - m * 60; return sign + m + ':' + (s < 10 ? '0' : '') + s.toFixed(dec); }
    return sign + a.toFixed(dec);
  }
  const font = (px, weight = 400) => `${weight} ${Math.round(px)}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`;

  /** Frequency axis left of plot rect r: tick labels, grid lines, optional note grid and piano ruler.
   *  o = { k (pixel scale), ink, mute, grid, note, a4, notation, noteGrid, pianoW (0 = no ruler), labelX } */
  function drawFreqAxis(ctx, r, sc, o) {
    const k = o.k || 1, yOf = (f) => r.y + r.h * (1 - sc.toNorm(f)), ticks = freqTicks(sc, r.h / k);
    ctx.save();
    // note grid (C lines labelled, semitone lines when there is room)
    if (o.noteGrid) {
      const m0 = Math.ceil(D.freqToMidi(Math.max(sc.fmin, 8), o.a4)), m1 = Math.floor(D.freqToMidi(sc.fmax, o.a4));
      ctx.font = font(9.5 * k, 600); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      for (let m = m0; m <= m1; m++) {
        const y = yOf(D.midiToFreq(m, o.a4)), yn = yOf(D.midiToFreq(m + 1, o.a4)), pc = ((m % 12) + 12) % 12;
        if (pc !== 0 && y - yn < 6 * k) continue;
        ctx.fillStyle = pc === 0 ? o.note : o.grid;
        ctx.globalAlpha = pc === 0 ? 0.55 : 0.22;
        ctx.fillRect(r.x, Math.round(y), r.w, Math.max(1, k * (pc === 0 ? 1 : 0.6)));
        if (pc === 0) { ctx.globalAlpha = 0.9; ctx.fillText(D.pcName(0, o.notation) + (Math.floor(m / 12) - 1), r.x + r.w - 3 * k, y - 1 * k); }
      }
      ctx.globalAlpha = 1;
    }
    // grid + ticks
    ctx.fillStyle = o.grid;
    for (const f of ticks.minor) { const y = Math.round(yOf(f)); ctx.globalAlpha = 0.5; ctx.fillRect(r.x - 3 * k - (o.pianoW || 0), y, 3 * k, Math.max(1, k * 0.8)); }
    ctx.globalAlpha = 1;
    ctx.font = font(10.5 * k); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const f of ticks.major) {
      const y = Math.round(yOf(f));
      ctx.fillStyle = o.grid; ctx.globalAlpha = 0.28; ctx.fillRect(r.x, y, r.w, Math.max(1, k * 0.8));
      ctx.globalAlpha = 1; ctx.fillRect(r.x - 6 * k - (o.pianoW || 0), y, 6 * k, Math.max(1, k));
      ctx.fillStyle = o.ink; ctx.fillText(formatHz(f), r.x - 8 * k - (o.pianoW || 0), Math.min(r.y + r.h - 5 * k, Math.max(r.y + 5 * k, y)));
    }
    // piano ruler
    if (o.pianoW > 0) {
      const px = r.x - o.pianoW - 1 * k, m0 = Math.floor(D.freqToMidi(Math.max(sc.fmin, 8), o.a4)) - 1, m1 = Math.ceil(D.freqToMidi(sc.fmax, o.a4)) + 1;
      ctx.fillStyle = '#e9e6dc'; ctx.fillRect(px, r.y, o.pianoW, r.h);
      for (let m = m0; m <= m1; m++) {
        const yA = yOf(D.midiToFreq(m - 0.5, o.a4)), yB = yOf(D.midiToFreq(m + 0.5, o.a4)), pc = ((m % 12) + 12) % 12;
        const top = Math.max(r.y, Math.min(yA, yB)), bot = Math.min(r.y + r.h, Math.max(yA, yB));
        if (bot <= top) continue;
        if (BLACK_KEYS[pc]) { ctx.fillStyle = '#1d1b22'; ctx.fillRect(px, top, o.pianoW * 0.62, bot - top); }
        else if ((pc === 0 || pc === 5) && yA - yB > 2.5 * k) { ctx.fillStyle = '#9a968b'; ctx.fillRect(px, Math.round(yA) - 0.5 * k, o.pianoW, Math.max(1, 0.6 * k)); }
        if (pc === 0 && o.hilite !== false) { ctx.fillStyle = o.note; ctx.fillRect(px + o.pianoW * 0.7, top, o.pianoW * 0.3, bot - top); }
      }
      if (o.hoverMidi != null) {
        const yA = yOf(D.midiToFreq(o.hoverMidi - 0.5, o.a4)), yB = yOf(D.midiToFreq(o.hoverMidi + 0.5, o.a4));
        ctx.fillStyle = o.note; ctx.globalAlpha = 0.85; ctx.fillRect(px, Math.min(yA, yB), o.pianoW, Math.max(1.5 * k, Math.abs(yA - yB))); ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  /** Time axis under plot rect r. o = { k, ink, grid, offset (added to labels, e.g. −10 for live), ticks: true } */
  function drawTimeAxis(ctx, r, t0, t1, o) {
    const k = o.k || 1, span = t1 - t0, ticks = niceTicks(t0, t1, Math.max(2, r.w / k / 90));
    ctx.save();
    ctx.font = font(10.5 * k); ctx.textBaseline = 'top';
    for (const t of ticks) {
      const x = Math.round(r.x + ((t - t0) / span) * r.w);
      ctx.fillStyle = o.grid; ctx.globalAlpha = o.gridAlpha == null ? 0.22 : o.gridAlpha; ctx.fillRect(x, r.y, Math.max(1, 0.8 * k), r.h);
      ctx.globalAlpha = 1; ctx.fillRect(x, r.y + r.h, Math.max(1, k), 5 * k);
      ctx.fillStyle = o.ink; ctx.textAlign = x < r.x + 20 * k ? 'left' : x > r.x + r.w - 20 * k ? 'right' : 'center';
      ctx.fillText(formatTime(t + (o.offset || 0), span), x, r.y + r.h + 7 * k);
    }
    ctx.restore();
  }

  /** Vertical colour bar with dB labels. */
  function drawColorbar(ctx, r, lut, dbMin, dbMax, o) {
    const k = o.k || 1;
    for (let y = 0; y < r.h; y++) {
      const i = Math.round(255 * (1 - y / Math.max(1, r.h - 1)));
      ctx.fillStyle = `rgb(${lut[i * 3]},${lut[i * 3 + 1]},${lut[i * 3 + 2]})`;
      ctx.fillRect(r.x, r.y + y, r.w, 1);
    }
    ctx.strokeStyle = o.grid; ctx.lineWidth = k; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.font = font(10.5 * k); ctx.fillStyle = o.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const v of niceTicks(dbMin, dbMax, Math.max(2, r.h / k / 45))) {
      const y = r.y + r.h * (1 - (v - dbMin) / (dbMax - dbMin));
      ctx.fillRect(r.x + r.w, y, 4 * k, Math.max(1, k));
      ctx.fillText(String(v), r.x + r.w + 7 * k, y);
    }
  }

  /** Complete labelled spectrogram for the PNG export, drawn on a W × H 2D context.
   *  p = { an, view, lut, title, subtitle, footer, labels: { time, freq, level }, a4, notation, noteGrid, piano, sel, offset } */
  function drawExport(ctx, W, H, p) {
    const k = W / 1500, theme = { bg: '#0b0d12', ink: '#e8ecf2', mute: '#9aa6b5', grid: '#7d8a99', note: '#ffd166' };
    const pianoW = p.piano ? 16 * k : 0;
    const r = { x: Math.round(92 * k + pianoW), y: Math.round(86 * k), w: 0, h: 0 };
    r.w = Math.round(W - r.x - 120 * k); r.h = Math.round(H - r.y - 92 * k);
    ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = theme.ink; ctx.font = font(26 * k, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(p.title, r.x - pianoW, 42 * k);
    ctx.fillStyle = theme.mute; ctx.font = font(13.5 * k); ctx.fillText(p.subtitle, r.x - pianoW, 66 * k);
    const img = ctx.createImageData(r.w, r.h);
    renderSpectrogram(p.an, p.view, r.w, r.h, p.lut, img.data, [11, 13, 18]);
    ctx.putImageData(img, r.x, r.y);
    if (p.sel) {
      const span = p.view.t1 - p.view.t0, xa = r.x + ((p.sel[0] - p.view.t0) / span) * r.w, xb = r.x + ((p.sel[1] - p.view.t0) / span) * r.w;
      ctx.strokeStyle = theme.note; ctx.lineWidth = 1.5 * k; ctx.setLineDash([6 * k, 4 * k]);
      ctx.strokeRect(Math.max(r.x, xa), r.y + 1, Math.min(r.x + r.w, xb) - Math.max(r.x, xa), r.h - 2); ctx.setLineDash([]);
    }
    drawFreqAxis(ctx, r, p.view.scale, { k, ink: theme.ink, grid: theme.grid, note: theme.note, a4: p.a4, notation: p.notation, noteGrid: p.noteGrid, pianoW });
    drawTimeAxis(ctx, r, p.view.t0, p.view.t1, { k, ink: theme.ink, grid: theme.grid, offset: p.offset });
    ctx.strokeStyle = theme.grid; ctx.lineWidth = k; ctx.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
    drawColorbar(ctx, { x: r.x + r.w + 24 * k, y: r.y, w: 18 * k, h: r.h }, p.lut, p.view.dbMin, p.view.dbMax, { k, ink: theme.ink, grid: theme.grid });
    // axis titles
    ctx.fillStyle = theme.mute; ctx.font = font(13 * k, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(p.labels.time, r.x + r.w / 2, r.y + r.h + 46 * k);
    ctx.save(); ctx.translate(24 * k, r.y + r.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(p.labels.freq, 0, 0); ctx.restore();
    ctx.save(); ctx.translate(W - 22 * k, r.y + r.h / 2); ctx.rotate(Math.PI / 2); ctx.fillText(p.labels.level, 0, 0); ctx.restore();
    ctx.font = font(11.5 * k); ctx.textAlign = 'left'; ctx.fillStyle = theme.mute;
    ctx.fillText(p.footer, r.x - pianoW, H - 18 * k);
    ctx.textAlign = 'right'; ctx.fillText('Spectre Atelier', W - 24 * k, H - 18 * k);
    return r;
  }

  return { BLACK_KEYS, renderSpectrogram, renderChroma, niceTicks, freqTicks, formatHz, formatTime, font, drawFreqAxis, drawTimeAxis, drawColorbar, drawExport };
});
