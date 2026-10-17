/* colormaps.js — Spectre Atelier original colour maps (hand-picked control points, interpolated in sRGB).
 * "oasis" is the colourblind-safe map: a blue → yellow ramp whose luminance rises monotonically, readable with
 * protanopia, deuteranopia and in greyscale. MIT licence. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpectreColormaps = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAPS = {
    braise: ['#06030a', '#2a0b3d', '#6a1460', '#a8234f', '#dd4a2b', '#f7902a', '#fcd56b', '#fffbe0'],  // ember
    oasis: ['#071a3d', '#23376f', '#4d5585', '#7a7a83', '#a69c75', '#d2c25c', '#fbe94a'],               // colourblind-safe
    glacier: ['#02040a', '#0b1d3f', '#12447a', '#1479a3', '#2fb3bf', '#8fe0d6', '#f2fffb'],
    sahara: ['#0e0805', '#3b1f0f', '#77421a', '#b06f2b', '#d9a453', '#f0d28f', '#fff6dc'],
    prisme: ['#08000f', '#35107e', '#1858d6', '#10aebf', '#46cf5c', '#e3dc2f', '#f68b2a', '#ff3d4f'],
    gris: ['#000000', '#ffffff'],
    encre: ['#ffffff', '#0b0b0b'], // print-friendly: loud = dark ink on white
  };
  const NAMES = Object.keys(MAPS);
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const cache = new Map();
  /** 256-entry RGB lookup table (Uint8ClampedArray of 768 values). */
  function lut(name) {
    if (cache.has(name)) return cache.get(name);
    const stops = (MAPS[name] || MAPS.braise).map(hex), out = new Uint8ClampedArray(768), n = stops.length - 1;
    for (let i = 0; i < 256; i++) {
      const u = (i / 255) * n, j = Math.min(n - 1, Math.floor(u)), f = u - j;
      for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(stops[j][c] + (stops[j + 1][c] - stops[j][c]) * f);
    }
    cache.set(name, out);
    return out;
  }
  /** Relative luminance (WCAG) of an RGB triple, 0…1. */
  function luminance(r, g, b) {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  /** CSS linear-gradient for previews. */
  const gradient = (name, dir = 'to right') => `linear-gradient(${dir}, ${(MAPS[name] || MAPS.braise).join(', ')})`;
  return { MAPS, NAMES, lut, luminance, gradient };
});
