// Headless UI test (Playwright + Chrome/Chromium): node tests/ui.test.js
// Serves the folder locally and runs the interface at 1440 × 900 (desktop) and 390 × 844 (mobile): demo signal,
// non-blank spectrogram / spectrum / chromagram, hover readout, peaks and key, three languages (+ Tifinagh), analysis
// and display settings (URL hash), zoom, selection, seek, playback and loop, stereo channel modes, exports (PNG / CSV /
// JSON content checked), JSON import, hash restore, loading a WAV file, live microphone (fake device), keyboard,
// theme, help, no console errors, no horizontal overflow on mobile. Writes the README screenshots.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.resolve(__dirname, '../../node_modules/playwright'))); }
const root = path.resolve(__dirname, '..'), shots = path.join(root, 'screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
let checks = 0;
const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= eps, `${msg || ''} expected ${b} ± ${eps}, got ${a}`);

/** 16-bit PCM mono WAV of a sine (for the file-loading test). */
function sineWav(file, f, sr = 48000, secs = 1.5, amp = 0.5) {
  const n = Math.round(sr * secs), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(amp * 32767 * Math.sin((2 * Math.PI * f * i) / sr)), 44 + i * 2);
  fs.writeFileSync(file, b);
}
const pngSize = (buf) => ({ sig: buf.subarray(1, 4).toString(), w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
async function download(page, action) {
  const [dl] = await Promise.all([page.waitForEvent('download'), action()]);
  return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) };
}
const st = (page) => page.evaluate(() => { const s = window.SpectreApp.state; return { ready: s.ready, busy: s.busy, analyses: s.analyses, view: s.view, sel: s.sel, playhead: s.playhead, playing: s.playing, live: s.live, s: s.s, peaks: s.peaks, key: s.key, lang: s.lang }; });
async function waitAnalysis(page, after) {
  await page.waitForFunction((n) => { const s = window.SpectreApp.state; return s.ready && !s.busy && s.analyses > n; }, after, { timeout: 20000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
/** Canvas content statistics: standard deviation of luminance and number of distinct colours (sampled). */
const canvasStats = (page, id) => page.evaluate((id) => {
  const c = document.getElementById(id), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, seen = new Set();
  let s = 0, s2 = 0, n = 0;
  for (let i = 0; i < d.length; i += 4 * 7) { const y = 0.2 * d[i] + 0.7 * d[i + 1] + 0.1 * d[i + 2]; s += y; s2 += y * y; n++; seen.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3)); }
  const m = s / n;
  return { std: Math.sqrt(Math.max(0, s2 / n - m * m)), colours: seen.size, w: c.width, h: c.height };
}, id);
/** Client coordinates of a time / normalized-frequency point inside the spectrogram plot. */
const specPoint = (page, t, u) => page.evaluate(([t, u]) => {
  const c = document.getElementById('spec'), b = c.getBoundingClientRect(), k = c.width / b.width, s = window.SpectreApp.state;
  const x0 = (48 * k + (s.s.piano ? 13 * k : 0)) / k, w = b.width - x0 - 8, h = b.height - 26;
  return { x: b.left + x0 + ((t - s.view.t0) / (s.view.t1 - s.view.t0)) * w, y: b.top + 4 + (1 - u) * h };
}, [t, u]);

async function run(browser, base, vp, name) {
  const mobile = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true, deviceScaleFactor: mobile ? 2 : 1, permissions: ['microphone'] });
  const page = await ctx.newPage(), errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const ok = (m) => { checks++; console.log(`  ✓ [${name}] ${m}`); };
  await page.goto(base, { waitUntil: 'load' });
  await waitAnalysis(page, 0);

  // ---- first load (demo is loaded automatically)
  assert.match(await page.title(), /Spectre Atelier/);
  assert.strictEqual(await page.textContent('#specTitle'), 'Spectrogramme');
  assert.match(await page.textContent('#srcName'), /Signal de démo/);
  ok('loads in French with the demo signal analysed');
  if (mobile) { const o = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert(o[0] <= o[1], 'overflow ' + o); ok('no horizontal overflow'); }

  // ---- demo button, non-blank canvases
  let a = (await st(page)).analyses;
  await page.click('#demoBtn');
  await waitAnalysis(page, a);
  for (const id of ['spec', 'spectrum', 'chroma', 'overview', 'scope']) {
    const s = await canvasStats(page, id);
    assert(s.std > 8 && s.colours > 20, `${id} looks blank: ${JSON.stringify(s)}`);
  }
  ok('demo button: spectrogram, spectrum, chromagram, overview and vectorscope render (non-blank)');
  let S = await st(page);
  assert.strictEqual(S.peaks.length, 10);
  assert(S.peaks.some((p) => Math.abs(p.freq - 220) < 2), 'peak at 220 Hz');
  assert.strictEqual(await page.locator('#peakTable tbody tr').count(), 10);
  assert.match(await page.textContent('#peakTable tbody'), /La3/);
  assert.match(await page.textContent('#keyBadge'), /La mineur/);
  ok('peaks (220 Hz = La3 listed) and key estimate (La mineur)');

  // ---- hover readout
  await page.locator('#spec').scrollIntoViewIfNeeded();
  let p = await specPoint(page, 1.5, 0.5);
  await page.mouse.move(p.x, p.y);
  const ro = await page.textContent('#readout');
  assert.match(ro, /Temps 1\.\d+ s · Fréq\. [\d.]+ (Hz|kHz) · \S+\d [±+−]\d+ c · Niveau/);
  ok('hover readout: ' + ro);

  // ---- languages
  await page.selectOption('#lang', 'en');
  assert.strictEqual(await page.textContent('#spTitle'), 'Spectrum');
  assert.match(await page.textContent('#keyBadge'), /A minor/);
  assert.match(await page.textContent('#peakTable tbody'), /A3/);
  assert.strictEqual(await page.evaluate(() => document.documentElement.lang), 'en');
  await page.selectOption('#lang', 'kab');
  assert.strictEqual(await page.textContent('#spTitle'), 'Aspekṭr');
  assert(await page.isVisible('#tfngWrap'));
  await page.check('#tfng');
  assert.strictEqual(await page.textContent('#spTitle'), 'ⴰⵙⵒⴻⴽⵟⵔ');
  assert(await page.evaluate(() => document.body.classList.contains('tfng')));
  assert.match(page.url(), /lang=kab&tf=1/);
  await page.uncheck('#tfng');
  await page.selectOption('#lang', 'fr');
  assert.strictEqual(await page.textContent('#spTitle'), 'Spectre');
  assert(!(await page.isVisible('#tfngWrap')));
  ok('language switch FR → EN → Taqbaylit → Tifinagh → FR (texts, note names, key, lang attribute, hash)');

  // ---- analysis + display settings
  a = (await st(page)).analyses;
  await page.selectOption('#fft', '8192');
  await waitAnalysis(page, a);
  assert.match(await page.textContent('#resInfo'), /5\.38 Hz/);
  a = (await st(page)).analyses;
  await page.selectOption('#win', 'blackmanharris'); await waitAnalysis(page, a);
  a = (await st(page)).analyses;
  await page.selectOption('#ov', '87.5'); await waitAnalysis(page, a);
  await page.click('#scaleSeg [data-val="mel"]');
  await page.selectOption('#cmap', 'oasis');
  await page.check('#grid');
  await page.fill('#a4', '442'); await page.press('#a4', 'Enter');
  S = await st(page);
  assert.strictEqual(S.s.fft, 8192); assert.strictEqual(S.s.win, 'blackmanharris'); assert.strictEqual(S.s.ov, 87.5);
  assert.strictEqual(S.s.scale, 'mel'); assert.strictEqual(S.s.cmap, 'oasis'); assert.strictEqual(S.s.grid, true); assert.strictEqual(S.s.a4, 442);
  assert.match(page.url(), /fft=8192/); assert.match(page.url(), /sc=mel/); assert.match(page.url(), /cm=oasis/); assert.match(page.url(), /a4=442/);
  assert.strictEqual(await page.getAttribute('#scaleSeg [data-val="mel"]', 'aria-checked'), 'true');
  assert((await canvasStats(page, 'spec')).std > 8);
  ok('settings: FFT 8192 (5.38 Hz bins), Blackman-Harris, 87.5 %, mel, oasis, note grid, A4 = 442 → URL hash');
  if (!mobile) await page.locator('#specCard').screenshot({ path: path.join(shots, 'mel-oasis-notegrid.png') });
  await page.fill('#a4', '440'); await page.press('#a4', 'Enter');
  await page.click('#scaleSeg [data-val="log"]');
  await page.fill('#dbMin', '-90');
  await page.fill('#fmin', '60'); await page.press('#fmin', 'Enter');
  await page.fill('#fmax', '4000'); await page.press('#fmax', 'Enter');
  S = await st(page);
  assert.strictEqual(S.s.fmin, 60); assert.strictEqual(S.s.fmax, 4000); assert.strictEqual(S.s.dbMin, -90);
  ok('frequency range and dB floor inputs');

  // ---- zoom (buttons + wheel + keyboard)
  await page.click('#tFit');
  await page.click('#tZoomIn');
  S = await st(page);
  near(S.view.t1 - S.view.t0, 4, 0.01, 'time zoom');
  await page.click('#tFit');
  await page.click('#fZoomIn');
  S = await st(page);
  assert(S.s.fmax < 4000 && S.s.fmin > 60, 'freq zoom');
  await page.click('#fFit');
  S = await st(page);
  assert.strictEqual(S.s.fmax, 22050); assert.strictEqual(S.s.fmin, 20);
  if (!mobile) {
    p = await specPoint(page, 2, 0.5);
    await page.mouse.move(p.x, p.y);
    await page.mouse.wheel(0, -400);
    S = await st(page);
    assert(S.view.t1 - S.view.t0 < 8 && S.view.t0 <= 2 && S.view.t1 >= 2, 'wheel zoom around the cursor');
  }
  await page.focus('#spec');
  await page.keyboard.press('0');
  S = await st(page); near(S.view.t1 - S.view.t0, 8, 1e-6);
  await page.keyboard.press('+');
  S = await st(page); near(S.view.t1 - S.view.t0, 4, 1e-6);
  await page.keyboard.press('0');
  ok('zoom: time / frequency buttons, wheel, keyboard + and 0');

  // ---- selection (drag), seek (click), loop playback
  await page.fill('#fmin', '50'); await page.press('#fmin', 'Enter');
  await page.fill('#fmax', '2000'); await page.press('#fmax', 'Enter');
  await page.locator('#spec').scrollIntoViewIfNeeded();
  const p1 = await specPoint(page, 0.5, 0.5), p2 = await specPoint(page, 2.5, 0.5);
  await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move(p2.x, p2.y, { steps: 6 }); await page.mouse.up();
  S = await st(page);
  near(S.sel[0], 0.5, 0.1, 'sel start'); near(S.sel[1], 2.5, 0.1, 'sel end');
  assert.match(await page.textContent('#selLabel'), /Sélection 0\.\d+ → 2\.\d+ s/);
  assert.match(await page.textContent('#spRange'), /sélection/);
  ok('drag selects a region; spectrum averages the selection');
  if (!mobile) {
    await page.locator('#specCard').screenshot({ path: path.join(shots, 'zoom-chord-piano.png') });
  }
  p = await specPoint(page, 6.4, 0.3);
  await page.mouse.click(p.x, p.y);
  S = await st(page); near(S.playhead, 6.4, 0.1, 'seek');
  ok('click seeks the playhead');
  await page.click('#playBtn');
  await page.waitForTimeout(700);
  S = await st(page);
  assert(S.playing, 'playing'); assert(S.playhead > 6.5, 'playhead advances: ' + S.playhead);
  await page.click('#playBtn');
  S = await st(page); assert(!S.playing);
  ok('playback: playhead advances, pause');
  await page.evaluate(() => window.SpectreApp.setSelection(1, 1.4));
  await page.click('#loopBtn');
  assert.strictEqual(await page.getAttribute('#loopBtn', 'aria-pressed'), 'true');
  await page.click('#playBtn');
  await page.waitForTimeout(1100);
  S = await st(page);
  assert(S.playing && S.playhead >= 1 && S.playhead <= 1.4, 'loop keeps the playhead inside the selection: ' + S.playhead);
  await page.click('#stopBtn');
  S = await st(page); assert(!S.playing); near(S.playhead, 1, 1e-6, 'stop returns to the selection start');
  await page.click('#loopBtn');
  await page.click('#clearSelBtn');
  assert.strictEqual((await st(page)).sel, null);
  ok('loop playback stays inside the selection; stop; clear selection');

  // ---- stereo channel modes, vectorscope, spectrum mode
  a = (await st(page)).analyses;
  await page.selectOption('#ch', 'side'); await waitAnalysis(page, a);
  assert.strictEqual((await st(page)).s.ch, 'side');
  await page.evaluate(() => window.SpectreApp.seek(5.7));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const corr = Number(await page.textContent('#corrHere'));
  assert(corr < 0.4, 'noise burst is wide: ' + corr);
  assert.match(await page.textContent('#corrFile'), /^0\.\d\d$/);
  a = (await st(page)).analyses;
  await page.selectOption('#ch', 'left'); await waitAnalysis(page, a);
  a = (await st(page)).analyses;
  await page.selectOption('#ch', 'mid'); await waitAnalysis(page, a);
  await page.click('#specModeSeg [data-val="playhead"]');
  assert.match(await page.textContent('#spRange'), /tête de lecture : 5\.700/);
  await page.click('#specModeSeg [data-val="avg"]');
  ok(`stereo: Side / Left / Mid analysis, correlation at the noise burst = ${corr}; spectrum at playhead / average`);

  // ---- exports
  await page.click('#fFit');
  let d = await download(page, () => page.click('#exPng'));
  let ps = pngSize(d.buf);
  assert.strictEqual(d.name, 'demo-spectrogram.png'); assert.strictEqual(ps.sig, 'PNG'); assert.deepStrictEqual([ps.w, ps.h], [3000, 1500]);
  assert(d.buf.length > 100000, 'PNG has content');
  await page.selectOption('#png', '1920x1080');
  d = await download(page, () => page.click('#exPng'));
  ps = pngSize(d.buf); assert.deepStrictEqual([ps.w, ps.h], [1920, 1080]);
  if (!mobile) fs.writeFileSync(path.join(shots, 'export-example.png'), d.buf);
  d = await download(page, () => page.click('#exPeaks'));
  let txt = d.buf.toString('utf8').replace(/^\ufeff/, ''), rows = txt.trim().split(/\r\n/);
  assert.strictEqual(d.name, 'demo-peaks.csv'); assert.strictEqual(rows[0], 'rank,frequency_hz,note,cents,level_dbfs'); assert.strictEqual(rows.length, 11);
  assert(rows.slice(1).some((r) => /^\d+,2(19|20)\.\d\d,La3,/.test(r)), 'La3 row');
  d = await download(page, () => page.click('#exSpectrum'));
  rows = d.buf.toString('utf8').replace(/^\ufeff/, '').trim().split(/\r\n/);
  assert.strictEqual(rows[0], 'frequency_hz,level_dbfs'); assert(rows.length > 1000);
  d = await download(page, () => page.click('#exJson'));
  const js = JSON.parse(d.buf.toString('utf8'));
  assert.strictEqual(js.app, 'spectre-atelier'); assert.strictEqual(js.settings.fft, 8192); assert.strictEqual(js.source.name, 'demo');
  assert.strictEqual(js.key.tonic, 'A'); assert.strictEqual(js.key.mode, 'minor'); assert.strictEqual(js.peaks.length, 10);
  ok('exports: PNG 3000×1500 and 1920×1080, peaks CSV (10 rows), spectrum CSV, settings JSON (key A minor)');

  // ---- import JSON settings
  const jf = path.join(os.tmpdir(), `spectre-${name}.json`);
  fs.writeFileSync(jf, JSON.stringify({ app: 'spectre-atelier', settings: { fft: 2048, cmap: 'glacier', scale: 'lin', peaks: 5, win: 'nonsense' } }));
  a = (await st(page)).analyses;
  await page.setInputFiles('#jsonInput', jf);
  await waitAnalysis(page, a);
  S = await st(page);
  assert.strictEqual(S.s.fft, 2048); assert.strictEqual(S.s.cmap, 'glacier'); assert.strictEqual(S.s.scale, 'lin'); assert.strictEqual(S.s.win, 'hann'); assert.strictEqual(S.peaks.length, 5);
  assert.strictEqual(await page.inputValue('#fft'), '2048');
  ok('JSON import (validated: unknown window falls back to Hann)');
  await page.click('#resetBtn');
  await page.waitForFunction(() => !window.SpectreApp.state.busy);
  assert.deepStrictEqual((await st(page)).s, await page.evaluate(() => window.SpectreSettings.defaults()));
  ok('reset settings');

  // ---- load a WAV file (mono 1 kHz)
  const wf = path.join(os.tmpdir(), `spectre-1k-${name}.wav`);
  sineWav(wf, 1000);
  a = (await st(page)).analyses;
  await page.setInputFiles('#fileInput', wf);
  await waitAnalysis(page, a);
  S = await st(page);
  near(S.peaks[0].freq, 1000, 1, 'WAV peak'); near(S.peaks[0].db, -6, 0.5, 'WAV level');
  assert.match(await page.textContent('#srcName'), /spectre-1k/);
  assert.match(await page.textContent('#srcMeta'), /mono/);
  assert(await page.isDisabled('#ch'), 'channel select disabled for mono');
  assert.strictEqual(await page.textContent('#corrFile'), '—');
  assert.match(await page.textContent('#peakTable tbody tr:first-child'), /^1(999\.\d Hz|1\.000 kHz)Si5\+21 c-6\.\d dB$/);
  ok('WAV file: 1 kHz peak at −6 dBFS, Si5 +21 c, mono detected');

  // ---- live microphone (Chrome fake device)
  await page.click('#micBtn');
  await page.waitForFunction(() => window.SpectreApp.state.live, null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  assert.strictEqual(await page.getAttribute('#micBtn', 'aria-pressed'), 'true');
  assert.match(await page.textContent('#srcName'), /Micro en direct/);
  assert(await page.isDisabled('#playBtn'));
  // the fake device beeps periodically: wait for a frame with sound
  await page.waitForFunction(() => window.SpectreApp.state.peaks.length > 0, null, { timeout: 8000 });
  S = await st(page);
  assert(await page.evaluate(() => { let m = -999; for (const v of window.SpectreApp.state.an.data) if (v > m) m = v; return m > -60; }), 'live data');
  assert((await canvasStats(page, 'spec')).std > 3, 'live spectrogram draws');
  d = await download(page, () => page.click('#exPng'));
  assert.strictEqual(d.name, 'micro-spectrogram.png');
  await page.click('#micBtn');
  await waitAnalysis(page, S.analyses);
  assert(!(await st(page)).live); assert.match(await page.textContent('#srcName'), /spectre-1k/);
  ok(`live microphone (fake device): rolling spectrogram, ${S.peaks.length} peaks (top ${S.peaks[0].freq.toFixed(0)} Hz), PNG snapshot, stop restores the file`);

  // ---- hash restore in a fresh page
  const p2page = await ctx.newPage();
  p2page.on('pageerror', (e) => errors.push(String(e)));
  p2page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p2page.goto(base + '#fft=1024&sc=lin&cm=sahara&grid=1&pk=4&lang=en', { waitUntil: 'load' });
  await waitAnalysis(p2page, 0);
  const S2 = await st(p2page);
  assert.strictEqual(S2.s.fft, 1024); assert.strictEqual(S2.s.scale, 'lin'); assert.strictEqual(S2.s.cmap, 'sahara'); assert.strictEqual(S2.s.grid, true); assert.strictEqual(S2.peaks.length, 4);
  assert.strictEqual(S2.lang, 'en'); assert.strictEqual(await p2page.textContent('#spTitle'), 'Spectrum');
  assert.strictEqual(await p2page.inputValue('#cmap'), 'sahara');
  await p2page.close();
  ok('shareable link: settings and language restored from the URL hash');

  // ---- theme, help, share
  await page.click('#themeBtn');
  assert.strictEqual(await page.getAttribute('html', 'data-theme'), 'light');
  await page.click('#helpBtn');
  assert(await page.isVisible('#helpDlg'));
  assert.match(await page.textContent('#helpDlg'), /Raccourcis/);
  await page.keyboard.press('Escape');
  assert(!(await page.isVisible('#helpDlg')));
  await page.click('#shareBtn');
  await page.waitForSelector('#toast:not([hidden])');
  ok('light theme, help dialog, share link');

  // ---- screenshots (demo, default settings)
  await page.click('#demoBtn');
  await page.waitForFunction(() => { const s = window.SpectreApp.state; return s.ready && !s.busy && s.src && s.src.demo; });
  await page.evaluate(() => window.SpectreApp.seek(6.45));
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await page.evaluate(() => { document.getElementById('toast').hidden = true; });
  if (mobile) {
    await page.click('#themeBtn');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(shots, 'mobile.png') });
  } else {
    await page.screenshot({ path: path.join(shots, 'desktop-light.png') });
    await page.click('#themeBtn');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(shots, 'desktop.png') });
    await page.locator('#chTitle').locator('xpath=ancestor::section').screenshot({ path: path.join(shots, 'chromagram.png') });
    await page.locator('#spTitle').locator('xpath=ancestor::section').screenshot({ path: path.join(shots, 'spectrum-peaks.png') });
  }
  if (mobile) { const o = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert(o[0] <= o[1], 'overflow at end ' + o); }

  assert.deepStrictEqual(errors, [], 'console errors');
  ok('no console errors');
  await ctx.close();
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  let code = 0;
  try {
    console.log('desktop 1440 × 900');
    await run(browser, base, { width: 1440, height: 900 }, 'desktop');
    console.log('mobile 390 × 844');
    await run(browser, base, { width: 390, height: 844 }, 'mobile');
    console.log(`\nUI test passed (${checks} checks)`);
  } catch (e) { console.error('\nUI test FAILED\n', e); code = 1; }
  await browser.close(); server.close();
  process.exit(code);
})();
