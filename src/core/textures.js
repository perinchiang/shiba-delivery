// Procedural texture toolkit: every texture in the game is painted on a <canvas> at load time.
// Nothing here is game-specific; generators compose these helpers into tiles, concrete, metal...
import * as THREE from 'three';
import { hash2 } from './rng.js';

export function makeCanvas(w, h = w) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  return { canvas, ctx, w, h };
}

let _maxAniso = 8;
export function setMaxAnisotropy(v) { _maxAniso = v; }

/**
 * Wrap a canvas in a THREE.CanvasTexture.
 * opts: { srgb=true (colour data; false for normal/roughness maps), repeat=false (RepeatWrapping),
 *         aniso=8, mipmaps=true, pixelated=false }
 */
export function canvasTexture(canvas, opts = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = Math.min(opts.aniso ?? 8, _maxAniso);
  if (opts.mipmaps === false) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  if (opts.pixelated) { t.magFilter = THREE.NearestFilter; }
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------------------------
// Noise (deterministic, optionally periodic so textures tile)

const h01 = (x, y, seed) => hash2(x + seed * 7919, y - seed * 104729) / 4294967296;
const fade = (t) => t * t * (3 - 2 * t);

/** Value noise in [0,1]. If period > 0 the lattice wraps every `period` units (tileable). */
export function noise2D(x, y, seed = 0, period = 0) {
  let x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  let x1 = x0 + 1, y1 = y0 + 1;
  if (period > 0) {
    x0 = ((x0 % period) + period) % period; x1 = ((x1 % period) + period) % period;
    y0 = ((y0 % period) + period) % period; y1 = ((y1 % period) + period) % period;
  }
  const a = h01(x0, y0, seed), b = h01(x1, y0, seed), c = h01(x0, y1, seed), d = h01(x1, y1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Fractal noise in [0,1]. `period` applies to the first octave and doubles with each octave. */
export function fbm2D(x, y, octaves = 4, seed = 0, period = 0) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * f, y * f, seed + i * 17, period * f);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

/**
 * Fill an ImageData-backed canvas from a per-pixel function fn(u, v, x, y) -> [r,g,b,a] in 0..255
 * (u,v in 0..1). Slow-ish but fine at load time for <= 1024^2.
 */
export function paintPixels(canvasOrSize, fn, h) {
  const c = typeof canvasOrSize === 'number' ? makeCanvas(canvasOrSize, h ?? canvasOrSize) : { canvas: canvasOrSize, ctx: canvasOrSize.getContext('2d'), w: canvasOrSize.width, h: canvasOrSize.height };
  const img = c.ctx.createImageData(c.w, c.h);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const p = fn((x + 0.5) / c.w, (y + 0.5) / c.h, x, y);
      d[i++] = p[0]; d[i++] = p[1]; d[i++] = p[2]; d[i++] = p[3] ?? 255;
    }
  }
  c.ctx.putImageData(img, 0, 0);
  return c.canvas;
}

/** Tileable grayscale noise canvas. opts: { scale=8 (lattice cells across), octaves=4, seed=0, lo=0, hi=255 } */
export function noiseCanvas(size = 256, opts = {}) {
  const { scale = 8, octaves = 4, seed = 0, lo = 0, hi = 255 } = opts;
  return paintPixels(size, (u, v) => {
    const n = fbm2D(u * scale, v * scale, octaves, seed, scale);
    const g = lo + (hi - lo) * n;
    return [g, g, g, 255];
  });
}

/**
 * Multiply/overlay tileable noise onto an existing canvas to break up flat colour.
 * opts: { amount=0.25 (0..1), scale=6, octaves=4, seed=0, mode='multiply'|'overlay'|'screen'|'soft-light' }
 */
export function addNoise(ctx, w, h, opts = {}) {
  const { amount = 0.25, scale = 6, octaves = 4, seed = 0, mode = 'multiply' } = opts;
  const size = Math.min(256, Math.max(64, Math.min(w, h)));
  const lo = mode === 'multiply' ? 255 * (1 - amount) : 128 - 127 * amount;
  const hi = mode === 'multiply' ? 255 : 128 + 127 * amount;
  const n = noiseCanvas(size, { scale, octaves, seed, lo, hi });
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.drawImage(n, 0, 0, w, h);
  ctx.restore();
}

/**
 * Rain/dirt streaks running down a wall texture (the grey-brown tide marks under window sills and
 * AC units that every tiled 握手楼 has). opts: { count=30, seed=0, color='rgba(40,34,28,0.35)', maxLen=0.6, width=[2,10] }
 */
export function addStreaks(ctx, w, h, opts = {}) {
  const { count = 30, seed = 0, color = 'rgba(40,34,28,0.35)', maxLen = 0.6, width = [2, 10] } = opts;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const r = (k) => h01(i, k, seed + 31);
    const x = r(1) * w, y = r(2) * h * 0.8, len = (0.15 + r(3) * 0.85) * maxLen * h;
    const ww = width[0] + r(4) * (width[1] - width[0]);
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.35 + r(5) * 0.65;
    ctx.fillRect(x - ww / 2, y, ww, len);
  }
  ctx.restore();
}

/**
 * Tangent-space normal map canvas from a grayscale height canvas (white = high). `strength` ~1..8.
 * Wraps at the edges so tiling height maps give tiling normal maps.
 */
export function normalFromHeight(heightCanvas, strength = 2) {
  const w = heightCanvas.width, h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255;
      d[i + 1] = (dy / l * 0.5 + 0.5) * 255; // canvas y is down, texture v is up (flipY)
      d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------------------------
// Cache so identical textures/materials are created once and shared between generators.

const _cache = new Map();
/** cached('key', () => expensive()) -> same instance for the same key. */
export function cached(key, factory) {
  let v = _cache.get(key);
  if (v === undefined) { v = factory(); _cache.set(key, v); }
  return v;
}
export function clearCache() { _cache.clear(); }

/** CSS colour helpers for canvas painting. */
export function hexCss(hex, alpha = 1) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}
/** Mix two hex colours (sRGB space, fine for painting). */
export function mixHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
