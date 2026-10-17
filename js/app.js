/* app.js — Spectre Atelier interface: sources (file, demo, live microphone), chunked analysis, spectrogram /
 * overview / spectrum / chromagram / vectorscope drawing, playback with loop, interactions, exports, i18n,
 * settings persistence (URL hash). Original code, MIT licence. Everything runs locally: nothing is uploaded. */
(function () {
  'use strict';
  const D = window.SpectreDSP, R = window.SpectreRender, CM = window.SpectreColormaps, ST = window.SpectreSettings, I18N = window.I18N;
  const $ = (id) => document.getElementById(id);
  const LIVE_SECONDS = 10, LIVE_FPS = 30;
  const PLOT_BG = [8, 10, 14], INK = '#dbe2ea', GRID = '#7d8a99', NOTE = '#ffc857', HEAD = '#b9f15c', SEL = '#ffc857';

  // ------------------------------------------------------------------ state
  const state = {
    s: ST.defaults(), lang: 'fr', tfng: false,
    src: null,              // { name, sr, channels: [L, R?], duration, demo }
    an: null,               // current analysis (see SpectreDSP.createStft) — also used for the live ring buffer
    chroma: null, chromaMax: 0, key: null,
    view: { t0: 0, t1: 1 }, sel: null, playhead: 0,
    playing: false, loop: false, live: false, busy: false, ready: false, analyses: 0,
    spec: null, peaks: [], fileCorr: null, fileWidth: null, hover: null, errors: [],
  };
  const T = (key, vars) => I18N.t(key, state.lang, vars, state.tfng);
  const notation = () => (state.s.nt === 'auto' ? (state.lang === 'en' ? 'en' : 'solf') : state.s.nt);
  const duration = () => (state.live ? LIVE_SECONDS : state.src ? state.src.duration : 0);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

  const cv = { spec: $('spec'), ov: $('overview'), sp: $('spectrum'), ch: $('chroma'), sc: $('scope') };
  const dirty = { spec: true, chroma: true };
  let specImg = null, chromaImg = null, ovEnv = null;

  // ------------------------------------------------------------------ small UI helpers
  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }
  const status = (msg) => { $('status').textContent = msg || ''; };
  function fmtDur(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return m ? `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}` : `${s.toFixed(2)} s`;
  }
  const fmtClock = (t) => (duration() >= 60 ? R.formatTime(t, 1) : t.toFixed(3));
  const fmtHz = (f) => (f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 2 : 3) + ' kHz' : f.toFixed(1) + ' Hz');
  const nyquist = () => (state.an ? state.an.sr / 2 : 22050);
  /** Current frequency scale (fmax limited to Nyquist). */
  function curScale() {
    const s = state.s, ny = nyquist(), fmax = Math.min(s.fmax, ny), fmin = Math.min(s.fmin, fmax * 0.9);
    return D.makeScale(s.scale, fmin, fmax);
  }

  // ------------------------------------------------------------------ i18n
  function applyLang() {
    const kab = state.lang === 'kab';
    document.documentElement.lang = kab ? (state.tfng ? 'kab-Tfng' : 'kab') : state.lang;
    document.body.classList.toggle('tfng', kab && state.tfng);
    $('tfngWrap').hidden = !kab;
    $('lang').value = state.lang; $('tfng').checked = state.tfng;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = T(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = T(el.dataset.i18nHtml); }); // own static strings only
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => el.dataset.i18nAttr.split(';').forEach((p) => { const [a, k] = p.split(':'); el.setAttribute(a, T(k)); }));
    updatePlayButton(); updateMicButton(); updateSourceInfo(); updateSelLabel(); updateKeyBadge(); updatePeaksTable(); updateResInfo(); updateStereoText();
    dirty.spec = dirty.chroma = true; schedule();
  }

  // ------------------------------------------------------------------ settings <-> controls <-> hash
  function syncControls() {
    const s = state.s;
    for (const id of ['fft', 'win', 'ov', 'ch', 'cmap', 'nt', 'png']) $(id).value = String(s[id]);
    $('fmin').value = s.fmin; $('fmax').value = s.fmax; $('a4').value = s.a4; $('peaks').value = s.peaks;
    $('dbMin').value = s.dbMin; $('dbMax').value = s.dbMax; $('dbMinOut').textContent = s.dbMin + ' dB'; $('dbMaxOut').textContent = s.dbMax + ' dB';
    $('grid').checked = s.grid; $('piano').checked = s.piano;
    $('cmapPreview').style.background = CM.gradient(s.cmap);
    document.querySelectorAll('#scaleSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.val === s.scale)));
    document.querySelectorAll('#specModeSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.val === s.spec)));
    $('ch').disabled = !!(state.src && state.src.channels.length < 2) || state.live;
  }
  let lastHash = '';
  function writeHash() {
    const p = [ST.toHash(state.s)];
    if (state.lang !== 'fr') p.push('lang=' + state.lang);
    if (state.lang === 'kab' && state.tfng) p.push('tf=1');
    const h = p.filter(Boolean).join('&');
    lastHash = h;
    try { history.replaceState(null, '', location.pathname + location.search + (h ? '#' + h : '')); } catch (e) { /* file:// in some browsers */ }
  }
  function readHash() {
    const h = location.hash.replace(/^#/, '');
    if (!h || h === lastHash) return false;
    const r = ST.fromHash(h);
    state.s = r.settings;
    if (I18N.LANGS.includes(r.extra.lang)) state.lang = r.extra.lang;
    state.tfng = r.extra.tf === '1';
    return true;
  }
  /** After any settings change: validate, refresh controls and hash, re-analyse only when needed. */
  function settingsChanged(reanalyse) {
    state.s = ST.validate(state.s);
    syncControls(); writeHash();
    if (reanalyse) { if (state.live) setupLive(); else analyse(); return; }
    dirty.spec = dirty.chroma = true;
    computeSpectrum(); schedule();
  }

  // ------------------------------------------------------------------ audio context & sources
  let actx = null;
  function ensureCtx() {
    if (!actx) { const C = window.AudioContext || window.webkitAudioContext; actx = new C(); }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }
  function setSource(src) {
    stopPlayback(true);
    if (state.live) stopMic(true);
    state.src = src; state.srcBuf = null;
    state.view = { t0: 0, t1: src.duration }; state.sel = null; state.playhead = 0;
    const st = src.channels.length > 1;
    state.fileCorr = st ? D.correlation(src.channels[0], src.channels[1]) : null;
    state.fileWidth = st ? D.width(src.channels[0], src.channels[1]) : null;
    buildOverviewEnvelope();
    if (state.s.fmax > src.sr / 2) { /* keep the setting; the display clamps to Nyquist */ }
    syncControls(); updateSourceInfo(); updateSelLabel(); updateStereoText();
    return analyse();
  }
  function loadDemo() { return setSource({ ...D.makeDemo(44100), demo: true }); }
  async function loadFile(file) {
    if (!file) return;
    status(T('decoding'));
    try {
      const ab = await file.arrayBuffer(), ctx = ensureCtx();
      const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
      const chs = [buf.getChannelData(0)];
      if (buf.numberOfChannels > 1) chs.push(buf.getChannelData(1));
      await setSource({ name: file.name, sr: buf.sampleRate, channels: chs, duration: buf.length / buf.sampleRate, demo: false });
    } catch (e) {
      status(''); toast(T('decodeError'));
    }
  }

  // ------------------------------------------------------------------ analysis (chunked so the page stays responsive)
  let analyseToken = 0;
  async function analyse() {
    if (!state.src) return;
    const token = ++analyseToken, s = state.s, t0 = performance.now();
    state.busy = true; state.ready = false;
    const x = D.deriveChannel(state.src.channels, state.src.channels.length > 1 ? s.ch : 'mid');
    const job = D.createStft(x, state.src.sr, { fft: s.fft, window: s.win, overlap: s.ov / 100 });
    const prog = $('progress');
    prog.hidden = false;
    const chunk = Math.max(4, Math.round(1.5e6 / s.fft));
    while (!job.step(chunk)) {
      prog.firstElementChild.style.width = (job.progress * 100).toFixed(1) + '%';
      prog.setAttribute('aria-valuenow', Math.round(job.progress * 100));
      await new Promise((r) => setTimeout(r, 0));
      if (token !== analyseToken) return;
    }
    if (token !== analyseToken) return;
    prog.hidden = true;
    state.an = job.an;
    computeChroma();
    state.busy = false; state.ready = true; state.analyses++;
    status(T('analysed', { n: job.an.nFrames, ms: Math.round(performance.now() - t0) }));
    updateResInfo(); dirty.spec = dirty.chroma = true;
    computeSpectrum(); schedule();
  }
  function computeChroma() {
    const an = state.an;
    if (!an) { state.chroma = null; state.key = null; return; }
    state.chroma = D.chromagram(an, state.s.a4);
    let m = 0;
    for (let i = 0; i < state.chroma.length; i++) if (state.chroma[i] > m) m = state.chroma[i];
    state.chromaMax = m;
    computeKey();
  }
  function computeKey() {
    if (!state.chroma || !state.an) { state.key = null; updateKeyBadge(); return; }
    const tot = state.sel ? D.chromaTotals(state.chroma, state.an, state.sel[0], state.sel[1]) : D.chromaTotals(state.chroma, state.an);
    state.key = D.estimateKey(tot);
    updateKeyBadge();
  }

  // ------------------------------------------------------------------ spectrum + peaks
  let specTimer = 0, lastTable = 0;
  function computeSpectrum() {
    const an = state.an;
    if (!an) { state.spec = null; state.peaks = []; updatePeaksTable(); return; }
    let label;
    if (state.live) { state.spec = D.frameRow(an, an.nFrames - 1).slice(); label = T('rangeLive'); }
    else if (state.s.spec === 'playhead') { state.spec = D.frameRow(an, D.frameIndex(an, state.playhead)).slice(); label = T('rangeHead', { t: state.playhead.toFixed(3) }); }
    else {
      const r = state.sel || [state.view.t0, state.view.t1];
      state.spec = D.averageSpectrum(an, r[0], r[1]);
      label = T(state.sel ? 'rangeSel' : 'rangeAvg', { a: r[0].toFixed(2), b: r[1].toFixed(2) });
    }
    const sc = curScale();
    state.peaks = D.findPeaks(state.spec, an.binHz, { count: state.s.peaks, minHz: Math.max(sc.fmin, an.binHz), maxHz: sc.fmax, halfWidth: D.WINDOWS[an.window] || 2, range: 80 });
    $('spRange').textContent = label;
    const now = performance.now();
    if (!(state.playing || state.live) || now - lastTable > 120) { updatePeaksTable(); lastTable = now; }
  }
  /** Debounced recomputation (averages over long views can take a moment). */
  function scheduleSpectrum(delay = 120) { clearTimeout(specTimer); specTimer = setTimeout(() => { computeSpectrum(); schedule(); }, delay); }
  function updatePeaksTable() {
    const tb = document.querySelector('#peakTable tbody');
    if (!tb) return;
    tb.textContent = '';
    if (!state.peaks.length) {
      const tr = document.createElement('tr'), td = document.createElement('td');
      td.colSpan = 5; td.textContent = state.an ? T('noPeaks') : '—'; td.style.textAlign = 'center';
      tr.appendChild(td); tb.appendChild(tr); return;
    }
    state.peaks.forEach((p, i) => {
      const ni = D.noteInfo(p.freq, state.s.a4, notation()), tr = document.createElement('tr');
      const cells = [String(i + 1), fmtHz(p.freq), ni ? ni.label : '—', ni ? D.centsText(ni.cents) : '—', p.db.toFixed(1) + ' dB'];
      cells.forEach((c, j) => { const td = document.createElement('td'); td.textContent = c; if (j === 2) td.className = 'note'; tr.appendChild(td); });
      tb.appendChild(tr);
    });
  }

  // ------------------------------------------------------------------ text panels
  function updateSourceInfo() {
    if (state.live) { $('srcName').textContent = T('liveName'); $('srcMeta').textContent = actx ? T('liveMeta', { sr: actx.sampleRate }) : ''; return; }
    const s = state.src;
    if (!s) { $('srcName').textContent = '—'; $('srcMeta').textContent = ''; return; }
    $('srcName').textContent = s.demo ? T('demoName') : s.name;
    $('srcMeta').textContent = T('meta', { dur: fmtDur(s.duration), sr: s.sr, ch: T(s.channels.length > 1 ? 'stereoLbl' : 'monoLbl') });
  }
  function updateResInfo() {
    const an = state.an;
    $('resInfo').textContent = an ? T('resInfo', { hz: an.binHz.toFixed(2), ms: (an.frameDur * 1000).toFixed(1), frames: an.nFrames }) : '';
  }
  function updateSelLabel() {
    const s = state.sel;
    $('selLabel').textContent = s ? T('selLabel', { a: s[0].toFixed(2), b: s[1].toFixed(2), d: (s[1] - s[0]).toFixed(2) }) : '';
  }
  function updateKeyBadge() {
    const k = state.key;
    $('keyBadge').textContent = k ? T('keyLabel', { key: D.pcName(k.tonic, notation()) + ' ' + T(k.mode) }) + ` · r = ${k.r.toFixed(2)}` : T('keyNone');
  }
  function updatePlayButton() {
    $('playIcon').textContent = state.playing ? '❚❚' : '▶';
    $('playBtn').setAttribute('aria-label', T(state.playing ? 'pause' : 'play'));
    $('loopBtn').setAttribute('aria-pressed', String(state.loop));
    for (const id of ['playBtn', 'stopBtn', 'loopBtn']) $(id).disabled = state.live || !state.src;
  }
  function updateMicButton() {
    const b = $('micBtn');
    b.setAttribute('aria-pressed', String(state.live));
    b.lastElementChild.textContent = T(state.live ? 'micStop' : 'mic');
  }
  function updateStereoText() {
    const st = state.src && state.src.channels.length > 1 && !state.live;
    $('corrFile').textContent = st ? state.fileCorr.toFixed(2) : '—';
    $('widthFile').textContent = st ? state.fileWidth.toFixed(2) : '—';
    $('stereoNote').textContent = st ? T('stereoNote') : T('monoSource');
  }

  // ------------------------------------------------------------------ playback
  let player = null; // { node, ctxStart, pos0, loop: [a, b] | null }
  function loopRange() {
    const s = state.sel;
    return state.loop && s && s[1] - s[0] > 0.02 ? s : null;
  }
  function audioBuffer() {
    if (state.srcBuf) return state.srcBuf;
    const s = state.src, ctx = ensureCtx(), b = ctx.createBuffer(s.channels.length, s.channels[0].length, s.sr);
    s.channels.forEach((c, i) => b.copyToChannel(c, i));
    return (state.srcBuf = b);
  }
  function play() {
    if (!state.src || state.live) return;
    const ctx = ensureCtx(), node = ctx.createBufferSource(), L = loopRange();
    node.buffer = audioBuffer(); node.connect(ctx.destination);
    let start = state.playhead;
    if (start >= state.src.duration - 0.005) start = 0;
    if (L) { node.loop = true; node.loopStart = L[0]; node.loopEnd = L[1]; if (start < L[0] || start >= L[1]) start = L[0]; }
    node.start(0, start);
    player = { node, ctxStart: ctx.currentTime, pos0: start, loop: L };
    node.onended = () => { if (player && player.node === node) { state.playhead = currentPos(); player = null; state.playing = false; updatePlayButton(); schedule(); } };
    state.playing = true; state.playhead = start;
    updatePlayButton(); schedule();
  }
  function currentPos() {
    if (!player || !actx) return state.playhead;
    let p = player.pos0 + (actx.currentTime - player.ctxStart);
    const L = player.loop;
    if (L && p >= L[1]) p = L[0] + ((p - L[0]) % (L[1] - L[0]));
    return clamp(p, 0, duration());
  }
  function stopPlayback(rewind) {
    if (player) { state.playhead = currentPos(); const n = player.node; player = null; n.onended = null; try { n.stop(); } catch (e) { /* already stopped */ } }
    state.playing = false;
    if (rewind) state.playhead = state.sel ? state.sel[0] : 0;
    updatePlayButton(); schedule();
  }
  const togglePlay = () => (state.playing ? stopPlayback(false) : play());
  function restartIfPlaying() { if (state.playing) { stopPlayback(false); play(); } }
  function seek(t) {
    state.playhead = clamp(t, 0, duration());
    if (state.playing) { stopPlayback(false); play(); }
    if (state.s.spec === 'playhead') computeSpectrum();
    schedule();
  }
  function followPlayhead() {
    const v = state.view, span = v.t1 - v.t0, p = state.playhead;
    if (span >= duration() - 1e-6) return;
    if (p > v.t1 || p < v.t0) setView(p - span * 0.05, p + span * 0.95);
  }

  // ------------------------------------------------------------------ live microphone
  let mic = null, live = null;
  async function startMic() {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { toast(T('micError')); return; }
    stopPlayback(false);
    try {
      const ctx = ensureCtx();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const source = ctx.createMediaStreamSource(stream), analyser = ctx.createAnalyser();
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      mic = { stream, source, analyser };
    } catch (e) { toast(T('micError')); return; }
    analyseToken++; state.busy = false; $('progress').hidden = true;
    state.live = true; state.playing = false;
    setupLive();
    updateMicButton(); updatePlayButton(); updateSourceInfo(); updateStereoText(); syncControls();
    toast(T('micOn')); status('');
  }
  /** (Re)builds the live ring buffer for the current FFT size / window. */
  function setupLive() {
    if (!mic) return;
    const s = state.s, n = s.fft, bins = n / 2 + 1, sr = actx.sampleRate, nFrames = LIVE_SECONDS * LIVE_FPS;
    mic.analyser.fftSize = Math.max(n, 2048);
    const win = D.makeWindow(s.win, n);
    let wsum = 0;
    for (let i = 0; i < n; i++) wsum += win[i];
    live = { win, wsum, buf: new Float32Array(mic.analyser.fftSize), frame: new Float32Array(n), re: new Float64Array(n), im: new Float64Array(n),
      out: new Float32Array(bins), last: performance.now(), map: D.chromaMap(bins, sr / n, s.a4), ticks: 0 };
    state.an = { fft: n, bins, hop: sr / LIVE_FPS, nFrames, sr, window: s.win, overlap: 0, frameDur: 1 / LIVE_FPS, binHz: sr / n, duration: LIVE_SECONDS,
      data: new Float32Array(nFrames * bins).fill(D.FLOOR_DB), live: true };
    state.chroma = new Float32Array(nFrames * 12); state.chromaMax = 1e-9;
    state.view = { t0: 0, t1: LIVE_SECONDS }; state.sel = null; state.ready = true; state.analyses++;
    updateResInfo(); updateSelLabel();
    dirty.spec = dirty.chroma = true; schedule();
  }
  function liveTick(now) {
    if (!mic || !live) return;
    let steps = 0;
    const dt = 1000 / LIVE_FPS;
    while (now - live.last >= dt && steps < 4) { live.last += dt; steps++; }
    if (now - live.last > 500) live.last = now;
    if (!steps) return;
    const an = state.an, bins = an.bins, n = an.fft;
    mic.analyser.getFloatTimeDomainData(live.buf);
    live.frame.set(live.buf.subarray(live.buf.length - n));
    D.spectrumDb(live.frame, live.win, live.out, live.re, live.im, live.wsum);
    for (let i = 0; i < steps; i++) {
      an.data.copyWithin(0, bins); an.data.set(live.out, (an.nFrames - 1) * bins);
      state.chroma.copyWithin(0, 12); D.chromaFrame(live.out, live.map, state.chroma, (an.nFrames - 1) * 12);
    }
    let m = 0;
    for (let p = 0; p < 12; p++) m = Math.max(m, state.chroma[(an.nFrames - 1) * 12 + p]);
    state.chromaMax = Math.max(state.chromaMax * 0.998, m);
    if (++live.ticks % 15 === 0) computeKey();
    dirty.spec = dirty.chroma = true;
    computeSpectrum();
  }
  function stopMic(silent) {
    if (mic) { mic.stream.getTracks().forEach((t) => t.stop()); try { mic.source.disconnect(); } catch (e) { /* ignore */ } }
    mic = null; live = null; state.live = false;
    updateMicButton(); updatePlayButton(); syncControls();
    if (!silent) {
      if (state.src) { state.view = { t0: 0, t1: state.src.duration }; updateSourceInfo(); updateStereoText(); analyse(); }
      else { state.an = null; state.chroma = null; updateSourceInfo(); computeSpectrum(); schedule(); }
    }
  }

  // ------------------------------------------------------------------ view (zoom / pan)
  function setView(t0, t1) {
    const dur = duration();
    if (!(dur > 0)) return;
    const minSpan = Math.max(0.02, state.an ? state.an.frameDur * 6 : 0.02);
    const span = clamp(t1 - t0, Math.min(minSpan, dur), dur);
    const a = clamp(t0, 0, dur - span);
    state.view = { t0: a, t1: a + span };
    dirty.spec = dirty.chroma = true;
    if (state.s.spec === 'avg' && !state.sel) scheduleSpectrum();
    schedule();
  }
  function zoomTime(f, center) {
    const v = state.view, c = center == null ? (state.playing ? state.playhead : (v.t0 + v.t1) / 2) : center;
    setView(c - (c - v.t0) * f, c + (v.t1 - c) * f);
  }
  function setFreqRange(a, b) {
    const ny = nyquist(), lo = state.s.scale === 'log' ? D.LOG_MIN_HZ : 0;
    a = clamp(a, lo, ny); b = clamp(b, lo, ny);
    if (state.s.scale === 'lin' ? b - a < 20 : b < a * 1.06) return;
    state.s.fmin = Math.round(a * 10) / 10; state.s.fmax = Math.round(b * 10) / 10;
    settingsChanged(false);
  }
  function zoomFreq(f, u = 0.5) {
    const sc = curScale();
    setFreqRange(sc.fromNorm(u - u * f), sc.fromNorm(u + (1 - u) * f));
  }
  function panFreq(du) { const sc = curScale(); setFreqRange(sc.fromNorm(du), sc.fromNorm(1 + du)); }
  const fitFreq = () => { state.s.fmin = state.s.scale === 'lin' ? 0 : 20; state.s.fmax = Math.round(nyquist()); settingsChanged(false); };

  // ------------------------------------------------------------------ layout & drawing
  const kOf = (c) => (c.clientWidth ? c.width / c.clientWidth : 1);
  function sizeCanvas(c) {
    const r = c.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(16, Math.round(r.width * dpr)), h = Math.max(16, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; return true; }
    return false;
  }
  /** Left margin shared by the spectrogram, overview and chromagram so their time axes line up. */
  function leftMargin(k) { return Math.round(48 * k + (state.s.piano ? 13 * k : 0)); }
  function specRect() {
    const c = cv.spec, k = kOf(c), x = leftMargin(k);
    return { x, y: Math.round(4 * k), w: Math.max(10, c.width - x - Math.round(8 * k)), h: Math.max(10, c.height - Math.round(26 * k)), k, pianoW: state.s.piano ? Math.round(13 * k) : 0 };
  }
  function renderSpecImage() {
    if (!state.an) { specImg = null; return; }
    const r = specRect();
    if (!specImg) specImg = document.createElement('canvas');
    if (specImg.width !== r.w || specImg.height !== r.h) { specImg.width = r.w; specImg.height = r.h; }
    const ctx = specImg.getContext('2d'), img = ctx.createImageData(r.w, r.h);
    R.renderSpectrogram(state.an, { t0: state.view.t0, t1: state.view.t1, scale: curScale(), dbMin: state.s.dbMin, dbMax: state.s.dbMax }, r.w, r.h, CM.lut(state.s.cmap), img.data, PLOT_BG);
    ctx.putImageData(img, 0, 0);
  }
  const xOfT = (r, t) => r.x + ((t - state.view.t0) / (state.view.t1 - state.view.t0)) * r.w;
  function drawSelectionAndHead(ctx, r, k) {
    if (state.sel) {
      const xa = clamp(xOfT(r, state.sel[0]), r.x, r.x + r.w), xb = clamp(xOfT(r, state.sel[1]), r.x, r.x + r.w);
      if (xb > xa) {
        ctx.fillStyle = 'rgba(255,200,87,0.14)'; ctx.fillRect(xa, r.y, xb - xa, r.h);
        ctx.fillStyle = SEL; ctx.fillRect(xa, r.y, Math.max(1, k), r.h); ctx.fillRect(xb - Math.max(1, k), r.y, Math.max(1, k), r.h);
      }
    }
    if (!state.live && state.src) {
      const x = xOfT(r, state.playhead);
      if (x >= r.x - 1 && x <= r.x + r.w + 1) {
        ctx.fillStyle = HEAD; ctx.fillRect(Math.round(x - 0.75 * k), r.y, Math.max(1, 1.5 * k), r.h);
        ctx.beginPath(); ctx.moveTo(x - 5 * k, r.y); ctx.lineTo(x + 5 * k, r.y); ctx.lineTo(x, r.y + 7 * k); ctx.fill();
      }
    }
  }
  function emptyMessage(ctx, c) {
    const k = kOf(c);
    ctx.fillStyle = '#8f9bab'; ctx.font = R.font(13 * k); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(state.busy ? T('analysing') + '…' : T('noSignal'), c.width / 2, c.height / 2);
  }
  function drawSpec() {
    const c = cv.spec, ctx = c.getContext('2d'), r = specRect(), k = r.k;
    ctx.fillStyle = 'rgb(8,10,14)'; ctx.fillRect(0, 0, c.width, c.height);
    if (!state.an || !specImg) { emptyMessage(ctx, c); return; }
    ctx.drawImage(specImg, r.x, r.y);
    const hov = state.hover && state.hover.on === 'spec' ? state.hover : null;
    R.drawFreqAxis(ctx, r, curScale(), { k, ink: INK, grid: GRID, note: NOTE, a4: state.s.a4, notation: notation(), noteGrid: state.s.grid, pianoW: r.pianoW, hoverMidi: hov ? hov.midi : null });
    R.drawTimeAxis(ctx, r, state.view.t0, state.view.t1, { k, ink: INK, grid: GRID, offset: state.live ? -LIVE_SECONDS : 0 });
    drawSelectionAndHead(ctx, r, k);
    if (hov) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = k; ctx.setLineDash([4 * k, 4 * k]);
      ctx.beginPath(); ctx.moveTo(hov.x, r.y); ctx.lineTo(hov.x, r.y + r.h); ctx.moveTo(r.x, hov.y); ctx.lineTo(r.x + r.w, hov.y); ctx.stroke(); ctx.restore();
    }
    if (state.live) { ctx.fillStyle = '#ff6f7d'; ctx.font = R.font(11 * k, 700); ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('● LIVE', r.x + r.w - 6 * k, r.y + 6 * k); }
  }
  function buildOverviewEnvelope() {
    const s = state.src, cols = 2000, n = s.channels[0].length, mn = new Float32Array(cols), mx = new Float32Array(cols);
    const per = n / cols, L = s.channels[0], Rr = s.channels[1] || L;
    for (let c = 0; c < cols; c++) {
      let lo = 0, hi = 0;
      const a = Math.floor(c * per), b = Math.min(n, Math.floor((c + 1) * per) + 1), step = Math.max(1, Math.floor((b - a) / 400));
      for (let i = a; i < b; i += step) { const v = 0.5 * (L[i] + Rr[i]); if (v < lo) lo = v; if (v > hi) hi = v; }
      mn[c] = lo; mx[c] = hi;
    }
    ovEnv = { mn, mx, cols };
  }
  function overviewRect() { const c = cv.ov, k = kOf(c), x = leftMargin(k); return { x, y: Math.round(3 * k), w: Math.max(10, c.width - x - Math.round(8 * k)), h: c.height - Math.round(6 * k), k }; }
  function drawOverview() {
    const c = cv.ov, ctx = c.getContext('2d'), r = overviewRect(), k = r.k;
    ctx.fillStyle = 'rgb(8,10,14)'; ctx.fillRect(0, 0, c.width, c.height);
    if (state.live || !state.src || !ovEnv) {
      ctx.fillStyle = state.live ? '#ff6f7d' : '#55606e'; ctx.font = R.font(11 * k, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(state.live ? '● LIVE — ' + LIVE_SECONDS + ' s' : '—', c.width / 2, c.height / 2); return;
    }
    const dur = duration(), mid = r.y + r.h / 2;
    ctx.fillStyle = '#3b4a5c';
    for (let x = 0; x < r.w; x++) {
      const i = Math.floor((x / r.w) * ovEnv.cols), a = ovEnv.mn[i], b = ovEnv.mx[i];
      ctx.fillRect(r.x + x, mid - b * r.h * 0.5, 1, Math.max(1, (b - a) * r.h * 0.5));
    }
    const X = (t) => r.x + (t / dur) * r.w;
    if (state.sel) { ctx.fillStyle = 'rgba(255,200,87,0.25)'; ctx.fillRect(X(state.sel[0]), r.y, Math.max(1, X(state.sel[1]) - X(state.sel[0])), r.h); }
    const va = X(state.view.t0), vb = X(state.view.t1);
    ctx.fillStyle = 'rgba(185,241,92,0.12)'; ctx.fillRect(va, r.y, vb - va, r.h);
    ctx.strokeStyle = HEAD; ctx.lineWidth = Math.max(1, k); ctx.strokeRect(va + 0.5, r.y + 0.5, Math.max(2, vb - va - 1), r.h - 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(X(state.playhead), r.y, Math.max(1, k), r.h);
    $('overview').setAttribute('aria-valuenow', Math.round((state.view.t0 / dur) * 100));
  }
  function chromaRect() { const c = cv.ch, k = kOf(c), x = leftMargin(k); return { x, y: Math.round(4 * k), w: Math.max(10, c.width - x - Math.round(8 * k)), h: Math.max(10, c.height - Math.round(24 * k)), k }; }
  function renderChromaImage() {
    if (!state.an || !state.chroma) { chromaImg = null; return; }
    const r = chromaRect();
    if (!chromaImg) chromaImg = document.createElement('canvas');
    if (chromaImg.width !== r.w || chromaImg.height !== r.h) { chromaImg.width = r.w; chromaImg.height = r.h; }
    const ctx = chromaImg.getContext('2d'), img = ctx.createImageData(r.w, r.h);
    R.renderChroma(state.chroma, state.an, state.view, r.w, r.h, CM.lut(state.s.cmap), img.data, state.chromaMax, PLOT_BG);
    ctx.putImageData(img, 0, 0);
  }
  function drawChroma() {
    const c = cv.ch, ctx = c.getContext('2d'), r = chromaRect(), k = r.k;
    ctx.fillStyle = 'rgb(8,10,14)'; ctx.fillRect(0, 0, c.width, c.height);
    if (!state.an || !chromaImg) { emptyMessage(ctx, c); return; }
    ctx.drawImage(chromaImg, r.x, r.y);
    const rowH = r.h / 12, nt = notation(), tonic = state.key ? state.key.tonic : -1;
    ctx.font = R.font(Math.min(10.5 * k, rowH * 0.9)); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let pc = 0; pc < 12; pc++) {
      const y = r.y + r.h - (pc + 0.5) * rowH;
      if (rowH < 8 * k && R.BLACK_KEYS[pc]) continue;
      ctx.fillStyle = pc === tonic ? HEAD : R.BLACK_KEYS[pc] ? '#8f9bab' : INK;
      ctx.fillText(D.pcName(pc, nt), r.x - 6 * k, y);
      ctx.fillStyle = 'rgba(8,10,14,0.6)'; ctx.fillRect(r.x, Math.round(r.y + r.h - pc * rowH), r.w, Math.max(1, 0.5 * k));
    }
    R.drawTimeAxis(ctx, r, state.view.t0, state.view.t1, { k, ink: INK, grid: GRID, gridAlpha: 0.12, offset: state.live ? -LIVE_SECONDS : 0 });
    drawSelectionAndHead(ctx, r, k);
  }
  function spectrumRect() {
    const c = cv.sp, k = kOf(c), pianoH = state.s.piano ? Math.round(12 * k) : 0;
    return { x: Math.round(44 * k), y: Math.round(8 * k), w: Math.max(10, c.width - Math.round(52 * k)), h: Math.max(10, c.height - Math.round(32 * k) - pianoH), k, pianoH };
  }
  function drawSpectrum() {
    const c = cv.sp, ctx = c.getContext('2d'), r = spectrumRect(), k = r.k, s = state.s;
    ctx.fillStyle = 'rgb(8,10,14)'; ctx.fillRect(0, 0, c.width, c.height);
    if (!state.an || !state.spec) { emptyMessage(ctx, c); return; }
    const sc = curScale(), an = state.an, spec = state.spec, yOf = (db) => r.y + r.h * (1 - (db - s.dbMin) / (s.dbMax - s.dbMin));
    const xOf = (f) => r.x + sc.toNorm(f) * r.w;
    // dB grid
    ctx.font = R.font(10 * k); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of R.niceTicks(s.dbMin, s.dbMax, Math.max(2, r.h / k / 36))) {
      const y = Math.round(yOf(v));
      ctx.fillStyle = GRID; ctx.globalAlpha = 0.25; ctx.fillRect(r.x, y, r.w, Math.max(1, 0.8 * k)); ctx.globalAlpha = 1;
      ctx.fillStyle = INK; ctx.fillText(String(v), r.x - 6 * k, y);
    }
    // frequency grid
    const ft = R.freqTicks(sc, r.w / k);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    let lastX = -1e9;
    for (const f of ft.major) {
      const x = Math.round(xOf(f));
      ctx.fillStyle = GRID; ctx.globalAlpha = 0.25; ctx.fillRect(x, r.y, Math.max(1, 0.8 * k), r.h); ctx.globalAlpha = 1;
      if (x - lastX > 34 * k) { ctx.fillStyle = INK; ctx.fillText(R.formatHz(f), clamp(x, r.x + 10 * k, r.x + r.w - 10 * k), r.y + r.h + r.pianoH + 5 * k); lastX = x; }
    }
    // curve (max of the bins under each pixel; interpolation when zoomed in)
    const grad = ctx.createLinearGradient(0, r.y, 0, r.y + r.h), lut = CM.lut(s.cmap);
    [[0, 230], [0.5, 150], [1, 50]].forEach(([o, i]) => grad.addColorStop(o, `rgba(${lut[i * 3]},${lut[i * 3 + 1]},${lut[i * 3 + 2]},0.55)`));
    ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h);
    const pts = [];
    for (let x = 0; x <= r.w; x++) {
      const fa = sc.fromNorm(x / r.w), fb = sc.fromNorm((x + 1) / r.w), ba = fa / an.binHz, bb = fb / an.binHz;
      let v;
      if (bb - ba < 1) { const b = clamp(ba, 0, an.bins - 2), i = Math.floor(b); v = spec[i] + (spec[i + 1] - spec[i]) * (b - i); }
      else { v = -Infinity; for (let i = Math.max(0, Math.ceil(ba)); i <= Math.min(an.bins - 1, Math.floor(bb)); i++) if (spec[i] > v) v = spec[i]; }
      const y = clamp(yOf(v), r.y, r.y + r.h);
      pts.push(y); ctx.lineTo(r.x + x, y);
    }
    ctx.lineTo(r.x + r.w, r.y + r.h); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); pts.forEach((y, x) => (x ? ctx.lineTo(r.x + x, y) : ctx.moveTo(r.x, y)));
    ctx.strokeStyle = HEAD; ctx.lineWidth = 1.4 * k; ctx.stroke();
    // peaks
    ctx.font = R.font(10 * k, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    state.peaks.forEach((p, i) => {
      const x = xOf(p.freq), y = clamp(yOf(p.db), r.y + 12 * k, r.y + r.h);
      if (x < r.x || x > r.x + r.w) return;
      ctx.fillStyle = NOTE; ctx.beginPath(); ctx.arc(x, y, 3 * k, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(String(i + 1), x, y - 4 * k);
    });
    // piano ruler under the axis
    if (r.pianoH) {
      const py = r.y + r.h + 1 * k, m0 = Math.floor(D.freqToMidi(Math.max(sc.fmin, 8), s.a4)), m1 = Math.ceil(D.freqToMidi(sc.fmax, s.a4));
      ctx.fillStyle = '#e9e6dc'; ctx.fillRect(r.x, py, r.w, r.pianoH);
      for (let m = m0; m <= m1; m++) {
        const xa = clamp(xOf(D.midiToFreq(m - 0.5, s.a4)), r.x, r.x + r.w), xb = clamp(xOf(D.midiToFreq(m + 0.5, s.a4)), r.x, r.x + r.w), pc = ((m % 12) + 12) % 12;
        if (xb <= xa) continue;
        if (R.BLACK_KEYS[pc]) { ctx.fillStyle = '#1d1b22'; ctx.fillRect(xa, py, xb - xa, r.pianoH * 0.62); }
        else if ((pc === 0 || pc === 5) && xb - xa > 2.5 * k) { ctx.fillStyle = '#9a968b'; ctx.fillRect(Math.round(xa), py, Math.max(1, 0.6 * k), r.pianoH); }
        if (pc === 0) { ctx.fillStyle = NOTE; ctx.fillRect(xa, py + r.pianoH * 0.7, xb - xa, r.pianoH * 0.3); }
      }
    }
    // hover
    const h = state.hover && state.hover.on === 'sp' ? state.hover : null;
    if (h) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(Math.round(h.x), r.y, Math.max(1, k), r.h); }
    ctx.strokeStyle = GRID; ctx.lineWidth = k; ctx.globalAlpha = 0.6; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); ctx.globalAlpha = 1;
  }
  let lastScope = '';
  function drawScope() {
    const c = cv.sc, ctx = c.getContext('2d'), k = kOf(c), W = c.width, H = c.height, cx = W / 2, cy = H / 2, rad = Math.min(W, H) * 0.46;
    const st = state.src && state.src.channels.length > 1 && !state.live;
    const key = [W, H, st, state.src && state.src.name, state.playhead.toFixed(3)].join('|');
    if (key === lastScope) return;
    lastScope = key;
    ctx.fillStyle = 'rgb(8,10,14)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(125,138,153,0.35)'; ctx.lineWidth = k;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad); ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy);
    const d = rad * Math.SQRT1_2;
    ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d); ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d); ctx.stroke();
    ctx.fillStyle = '#8f9bab'; ctx.font = R.font(10 * k, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('M', cx, cy - rad - 0 * k + 8 * k); ctx.fillText('L', cx - d - 6 * k, cy - d + 2 * k); ctx.fillText('R', cx + d + 6 * k, cy - d + 2 * k);
    if (!st) {
      ctx.fillStyle = '#8f9bab'; ctx.font = R.font(12 * k, 600); ctx.fillText(state.src || state.live ? 'mono' : '—', cx, cy + rad * 0.5);
      $('corrHere').textContent = '—'; $('corrMark').style.left = '100%'; return;
    }
    const L = state.src.channels[0], Rr = state.src.channels[1], sr = state.src.sr, N = 2048;
    const a = clamp(Math.round(state.playhead * sr) - N / 2, 0, Math.max(0, L.length - N)), b = Math.min(L.length, a + N);
    let peak = 0;
    for (let i = a; i < b; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rr[i]));
    const g = Math.min(8, 0.9 / Math.max(peak, 1e-4)) * rad;
    ctx.fillStyle = 'rgba(185,241,92,0.45)';
    const dot = Math.max(1, 1.3 * k);
    for (let i = a; i < b; i++) ctx.fillRect(cx + (Rr[i] - L[i]) * 0.5 * g, cy - (L[i] + Rr[i]) * 0.5 * g, dot, dot);
    const corr = D.correlation(L, Rr, a, b);
    $('corrHere').textContent = peak > 1e-4 ? corr.toFixed(2) : '—';
    $('corrMark').style.left = ((clamp(corr, -1, 1) + 1) * 50).toFixed(1) + '%';
  }
  function updateTimeLabel() {
    $('timeLabel').textContent = state.live ? 'LIVE' : `${fmtClock(state.playhead)} / ${fmtClock(duration())} s`;
  }

  // ------------------------------------------------------------------ frame loop
  let raf = 0;
  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    try {
      let resized = false;
      for (const c of Object.values(cv)) resized = sizeCanvas(c) || resized;
      if (resized) { dirty.spec = dirty.chroma = true; lastScope = ''; }
      if (state.live) liveTick(now);
      if (state.playing) {
        state.playhead = currentPos(); followPlayhead();
        if (state.s.spec === 'playhead') computeSpectrum();
      }
      if (dirty.spec) { renderSpecImage(); dirty.spec = false; }
      if (dirty.chroma) { renderChromaImage(); dirty.chroma = false; }
      drawSpec(); drawOverview(); drawChroma(); drawSpectrum(); drawScope(); updateTimeLabel();
    } catch (e) { console.error(e); }
    if (state.playing || state.live) schedule();
  }

  // ------------------------------------------------------------------ pointer & keyboard interactions
  function plotPoint(c, e, rect) {
    const b = c.getBoundingClientRect(), k = c.width / b.width, x = (e.clientX - b.left) * k, y = (e.clientY - b.top) * k;
    return { x, y, inside: x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h, tx: (x - rect.x) / rect.w, u: 1 - (y - rect.y) / rect.h };
  }
  let drag = null;
  cv.spec.addEventListener('pointerdown', (e) => {
    if (!state.an || state.live || !state.src) return;
    const r = specRect(), p = plotPoint(cv.spec, e, r);
    if (!p.inside) return;
    cv.spec.setPointerCapture(e.pointerId);
    const span = state.view.t1 - state.view.t0;
    drag = { mode: e.altKey || e.button === 1 ? 'pan' : 'sel', x0: p.x, y0: p.y, t0: state.view.t0 + p.tx * span, view: { ...state.view }, moved: false, r, sc: curScale() };
    e.preventDefault();
  });
  cv.spec.addEventListener('pointermove', (e) => {
    const r = specRect(), p = plotPoint(cv.spec, e, r), span = state.view.t1 - state.view.t0;
    if (drag) {
      if (Math.abs(p.x - drag.x0) > 4 * r.k || Math.abs(p.y - drag.y0) > 4 * r.k) drag.moved = true;
      if (drag.mode === 'pan') {
        const dt = ((p.x - drag.x0) / r.w) * (drag.view.t1 - drag.view.t0);
        setView(drag.view.t0 - dt, drag.view.t1 - dt);
      } else if (drag.moved) {
        const t = clamp(state.view.t0 + clamp(p.tx, 0, 1) * span, 0, duration());
        state.sel = [Math.min(drag.t0, t), Math.max(drag.t0, t)];
        updateSelLabel();
      }
    }
    hoverSpec(p, r);
    schedule();
  });
  function endDrag(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.mode === 'sel') {
      if (!d.moved) seek(d.t0);
      else {
        if (state.sel && state.sel[1] - state.sel[0] < 0.01) state.sel = null;
        selectionChanged();
      }
    }
    schedule();
  }
  cv.spec.addEventListener('pointerup', endDrag);
  cv.spec.addEventListener('pointercancel', endDrag);
  cv.spec.addEventListener('pointerleave', () => { if (!drag) { state.hover = null; $('readout').textContent = ''; schedule(); } });
  cv.spec.addEventListener('wheel', (e) => {
    if (!state.an || state.live) return;
    e.preventDefault();
    const r = specRect(), p = plotPoint(cv.spec, e, r), delta = (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 33 : 1);
    const f = Math.exp(clamp(delta, -300, 300) * 0.0015);
    if (e.shiftKey) zoomFreq(f, clamp(p.u, 0, 1));
    else zoomTime(f, state.view.t0 + clamp(p.tx, 0, 1) * (state.view.t1 - state.view.t0));
  }, { passive: false });
  function hoverSpec(p, r) {
    const an = state.an;
    if (!an || !p.inside) { state.hover = null; $('readout').textContent = ''; return; }
    const t = state.view.t0 + p.tx * (state.view.t1 - state.view.t0), f = curScale().fromNorm(p.u);
    const fi = D.frameIndex(an, t), b = clamp(Math.round(f / an.binHz), 0, an.bins - 1), lvl = an.data[fi * an.bins + b];
    const ni = D.noteInfo(f, state.s.a4, notation());
    $('readout').textContent = `${T('rTime')} ${R.formatTime(state.live ? t - LIVE_SECONDS : t, 1)} s · ${T('rFreq')} ${fmtHz(f)} · ${ni ? ni.label + ' ' + D.centsText(ni.cents) : '—'} · ${T('rLevel')} ${lvl <= D.FLOOR_DB + 1 ? '−∞' : lvl.toFixed(1)} dB`;
    state.hover = { on: 'spec', x: p.x, y: p.y, midi: ni ? ni.nearest : null };
  }
  cv.sp.addEventListener('pointermove', (e) => {
    const r = spectrumRect(), p = plotPoint(cv.sp, e, r), an = state.an;
    if (!an || !state.spec || !p.inside) { state.hover = null; $('spReadout').textContent = ''; schedule(); return; }
    const f = curScale().fromNorm(p.tx), b = clamp(Math.round(f / an.binHz), 0, an.bins - 1), ni = D.noteInfo(f, state.s.a4, notation());
    $('spReadout').textContent = `${fmtHz(f)} · ${ni ? ni.label + ' ' + D.centsText(ni.cents) : '—'} · ${state.spec[b].toFixed(1)} dB`;
    state.hover = { on: 'sp', x: p.x };
    schedule();
  });
  cv.sp.addEventListener('pointerleave', () => { state.hover = null; $('spReadout').textContent = ''; schedule(); });
  // overview: drag to move the view (click seeks when the whole file is visible)
  let ovDrag = false;
  function ovAt(e) {
    const r = overviewRect(), p = plotPoint(cv.ov, e, r), dur = duration(), t = clamp(p.tx, 0, 1) * dur, span = state.view.t1 - state.view.t0;
    if (span >= dur - 1e-6) seek(t); else setView(t - span / 2, t + span / 2);
  }
  cv.ov.addEventListener('pointerdown', (e) => { if (!state.src || state.live) return; ovDrag = true; cv.ov.setPointerCapture(e.pointerId); ovAt(e); });
  cv.ov.addEventListener('pointermove', (e) => { if (ovDrag) ovAt(e); });
  cv.ov.addEventListener('pointerup', () => { ovDrag = false; });
  cv.ov.addEventListener('dblclick', () => setView(0, duration()));
  cv.ov.addEventListener('keydown', (e) => {
    const span = state.view.t1 - state.view.t0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const d = (e.key === 'ArrowLeft' ? -1 : 1) * span * (e.shiftKey ? 0.5 : 0.1); setView(state.view.t0 + d, state.view.t1 + d); }
  });
  function selectionChanged() {
    updateSelLabel(); computeKey();
    if (state.s.spec === 'avg') computeSpectrum();
    if (state.loop) restartIfPlaying();
    schedule();
  }
  function onKey(e) {
    if (e.target.closest('input, select, textarea, dialog')) return;
    const span = state.view.t1 - state.view.t0;
    let used = true;
    switch (e.key) {
      case ' ': togglePlay(); break;
      case 'ArrowLeft': case 'ArrowRight': seek(state.playhead + (e.key === 'ArrowLeft' ? -1 : 1) * span * (e.shiftKey ? 0.1 : 0.01)); followPlayheadNow(); break;
      case '+': case '=': zoomTime(0.5); break;
      case '-': case '_': zoomTime(2); break;
      case '0': setView(0, duration()); break;
      case 'PageUp': zoomFreq(0.7); break;
      case 'PageDown': zoomFreq(1 / 0.7); break;
      case 'Home': seek(0); setView(0, span); break;
      case 'End': seek(duration()); break;
      case 'l': case 'L': toggleLoop(); break;
      case 'Escape': if (state.sel) { state.sel = null; selectionChanged(); } else used = false; break;
      default: used = false;
    }
    if (used) e.preventDefault();
  }
  function followPlayheadNow() { const v = state.view, span = v.t1 - v.t0; if (state.playhead < v.t0 || state.playhead > v.t1) setView(state.playhead - span / 2, state.playhead + span / 2); }
  cv.spec.addEventListener('keydown', onKey);
  document.addEventListener('keydown', (e) => { if (e.target === cv.spec || e.target === cv.ov) return; if (e.key === ' ' && !e.target.closest('input, select, textarea, button, dialog, a')) { e.preventDefault(); togglePlay(); } });
  function toggleLoop() { state.loop = !state.loop; updatePlayButton(); restartIfPlaying(); }

  // ------------------------------------------------------------------ exports
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast(T('exported', { name }));
  }
  function baseName() {
    if (state.live) return 'micro';
    if (!state.src) return 'spectre';
    if (state.src.demo) return 'demo';
    return (state.src.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 60)) || 'audio';
  }
  const winName = () => T({ hann: 'w_hann', hamming: 'w_hamming', blackmanharris: 'w_bh', rect: 'w_rect' }[state.an.window]);
  function exportPng() {
    if (!state.an) return null;
    const [W, H] = state.s.png.split('x').map(Number), c = document.createElement('canvas');
    c.width = W; c.height = H;
    const s = state.s, ctx = c.getContext('2d'), title = state.live ? T('liveName') : state.src.demo ? T('demoName') : state.src.name;
    R.drawExport(ctx, W, H, {
      an: state.an, view: { t0: state.view.t0, t1: state.view.t1, scale: curScale(), dbMin: s.dbMin, dbMax: s.dbMax }, lut: CM.lut(s.cmap),
      title, subtitle: T('pngSub', { dur: fmtDur(duration()), sr: state.an.sr, ch: T('ch_' + (state.live ? 'mid' : s.ch)), fft: state.an.fft, win: winName(), ov: s.ov, scale: T('sc_' + s.scale), a4: s.a4 }),
      footer: T('pngFoot'), labels: { time: T('pngTime'), freq: T('pngFreq'), level: T('pngLevel') },
      a4: s.a4, notation: notation(), noteGrid: s.grid, piano: s.piano, sel: state.sel, offset: state.live ? -LIVE_SECONDS : 0,
    });
    const name = baseName() + '-spectrogram.png';
    c.toBlob((b) => download(b, name), 'image/png');
    return name;
  }
  const csv = (rows) => new Blob(['\ufeff' + rows.map((r) => r.join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  function exportPeaks() {
    const rows = [['rank', 'frequency_hz', 'note', 'cents', 'level_dbfs']];
    state.peaks.forEach((p, i) => { const ni = D.noteInfo(p.freq, state.s.a4, notation()); rows.push([i + 1, p.freq.toFixed(2), ni ? ni.label : '', ni ? ni.cents : '', p.db.toFixed(2)]); });
    download(csv(rows), baseName() + '-peaks.csv');
  }
  function exportSpectrum() {
    if (!state.spec) return;
    const sc = curScale(), an = state.an, rows = [['frequency_hz', 'level_dbfs']];
    for (let k = 0; k < an.bins; k++) { const f = k * an.binHz; if (f >= sc.fmin && f <= sc.fmax) rows.push([f.toFixed(3), state.spec[k] <= D.FLOOR_DB ? '' : state.spec[k].toFixed(2)]); }
    download(csv(rows), baseName() + '-spectrum.csv');
  }
  function exportJson() {
    const k = state.key, src = state.src;
    const obj = {
      app: 'spectre-atelier', version: 1, exported: new Date().toISOString(), settings: state.s,
      source: state.live ? { name: 'live', sampleRate: state.an && state.an.sr } : src ? { name: src.demo ? 'demo' : src.name, sampleRate: src.sr, duration: +src.duration.toFixed(4), channels: src.channels.length } : null,
      view: { t0: +state.view.t0.toFixed(4), t1: +state.view.t1.toFixed(4) }, selection: state.sel,
      key: k ? { tonic: D.pcName(k.tonic, 'en'), mode: k.mode, r: +k.r.toFixed(3) } : null,
      peaks: state.peaks.map((p) => ({ frequency: +p.freq.toFixed(2), note: (D.noteInfo(p.freq, state.s.a4, 'en') || {}).label, level: +p.db.toFixed(2) })),
    };
    download(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), 'spectre-atelier-settings.json');
  }
  async function importJson(file) {
    try {
      const obj = JSON.parse(await file.text());
      if (!obj || typeof obj !== 'object') throw new Error('not an object');
      state.s = ST.validate(obj.settings || obj);
      settingsChanged(true); toast(T('jsonLoaded'));
    } catch (e) { toast(T('jsonError')); }
  }
  async function share() {
    writeHash();
    try { await navigator.clipboard.writeText(location.href); toast(T('linkCopied')); } catch (e) { toast(T('linkReady')); }
  }

  // ------------------------------------------------------------------ bindings
  $('openBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; loadFile(f); });
  $('demoBtn').addEventListener('click', () => { ensureCtx(); loadDemo(); });
  $('micBtn').addEventListener('click', () => (state.live ? stopMic(false) : startMic()));
  $('playBtn').addEventListener('click', togglePlay);
  $('stopBtn').addEventListener('click', () => stopPlayback(true));
  $('loopBtn').addEventListener('click', toggleLoop);
  $('clearSelBtn').addEventListener('click', () => { state.sel = null; selectionChanged(); });
  $('tZoomIn').addEventListener('click', () => zoomTime(0.5));
  $('tZoomOut').addEventListener('click', () => zoomTime(2));
  $('tFit').addEventListener('click', () => setView(0, duration()));
  $('fZoomIn').addEventListener('click', () => zoomFreq(0.6));
  $('fZoomOut').addEventListener('click', () => zoomFreq(1 / 0.6));
  $('fFit').addEventListener('click', fitFreq);
  for (const id of ['fft', 'win', 'ov', 'ch']) $(id).addEventListener('change', (e) => { state.s[id] = e.target.value; settingsChanged(true); });
  for (const id of ['cmap', 'nt', 'png']) $(id).addEventListener('change', (e) => { state.s[id] = e.target.value; settingsChanged(false); if (id === 'nt') applyLang(); });
  for (const id of ['fmin', 'fmax', 'peaks']) $(id).addEventListener('change', (e) => { state.s[id] = Number(e.target.value); settingsChanged(false); });
  for (const id of ['dbMin', 'dbMax']) $(id).addEventListener('input', (e) => { state.s[id] = Number(e.target.value); settingsChanged(false); });
  for (const id of ['grid', 'piano']) $(id).addEventListener('change', (e) => { state.s[id] = e.target.checked; settingsChanged(false); });
  $('a4').addEventListener('change', (e) => {
    state.s.a4 = Number(e.target.value); state.s = ST.validate(state.s);
    if (state.live && live) live.map = D.chromaMap(state.an.bins, state.an.binHz, state.s.a4); else computeChroma();
    settingsChanged(false); updatePeaksTable();
  });
  function segment(id, key) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-val]');
      if (!b) return;
      state.s[key] = b.dataset.val;
      if (key === 'scale' && b.dataset.val === 'log' && state.s.fmin < D.LOG_MIN_HZ) state.s.fmin = 20;
      settingsChanged(false);
    });
    $(id).addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const bs = [...$(id).querySelectorAll('button')], i = bs.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
      n.click(); n.focus(); e.preventDefault();
    });
  }
  segment('scaleSeg', 'scale'); segment('specModeSeg', 'spec');
  $('exPng').addEventListener('click', exportPng);
  $('exPeaks').addEventListener('click', exportPeaks);
  $('exSpectrum').addEventListener('click', exportSpectrum);
  $('exJson').addEventListener('click', exportJson);
  $('imJson').addEventListener('click', () => $('jsonInput').click());
  $('jsonInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importJson(f); });
  $('shareBtn').addEventListener('click', share);
  $('resetBtn').addEventListener('click', () => { state.s = ST.defaults(); settingsChanged(true); toast(T('resetDone')); });
  $('lang').addEventListener('change', (e) => { state.lang = e.target.value; store.set('spectre-lang', state.lang); writeHash(); applyLang(); });
  $('tfng').addEventListener('change', (e) => { state.tfng = e.target.checked; store.set('spectre-tfng', state.tfng ? '1' : '0'); writeHash(); applyLang(); });
  $('themeBtn').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t; store.set('spectre-theme', t);
  });
  $('helpBtn').addEventListener('click', () => $('helpDlg').showModal());
  // drag & drop anywhere on the page
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; $('specCard').classList.add('dragging'); e.preventDefault(); } });
  window.addEventListener('dragover', (e) => { e.preventDefault(); });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('specCard').classList.remove('dragging'); });
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; $('specCard').classList.remove('dragging');
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) { ensureCtx(); if (/\.json$/i.test(f.name)) importJson(f); else loadFile(f); }
  });
  window.addEventListener('hashchange', () => { if (readHash()) { applyLang(); settingsChanged(true); } });
  if (window.ResizeObserver) new ResizeObserver(() => schedule()).observe(document.body);
  window.addEventListener('resize', schedule);

  // ------------------------------------------------------------------ start
  const savedTheme = store.get('spectre-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;
  const savedLang = store.get('spectre-lang');
  if (I18N.LANGS.includes(savedLang)) state.lang = savedLang;
  state.tfng = store.get('spectre-tfng') === '1';
  readHash();
  state.s = ST.validate(state.s);
  syncControls(); applyLang(); writeHash();
  loadDemo();

  // small API for tests and power users (console)
  window.SpectreApp = { state, loadDemo, loadFile, analyse, seek, setView, zoomTime, zoomFreq, play, stopPlayback, exportPng, exportPeaks, exportSpectrum, exportJson, startMic, stopMic,
    setSelection(a, b) { state.sel = a == null ? null : [Math.min(a, b), Math.max(a, b)]; selectionChanged(); } };
})();
