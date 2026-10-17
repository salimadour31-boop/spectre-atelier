/* i18n.js — Spectre Atelier interface texts: French (default), English, Taqbaylit (Kabyle, Latin script) with
 * optional Tifinagh rendering of the Kabyle texts. Each entry is [fr, en, kab]; placeholders look like {n}.
 * The Kabyle texts are a first draft — corrections are welcome. Original texts, MIT licence. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.I18N = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const S = {
    skip: ['Aller au spectrogramme', 'Skip to the spectrogram', 'Ddu ɣer uspekṭrugram'],
    tagline: ['Analyseur de spectre et spectrogramme audio — tout reste sur votre appareil', 'Audio spectrum and spectrogram analyzer — everything stays on your device', 'Tasleḍt n uspekṭr d uspekṭrugram — kullec yeqqim ɣur-k'],
    language: ['Langue', 'Language', 'Tutlayt'],
    tifinagh: ['Tifinagh', 'Tifinagh', 'Tifinaɣ'],
    uiTheme: ['Interface claire / sombre', 'Light / dark interface', 'Agrudem amellal / aberkan'],
    help: ['Aide', 'Help', 'Tallelt'],
    close: ['Fermer', 'Close', 'Mdel'],
    source: ['Source audio', 'Audio source', 'Aɣbalu n imesli'],
    openFile: ['Ouvrir un fichier audio', 'Open an audio file', 'Ldi afaylu n imesli'],
    demo: ['Signal de démo', 'Demo signal', 'Amedya'],
    mic: ['Micro en direct', 'Live microphone', 'Amikru srid'],
    micStop: ['Arrêter le micro', 'Stop the microphone', 'Seḥbes amikru'],
    analysing: ['Analyse en cours', 'Analysing', 'Tasleḍt teddu'],
    spectrogram: ['Spectrogramme', 'Spectrogram', 'Aspekṭrugram'],
    specAria: ['Spectrogramme : temps en abscisse, fréquence en ordonnée, niveau en couleur', 'Spectrogram: time across, frequency up, level as colour', 'Aspekṭrugram: akud s uglawi, asnagar s ubeddi, aswir s yini'],
    dropHint: ['Déposez un fichier audio ici', 'Drop an audio file here', 'Sers afaylu n imesli da'],
    overviewAria: ['Vue d’ensemble : faites glisser pour déplacer la vue', 'Overview: drag to move the view', 'Tamuɣli tamatut: zuɣer akken ad tesmuttiḍ'],
    transport: ['Lecture', 'Transport', 'Taɣuri'],
    play: ['Lecture', 'Play', 'Urar'],
    pause: ['Pause', 'Pause', 'Asteɛfu'],
    playKey: ['Lecture / pause (Espace)', 'Play / pause (Space)', 'Urar / asteɛfu (Espace)'],
    stop: ['Stop (retour au début)', 'Stop (back to start)', 'Seḥbes (uɣal ɣer tazwara)'],
    loop: ['Boucler la sélection', 'Loop the selection', 'Ales afran'],
    loopKey: ['Boucler la sélection (L)', 'Loop the selection (L)', 'Ales afran (L)'],
    clearSel: ['Effacer la sélection (Échap)', 'Clear the selection (Esc)', 'Sfeḍ afran (Échap)'],
    zoomTime: ['Temps', 'Time', 'Akud'],
    zoomFreq: ['Fréq.', 'Freq.', 'Asnagar'],
    zoomInTime: ['Zoom avant en temps (+)', 'Zoom in time (+)', 'Simɣer akud (+)'],
    zoomOutTime: ['Zoom arrière en temps (−)', 'Zoom out time (−)', 'Smeẓẓi akud (−)'],
    fitTime: ['Tout le fichier (0)', 'Whole file (0)', 'Afaylu akk (0)'],
    zoomInFreq: ['Zoom avant en fréquence (Page préc.)', 'Zoom in frequency (Page Up)', 'Simɣer asnagar (PageUp)'],
    zoomOutFreq: ['Zoom arrière en fréquence (Page suiv.)', 'Zoom out frequency (Page Down)', 'Smeẓẓi asnagar (PageDown)'],
    fitFreq: ['Toute la bande de fréquences', 'Full frequency range', 'Asnagar akk'],
    gestures: ['Clic : placer la tête de lecture · glisser : sélectionner une zone · molette : zoom temps · <kbd>Maj</kbd> + molette : zoom fréquence · <kbd>Alt</kbd> + glisser : déplacer', 'Click: set the playhead · drag: select a region · wheel: zoom time · <kbd>Shift</kbd> + wheel: zoom frequency · <kbd>Alt</kbd> + drag: pan', 'Sit: aqerru n tɣuri · zuɣer: fren tamnaḍt · taṛuṭ: asemɣer n wakud · <kbd>Shift</kbd> + taṛuṭ: asemɣer n usnagar · <kbd>Alt</kbd> + zuɣer: smutti'],
    spectrum: ['Spectre', 'Spectrum', 'Aspekṭr'],
    specMode: ['Mode du spectre', 'Spectrum mode', 'Askar n uspekṭr'],
    modeAvg: ['Moyenne', 'Average', 'Alemmas'],
    modePlayhead: ['À la tête de lecture', 'At playhead', 'Ɣer uqerru n tɣuri'],
    spectrumAria: ['Spectre : fréquence en abscisse, niveau en dB en ordonnée, pics numérotés', 'Spectrum: frequency across, level in dB up, numbered peaks', 'Aspekṭr: asnagar s uglawi, aswir s ubeddi'],
    peaks: ['Pics', 'Peaks', 'Tiqacucin'],
    peakCount: ['Nombre', 'Count', 'Amḍan'],
    colFreq: ['Fréquence', 'Frequency', 'Asnagar'],
    colNote: ['Note', 'Note', 'Tazmilt'],
    colCents: ['Écart', 'Offset', 'Tiseddi'],
    colLevel: ['Niveau', 'Level', 'Aswir'],
    noPeaks: ['Aucun pic dans la plage affichée', 'No peak in the displayed range', 'Ulac taqacuct'],
    chroma: ['Chromagramme et tonalité', 'Chromagram and key', 'Akrumagram d tsarut'],
    chromaAria: ['Chromagramme : 12 classes de hauteur (Do en bas) au fil du temps', 'Chromagram: 12 pitch classes (C at the bottom) over time', 'Akrumagram: 12 n tneɣrufin n tazmilt'],
    keyNote: ['Estimation automatique (profils de Krumhansl–Kessler) sur la sélection ou tout le fichier : une indication, pas une vérité.', 'Automatic estimate (Krumhansl–Kessler profiles) over the selection or the whole file: a hint, not a verdict.', 'Tiẓi tawurmant (Krumhansl–Kessler) ɣef ufran neɣ ɣef ufaylu akk.'],
    keyLabel: ['Tonalité estimée : {key}', 'Estimated key: {key}', 'Tasarut: {key}'],
    keyNone: ['Tonalité : —', 'Key: —', 'Tasarut: —'],
    major: ['majeur', 'major', 'tameqqrant'],
    minor: ['mineur', 'minor', 'tamecṭuḥt'],
    analysis: ['Analyse', 'Analysis', 'Tasleḍt'],
    fftSize: ['Taille FFT', 'FFT size', 'Tiddi n FFT'],
    window: ['Fenêtre', 'Window', 'Taṭṭaqt'],
    w_hann: ['Hann', 'Hann', 'Hann'],
    w_hamming: ['Hamming', 'Hamming', 'Hamming'],
    w_bh: ['Blackman-Harris', 'Blackman-Harris', 'Blackman-Harris'],
    w_rect: ['Rectangulaire', 'Rectangular', 'Amkuẓ'],
    overlap: ['Recouvrement', 'Overlap', 'Amyager'],
    channel: ['Canal analysé', 'Analysed channel', 'Abadu'],
    ch_mid: ['Mid (G+D)/2', 'Mid (L+R)/2', 'Talemmast (Z+Y)/2'],
    ch_left: ['Gauche', 'Left', 'Azelmaḍ'],
    ch_right: ['Droite', 'Right', 'Ayeffus'],
    ch_side: ['Side (G−D)/2', 'Side (L−R)/2', 'Idis (Z−Y)/2'],
    resInfo: ['Résolution : {hz} Hz · {ms} ms par trame · {frames} trames', 'Resolution: {hz} Hz · {ms} ms per frame · {frames} frames', 'Tabadut: {hz} Hz · {ms} ms · {frames}'],
    display: ['Affichage', 'Display', 'Askan'],
    freqScale: ['Échelle de fréquence', 'Frequency scale', 'Taskala n usnagar'],
    sc_lin: ['Linéaire', 'Linear', 'Ajerriḍ'],
    sc_log: ['Log', 'Log', 'Log'],
    sc_mel: ['Mel', 'Mel', 'Mel'],
    fmin: ['Fréq. min (Hz)', 'Min freq. (Hz)', 'Asnagar adday (Hz)'],
    fmax: ['Fréq. max (Hz)', 'Max freq. (Hz)', 'Asnagar afellay (Hz)'],
    dbMin: ['Plancher (dB)', 'Floor (dB)', 'Aswir adday (dB)'],
    dbMax: ['Plafond (dB)', 'Ceiling (dB)', 'Aswir afellay (dB)'],
    colormap: ['Palette de couleurs', 'Colour map', 'Takarḍa n yiniten'],
    cm_braise: ['Braise', 'Ember', 'Tirgin'],
    cm_oasis: ['Oasis (daltonisme)', 'Oasis (colourblind-safe)', 'Oasis (i yiderɣalen n yini)'],
    cm_glacier: ['Glacier', 'Glacier', 'Adfel'],
    cm_sahara: ['Sahara', 'Sahara', 'Tiniri'],
    cm_prisme: ['Prisme', 'Prism', 'Asegzi'],
    cm_gris: ['Gris', 'Grey', 'Amumad'],
    cm_encre: ['Encre (impression)', 'Ink (print)', 'Lmidad (asiggez)'],
    noteGrid: ['Grille des notes', 'Note grid', 'Aẓeṭṭa n tezmilin'],
    pianoRuler: ['Clavier de piano', 'Piano ruler', 'Anasiw n upyanu'],
    a4: ['Référence La4 / A4 (Hz)', 'A4 reference (Hz)', 'Tamsisant A4 (Hz)'],
    notation: ['Noms des notes', 'Note names', 'Ismawen n tezmilin'],
    nt_auto: ['Selon la langue', 'Follow language', 'Am tutlayt'],
    nt_en: ['C D E…', 'C D E…', 'C D E…'],
    nt_solf: ['Do Ré Mi…', 'Do Ré Mi…', 'Do Ré Mi…'],
    stereo: ['Stéréo', 'Stereo', 'Stiryu'],
    scopeAria: ['Vectorscope stéréo (Mid vers le haut, Side en largeur)', 'Stereo vectorscope (Mid up, Side across)', 'Avektuskup n stiryu'],
    corrHere: ['Corrélation (ici)', 'Correlation (here)', 'Assaɣ (da)'],
    corrFile: ['Corrélation (fichier)', 'Correlation (file)', 'Assaɣ (afaylu)'],
    widthFile: ['Largeur S/M', 'Width S/M', 'Tehri S/M'],
    stereoNote: ['+1 : mono · 0 : très large · négatif : risque d’annulation de phase en mono.', '+1: mono · 0: very wide · negative: phase-cancellation risk in mono.', '+1: mono · 0: yehrawen · ddaw 0: ugur n tfaza deg mono.'],
    monoSource: ['Source mono : pas d’image stéréo.', 'Mono source: no stereo image.', 'Aɣbalu mono: ulac tugna n stiryu.'],
    export: ['Exporter', 'Export', 'Sifeḍ'],
    pngSize: ['Taille du PNG', 'PNG size', 'Tiddi n PNG'],
    exPng: ['Spectrogramme PNG', 'Spectrogram PNG', 'Aspekṭrugram PNG'],
    exPeaks: ['Pics CSV', 'Peaks CSV', 'Tiqacucin CSV'],
    exSpectrum: ['Spectre complet CSV', 'Full spectrum CSV', 'Aspekṭr akk CSV'],
    exJson: ['Réglages JSON', 'Settings JSON', 'Iɣewwaṛen JSON'],
    imJson: ['Ouvrir des réglages', 'Open settings', 'Ldi iɣewwaṛen'],
    share: ['Copier le lien', 'Copy link', 'Nɣel aseɣwen'],
    reset: ['Réinitialiser les réglages', 'Reset settings', 'Wennez iɣewwaṛen'],
    privacy: ['Confidentialité : le son est décodé et analysé dans votre navigateur ; rien n’est envoyé.', 'Privacy: audio is decoded and analysed in your browser; nothing is uploaded.', 'Tabaḍnit: imesli yettwasleḍ deg yiminig-ik; ulac ayen yettwaznen.'],
    footer: ['Logiciel libre (licence MIT) — fonctionne hors ligne, sans traceur.', 'Free software (MIT licence) — works offline, no trackers.', 'Aseɣzan ilelli (MIT) — yetteddu war Internet.'],
    sourceCode: ['Code source', 'Source code', 'Tangalt taɣbalut'],
    // dynamic texts
    demoName: ['Signal de démo (accord, balayage, bruit, arpège)', 'Demo signal (chord, sweep, noise, arpeggio)', 'Amedya (akurd, asmures, ahuskul, arpij)'],
    liveName: ['Micro en direct', 'Live microphone', 'Amikru srid'],
    meta: ['{dur} · {sr} Hz · {ch}', '{dur} · {sr} Hz · {ch}', '{dur} · {sr} Hz · {ch}'],
    stereoLbl: ['stéréo', 'stereo', 'stiryu'],
    monoLbl: ['mono', 'mono', 'mono'],
    liveMeta: ['écoute en direct · {sr} Hz · 10 dernières secondes', 'live listening · {sr} Hz · last 10 seconds', 'srid · {sr} Hz · 10 n tasinin'],
    decoding: ['Décodage…', 'Decoding…', 'Asefsex…'],
    decodeError: ['Impossible de décoder ce fichier (format non pris en charge par le navigateur).', 'Could not decode this file (format not supported by the browser).', 'Ur yezmir ara ad yefsex afaylu-a.'],
    micError: ['Micro indisponible ou refusé.', 'Microphone unavailable or denied.', 'Amikru ulac-it neɣ yettwagdel.'],
    micOn: ['Micro actif : analyse en direct.', 'Microphone on: live analysis.', 'Amikru yermed: tasleḍt srid.'],
    analysed: ['{n} trames analysées en {ms} ms', '{n} frames analysed in {ms} ms', '{n} n tɣawsiwin deg {ms} ms'],
    linkCopied: ['Lien copié dans le presse-papiers.', 'Link copied to the clipboard.', 'Aseɣwen yettwanɣel.'],
    linkReady: ['Lien prêt dans la barre d’adresse.', 'Link ready in the address bar.', 'Aseɣwen yewjed.'],
    jsonLoaded: ['Réglages chargés.', 'Settings loaded.', 'Iɣewwaṛen ttwasalin.'],
    jsonError: ['Fichier JSON invalide.', 'Invalid JSON file.', 'Afaylu JSON ur yelhi ara.'],
    exported: ['{name} exporté.', '{name} exported.', '{name} yettwasifeḍ.'],
    resetDone: ['Réglages réinitialisés.', 'Settings reset.', 'Iɣewwaṛen ttwawennzen.'],
    noSignal: ['Ouvrez un fichier, le signal de démo ou le micro', 'Open a file, the demo signal or the microphone', 'Ldi afaylu, amedya neɣ amikru'],
    rangeAvg: ['Moyenne de la vue : {a} → {b} s', 'Average of the view: {a} → {b} s', 'Alemmas n tmuɣli: {a} → {b} s'],
    rangeSel: ['Moyenne de la sélection : {a} → {b} s', 'Average of the selection: {a} → {b} s', 'Alemmas n ufran: {a} → {b} s'],
    rangeHead: ['Trame à la tête de lecture : {t} s', 'Frame at the playhead: {t} s', 'Aqerru n tɣuri: {t} s'],
    rangeLive: ['Trame en direct', 'Live frame', 'Srid'],
    selLabel: ['Sélection {a} → {b} s ({d} s)', 'Selection {a} → {b} s ({d} s)', 'Afran {a} → {b} s ({d} s)'],
    rTime: ['Temps', 'Time', 'Akud'],
    rFreq: ['Fréq.', 'Freq.', 'Asnagar'],
    rLevel: ['Niveau', 'Level', 'Aswir'],
    pngTime: ['Temps (s)', 'Time (s)', 'Akud (s)'],
    pngFreq: ['Fréquence (Hz)', 'Frequency (Hz)', 'Asnagar (Hz)'],
    pngLevel: ['Niveau (dBFS)', 'Level (dBFS)', 'Aswir (dBFS)'],
    pngSub: ['{dur} · {sr} Hz · canal {ch} · FFT {fft} · {win} · recouvrement {ov} % · échelle {scale} · La4 = {a4} Hz', '{dur} · {sr} Hz · channel {ch} · FFT {fft} · {win} · overlap {ov} % · {scale} scale · A4 = {a4} Hz', '{dur} · {sr} Hz · abadu {ch} · FFT {fft} · {win} · amyager {ov} % · {scale} · A4 = {a4} Hz'],
    pngFoot: ['Analyse locale dans le navigateur — github.com/salimadour31-boop/spectre-atelier', 'Analysed locally in the browser — github.com/salimadour31-boop/spectre-atelier', 'Tasleḍt deg yiminig — github.com/salimadour31-boop/spectre-atelier'],
    helpBody: [
      `<p><strong>Spectre Atelier</strong> montre de quoi un son est fait : chaque fréquence, à chaque instant.</p>
<ol><li><strong>Source</strong> : ouvrez un fichier (WAV, MP3, OGG, FLAC… selon le navigateur) ou déposez-le sur le spectrogramme, essayez le <em>signal de démo</em>, ou le <em>micro en direct</em>.</li>
<li><strong>Spectrogramme</strong> : temps → horizontal, fréquence → vertical, niveau → couleur. Survolez pour lire temps, fréquence, note la plus proche (± cents) et niveau. Clic = tête de lecture, glisser = sélection, molette = zoom temps, <kbd>Maj</kbd> + molette = zoom fréquence, <kbd>Alt</kbd> + glisser = déplacer. La bande du dessous montre tout le fichier : faites-la glisser pour vous déplacer.</li>
<li><strong>Analyse</strong> : une grande FFT sépare mieux les fréquences proches (basses, notes) mais brouille le temps ; une petite FFT suit mieux les attaques. Hann convient à tout, Blackman-Harris limite les fuites, Rectangulaire est la plus fine mais fuit beaucoup.</li>
<li><strong>Spectre</strong> : moyenne de la vue (ou de la sélection) ou trame sous la tête de lecture ; les pics sont listés avec leur note.</li>
<li><strong>Chromagramme</strong> : énergie des 12 notes au fil du temps et tonalité estimée. <strong>Stéréo</strong> : vectorscope et corrélation de phase.</li>
<li><strong>Exports</strong> : PNG annoté haute résolution, CSV des pics ou du spectre, réglages JSON et lien partageable (réglages dans l’adresse).</li></ol>
<p>Raccourcis (spectrogramme sélectionné) : <kbd>Espace</kbd> lecture, <kbd>←</kbd> <kbd>→</kbd> déplacer la tête, <kbd>+</kbd> <kbd>−</kbd> <kbd>0</kbd> zoom temps, <kbd>Page préc.</kbd> / <kbd>Page suiv.</kbd> zoom fréquence, <kbd>L</kbd> boucle, <kbd>Échap</kbd> effacer la sélection.</p>
<p>Les octaves suivent la notation scientifique (La4 = A4 = la de référence, Do4 = do central), y compris en Do Ré Mi. Niveaux en dBFS : un sinus à pleine échelle vaut 0 dB.</p>`,
      `<p><strong>Spectre Atelier</strong> shows what a sound is made of: every frequency, at every moment.</p>
<ol><li><strong>Source</strong>: open a file (WAV, MP3, OGG, FLAC… depending on the browser) or drop it on the spectrogram, try the <em>demo signal</em>, or the <em>live microphone</em>.</li>
<li><strong>Spectrogram</strong>: time → across, frequency → up, level → colour. Hover to read time, frequency, nearest note (± cents) and level. Click = playhead, drag = selection, wheel = zoom time, <kbd>Shift</kbd> + wheel = zoom frequency, <kbd>Alt</kbd> + drag = pan. The strip below shows the whole file: drag it to move around.</li>
<li><strong>Analysis</strong>: a large FFT separates close frequencies (bass, notes) but blurs time; a small FFT follows attacks better. Hann suits everything, Blackman-Harris limits leakage, Rectangular is the sharpest but leaks a lot.</li>
<li><strong>Spectrum</strong>: average of the view (or selection) or the frame under the playhead; peaks are listed with their note.</li>
<li><strong>Chromagram</strong>: energy of the 12 pitch classes over time and an estimated key. <strong>Stereo</strong>: vectorscope and phase correlation.</li>
<li><strong>Exports</strong>: annotated high-resolution PNG, peaks or spectrum CSV, settings JSON and a shareable link (settings in the address).</li></ol>
<p>Shortcuts (spectrogram focused): <kbd>Space</kbd> play, <kbd>←</kbd> <kbd>→</kbd> move the playhead, <kbd>+</kbd> <kbd>−</kbd> <kbd>0</kbd> time zoom, <kbd>Page Up</kbd> / <kbd>Page Down</kbd> frequency zoom, <kbd>L</kbd> loop, <kbd>Esc</kbd> clear the selection.</p>
<p>Octaves follow scientific pitch notation (A4 = reference A, C4 = middle C), also with Do Ré Mi names. Levels in dBFS: a full-scale sine reads 0 dB.</p>`,
      `<p><strong>Spectre Atelier</strong> yesskan seg wacu yebna yiwen n yimesli: yal asnagar, deg yal tasint.</p>
<ol><li><strong>Aɣbalu</strong>: ldi afaylu (WAV, MP3, OGG, FLAC…) neɣ sers-it ɣef uspekṭrugram, neɣ ɛreḍ <em>amedya</em> neɣ <em>amikru srid</em>.</li>
<li><strong>Aspekṭrugram</strong>: akud → s uglawi, asnagar → s ubeddi, aswir → s yini. Sit = aqerru n tɣuri, zuɣer = afran, taṛuṭ = asemɣer n wakud, <kbd>Shift</kbd> + taṛuṭ = asemɣer n usnagar.</li>
<li><strong>Tasleḍt</strong>: FFT tameqqrant tferreq asnagar, FFT tamecṭuḥt teṭṭafar akud.</li>
<li><strong>Aspekṭr</strong>: alemmas neɣ aqerru n tɣuri; tiqacucin s tezmilin-nsent.</li>
<li><strong>Akrumagram</strong>: 12 n tezmilin d tsarut. <strong>Stiryu</strong>: avektuskup d wassaɣ.</li>
<li><strong>Sifeḍ</strong>: PNG, CSV, JSON d useɣwen.</li></ol>
<p>Inegzumen: <kbd>Espace</kbd> urar, <kbd>←</kbd> <kbd>→</kbd>, <kbd>+</kbd> <kbd>−</kbd> <kbd>0</kbd>, <kbd>L</kbd>, <kbd>Échap</kbd>.</p>`,
    ],
  };
  const LANGS = ['fr', 'en', 'kab'];
  const idx = (lang) => Math.max(0, LANGS.indexOf(lang));

  // Kabyle Latin → Tifinagh (neo-Tifinagh as used for Taqbaylit). Acronyms, units, note names and words with digits are kept.
  const TF = { a: 'ⴰ', b: 'ⴱ', c: 'ⵛ', č: 'ⵞ', d: 'ⴷ', ḍ: 'ⴹ', e: 'ⴻ', é: 'ⴻ', ɛ: 'ⵄ', f: 'ⴼ', g: 'ⴳ', ǧ: 'ⴵ', ɣ: 'ⵖ', h: 'ⵀ', ḥ: 'ⵃ', i: 'ⵉ', j: 'ⵊ', k: 'ⴽ', l: 'ⵍ', m: 'ⵎ', n: 'ⵏ',
    o: 'ⵓ', p: 'ⵒ', q: 'ⵇ', r: 'ⵔ', ṛ: 'ⵕ', s: 'ⵙ', ṣ: 'ⵚ', t: 'ⵜ', ṭ: 'ⵟ', u: 'ⵓ', v: 'ⵠ', w: 'ⵡ', x: 'ⵅ', y: 'ⵢ', z: 'ⵣ', ẓ: 'ⵥ' };
  const KEEP = /^(Spectre|Atelier|Hann|Hamming|Blackman|Harris|Krumhansl|Kessler|Oasis|Mel|Log|Shift|Alt|Espace|Échap|PageUp|PageDown|Internet|MIT|mono|ms|Hz|dB|dBFS|Do|Ré|Mi|Fa|Sol|La|Si|C|D|E|F|G|A|B|github|com|salimadour31-boop|spectre-atelier)$/;
  function toTifinagh(text) {
    return String(text).replace(/(<[^>]*>)|(\{[^}]*\})|([^<{]+)/g, (m, tag, ph, txt) => tag || ph || txt.replace(/[\p{L}\d-]+/gu, (w) => {
      if (/\d/.test(w) || (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) || KEEP.test(w)) return w;
      return Array.from(w.toLowerCase()).map((ch) => TF[ch] || ch).join('');
    }));
  }
  /** Translate key into lang; vars fill {placeholders}; tfng renders Kabyle in Tifinagh. */
  function t(key, lang = 'fr', vars, tfng = false) {
    const e = S[key];
    let s = e ? e[idx(lang)] : key;
    if (lang === 'kab' && tfng) s = toTifinagh(s);
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  }
  return { S, LANGS, t, toTifinagh };
});
