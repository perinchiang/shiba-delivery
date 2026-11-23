/**
 * sign-paint.js — canvas painters for the Chinese signage kit (sign-kit.js).
 *
 * One painter per sign kind; each takes a fully resolved spec (see sign-kit.js header for the fields)
 * and a texel density and returns the face canvas(es). Nothing here touches three.js.
 *
 *   paintSign(spec, ppm) -> { canvas, canvasB?, posts?, lamps? }
 *        canvasB: second page of a 'screen' / plain back of a 'banner';  posts: [[u,v]..] points on
 *        neon tubes (standoffs);  lamps: x positions (m from the left) of the spot lamps of a 'spot' lightbox
 *   paintLedRow(text, rows, colorHex, width) -> canvas   one row band of the shared LED dot-matrix bitmap
 *   ledDotMask(px) -> canvas                             the round-LED mask tile (one LED per tile)
 *   dominantColor(canvas) -> { hex, lum, energy }        energy-weighted emitted colour, mean luminance,
 *                                                        and 'energy' (luminance blended with mean max-channel)
 *   paintDish(ctx, x, y, w, h, kind, rng)                stylised food "photo" patch
 *   luma(hex), capLuma(hex, max)   PICTOGRAMS: string[]   DISHES: string[]   BG_LUMA
 *   SIGN_FONTS                                           extra lettering faces (wei / li / xing / heavy)
 *
 * When spec.storybook !== false (default in Shiba Delivery), fills use raised luma caps (0.88-0.96)
 * and skip heavy grime/tube-banding so signs stay warm and bright under daytime litMaterial + 4-TOD
 * lighting. Setting spec.storybook = false restores the HDR night-glow caps (BG_LUMA = 0.42).
 */
import { makeCanvas, paintPixels, noiseCanvas, fbm2D, hexCss, mixHex, cached } from '../core/textures.js';
import { drawText, roundRect, fontCss } from '../core/textcanvas.js';
import { RNG } from '../core/rng.js';

export const BG_LUMA = 0.42;
const PATCH_LUMA = 0.52;
const INK_LUMA = 0.56;
const CORE_LUMA = 0.72;
const SMALL_LUMA = 0.58;

const STORYBOOK_CAPS = { bg: 0.88, patch: 0.92, ink: 0.96, core: 0.98, small: 0.92 };
const GLOW_CAPS = { bg: BG_LUMA, patch: PATCH_LUMA, ink: INK_LUMA, core: CORE_LUMA, small: SMALL_LUMA };
const capsOf = (s) => (s.storybook === false ? GLOW_CAPS : STORYBOOK_CAPS);

/** Sign lettering faces: the core FONTS keys plus display faces (魏碑 / 隶书 / 行楷) with safe fallbacks. */
export const SIGN_FONTS = {
  wei: '"Weibei SC","Kaiti SC","STKaiti","KaiTi",serif',
  li: '"Libian SC","Baoli SC","Kaiti SC","STKaiti","KaiTi",serif',
  xing: '"Xingkai SC","Kaiti SC","STKaiti","KaiTi",serif',
  heavy: '"Heiti SC","STHeiti","PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif',
};

export const PICTOGRAMS = ['bowl', 'scissors', 'cross', 'parcel', 'chili', 'bolt', 'arrow', 'bed', 'foot', 'beer', 'cup'];
export const DISHES = ['changfen', 'mala', 'noodle', 'rice', 'congee'];

// ------------------------------------------------------------------------------------- colour / size
const s2l = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const l2s = (v) => Math.max(0, Math.min(255, Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))));
const css = hexCss;
/** Bloom luma (linear) of an sRGB hex colour. */
export function luma(hex) {
  return 0.299 * s2l((hex >> 16) & 255) + 0.587 * s2l((hex >> 8) & 255) + 0.114 * s2l(hex & 255);
}
/** Scale a colour in linear light so its luma is <= max (hue and saturation kept). */
export function capLuma(hex, max = BG_LUMA) {
  const L = luma(hex);
  if (L <= max) return hex;
  const k = max / L;
  return (l2s(s2l((hex >> 16) & 255) * k) << 16) | (l2s(s2l((hex >> 8) & 255) * k) << 8) | l2s(s2l(hex & 255) * k);
}
const dark = (hex, k) => mixHex(hex, 0x000000, 1 - k);
const lite = (hex, k) => mixHex(hex, 0xffffff, k);
const size = (s, ppm) => [Math.max(8, Math.round(s.w * ppm)), Math.max(8, Math.round(s.h * ppm))];

/** Energy-weighted mean colour a face emits (normalised to max channel 1), its mean linear luminance and energy. */
export function dominantColor(canvas) {
  const n = 24, t = makeCanvas(n, n);
  t.ctx.drawImage(canvas, 0, 0, n, n);
  const d = t.ctx.getImageData(0, 0, n, n).data;
  let r = 0, g = 0, b = 0, e = 0, lum = 0, ws = 0;
  for (let i = 0; i < d.length; i += 4) {
    const pr = s2l(d[i]), pg = s2l(d[i + 1]), pb = s2l(d[i + 2]), mx = Math.max(pr, pg, pb);
    const w = 1 + 0.8 * (mx - Math.min(pr, pg, pb)) / Math.max(mx, 0.02);
    r += pr * w; g += pg * w; b += pb * w; ws += w;
    e += mx; lum += 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
  }
  r /= ws; g /= ws; b /= ws; e /= n * n; lum /= n * n;
  const mx0 = Math.max(r, g, b, 1e-4), mean = (r + g + b) / 3;
  const sat = 1 + 0.6 * (mx0 - Math.min(r, g, b)) / mx0;
  r = Math.max(0, mean + (r - mean) * sat); g = Math.max(0, mean + (g - mean) * sat); b = Math.max(0, mean + (b - mean) * sat);
  const m = Math.max(r, g, b, 1e-4);
  return { hex: (l2s(r / m) << 16) | (l2s(g / m) << 8) | l2s(b / m), lum, energy: 0.5 * lum + 0.5 * e };
}

// ------------------------------------------------------------------------------------- text
/** Make a name fill its box the way sign makers do: condense long names, space out short ones. */
function fitRow(ctx, text, w, h, o) {
  const chars = Array.from(text);
  ctx.save();
  ctx.font = fontCss(o.font || 'hei', 100, o.weight ?? 700);
  const em = chars.reduce((a, c) => a + ctx.measureText(c).width, 0) / 100;
  ctx.restore();
  const sz = Math.min(h * 0.92, o.maxSize ?? Infinity);
  let squash = 1, spacing = o.spacing ?? 0.06;
  const nat = (em + spacing * (chars.length - 1)) * sz;
  if (nat > w) squash = Math.max(o.minSquash ?? 0.7, w / nat);
  else if (chars.length > 1 && o.spread !== false) {
    spacing = Math.min(o.maxSpacing ?? 0.45, spacing + Math.max(0, w * (o.fill ?? 0.9) - nat) / (sz * (chars.length - 1)));
  }
  return { squash, spacing };
}

/**
 * Sign lettering fitted in a box: optional drop shadow, fat contrast outline, emboldened fill.
 */
function signText(ctx, text, x, y, w, h, o = {}) {
  if (!text || w <= 2 || h <= 2) return 0;
  const est = h * 0.8;
  const sw = o.stroke ? (o.strokeW ?? 0.085) * est : 0, fat = (o.fat ?? 0) * est, sh = o.shadow ? (o.shadowOff ?? 0.06) * est : 0;
  const m = sw + fat * 0.5, bx = x + m, by = y + m, bw = w - m * 2 - sh, bh = h - m * 2 - sh;
  const base = { font: o.font || 'hei', weight: o.weight ?? 700, vertical: !!o.vertical, align: o.align || 'center', pad: 0, maxSize: o.maxSize ?? Infinity, spacing: o.spacing ?? 0.06 };
  if (!o.vertical) Object.assign(base, fitRow(ctx, text, bw, bh, o));
  const line = (color, lw) => drawText(ctx, text, bx, by, bw, bh, { ...base, color, stroke: lw > 0.3 ? color : null, strokeWidth: lw });
  if (o.pass === 'cut') return drawText(ctx, text, bx, by, bw, bh, { ...base, color: CLEAR, stroke: '#000', strokeWidth: 2 * (o.erode ?? 0.03) * est - fat });
  if (o.pass === 'core') return drawText(ctx, text, bx, by, bw, bh, { ...base, color: o.color });
  if (o.pass) return line(o.color, fat);
  if (o.shadow) { ctx.save(); ctx.translate(sh, sh); line(o.shadow, sw * 2 + fat); ctx.restore(); }
  if (o.stroke) line(o.stroke, sw * 2 + fat);
  return line(o.color || '#fff', fat);
}

// ------------------------------------------------------------------------------------- light + wear
const grain = () => cached('signpaint:grain', () => noiseCanvas(256, { scale: 7, octaves: 5, seed: 41, lo: 120, hi: 255 }));
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function backlight(ctx, W, H, wm, hm, o, rng) {
  const tpm = 40, cw = Math.max(8, Math.round(wm * tpm)), ch = Math.max(8, Math.round(hm * tpm));
  const mode = o.mode || 'tubes', amt = o.amount ?? 0.3, edge = o.edge ?? 0.085, seed = rng.int(1, 9999);
  const vert = o.axis === 'y', along = vert ? hm : wm;
  const period = vert ? 1.2 : rng.range(0.3, 0.42), phase = rng.range(0, period);
  const nT = Math.ceil(along / period) + 2;
  const k = Array.from({ length: nT }, () => rng.range(0.95, 1));
  const hasDead = o.dead != null && mode !== 'spot';
  const dw = vert ? Math.min(0.5, hm * 0.2) : period * 0.75, dc = hasDead ? Math.min(along - dw * 0.7, Math.max(dw * 0.7, o.dead * along)) : 0;
  const deadAt = (a) => (hasDead ? 1 - 0.5 * (1 - sstep(dw * 0.45, dw * 1.05, Math.abs(a - dc))) : 1);
  const lamps = [];
  if (mode === 'spot') for (let x = rng.range(0.25, 0.45); x < wm; x += rng.range(0.75, 0.95)) lamps.push(x);
  const map = paintPixels(cw, (u, v) => { const g = Math.max(0, Math.min(255, level(u, v) * 255)); return [g, g, g, 255]; }, ch);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(map, 0, 0, W, H);
  ctx.restore();
  return { lamps, band: hasDead ? [dc - dw * 1.05, dc + dw * 1.05] : null, vert };
  function level(u, v) {
    const xm = u * wm, ym = v * hm, a = vert ? ym : xm, b = vert ? xm : ym, bl = vert ? wm : hm;
    let L;
    if (mode === 'spot') {
      L = 0.2;
      for (const lx of lamps) L += 0.95 * Math.exp(-(((xm - lx) / 0.36) ** 2) - ((ym / (hm * 0.8)) ** 2));
      L = Math.min(1, L) * (0.94 + 0.06 * fbm2D(u * 5, v * 2, 3, seed));
    } else {
      const t = (a + phase) / period, i = Math.floor(t), f = t - i;
      const kk = k[i] * (1 - f) + k[Math.min(nT - 1, i + 1)] * f;
      if (mode === 'led') L = 0.965 + 0.0175 * (Math.cos(xm / 0.17 * 6.283) + Math.cos(ym / 0.17 * 6.283));
      else if (vert) L = 1 - amt * 1.3 * Math.exp(-(((f - 0.5) * period / 0.09) ** 2)) - amt * 0.35 * (0.5 + 0.5 * Math.cos(b / bl * 6.283 * 2));
      else L = 1 - amt * (0.5 - 0.5 * Math.cos((f - 0.5) * 6.283));
      L *= Math.min(1, kk * 1.02);
      L *= 0.8 + 0.2 * sstep(0, 0.22, Math.min(b, bl - b));
      L *= 0.93 + 0.07 * fbm2D(u * wm * 1.3, v * hm * 1.3, 3, seed);
    }
    const d = Math.min(xm, wm - xm, ym, hm - ym);
    return L * (0.5 + 0.5 * sstep(0, edge, d)) * deadAt(a);
  }
}

/** Dirt: rain run marks from the top trim, grime rising from the bottom edge, blotchy stains. wear 0..1 */
function wearLayer(ctx, W, H, ppm, wear, rng, o = {}) {
  if (wear <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = Math.min(1, wear * 0.6);
  const g0 = grain(), sc = rng.range(0.35, 0.8);
  ctx.drawImage(g0, rng.range(0, 256 * (1 - sc)), rng.range(0, 256 * (1 - sc)), 256 * sc, 256 * sc * Math.min(1, H / W * 2), 0, 0, W, H);
  ctx.globalAlpha = 1;
  const n = Math.round((W / ppm) * 7 * wear);
  for (let i = 0; i < n; i++) {
    const x = rng.range(0, W), len = rng.range(0.15, 0.95) * H, ww = rng.range(0.006, 0.035) * ppm;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(58,46,34,${(0.55 * wear * rng.range(0.4, 1)).toFixed(3)})`);
    g.addColorStop(1, 'rgba(58,46,34,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - ww / 2, 0, ww, len);
  }
  if (o.bottom !== false) {
    const g = ctx.createLinearGradient(0, H, 0, H * 0.72);
    g.addColorStop(0, `rgba(70,56,40,${(0.6 * wear).toFixed(3)})`);
    g.addColorStop(1, 'rgba(70,56,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.7, W, H * 0.3);
  }
  ctx.restore();
}

/** Vinyl / acrylic field: gentle gradient + sun-fade wash + panel seams, so it is never a flat CSS fill. */
function vinylField(ctx, W, H, ppm, bg, s, rng) {
  const storybook = s.storybook !== false;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, css(lite(bg, storybook ? 0.05 : 0.07)));
  g.addColorStop(0.55, css(bg));
  g.addColorStop(1, css(dark(bg, storybook ? 0.94 : 0.86)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (s.faded > 0.02) {
    const a = rng.chance(0.5), f = ctx.createLinearGradient(a ? 0 : W, 0, a ? W : 0, H * 0.6);
    const pale = capLuma(lite(mixHex(bg, 0xb9a48c, 0.35), 0.35), capsOf(s).bg * 1.1);
    f.addColorStop(0, css(pale, Math.min(0.85, s.faded * 0.9))); f.addColorStop(1, css(pale, s.faded * 0.25));
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, W, H);
  }
  if (!storybook && s.w > 1.6) {
    const step = rng.range(1.1, 1.5) * ppm;
    for (let x = rng.range(0.4, 1) * step; x < W - 0.2 * ppm; x += step) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(Math.round(x), 0, 1.2, H);
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(Math.round(x) + 1.2, 0, 1, H);
    }
  }
}

/** Peeled vinyl: small backlit-white patches where the film has lifted (old signs only). */
function peels(ctx, W, H, ppm, wear, rng) {
  if (wear < 0.55) return;
  for (let i = rng.int(1, 3); i > 0; i--) {
    const x = (rng.chance(0.5) ? rng.range(0.01, 0.07) : rng.range(0.93, 0.99)) * W, y = (rng.chance(0.5) ? rng.range(0.03, 0.12) : rng.range(0.88, 0.97)) * H, r = rng.range(0.01, 0.028) * ppm;
    ctx.beginPath();
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283, rr = r * rng.range(0.5, 1.3); ctx.lineTo(x + Math.cos(a) * rr * 1.8, y + Math.sin(a) * rr); }
    ctx.closePath();
    ctx.fillStyle = 'rgba(244,240,226,0.92)';
    ctx.fill();
  }
}

function finishFace(ctx, W, H, ppm, s, rng, bl, ink) {
  const storybook = s.storybook !== false;
  if (storybook && (s.wear ?? 0) <= 0.12 && s.dead == null && bl.mode !== 'spot') {
    // Storybook mode: subtle warm-paper micro texture + ultra-soft edge falloff, no dark grime or tube bars.
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.08;
    ctx.drawImage(grain(), 0, 0, 256, 256, 0, 0, W, H);
    ctx.globalAlpha = 1;
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.hypot(W, H) * 0.58);
    v.addColorStop(0, 'rgba(255,255,255,1)');
    v.addColorStop(1, 'rgba(244,238,226,1)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return [];
  }
  peels(ctx, W, H, ppm, s.wear, rng);
  wearLayer(ctx, W, H, ppm, s.wear, rng);
  const out = backlight(ctx, W, H, s.w, s.h, bl, rng);
  if (ink && bl.mode !== 'spot') {
    const layer = makeCanvas(W, H);
    ink(layer.ctx, 'core');
    layer.ctx.globalCompositeOperation = 'destination-out';
    ink(layer.ctx, 'cut');
    ctx.save();
    if (out.band) {
      const k = out.vert ? H / s.h : W / s.w, a0 = out.band[0] * k, a1 = out.band[1] * k;
      ctx.beginPath();
      if (out.vert) { ctx.rect(0, 0, W, a0); ctx.rect(0, a1, W, H - a1); } else { ctx.rect(0, 0, a0, H); ctx.rect(a1, 0, W - a1, H); }
      ctx.clip();
    }
    ctx.globalCompositeOperation = 'lighten';
    ink(ctx, 'floor');
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.restore();
  }
  return out.lamps;
}
const CLEAR = 'rgba(0,0,0,0)';

function strokeCss(s, bg) {
  if ((s.effect !== 'stroke' && s.effect !== 'both') || s.accent === s.fg) return null;
  if (luma(s.fg) > 0.6 && luma(s.accent) > 0.25) return css(dark(bg, 0.35));
  return css(capLuma(s.accent, capsOf(s).patch));
}
const inkCss = (s, hex, pass) => css(capLuma(hex, pass === 'core' ? capsOf(s).core : capsOf(s).ink));
const isHeavy = (s) => s.fontKey === 'hei' || s.fontKey === 'heavy';

// ------------------------------------------------------------------------------------- pictograms
const PICTO = {
  bowl(c) {
    c.moveTo(-0.88, -0.05); c.lineTo(0.88, -0.05);
    c.moveTo(-0.8, -0.05); c.bezierCurveTo(-0.74, 0.8, 0.74, 0.8, 0.8, -0.05);
    c.moveTo(-0.3, 0.78); c.lineTo(0.3, 0.78);
    for (const x of [-0.42, 0, 0.42]) { c.moveTo(x, -0.3); c.bezierCurveTo(x - 0.2, -0.5, x + 0.2, -0.68, x, -0.92); }
  },
  scissors(c) {
    c.moveTo(-0.08, 0.62); c.arc(-0.3, 0.62, 0.22, 0, Math.PI * 2);
    c.moveTo(0.52, 0.62); c.arc(0.3, 0.62, 0.22, 0, Math.PI * 2);
    c.moveTo(-0.2, 0.42); c.lineTo(0.42, -0.92);
    c.moveTo(0.2, 0.42); c.lineTo(-0.42, -0.92);
  },
  cross(c) {
    const a = 0.3, b = 0.86;
    c.moveTo(-a, -b); c.lineTo(a, -b); c.lineTo(a, -a); c.lineTo(b, -a); c.lineTo(b, a); c.lineTo(a, a);
    c.lineTo(a, b); c.lineTo(-a, b); c.lineTo(-a, a); c.lineTo(-b, a); c.lineTo(-b, -a); c.lineTo(-a, -a); c.closePath();
  },
  parcel(c) {
    c.moveTo(-0.8, -0.32); c.lineTo(0, -0.78); c.lineTo(0.8, -0.32); c.lineTo(0, 0.14); c.closePath();
    c.moveTo(-0.8, -0.32); c.lineTo(-0.8, 0.46); c.lineTo(0, 0.92); c.lineTo(0.8, 0.46); c.lineTo(0.8, -0.32);
    c.moveTo(0, 0.14); c.lineTo(0, 0.92);
    c.moveTo(-0.4, -0.55); c.lineTo(0.4, -0.09);
  },
  chili(c) {
    c.moveTo(0.55, -0.58); c.bezierCurveTo(0.95, 0.15, 0.1, 0.95, -0.82, 0.76);
    c.bezierCurveTo(-0.2, 0.55, 0.05, 0, 0.2, -0.58); c.closePath();
    c.moveTo(0.38, -0.6); c.bezierCurveTo(0.34, -0.8, 0.5, -0.96, 0.72, -0.92);
  },
  bolt(c) {
    c.moveTo(0.25, -0.95); c.lineTo(-0.52, 0.12); c.lineTo(-0.04, 0.12); c.lineTo(-0.25, 0.95);
    c.lineTo(0.52, -0.16); c.lineTo(0.04, -0.16); c.closePath();
  },
  arrow(c) { c.moveTo(-0.88, 0); c.lineTo(0.82, 0); c.moveTo(0.3, -0.5); c.lineTo(0.84, 0); c.lineTo(0.3, 0.5); },
  bed(c) {
    c.moveTo(-0.88, -0.55); c.lineTo(-0.88, 0.62);
    c.moveTo(-0.88, 0.28); c.lineTo(0.88, 0.28); c.lineTo(0.88, 0.62);
    c.moveTo(-0.2, 0.28); c.lineTo(-0.2, -0.1); c.lineTo(0.6, -0.1); c.quadraticCurveTo(0.88, -0.1, 0.88, 0.28);
    c.moveTo(-0.36, 0); c.arc(-0.54, 0, 0.18, 0, Math.PI * 2);
  },
  foot(c) {
    c.moveTo(-0.1, 0.92); c.bezierCurveTo(-0.52, 0.92, -0.46, 0.3, -0.4, 0.02);
    c.bezierCurveTo(-0.5, -0.32, -0.1, -0.46, 0.2, -0.36); c.bezierCurveTo(0.5, -0.26, 0.36, 0.1, 0.26, 0.36);
    c.bezierCurveTo(0.2, 0.62, 0.26, 0.92, -0.1, 0.92);
    for (const [x, y, r] of [[-0.4, -0.6, 0.1], [-0.15, -0.76, 0.11], [0.1, -0.76, 0.1], [0.32, -0.66, 0.09], [0.5, -0.5, 0.08]]) { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); }
  },
  beer(c) {
    c.moveTo(-0.55, -0.35); c.lineTo(-0.55, 0.88); c.lineTo(0.3, 0.88); c.lineTo(0.3, -0.35);
    c.moveTo(0.3, -0.1); c.bezierCurveTo(0.84, -0.1, 0.84, 0.62, 0.3, 0.62);
    c.moveTo(-0.62, -0.35); c.bezierCurveTo(-0.74, -0.82, -0.26, -0.88, -0.2, -0.62); c.bezierCurveTo(-0.1, -0.98, 0.44, -0.82, 0.38, -0.35); c.closePath();
  },
  cup(c) {
    c.moveTo(-0.5, -0.35); c.lineTo(-0.36, 0.9); c.lineTo(0.36, 0.9); c.lineTo(0.5, -0.35);
    c.moveTo(-0.62, -0.35); c.lineTo(0.62, -0.35);
    c.moveTo(0.1, -0.35); c.lineTo(0.32, -0.96);
  },
};
function strokePicto(ctx, name, cx, cy, r, lw, color) {
  const fn = PICTO[name] || PICTO.bolt;
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(r, r);
  ctx.lineWidth = lw / r; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (color) ctx.strokeStyle = color;
  ctx.beginPath(); fn(ctx); ctx.stroke();
  ctx.restore();
}
/** Logo roundel: ring + one character or a pictogram. */
function roundel(ctx, cx, cy, r, fill, ink, o = {}) {
  ctx.save();
  ctx.fillStyle = css(fill);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.strokeStyle = css(ink); ctx.lineWidth = r * 0.07;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.86, 0, 7); ctx.stroke();
  if (o.picto) strokePicto(ctx, o.picto, cx, cy, r * 0.56, r * 0.15, css(ink));
  else if (o.char) signText(ctx, o.char, cx - r * 0.66, cy - r * 0.66, r * 1.32, r * 1.32, { font: o.font || 'kai', weight: 900, color: css(ink), fat: 0.03 });
  ctx.restore();
}

// ------------------------------------------------------------------------------------- food "photo"
const ell = (ctx, x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };

/** A stylised dish seen from 3/4 above on a dark table, framed like the photo patch on a 门头. */
export function paintDish(ctx, x, y, w, h, kind, rng, { storybook = true } = {}) {
  ctx.save();
  roundRect(ctx, x, y, w, h, h * 0.05); ctx.clip();
  let g = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, h * 0.1, x + w * 0.5, y + h * 0.5, w * 0.8);
  g.addColorStop(0, storybook ? '#965c36' : '#70401f');
  g.addColorStop(1, storybook ? '#4a2a18' : '#1e0e08');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const cx = x + w / 2, cy = y + h * 0.55, rx = Math.min(w * 0.45, h * 0.7), ry = rx * 0.62;
  ctx.fillStyle = storybook ? 'rgba(32,18,10,0.34)' : 'rgba(0,0,0,0.5)';
  ell(ctx, cx + rx * 0.05, cy + ry * 0.14, rx * 1.03, ry * 1.04); ctx.fill();
  const plate = kind === 'changfen' || kind === 'rice';
  const rim = kind === 'mala' ? ['#3a3432', '#141110'] : ['#f6f3ea', '#b9b3a4'];
  g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry); g.addColorStop(0, rim[0]); g.addColorStop(1, rim[1]);
  ctx.fillStyle = g; ell(ctx, cx, cy, rx, ry); ctx.fill();
  const ix = rx * (plate ? 0.76 : 0.87), iy = ry * (plate ? 0.72 : 0.85), icy = cy - ry * (plate ? 0 : 0.02);
  const fills = { changfen: ['#e4dfd0', '#cfc8b6'], rice: ['#e4dfd0', '#cfc8b6'], mala: ['#e0421c', '#84140a'], noodle: ['#e9cf94', '#b98d4a'], congee: ['#f3eedd', '#d8cfb4'] }[kind] || ['#e9cf94', '#b98d4a'];
  g = ctx.createRadialGradient(cx - ix * 0.2, icy - iy * 0.3, ix * 0.1, cx, icy, ix);
  g.addColorStop(0, fills[0]); g.addColorStop(1, fills[1]);
  ctx.fillStyle = g; ell(ctx, cx, icy, ix, iy); ctx.fill();
  ctx.save();
  ell(ctx, cx, icy, ix, iy); ctx.clip();
  const dots = (n, cols, r, spread = 0.85) => {
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, 6.283), d = Math.sqrt(rng.next()) * spread;
      ctx.fillStyle = rng.pick(cols);
      ell(ctx, cx + Math.cos(a) * ix * d, icy + Math.sin(a) * iy * d, r * rng.range(0.6, 1.3), r * rng.range(0.4, 0.9), rng.range(0, 3)); ctx.fill();
    }
  };
  const egg = (ex, ey, r) => {
    ctx.fillStyle = '#fbf7ea'; ell(ctx, ex, ey, r, r * 0.72, 0.3); ctx.fill();
    ctx.fillStyle = '#f0a01c'; ell(ctx, ex + r * 0.05, ey, r * 0.5, r * 0.36, 0.3); ctx.fill();
  };
  if (kind === 'changfen') {
    ctx.fillStyle = 'rgba(96,50,14,0.8)'; ell(ctx, cx + ix * 0.05, icy + iy * 0.25, ix * 0.8, iy * 0.62); ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(cx + ix * 0.02, icy + (i - 1) * iy * 0.44); ctx.rotate(-0.16);
      const L = ix * (1.34 - Math.abs(i - 1) * 0.22), T = iy * 0.4;
      const rg = ctx.createLinearGradient(0, -T / 2, 0, T / 2);
      rg.addColorStop(0, '#fffdf4'); rg.addColorStop(0.55, '#ece5d0'); rg.addColorStop(1, '#bfb49a');
      ctx.fillStyle = rg; roundRect(ctx, -L / 2, -T / 2, L, T, T * 0.48); ctx.fill();
      ctx.fillStyle = 'rgba(232,140,96,0.42)';
      for (let k = 0; k < 3; k++) { ell(ctx, (k - 1) * L * 0.27 + rng.range(-3, 3), T * 0.05, L * 0.09, T * 0.24); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1, T * 0.1); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-L * 0.36, -T * 0.24); ctx.lineTo(L * 0.3, -T * 0.24); ctx.stroke();
      ctx.restore();
    }
    dots(22, ['#3c9a2a', '#7fc648', '#2f7d22'], rx * 0.022, 0.7);
  } else if (kind === 'rice') {
    ctx.fillStyle = '#fbf9f0'; ell(ctx, cx - ix * 0.3, icy - iy * 0.05, ix * 0.52, iy * 0.62); ctx.fill();
    for (let i = 0; i < 60; i++) { ctx.fillStyle = 'rgba(190,182,160,0.5)'; ell(ctx, cx - ix * 0.3 + rng.range(-0.45, 0.45) * ix, icy - iy * 0.05 + rng.range(-0.5, 0.5) * iy, rx * 0.012, rx * 0.007, rng.range(0, 3)); ctx.fill(); }
    for (let i = 0; i < 5; i++) {
      const mx = cx + ix * (0.18 + (i % 3) * 0.2), my = icy + iy * (-0.3 + Math.floor(i / 3) * 0.42 + (i % 2) * 0.1);
      ctx.fillStyle = rng.pick(['#7c3a10', '#93481a', '#5e2a0c']); ell(ctx, mx, my, ix * 0.15, iy * 0.2, rng.range(-0.5, 0.5)); ctx.fill();
      ctx.fillStyle = 'rgba(255,220,170,0.6)'; ell(ctx, mx - ix * 0.04, my - iy * 0.07, ix * 0.05, iy * 0.035, -0.4); ctx.fill();
    }
    ctx.fillStyle = '#2f7a26'; ell(ctx, cx + ix * 0.1, icy + iy * 0.62, ix * 0.5, iy * 0.16, 0.08); ctx.fill();
    ctx.fillStyle = '#58a83c'; ell(ctx, cx + ix * 0.02, icy + iy * 0.58, ix * 0.3, iy * 0.06, 0.08); ctx.fill();
    egg(cx - ix * 0.5, icy + iy * 0.48, ix * 0.17);
  } else {
    if (kind !== 'congee') {
      ctx.strokeStyle = kind === 'mala' ? 'rgba(250,226,160,0.9)' : '#fff3c8'; ctx.lineWidth = Math.max(1.2, rx * 0.035); ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const yy = icy + (i / 8 - 0.5) * iy * 1.3;
        ctx.beginPath(); ctx.moveTo(cx - ix, yy);
        ctx.bezierCurveTo(cx - ix * 0.4, yy + rng.range(-0.3, 0.3) * iy, cx + ix * 0.3, yy + rng.range(-0.3, 0.3) * iy, cx + ix, yy + rng.range(-0.2, 0.2) * iy);
        ctx.stroke();
      }
    }
    if (kind === 'mala') {
      dots(5, ['#f4efe2', '#f1d98a'], rx * 0.085, 0.6);
      dots(4, ['#2f8a2a', '#3da034'], rx * 0.1, 0.7);
      dots(4, ['#8a4a22', '#b06a3c'], rx * 0.075, 0.7);
      dots(26, ['#ffcf3a', '#ff7a1c', '#b3120a'], rx * 0.02, 0.92);
    } else if (kind === 'noodle') {
      dots(4, ['#8a4a22', '#a85c30'], rx * 0.1, 0.5);
      dots(3, ['#2f8a2a', '#49a83a'], rx * 0.1, 0.7);
      egg(cx + ix * 0.38, icy - iy * 0.25, ix * 0.2);
      dots(16, ['#3c9a2a', '#7fc648'], rx * 0.02, 0.9);
    } else {
      dots(7, ['#3a2c20', '#5a4630', '#c98a4a'], rx * 0.05, 0.6);
      dots(18, ['#3c9a2a', '#7fc648'], rx * 0.02, 0.8);
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(1, rx * 0.022);
  ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.95, ry * 0.94, 0, Math.PI * 1.12, Math.PI * 1.72); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = rx * 0.1; ctx.lineCap = 'round';
  for (const sx of [-0.3, 0.05, 0.36]) {
    const bx = cx + sx * rx, by = cy - ry * 0.55;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.bezierCurveTo(bx - rx * 0.16, by - h * 0.12, bx + rx * 0.16, by - h * 0.2, bx, by - h * 0.34); ctx.stroke();
  }
  if (!storybook) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgb(200,196,188)'; ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = storybook ? 'rgba(255,244,218,0.85)' : 'rgb(204,200,190)';
  ctx.lineWidth = Math.max(1.5, h * 0.035);
  roundRect(ctx, x, y, w, h, h * 0.05); ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------------------------- lightbox
function paintLightbox(s, ppm) {
  const [W, H] = size(s, ppm), { canvas, ctx } = makeCanvas(W, H), rng = new RNG(s.seed);
  const caps = capsOf(s);
  const bg = capLuma(s.bg, caps.bg), lightBg = luma(bg) > 0.22;
  vinylField(ctx, W, H, ppm, bg, s, rng);
  const m = Math.max(0.045 * ppm, H * 0.075);
  let x0 = m, x1 = W - m;
  const y0 = m, ih = H - m * 2, gap = ih * 0.14;
  const ink = lightBg ? dark(bg, 0.26) : capLuma(0xffffff, caps.small);
  const onAccent = luma(s.accent) > 0.25 ? dark(bg, lightBg ? 0.22 : 0.6) : 0xffffff;
  const wide = s.w >= 2.2;
  let dishRect = null;
  if (s.badge === 'caps' && wide && s.tags && s.tags.length) {
    const tw = ih * 0.36;
    s.tags.slice(0, 2).forEach((t, i) => {
      const tx = i === 0 ? x0 : x1 - tw;
      ctx.fillStyle = css(capLuma(s.accent, caps.patch));
      roundRect(ctx, tx, y0 + ih * 0.04, tw, ih * 0.92, tw * 0.16); ctx.fill();
      signText(ctx, t, tx + tw * 0.12, y0 + ih * 0.1, tw * 0.76, ih * 0.8, { font: 'hei', weight: 700, vertical: true, color: css(onAccent), fat: 0.03 });
    });
    x0 += tw + gap; x1 -= tw + gap;
  } else if (s.badge === 'logo' && wide) {
    const r = ih * 0.45;
    roundel(ctx, x0 + r, y0 + ih / 2, r, capLuma(s.accent, caps.patch), onAccent, { picto: s.pictogram, char: s.logo || Array.from(s.text)[0], font: s.font });
    x0 += r * 2 + gap;
  } else if (s.badge === 'photo' && wide) {
    const pw = Math.min(ih * 1.65, (x1 - x0) * 0.28);
    dishRect = [s.photoRight ? x1 - pw : x0, y0 + ih * 0.04, pw, ih * 0.92];
    if (s.storybook === false) paintDish(ctx, ...dishRect, s.photo || 'changfen', rng.fork('dish'), { storybook: false });
    if (s.photoRight) x1 -= pw + gap; else x0 += pw + gap;
  }
  const shadow = s.effect === 'shadow' || s.effect === 'both' ? css(dark(bg, lightBg ? 0.68 : 0.3), s.storybook === false ? 0.9 : 0.45) : null;
  const stroke = strokeCss(s, bg);
  const inks = [];
  const name = (bx, by, bw, bh, c = ctx, pass = null) => {
    if (!pass) inks.push([bx, by, bw, bh]);
    return signText(c, s.text, bx, by, bw, bh, {
      font: s.font, weight: 900, color: inkCss(s, s.fg, pass), stroke, shadow, strokeW: lightBg ? 0.04 : 0.075,
      fat: isHeavy(s) ? 0.045 : 0.02, pass, erode: isHeavy(s) ? 0.06 : 0.045,
    });
  };
  const phone = s.phone ? `${s.phoneLabel}:${s.phone}` : '';
  let layout = s.layout;
  if (!wide && layout === 'side') layout = 'stack';
  if (!s.sub && !phone && layout !== 'plain') layout = 'plain';
  const bw = x1 - x0;
  if (layout === 'side') {
    const cw = bw * 0.3, cx = x1 - cw;
    name(x0, y0, bw - cw - gap, ih * (s.latin ? 0.78 : 1));
    if (s.latin) signText(ctx, s.latin, x0, y0 + ih * 0.85, bw - cw - gap, ih * 0.15, { font: 'latin', weight: 700, color: css(ink, 0.9), spread: true, fill: 0.8, maxSpacing: 0.5 });
    ctx.fillStyle = css(capLuma(s.accent, caps.patch));
    roundRect(ctx, cx, y0 + ih * 0.04, cw, ih * 0.36, ih * 0.06); ctx.fill();
    signText(ctx, s.sub, cx + cw * 0.04, y0 + ih * 0.08, cw * 0.92, ih * 0.28, { font: 'hei', weight: 700, color: css(onAccent), spread: false });
    if (s.phone) {
      signText(ctx, s.phoneLabel, cx, y0 + ih * 0.47, cw, ih * 0.2, { font: 'hei', weight: 700, color: css(ink), spread: true, fill: 0.7 });
      signText(ctx, s.phone, cx, y0 + ih * 0.68, cw, ih * 0.3, { font: 'led', weight: 700, color: css(lightBg ? ink : capLuma(s.fg, caps.small)), spread: false });
    } else if (s.sideNote) {
      signText(ctx, s.sideNote, cx, y0 + ih * 0.56, cw, ih * 0.32, { font: 'hei', weight: 700, color: css(ink), spread: true, fill: 0.82 });
    }
  } else if (layout === 'plain') {
    const lat = s.latin ? 0.17 : 0;
    name(x0, y0 + ih * 0.02, bw, ih * (0.96 - lat * 1.3));
    if (s.latin) signText(ctx, s.latin, x0, y0 + ih * (1 - lat), bw, ih * lat, { font: 'latin', weight: 700, color: css(ink, 0.9), spread: true, fill: 0.7, maxSpacing: 0.6 });
  } else {
    const band = layout === 'band', lat = s.latin ? 0.09 : 0, nh = s.latin ? 0.62 : 0.71, sy = y0 + ih * 0.77, shh = ih * 0.23;
    let small = ink;
    if (band) {
      ctx.fillStyle = css(capLuma(s.accent, caps.patch));
      ctx.fillRect(0, sy - ih * 0.03, W, H);
      small = onAccent;
    }
    name(x0, y0, bw, ih * nh);
    if (s.latin) signText(ctx, s.latin, x0, y0 + ih * 0.635, bw, ih * lat, { font: 'latin', weight: 700, color: css(ink, 0.9), spread: true, fill: 0.6, maxSpacing: 0.6 });
    const sx0 = band ? m : x0, sbw = band ? W - m * 2 : bw, o = { font: 'hei', weight: 700, color: css(small), spread: false };
    if (s.sub && phone) {
      signText(ctx, s.sub, sx0, sy, sbw * 0.56, shh, { ...o, align: 'left' });
      signText(ctx, phone, sx0 + sbw * 0.6, sy, sbw * 0.4, shh, { ...o, align: 'right' });
    } else signText(ctx, s.sub || phone, sx0, sy, sbw, shh, { ...o, spread: true, fill: 0.75, maxSpacing: 0.4 });
  }
  const lamps = finishFace(ctx, W, H, ppm, s, rng, { mode: s.light, axis: 'x', dead: s.dead }, (c, pass) => { for (const b of inks) name(...b, c, pass); });
  if (dishRect && s.storybook !== false) {
    paintDish(ctx, ...dishRect, s.photo || 'changfen', rng.fork('dish'), { storybook: true });
  }
  return { canvas, lamps };
}

// ------------------------------------------------------------------------------------- vertical blade
function paintVertical(s, ppm) {
  const [W, H] = size(s, ppm), { canvas, ctx } = makeCanvas(W, H), rng = new RNG(s.seed);
  const caps = capsOf(s);
  const bg = capLuma(s.bg, caps.bg), lightBg = luma(bg) > 0.22;
  vinylField(ctx, W, H, ppm, bg, s, rng);
  const m = W * 0.1;
  const onAccent = luma(s.accent) > 0.25 ? dark(bg, lightBg ? 0.22 : 0.65) : 0xffffff;
  ctx.strokeStyle = css(lightBg ? s.fg : s.accent, 0.95); ctx.lineWidth = Math.max(1.5, 0.012 * ppm);
  roundRect(ctx, m * 0.55, m * 0.55, W - m * 1.1, H - m * 1.1, m * 0.5); ctx.stroke();
  let y0 = m * 1.3, y1 = H - m * 1.3;
  const iw = W - m * 2.4, x0 = m * 1.2;
  if (s.top || s.pictogram) {
    const r = iw * 0.44;
    if (s.pictogram) roundel(ctx, W / 2, y0 + r, r, capLuma(s.accent, caps.patch), onAccent, { picto: s.pictogram });
    else {
      ctx.fillStyle = css(capLuma(s.accent, caps.patch)); roundRect(ctx, x0, y0, iw, r * 1.3, r * 0.25); ctx.fill();
      signText(ctx, s.top, x0 + iw * 0.06, y0 + r * 0.12, iw * 0.88, r * 1.06, { font: 'hei', weight: 700, color: css(onAccent), spread: false });
    }
    y0 += (s.pictogram ? r * 2 : r * 1.3) + m * 0.6;
  }
  if (s.bottom) {
    const bh = iw * 0.42;
    ctx.fillStyle = css(lightBg ? s.fg : s.accent, 0.9); ctx.fillRect(x0, y1 - bh - m * 0.35, iw, Math.max(1.5, 0.008 * ppm));
    signText(ctx, s.bottom, x0, y1 - bh, iw, bh, { font: 'hei', weight: 700, color: css(lightBg ? dark(bg, 0.22) : capLuma(0xffffff, caps.small)), spread: false });
    y1 -= bh + m * 0.7;
  }
  const chars = Array.from(s.text), n = chars.length, cell = Math.min(iw, (y1 - y0) / n), top = y0 + ((y1 - y0) - cell * n) / 2;
  const shadow = s.effect === 'shadow' || s.effect === 'both' ? css(dark(bg, lightBg ? 0.68 : 0.3), s.storybook === false ? 0.9 : 0.45) : null;
  const stroke = strokeCss(s, bg);
  const boxed = s.charBox === 'circle' || s.charBox === 'square';
  const letters = (c, pass) => chars.forEach((ch, i) => {
    const cx = W / 2, cy = top + cell * (i + 0.5);
    let color = inkCss(s, s.fg, pass), k = 0.9;
    if (boxed) {
      if (pass) return;
      c.fillStyle = css(capLuma(s.fg, caps.patch));
      if (s.charBox === 'circle') { c.beginPath(); c.arc(cx, cy, cell * 0.45, 0, 7); c.fill(); } else { roundRect(c, cx - cell * 0.44, cy - cell * 0.44, cell * 0.88, cell * 0.88, cell * 0.08); c.fill(); }
      color = css(luma(s.fg) > 0.25 ? dark(bg, lightBg ? 0.25 : 0.8) : 0xffffff); k = s.charBox === 'circle' ? 0.6 : 0.7;
    }
    signText(c, ch, cx - cell * k / 2, cy - cell * k / 2, cell * k, cell * k, {
      font: s.font, weight: 900, color, stroke: boxed ? null : stroke, shadow: boxed ? null : shadow, strokeW: lightBg ? 0.045 : 0.085,
      fat: isHeavy(s) ? 0.04 : 0.015, pass, erode: isHeavy(s) ? 0.06 : 0.045,
    });
  });
  letters(ctx, null);
  finishFace(ctx, W, H, ppm, s, rng, { mode: s.light === 'spot' ? 'tubes' : s.light, axis: 'y', dead: s.dead, edge: 0.06 }, letters);
  return { canvas };
}

// ------------------------------------------------------------------------------------- neon
function tubeLayer(W, H, draw, tube, color, rng, nGaps, nPts) {
  const mk = (part) => {
    const c = makeCanvas(W, H);
    c.ctx.lineCap = 'round'; c.ctx.lineJoin = 'round'; c.ctx.strokeStyle = '#fff'; c.ctx.fillStyle = '#fff';
    draw(c.ctx, part);
    return c;
  };
  const a = mk('body'), b = mk('core');
  const d = a.ctx.getImageData(0, 0, W, H).data, on = [];
  for (let t = 0; t < (nGaps + nPts) * 60 && on.length < nGaps + nPts; t++) {
    const x = rng.int(2, W - 3), y = rng.int(2, H - 3);
    if (d[(y * W + x) * 4 + 3] > 200 && on.every((p) => Math.hypot(p[0] - x, p[1] - y) > tube * 4)) on.push([x, y]);
  }
  const gaps = on.slice(0, nGaps), pts = on.slice(nGaps).map((p) => [p[0] / W, p[1] / H]);
  for (const [c, col] of [[a, dark(color, 0.86)], [b, lite(color, 0.32)]]) {
    c.ctx.globalCompositeOperation = 'destination-out';
    c.ctx.fillStyle = '#000';
    for (const g of gaps) { c.ctx.beginPath(); c.ctx.arc(g[0], g[1], tube * 0.85, 0, 7); c.ctx.fill(); }
    c.ctx.globalCompositeOperation = 'source-in';
    c.ctx.fillStyle = css(col); c.ctx.fillRect(0, 0, W, H);
  }
  return { body: a.canvas, core: b.canvas, pts };
}
function blurred(src, r) {
  const k = Math.max(2, Math.round(r)), w = Math.max(2, Math.ceil(src.width / k)), h = Math.max(2, Math.ceil(src.height / k));
  const a = makeCanvas(w, h), b = makeCanvas(w, h);
  a.ctx.imageSmoothingQuality = 'high';
  a.ctx.drawImage(src, 0, 0, w, h);
  b.ctx.globalAlpha = 1 / 9;
  b.ctx.globalCompositeOperation = 'lighter';
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) b.ctx.drawImage(a.canvas, i * 0.7, j * 0.7);
  return b.canvas;
}
function compositeTubes(ctx, layer, tube, k = 1) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (k > 0.5) {
    ctx.globalAlpha = 0.16; ctx.drawImage(blurred(layer.body, tube * 2.2), 0, 0, W, H);
    ctx.globalAlpha = 0.24; ctx.drawImage(blurred(layer.body, tube * 0.6), 0, 0, W, H);
  }
  ctx.globalAlpha = k; ctx.drawImage(layer.body, 0, 0);
  if (k > 0.5) ctx.drawImage(layer.core, 0, 0);
  ctx.restore();
}

function paintNeon(s, ppm) {
  const [W, H] = size(s, ppm), { canvas, ctx } = makeCanvas(W, H), rng = new RNG(s.seed);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const tube = Math.max(2.5, 0.016 * ppm), m = Math.min(W, H) * 0.1;
  let x0 = m * 1.9, y0 = m * 1.9, x1 = W - m * 1.9, y1 = H - m * 1.9;
  const posts = [];
  const add = (draw, color, nG, nP, k = 1) => { const L = tubeLayer(W, H, draw, tube, color, rng, nG, nP); compositeTubes(ctx, L, tube, k); posts.push(...L.pts); };
  const path = (fn) => (c, part) => { c.lineWidth = part === 'body' ? tube : tube * 0.4; c.beginPath(); fn(c); c.stroke(); };
  if (s.border) {
    add(path((c) => roundRect(c, m, m, W - m * 2, H - m * 2, m * 0.9)), s.accent, 2, 6);
    if (s.border === 'double') add(path((c) => roundRect(c, m * 1.45, m * 1.45, W - m * 2.9, H - m * 2.9, m * 0.6)), s.fg, 2, 0);
  }
  if (s.pictogram) {
    const r = Math.min((s.vertical ? x1 - x0 : y1 - y0) * 0.46, (s.vertical ? y1 - y0 : x1 - x0) * 0.2);
    const cx = s.vertical ? W / 2 : x0 + r, cy = s.vertical ? y0 + r : H / 2;
    add((c, part) => { const lw = part === 'body' ? tube : tube * 0.4; c.save(); c.translate(cx, cy); c.scale(r, r); c.lineWidth = lw / r; c.beginPath(); (PICTO[s.pictogram] || PICTO.bolt)(c); c.stroke(); c.restore(); }, s.pictoColor ?? s.accent, 2, 3);
    if (s.vertical) y0 += r * 2 + m * 0.6; else x0 += r * 2 + m * 0.8;
  }
  if (s.sub && !s.vertical) {
    const sh = (y1 - y0) * 0.24;
    const so = { font: 'hei', weight: 300, pad: 0, spacing: 0.3 };
    add((c, part) => {
      drawText(c, s.sub, x0, y1 - sh, x1 - x0, sh, { ...so, color: '#fff', stroke: '#fff', strokeWidth: part === 'body' ? tube * 0.5 : 0.01 });
    }, s.accent, 0, 2);
    y1 -= sh + m * 0.5;
  }
  const chars = Array.from(s.text), outline = s.tubeStyle === 'outline';
  const o = { font: s.font, weight: outline ? 900 : 200, pad: 0, vertical: !!s.vertical, spacing: outline ? 0.14 : 0.12 };
  const textDraw = (str) => (c, part) => {
    const body = part === 'body', bx = x0 + tube, by = y0 + tube, bw = x1 - x0 - tube * 2, bh = y1 - y0 - tube * 2;
    if (outline) drawText(c, str, bx, by, bw, bh, { ...o, color: 'rgba(0,0,0,0)', stroke: '#fff', strokeWidth: body ? tube : tube * 0.4 });
    else {
      drawText(c, str, bx, by, bw, bh, { ...o, color: '#fff', stroke: body ? '#fff' : null, strokeWidth: tube * 0.45 });
      if (!body) { c.globalCompositeOperation = 'destination-out'; drawText(c, str, bx, by, bw, bh, { ...o, color: 'rgba(0,0,0,0)', stroke: '#000', strokeWidth: Math.max(1, tube * 0.3) }); c.globalCompositeOperation = 'source-over'; }
    }
  };
  const dead = s.dead != null && chars.length > 1 ? Math.min(chars.length - 1, Math.floor(s.dead * chars.length)) : -1;
  const blank = (keep) => chars.map((ch, i) => (keep(i) ? ch : '　')).join('');
  add(textDraw(blank((i) => i !== dead)), s.fg, chars.length * 2, chars.length * 3);
  if (dead >= 0) add(textDraw(blank((i) => i === dead)), mixHex(s.fg, 0x8a8a8a, 0.7), 0, 2, 0.16);
  return { canvas, posts };
}

// ------------------------------------------------------------------------------------- LED strip
export function paintLedRow(text, rows, colorHex, width) {
  const { canvas, ctx } = makeCanvas(width, rows);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, rows);
  const px = rows * 0.94, gapPx = Math.round(rows * 2.5);
  ctx.font = fontCss('hei', px, 500);
  ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
  const tw = Math.ceil(ctx.measureText(text).width) + gapPx, n = Math.max(1, Math.floor(width / tw));
  for (let i = 0; i < n; i++) ctx.fillText(text, Math.round(i * width / n) + Math.round(rows * 0.5), rows / 2 + rows * 0.04);
  const img = ctx.getImageData(0, 0, width, rows), d = img.data;
  const r = (colorHex >> 16) & 255, g = (colorHex >> 8) & 255, b = colorHex & 255;
  for (let i = 0; i < d.length; i += 4) {
    const k = d[i] > 105 ? 1 : 0.16;
    d[i] = r * k; d[i + 1] = g * k; d[i + 2] = b * k; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
export function ledDotMask(px = 32) {
  return paintPixels(px, (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) / 0.5;
    const g = 255 * Math.max(0, Math.min(1, (0.8 - d) / 0.22)) * (0.72 + 0.28 * Math.max(0, 1 - d * 1.6));
    return [g, g, g, 255];
  });
}

// ------------------------------------------------------------------------------------- plaque
function screw(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#e8e8e4'); g.addColorStop(1, '#5a5a58');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,20,0.8)'; ctx.lineWidth = Math.max(1, r * 0.3);
  ctx.beginPath(); ctx.moveTo(x - r * 0.6, y - r * 0.3); ctx.lineTo(x + r * 0.6, y + r * 0.3); ctx.stroke();
}
function paintPlaque(s, ppm) {
  const [W, H] = size(s, ppm), { canvas, ctx } = makeCanvas(W, H), rng = new RNG(s.seed);
  const u = Math.min(W, H), caps = capsOf(s);
  if (s.style === 'lit') {
    const bg = capLuma(s.bg, caps.bg);
    vinylField(ctx, W, H, ppm, bg, s, rng);
    const hasSub = !!s.sub;
    signText(ctx, s.text, W * 0.07, H * 0.08, W * 0.86, H * (hasSub ? 0.56 : 0.84), { font: s.font, weight: 900, color: css(capLuma(s.fg, caps.ink)), fat: 0.03, stroke: s.effect === 'stroke' ? css(capLuma(s.accent, caps.patch)) : null });
    if (hasSub) signText(ctx, s.sub, W * 0.07, H * 0.66, W * 0.86, H * 0.26, { font: 'led', weight: 700, color: css(luma(bg) > 0.22 ? dark(bg, 0.22) : 0xffffff), spread: false });
    finishFace(ctx, W, H, ppm, s, rng, { mode: 'led', edge: 0.03 }, null);
    return { canvas };
  }
  if (s.style === 'door') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, css(lite(s.bg, 0.14))); g.addColorStop(1, css(dark(s.bg, 0.86)));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = css(s.fg); ctx.lineWidth = u * 0.024;
    roundRect(ctx, u * 0.06, u * 0.06, W - u * 0.12, H - u * 0.12, u * 0.07); ctx.stroke();
    signText(ctx, s.text, W * 0.1, H * 0.13, W * 0.8, H * 0.27, { font: 'hei', weight: 700, color: css(s.fg), spread: true, fill: 0.86 });
    signText(ctx, s.sub, W * 0.2, H * 0.4, W * 0.6, H * 0.4, { font: 'latin', weight: 700, color: css(s.fg), spread: false, fat: 0.02 });
    if (s.note) signText(ctx, s.note, W * 0.2, H * 0.8, W * 0.6, H * 0.1, { font: 'hei', weight: 500, color: css(s.fg, 0.85), spread: true, fill: 0.9 });
    screw(ctx, W * 0.1, H * 0.6, u * 0.028); screw(ctx, W * 0.9, H * 0.6, u * 0.028);
    if (s.wear > 0.12) {
      for (let i = Math.round(s.wear * 9); i > 0; i--) {
        const e = rng.int(0, 3), t = rng.next(), x = e < 2 ? t * W : (e === 2 ? rng.range(0, 0.05) : rng.range(0.95, 1)) * W, y = e >= 2 ? t * H : (e === 0 ? rng.range(0, 0.07) : rng.range(0.93, 1)) * H;
        ctx.fillStyle = rng.pick(['#3a2414', '#5a3418', '#21160e']);
        ell(ctx, x, y, u * rng.range(0.012, 0.045), u * rng.range(0.01, 0.03), rng.range(0, 3)); ctx.fill();
      }
      wearLayer(ctx, W, H, ppm, s.wear * 0.8, rng);
    }
    const gl = ctx.createLinearGradient(0, 0, W * 0.7, H);
    gl.addColorStop(0.2, 'rgba(255,255,255,0)'); gl.addColorStop(0.36, 'rgba(255,255,255,0.14)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
    return { canvas };
  }
  const steel = s.style === 'steel';
  const stops = steel ? ['#72767a', '#a9acaf', '#7e8286', '#b4b6b8', '#6c7074'] : ['#7a5c20', '#b89a50', '#8c6c28', '#c4aa5e', '#785a20'];
  const g = ctx.createLinearGradient(0, 0, W * 0.25, H);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    ctx.fillStyle = rng.chance(0.5) ? `rgba(255,255,255,${rng.range(0, 0.11).toFixed(3)})` : `rgba(0,0,0,${rng.range(0, 0.11).toFixed(3)})`;
    ctx.fillRect(0, y, W, 1);
  }
  const inkC = css(s.fg);
  ctx.strokeStyle = inkC; ctx.lineWidth = Math.max(1, u * 0.012);
  ctx.strokeRect(u * 0.07, u * 0.07, W - u * 0.14, H - u * 0.14);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(u * 0.07 + 1.5, u * 0.07 + 1.5, W - u * 0.14, H - u * 0.14);
  const vert = H > W * 1.25, o = { font: s.font, weight: 900, color: inkC, vertical: vert, spread: true, fill: 0.9 };
  if (vert) {
    if (s.sub) { signText(ctx, s.text, W * 0.42, H * 0.1, W * 0.44, H * 0.8, o); signText(ctx, s.sub, W * 0.16, H * 0.2, W * 0.2, H * 0.6, { ...o, color: css(s.accent) }); } else signText(ctx, s.text, W * 0.2, H * 0.1, W * 0.6, H * 0.8, o);
  } else {
    signText(ctx, s.text, W * 0.12, H * (s.sub ? 0.16 : 0.24), W * 0.76, H * (s.sub ? 0.42 : 0.52), o);
    if (s.sub) signText(ctx, s.sub, W * 0.12, H * 0.62, W * 0.76, H * 0.2, { ...o, weight: 700, color: css(s.accent) });
  }
  for (const [fx, fy] of [[0.06, 0.06], [0.94, 0.06], [0.06, 0.94], [0.94, 0.94]]) screw(ctx, fx * W, fy * H, u * 0.022);
  wearLayer(ctx, W, H, ppm, s.wear, rng);
  const v = ctx.createRadialGradient(W / 2, H / 2, u * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  v.addColorStop(0, 'rgba(60,40,10,0)'); v.addColorStop(1, `rgba(40,26,8,${(0.25 + s.wear * 0.4).toFixed(2)})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  return { canvas };
}

// ------------------------------------------------------------------------------------- banner
function paintBanner(s, ppm) {
  return { canvas: bannerFace(s, ppm, true), canvasB: bannerFace(s, ppm, false) };
}
function bannerFace(s, ppm, text) {
  const [W, H] = size(s, ppm), { canvas, ctx } = makeCanvas(W, H), rng = new RNG(s.seed);
  ctx.fillStyle = css(text ? s.bg : dark(s.bg, 0.82)); ctx.fillRect(0, 0, W, H);
  if (text) signText(ctx, s.text, W * 0.035, H * 0.17, W * 0.93, H * 0.66, { font: s.font, weight: 900, color: css(s.fg), spread: true, fill: 0.97, maxSpacing: 0.3, fat: 0.02 });
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.5; ctx.drawImage(grain(), 0, 0, 256, 60, 0, 0, W, H); ctx.globalAlpha = 1;
  for (let x = rng.range(0.2, 0.5) * ppm; x < W; x += rng.range(0.42, 0.55) * ppm) {
    const cw = 0.05 * ppm, g = ctx.createLinearGradient(x - cw, 0, x + cw, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(176,168,168,1)'); g.addColorStop(0.55, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(232,224,224,1)');
    ctx.fillStyle = g; ctx.fillRect(x - cw, 0, cw * 2, H);
  }
  for (let i = 0; i < W / ppm * 2; i++) {
    const x = rng.range(0, W), ww = rng.range(0.1, 0.3) * ppm, g = ctx.createLinearGradient(x - ww, 0, x + ww, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, `rgba(${rng.int(205, 235)},${rng.int(198, 228)},${rng.int(198, 228)},1)`); g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g; ctx.fillRect(x - ww, 0, ww * 2, H);
  }
  ctx.fillStyle = 'rgba(170,150,150,1)'; ctx.fillRect(0, H * 0.5 - 1, W, 2);
  ctx.fillStyle = 'rgba(150,130,130,1)'; ctx.fillRect(0, 0, W, H * 0.06); ctx.fillRect(0, H * 0.94, W, H * 0.06);
  ctx.fillStyle = 'rgb(150,146,140)'; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,225,190,0.5)';
  for (let x = 2; x < W; x += 6) { ctx.fillRect(x, H * 0.06, 3, 1); ctx.fillRect(x, H * 0.94 - 1, 3, 1); }
  wearLayer(ctx, W, H, ppm, s.wear * 0.7, rng);
  return canvas;
}

// ------------------------------------------------------------------------------------- hologram
function paintHolo(s, ppm) {
  const [W, H] = size(s, ppm), { canvas, ctx } = makeCanvas(W, H), rng = new RNG(s.seed);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const m = Math.min(W, H) * 0.08, c1 = s.fg, c2 = s.accent, lw = Math.max(1.5, 0.008 * ppm);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, css(c1, 0.1)); g.addColorStop(1, css(c1, 0.03));
  ctx.fillStyle = g; roundRect(ctx, m, m, W - m * 2, H - m * 2, m * 0.4); ctx.fill();
  ctx.strokeStyle = css(c1, 0.9); ctx.lineWidth = lw; ctx.lineCap = 'square';
  const L = m * 1.6;
  for (const [cx, cy, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(cx + dx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * L); ctx.stroke();
  }
  let x0 = m * 2.2;
  const y0 = m * 2, ih = H - m * 4;
  if (s.pictogram) {
    const r = Math.min(ih * 0.42, W * 0.14), cx = x0 + r, cy = H / 2 - ih * 0.04;
    ctx.strokeStyle = css(c2, 0.9); ctx.lineWidth = lw;
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + 0.5236; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.closePath(); ctx.stroke();
    ctx.fillStyle = css(c2, 0.12); ctx.fill();
    ctx.shadowColor = css(c2); ctx.shadowBlur = r * 0.3;
    strokePicto(ctx, s.pictogram, cx, cy, r * 0.55, lw * 2.2, css(lite(c2, 0.35)));
    ctx.shadowBlur = 0;
    x0 += r * 2 + m * 1.2;
  }
  const bw = W - m * 2.2 - x0;
  drawText(ctx, s.text, x0, y0, bw, ih * (s.sub ? 0.56 : 0.8), { font: s.font, weight: 700, color: css(lite(c1, 0.3)), glow: css(c1, 0.6), glowBlur: Math.max(2, 0.012 * ppm), pad: 0.02, spacing: 0.1, align: 'left' });
  if (s.sub) drawText(ctx, s.sub, x0, y0 + ih * 0.58, bw, ih * 0.2, { font: 'hei', weight: 500, color: css(lite(c2, 0.2)), pad: 0, spacing: 0.12, align: 'left' });
  ctx.fillStyle = css(c1, 0.75); ctx.fillRect(x0, y0 + ih * 0.82, bw * 0.62, lw * 0.6);
  for (let x = x0, i = 0; x < x0 + bw * 0.62; x += lw * 3.5, i++) ctx.fillRect(x, y0 + ih * 0.82, lw * 0.6, i % 5 === 0 ? lw * 3 : lw * 1.6);
  for (let x = x0 + bw * 0.7; x < x0 + bw; x += lw * rng.range(1.2, 2.6)) { ctx.fillStyle = css(c1, rng.range(0.35, 0.9)); ctx.fillRect(x, y0 + ih * 0.82, lw * rng.range(0.4, 1.2), ih * 0.14); }
  if (s.note) drawText(ctx, s.note, x0, y0 + ih * 0.88, bw * 0.62, ih * 0.12, { font: 'mono', weight: 400, color: css(c1, 0.8), pad: 0, align: 'left', spacing: 0.1 });
  ctx.globalCompositeOperation = 'multiply';
  for (const [ax, ay, bx, by] of [[0, 0, m * 1.2, 0], [W, 0, W - m * 1.2, 0], [0, 0, 0, m * 1.2], [0, H, 0, H - m * 1.2]]) {
    const f = ctx.createLinearGradient(ax, ay, bx, by);
    f.addColorStop(0, '#000'); f.addColorStop(1, '#fff');
    ctx.fillStyle = f; ctx.fillRect(0, 0, W, H);
  }
  return { canvas };
}

// ------------------------------------------------------------------------------------- LCD screen
function fakeQR(ctx, x, y, sz, rng) {
  const n = 21, c = sz / (n + 2);
  ctx.fillStyle = '#c9c9c4'; ctx.fillRect(x, y, sz, sz);
  ctx.fillStyle = '#16130f';
  const finder = (i, j) => (i < 7 && j < 7) || (i >= n - 7 && j < 7) || (i < 7 && j >= n - 7);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let on;
    if (finder(i, j)) { const a = i >= n - 7 ? i - (n - 7) : i, b = j >= n - 7 ? j - (n - 7) : j, d = Math.max(Math.abs(a - 3), Math.abs(b - 3)); on = d !== 2; } else on = rng.chance(0.48);
    if (on) ctx.fillRect(x + (i + 1) * c, y + (j + 1) * c, c + 0.4, c + 0.4);
  }
}
function paintScreenPage(W, H, p, rng, s) {
  const { canvas, ctx } = makeCanvas(W, H);
  const caps = capsOf(s);
  const bg = capLuma(p.bg, caps.bg * 0.9), ac = capLuma(p.accent, caps.patch), u = Math.min(W, H), portrait = H >= W;
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, css(lite(bg, 0.1))); g.addColorStop(1, css(dark(bg, 0.6)));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.1; ctx.strokeStyle = '#fff'; ctx.lineWidth = u * 0.06;
  for (let i = -H; i < W; i += u * 0.2) { ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H, 0); ctx.stroke(); }
  ctx.restore();
  const cx = portrait ? W * 0.5 : W * 0.76, cy = H * 0.5, r = portrait ? W * 0.36 : H * 0.36;
  ctx.fillStyle = css(ac); ctx.beginPath(); ctx.arc(cx + r * 0.15, cy + r * 0.1, r * 1.12, 0, 7); ctx.fill();
  if (p.dish) paintDish(ctx, cx - r * 1.05, cy - r * 0.8, r * 2.1, r * 1.6, p.dish, rng.fork('dish'), { storybook: s.storybook !== false });
  else { ctx.fillStyle = css(dark(bg, 0.5)); ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, 7); ctx.fill(); strokePicto(ctx, p.pictogram || 'bolt', cx, cy, r * 0.5, r * 0.13, css(capLuma(p.fg, 0.62))); }
  const tx = W * 0.08, tw = portrait ? W * 0.84 : W * 0.5;
  const ty = portrait ? H * 0.06 : H * 0.12;
  if (p.tag) {
    const th = u * 0.1, twd = th * (Array.from(p.tag).length * 0.95 + 0.8);
    ctx.fillStyle = css(capLuma(p.fg, caps.patch)); roundRect(ctx, tx, ty, twd, th, th / 2); ctx.fill();
    signText(ctx, p.tag, tx + th * 0.3, ty + th * 0.1, twd - th * 0.6, th * 0.8, { font: 'hei', weight: 700, color: css(dark(bg, 0.5)), spread: false });
  }
  const lines = String(p.title).split('\n'), lh = (portrait ? H * 0.11 : H * 0.22);
  lines.forEach((ln, i) => signText(ctx, ln, tx, ty + u * 0.14 + i * lh, tw, lh * 0.95, { font: s.font, weight: 900, color: css(capLuma(p.fg, caps.ink)), align: 'left', spread: false, shadow: css(dark(bg, 0.3), 0.8), fat: 0.03 }));
  if (p.price) {
    const bx = portrait ? W * 0.74 : W * 0.56, by = portrait ? H * 0.68 : H * 0.72, br = u * 0.17;
    ctx.fillStyle = css(capLuma(0xffd21c, caps.patch)); ctx.beginPath();
    for (let i = 0; i < 28; i++) { const a = i / 28 * 6.283, rr = i % 2 ? br : br * 0.78; ctx.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    signText(ctx, p.price, bx - br * 0.62, by - br * 0.4, br * 1.24, br * 0.8, { font: 'led', weight: 700, color: '#b3120a', spread: false, fat: 0.03 });
  }
  const fy = portrait ? H * 0.8 : H * 0.74, fh = H - fy;
  ctx.fillStyle = 'rgba(8,8,10,0.55)'; ctx.fillRect(0, fy, W, fh);
  const q = Math.min(fh * 0.8, W * 0.22);
  fakeQR(ctx, W - tx - q, fy + (fh - q) / 2, q, rng.fork('qr'));
  if (p.sub) signText(ctx, p.sub, tx, fy + fh * 0.12, W - tx * 3 - q, fh * 0.42, { font: 'hei', weight: 700, color: '#f6f2e6', align: 'left', spread: false });
  if (p.brand) signText(ctx, p.brand, tx, fy + fh * 0.58, W - tx * 3 - q, fh * 0.3, { font: 'hei', weight: 700, color: css(lite(ac, 0.3)), align: 'left', spread: false });
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgb(10,13,20)'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply';
  const v = ctx.createRadialGradient(W / 2, H / 2, u * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
  v.addColorStop(0, '#fff'); v.addColorStop(1, '#b4b8c4');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  return canvas;
}
function paintScreen(s, ppm) {
  const [W, H] = size(s, ppm), rng = new RNG(s.seed);
  return { canvas: paintScreenPage(W, H, s.pages[0], rng.fork('a'), s), canvasB: paintScreenPage(W, H, s.pages[1] || s.pages[0], rng.fork('b'), s) };
}

const PAINTERS = { lightbox: paintLightbox, vertical: paintVertical, neon: paintNeon, plaque: paintPlaque, banner: paintBanner, holo: paintHolo, screen: paintScreen };
/** Paint the face of a resolved spec at `ppm` texels per metre. ('led' uses paintLedRow instead.) */
export function paintSign(spec, ppm) {
  const fn = PAINTERS[spec.kind];
  if (!fn) throw new Error(`[signpaint] no painter for kind "${spec.kind}"`);
  return fn({ ...spec, fontKey: spec.font, font: SIGN_FONTS[spec.font] || spec.font }, ppm);
}
