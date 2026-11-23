/**
 * sign-kit.js — the Chinese signage kit: 门头 lightboxes, 竖招牌 blades, neon, LED strips, plaques,
 * 红横幅, holograms and LCD ad screens, adapted for Shiba Delivery's storybook look and 4-TOD lighting.
 *
 *   const kit = new SignKit({ rng, density = 1, mode = 'lit', storybook = true, glow = 1, emit = 1 });
 *   kit.add(spec, { x, y, z, rotY }) -> { emitter, w, h, spec }
 *   kit.build() -> THREE.Group
 *   kit.emitters / kit.update(dt, t) / kit.pages / kit.ledTexture / kit.stats / kit.dispose()
 *   SIGN_KINDS, defaultSignSpec(kind, text, rng, hint?)
 */
import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { litMaterial, glowMaterial, setGlow } from '../core/materials.js';
import { makeCanvas, canvasTexture, paintPixels, noise2D, fbm2D, cached } from '../core/textures.js';
import { RNG } from '../core/rng.js';
import { paintSign, paintLedRow, ledDotMask, dominantColor, luma, DISHES } from './sign-paint.js';

export const SIGN_KINDS = ['lightbox', 'vertical', 'neon', 'led', 'plaque', 'banner', 'holo', 'screen'];

const ATLAS = 2048;
const LED_W = 1024;
const KIND = {
  lightbox: { ppm: 256, glow: 1.6, trim: 0.03 },
  vertical: { ppm: 224, glow: 1.6, trim: 0.025 },
  neon: { ppm: 384, glow: 2.3 },
  led: { glow: 4.2 },
  plaque: { ppm: 560, glow: 1.6, trim: 0.012 },
  banner: { ppm: 150 },
  holo: { ppm: 220, glow: 1.25 },
  screen: { ppm: 300, glow: 1.35, trim: 0.02 },
};

// ------------------------------------------------------------------------------------- defaults
const SCHEMES = {
  red: [0xd3201f, 0xffffff, 0xffd83a], redGold: [0xc4161c, 0xffe03a, 0xffffff], yellow: [0xffd21c, 0xc8161c, 0xc8161c],
  yellowBlack: [0xffcf1a, 0x16130f, 0xd81e1e], green: [0x0f8a43, 0xffffff, 0xffe03a], blue: [0x1557c0, 0xffffff, 0xffd83a],
  white: [0xf0efe8, 0xd3201f, 0x1557c0], orange: [0xf26a1b, 0xffffff, 0xfff0a0], black: [0x15130f, 0xffd24a, 0xd3201f],
};
const SCHEME_KEYS = Object.keys(SCHEMES);
const TRADES = [
  { re: /药|医|诊|口腔|牙/, schemes: ['green', 'white'], picto: 'cross' },
  { re: /快递|驿站|物流|寄|邮/, schemes: ['blue', 'orange', 'white'], picto: 'parcel' },
  { re: /发廊|美发|理发|造型/, schemes: ['black', 'red', 'white'], picto: 'scissors' },
  { re: /麻辣|川|湘|辣|火锅|烧烤/, schemes: ['red', 'redGold', 'yellow', 'black'], picto: 'chili', photo: 'mala' },
  { re: /肠粉|粥/, schemes: ['red', 'redGold', 'green', 'yellow'], picto: 'bowl', photo: 'changfen' },
  { re: /饭|快餐|烧腊|猪脚/, schemes: ['red', 'redGold', 'yellow', 'orange'], picto: 'bowl', photo: 'rice' },
  { re: /面|粉|馄饨|饺|小吃|糖水/, schemes: ['red', 'redGold', 'yellow', 'green'], picto: 'bowl', photo: 'noodle' },
  { re: /足浴|按摩|推拿/, schemes: ['green', 'yellowBlack', 'red'], picto: 'foot' },
  { re: /住宿|旅|宾馆|公寓|宿/, schemes: ['white', 'red', 'blue'], picto: 'bed' },
  { re: /酒|啤/, schemes: ['black', 'red', 'orange'], picto: 'beer' },
  { re: /茶|饮|奶|士多|便利|超市|商店|冰室/, schemes: ['blue', 'green', 'red', 'orange'], picto: 'cup' },
  { re: /电|手机|维修/, schemes: ['blue', 'yellowBlack', 'white'], picto: 'bolt' },
];
const FONT_W = [['hei', 40], ['heavy', 18], ['kai', 10], ['wei', 12], ['li', 6], ['song', 6], ['round', 8]];
const NEON_COLS = [0xff3348, 0xff4fa8, 0x3dff88, 0xffd84a, 0x8fd8ff, 0xff8a2a];
const phoneNumber = (r) => (r.chance(0.7)
  ? `1${r.pick([38, 36, 59, 88, 37, 35, 50, 89])}-${String(r.int(0, 9999)).padStart(4, '0')}-${String(r.int(0, 9999)).padStart(4, '0')}`
  : `0755-2${r.int(100, 999)} ${String(r.int(0, 9999)).padStart(4, '0')}`);

export function defaultSignSpec(kind, text = '', rng = new RNG(1), hint = {}) {
  const r = rng, n = Math.max(1, Array.from(String(text)).length);
  const trade = TRADES.find((t) => t.re.test(text)) || {};
  let [bg, fg, accent] = SCHEMES[r.pick(trade.schemes || SCHEME_KEYS)];
  const fgPick = r.next();
  if (hint.bg !== undefined) {
    const light = luma(hint.bg) > 0.3;
    bg = hint.bg; fg = light ? (fgPick < 0.6 ? 0xd3201f : 0x16130f) : 0xffffff; accent = light ? 0xd3201f : 0xffd83a;
  }
  const storybook = hint.storybook !== false;
  const b = {
    kind, text: String(text), sub: '', seed: r.int(1, 1e9), bg, fg, accent, storybook,
    font: r.weighted(FONT_W, (f) => f[1])[0],
    wear: storybook ? 0.06 : +r.range(0.15, 0.6).toFixed(2),
    faded: storybook ? 0 : (r.chance(0.25) ? +r.range(0.3, 0.7).toFixed(2) : 0),
    dead: storybook ? null : (r.chance(0.12) ? +r.next().toFixed(2) : null),
    flicker: 0, emit: 1,
    casing: storybook ? 0x624432 : r.pick([0x54585c, 0x3c3f43, 0xc9c8c0]),
    trimColor: storybook ? 0xe2ca9d : r.pick([0xb4b7ba, 0xa0a4a8, 0x8f9296]),
  };
  const effect = storybook ? 'none' : r.pick(['stroke', 'shadow', 'both', 'none']);
  const light = storybook ? 'led' : r.weighted([['tubes', 7], ['led', 3]], (f) => f[1])[0];
  switch (kind) {
    case 'lightbox': return {
      ...b, w: 3.4, h: 0.9, depth: 0.18, layout: r.pick(['stack', 'stack', 'side', 'band', 'plain']), effect, light,
      badge: trade.photo && r.chance(0.5) ? 'photo' : r.pick(['logo', 'none', 'none']), photo: trade.photo || r.pick(DISHES),
      photoRight: r.chance(0.3), pictogram: r.chance(0.5) ? trade.picto : undefined, logo: '', tags: [], latin: '',
      phone: storybook ? '' : (r.chance(0.6) ? phoneNumber(r) : ''), phoneLabel: r.pick(['订餐电话', '电话', 'TEL']),
      sideNote: '',
    };
    case 'vertical': return {
      ...b, w: 0.6, h: Math.min(4, Math.max(1.6, n * 0.56 + 0.5)), depth: 0.16, standoff: +r.range(0.2, 0.6).toFixed(2),
      top: '', bottom: '', charBox: r.pick(['none', 'none', 'none', 'circle', 'square']), effect, light,
      pictogram: r.chance(0.25) ? trade.picto : undefined,
    };
    case 'neon': {
      const vertical = !!hint.vertical, c = r.shuffle(NEON_COLS), picto = hint.pictogram ?? (r.chance(0.5) ? trade.picto : undefined);
      const len = n * 0.56 + (picto ? 0.7 : 0) + 0.45;
      return {
        ...b, w: vertical ? 0.75 : len, h: vertical ? len : 0.8, vertical, fg: c[0], accent: c[1], pictoColor: c[2], pictogram: picto,
        border: 'single', tubeStyle: 'single', font: 'hei', backing: 0x16171a, dead: null,
      };
    }
    case 'led': return { ...b, w: 2.4, h: 0.2, depth: 0.07, fg: r.weighted([[0xff2a1a, 6], [0xffa21a, 2], [0x38ff5a, 1]], (f) => f[1])[0], rows: 16, speed: 34 };
    case 'plaque': {
      const style = hint.style || 'door';
      if (style === 'door') return { ...b, style, w: 0.36, h: 0.24, bg: storybook ? 0x2c5c8f : 0x1546b0, fg: 0xffffff, note: '', font: 'hei', emit: 0 };
      if (style === 'lit') return { ...b, style, w: 0.7, h: 0.32, depth: 0.05, effect: 'none' };
      return { ...b, style, w: n > 6 ? 0.36 : 0.6, h: n > 6 ? 0.62 : 0.4, fg: style === 'steel' ? 0x16130f : 0x2a1a08, accent: 0xa81a14, font: r.pick(['song', 'kai', 'hei']), emit: 0 };
    }
    case 'banner': return { ...b, w: Math.max(3, n * 0.42), h: 0.7, bg: 0xc8141a, fg: r.chance(0.7) ? 0xffe24a : 0xffffff, font: r.pick(['song', 'hei', 'kai']), sag: 0.12, standoff: 0.08, emit: 0, wear: storybook ? 0.12 : 0.4 };
    case 'holo': return { ...b, w: 2.2, h: 1.0, fg: 0x58e6ff, accent: 0xffc21a, font: 'hei', pictogram: trade.picto || 'bolt', note: '', standoff: 0.3, twoSided: false, emit: 0.7 };
    case 'screen': {
      const page = (k) => ({ title: String(text), tag: k ? '热卖' : '新品', sub: '', brand: '', price: '', pictogram: trade.picto || 'cup', bg: k ? accent : bg, fg: 0xffffff, accent: k ? bg : accent });
      return { ...b, w: 0.9, h: 1.6, depth: 0.07, font: 'heavy', pages: [page(0), page(1)] };
    }
    default: throw new Error(`[signs] unknown sign kind "${kind}"`);
  }
}
function resolveSpec(spec, rng, storybook = true) {
  const hint = spec.storybook === undefined ? { ...spec, storybook } : spec;
  const s = defaultSignSpec(spec.kind, spec.text ?? '', rng, hint);
  for (const k in spec) if (spec[k] !== undefined) s[k] = spec[k];
  return s;
}

// ------------------------------------------------------------------------------------- materials
const DECAL = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
const metalTexture = () => cached('signs:metalTex', () => {
  const c = paintPixels(128, (u, v) => {
    const g = 210 + 30 * noise2D(u * 96, 0.5, 5, 96) + 20 * (fbm2D(u * 8, v * 8, 3, 9, 8) - 0.5);
    return [g, g, g, 255];
  });
  const map = canvasTexture(c, { repeat: true });
  map.repeat.set(2, 2);
  return map;
});
const frameMaterial = (mode) => cached(`signs:frameMat:${mode}`, () => litMaterial({
  map: mode === 'lit' ? undefined : metalTexture(),
  vertexColors: true,
  roughness: mode === 'lit' ? 0.78 : 0.46,
  metalness: mode === 'lit' ? 0.08 : 0.3,
  grid: false,
}));
const matteMaterial = (mode) => cached(`signs:matteMat:${mode}`, () => litMaterial({
  map: mode === 'lit' ? undefined : metalTexture(),
  vertexColors: true,
  roughness: 0.92,
  metalness: 0,
  grid: false,
}));
const HOLO_FRAG = /* glsl */ `
#ifdef USE_MAP
{
  float ht = uHoloTime + vHoloUv.z;
  float hy = vHoloUv.y * 85.0;
  float tick = floor(ht * 9.0);
  float tear = step(0.993, fract(sin(floor(hy) * 12.9898 + tick * 78.233) * 43758.5453));
  vec2 huv = vMapUv + vec2(tear * 0.004, 0.0);
  vec2 ca = vec2(0.0009 + 0.0005 * sin(ht * 0.9), 0.0);
  vec3 hc = vec3(texture2D(map, huv + ca).r, texture2D(map, huv).g, texture2D(map, huv - ca).b);
  float scan = mix(1.0, 0.64 + 0.36 * sin(hy * 6.2832 - ht * 2.0), clamp(1.0 - fwidth(hy) * 1.3, 0.0, 1.0));
  float sweep = exp(-pow((vHoloUv.y - (mod(ht * 0.22, 3.2) - 0.5)) / 0.07, 2.0));
  float shimmer = 0.9 + 0.1 * sin(ht * 1.7 + vHoloUv.x * 3.0);
  float drop = 1.0 - 0.3 * step(0.975, fract(sin(tick * 3.17) * 917.3));
  diffuseColor.rgb *= hc * (scan * shimmer * drop * (1.0 + 0.7 * sweep));
}
#endif
`;
function holoMaterial(map, intensity) {
  const m = glowMaterial({ map, intensity, additive: true, vertexColors: true });
  const u = { uHoloTime: { value: 0 } };
  m.userData.holo = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 holoUv;\nvarying vec3 vHoloUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvHoloUv = holoUv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHoloTime;\nvarying vec3 vHoloUv;')
      .replace('#include <map_fragment>', HOLO_FRAG);
  };
  m.customProgramCacheKey = () => 'signs-holo';
  return m;
}

// ------------------------------------------------------------------------------------- geometry helpers
const _c = new THREE.Color(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), SIDE = new THREE.Vector3(1, 0, 0);
const lin = (hex, k = 1) => { _c.set(hex); return [_c.r * k, _c.g * k, _c.b * k]; };
const mix = (a, b, t) => a + (b - a) * t;

function rod(g, a, b, t, color) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
  const L = _a.distanceTo(_b);
  const m = new THREE.Matrix4().lookAt(_a, _b, Math.abs(_b.y - _a.y) > L * 0.98 ? SIDE : UP);
  m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  g.box(0, 0, 0, t, t, L, { m, color });
}
function trimRing(g, w, h, tr, z, color, dir = 1, lip = 0.012) {
  const zc = dir * (z + lip - 0.01), o = { color };
  g.box(0, h / 2 - tr / 2, zc, w, tr, 0.02, o); g.box(0, -h / 2 + tr / 2, zc, w, tr, 0.02, o);
  g.box(-w / 2 + tr / 2, 0, zc, tr, h - tr * 2, 0.02, o); g.box(w / 2 - tr / 2, 0, zc, tr, h - tr * 2, 0.02, o);
}
function faceQuad(g, face, w, h, z, color, back = false) {
  const x = back ? -w / 2 : w / 2;
  g.quad([-x, -h / 2, z], [x, -h / 2, z], [x, h / 2, z], [-x, h / 2, z], { uv: face.uv, color });
}

function packFaces(faces, S) {
  const pages = [];
  const order = [...faces].sort((a, b) => Math.max(b.pw, b.ph) - Math.max(a.pw, a.ph) || b.pw * b.ph - a.pw * a.ph);
  for (const f of order) {
    const w = f.pw + f.pad * 2, h = f.ph + f.pad * 2;
    let best = null;
    for (const pg of pages) {
      pg.free.forEach((r, i) => {
        if (r.w < w || r.h < h) return;
        const score = Math.min(r.w - w, r.h - h);
        if (!best || score < best.score) best = { pg, i, score };
      });
      if (best) break;
    }
    if (!best) { const pg = { i: pages.length, free: [{ x: 0, y: 0, w: S, h: S }] }; pages.push(pg); best = { pg, i: 0 }; }
    const r = best.pg.free.splice(best.i, 1)[0], dw = r.w - w, dh = r.h - h;
    f.page = best.pg.i; f.px = r.x + f.pad; f.py = r.y + f.pad;
    if (dw > dh) best.pg.free.push({ x: r.x + w, y: r.y, w: dw, h: r.h }, { x: r.x, y: r.y + h, w, h: dh });
    else best.pg.free.push({ x: r.x + w, y: r.y, w: dw, h }, { x: r.x, y: r.y + h, w: r.w, h: dh });
  }
  return pages.length;
}

// ------------------------------------------------------------------------------------- per-kind builders
const BUILD = {
  lightbox(kit, r, L, F, M) {
    const s = r.spec, tr = KIND.lightbox.trim, d = s.depth;
    M.at(r.x, r.y, r.z, r.rotY, (g) => g.box(0, 0, d / 2, s.w - 0.006, s.h - 0.006, d, { color: s.casing, colors: { py: 0x3b2c22 }, skip: 'nz,pz' }));
    F.at(r.x, r.y, r.z, r.rotY, (g) => {
      trimRing(g, s.w, s.h, tr, d, s.trimColor);
      for (const lx of r.lamps || []) {
        const x = lx - s.w / 2 + tr, y = s.h / 2;
        rod(g, [x, y - 0.02, d * 0.5], [x, y + 0.16, d + 0.12], 0.016, 0x2a2c2e);
        rod(g, [x, y + 0.16, d + 0.12], [x, y + 0.13, d + 0.4], 0.016, 0x2a2c2e);
        g.box(x, y + 0.1, d + 0.42, 0.1, 0.07, 0.13, { color: 0x34363a });
      }
    });
    kit._glow(r, L, r.faces.a.page).at(r.x, r.y, r.z, r.rotY, (g) => {
      faceQuad(g, r.faces.a, s.w - tr * 2, s.h - tr * 2, d + 0.002, r.k);
      for (const lx of r.lamps || []) {
        const x = lx - s.w / 2 + tr, y = s.h / 2 + 0.064, z = d + 0.42;
        g.quad([x - 0.04, y, z - 0.055], [x + 0.04, y, z - 0.055], [x + 0.04, y, z + 0.055], [x - 0.04, y, z + 0.055], { uv: kit._white.uv, color: lin(0xffe2b0, 5) });
      }
    });
  },
  vertical(kit, r, L, F, M) {
    const s = r.spec, tr = KIND.vertical.trim, d = s.depth, so = s.standoff;
    const T = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(0, 0, so + s.w / 2);
    M.at(r.x, r.y, r.z, r.rotY, (g) => g.with(T, () => g.box(0, 0, 0, s.w - 0.006, s.h - 0.006, d, { color: s.casing, colors: { py: 0x3b2c22 }, skip: 'pz,nz' })));
    F.at(r.x, r.y, r.z, r.rotY, (g) => g.with(T, () => {
      trimRing(g, s.w, s.h, tr, d / 2, s.trimColor, 1); trimRing(g, s.w, s.h, tr, d / 2, s.trimColor, -1);
      const iron = 0x4b4640;
      for (const by of [s.h * 0.34, -s.h * 0.34]) {
        g.box(s.w / 2 + so / 2, by, 0, so, 0.04, 0.04, { color: iron });
        g.box(s.w / 2 + so - 0.006, by, 0, 0.012, 0.18, 0.12, { color: iron });
      }
      if (!s.storybook) {
        rod(g, [-s.w / 2 + 0.05, s.h / 2, 0], [s.w / 2 + so, s.h / 2 + Math.min(0.7, 0.3 + s.w * 0.5), 0], 0.008, 0x6a6c6e);
        rod(g, [s.w / 2, -s.h * 0.34 - 0.02, 0.05], [s.w / 2 + so, -s.h * 0.34 - 0.3, 0.05], 0.014, 0x1a1a1a);
      }
    }));
    kit._glow(r, L, r.faces.a.page).at(r.x, r.y, r.z, r.rotY, (g) => g.with(T, () => {
      faceQuad(g, r.faces.a, s.w - tr * 2, s.h - tr * 2, d / 2 + 0.002, r.k);
      faceQuad(g, r.faces.a, s.w - tr * 2, s.h - tr * 2, -d / 2 - 0.002, r.k, true);
    }));
  },
  neon(kit, r, L, F, M) {
    const s = r.spec, bd = 0.03, off = 0.04;
    M.at(r.x, r.y, r.z, r.rotY, (g) => {
      g.box(0, 0, bd / 2, s.w, s.h, bd, { color: s.backing, skip: 'nz' });
      trimRing(g, s.w, s.h, 0.018, bd, 0x2c2e32, 1, 0.014);
      g.box(s.w / 2 - 0.13, -s.h / 2 + 0.06, bd + 0.022, 0.17, 0.06, 0.044, { color: 0x24262a });
    });
    F.at(r.x, r.y, r.z, r.rotY, (g) => {
      for (const [u, v] of (r.posts || []).slice(0, 30)) g.box((u - 0.5) * s.w, (0.5 - v) * s.h, bd + off / 2, 0.007, 0.007, off, { color: 0xc8c8c0, skip: 'pz,nz' });
    });
    L('neon', r.faces.a.page).at(r.x, r.y, r.z, r.rotY, (g) => faceQuad(g, r.faces.a, s.w, s.h, bd + 0.003, [0.22, 0.22, 0.22]));
    kit._glow(r, L, r.faces.a.page, 'neon').at(r.x, r.y, r.z, r.rotY, (g) => faceQuad(g, r.faces.a, s.w, s.h, bd + off, r.k));
  },
  led(kit, r, L, F, M) {
    const s = r.spec, d = s.depth, tr = 0.012, fw = s.w - tr * 2, fh = s.h - tr * 2, b = r.band;
    M.at(r.x, r.y, r.z, r.rotY, (g) => {
      g.box(0, 0, d / 2, s.w, s.h, d, { color: 0x0e0f11, skip: 'nz' });
      trimRing(g, s.w, s.h, tr, d, 0x1e2024, 1, 0.006);
    });
    const u0 = b.phase / LED_W, v1 = 1 - b.y / kit._ledH, v0 = 1 - (b.y + b.rows) / kit._ledH;
    kit._ledB.at(r.x, r.y, r.z, r.rotY, (g) => g.quad([-fw / 2, -fh / 2, d + 0.001], [fw / 2, -fh / 2, d + 0.001], [fw / 2, fh / 2, d + 0.001], [-fw / 2, fh / 2, d + 0.001], { uv: [u0, v0, u0 + b.cols / LED_W, v1] }));
    kit._ledUv1.push(0, 0, b.cols, 0, b.cols, b.rows, 0, b.rows);
  },
  plaque(kit, r, L, F, M) {
    const s = r.spec;
    if (s.style === 'lit') {
      const d = s.depth, tr = KIND.plaque.trim;
      M.at(r.x, r.y, r.z, r.rotY, (g) => g.box(0, 0, d / 2, s.w - 0.004, s.h - 0.004, d, { color: s.casing, skip: 'nz,pz' }));
      F.at(r.x, r.y, r.z, r.rotY, (g) => trimRing(g, s.w, s.h, tr, d, s.trimColor, 1, 0.006));
      kit._glow(r, L, r.faces.a.page).at(r.x, r.y, r.z, r.rotY, (g) => faceQuad(g, r.faces.a, s.w - tr * 2, s.h - tr * 2, d + 0.002, r.k));
      return;
    }
    M.at(r.x, r.y, r.z, r.rotY, (g) => g.box(0, 0, 0.004, s.w + 0.004, s.h + 0.004, 0.008, { color: s.style === 'door' ? 0x26486e : 0x4a4436, skip: 'nz,pz' }));
    L('plate', r.faces.a.page).at(r.x, r.y, r.z, r.rotY, (g) => faceQuad(g, r.faces.a, s.w, s.h, 0.0085));
  },
  banner(kit, r, L, F) {
    const s = r.spec, n = Math.max(8, Math.round(s.w / 0.3)), rr = new RNG(s.seed), ph = rr.range(0, 6.28);
    const A = r.faces.a.uv, B = r.faces.b.uv;
    const P = (t, top) => [
      (t - 0.5) * s.w, (top ? s.h / 2 : -s.h / 2) - s.sag * 4 * t * (1 - t) * (top ? 1 : 1.15),
      s.standoff + 0.05 * Math.sin(t * Math.PI) * (top ? 0.5 : 1.4) + 0.014 * Math.sin(t * 21 + ph + (top ? 0 : 1.1)),
    ];
    L('cloth', r.faces.a.page).at(r.x, r.y, r.z, r.rotY, (g) => {
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, a = P(t0, false), b = P(t1, false), c = P(t1, true), d = P(t0, true);
        g.quad(a, b, c, d, { uv: [mix(A[0], A[2], t0), A[1], mix(A[0], A[2], t1), A[3]] });
        g.quad(b, a, d, c, { uv: [mix(B[0], B[2], t0), B[1], mix(B[0], B[2], t1), B[3]] });
      }
    });
    F.at(r.x, r.y, r.z, r.rotY, (g) => {
      for (const [t, top] of [[0, true], [0, false], [1, true], [1, false]]) {
        const p = P(t, top), sx = t ? 1 : -1;
        rod(g, p, [p[0] + sx * 0.32, p[1] + (top ? 0.1 : -0.06), 0.012], 0.007, 0xd8d2c0);
        g.box(p[0] + sx * 0.32, p[1] + (top ? 0.1 : -0.06), 0.012, 0.03, 0.03, 0.024, { color: 0x6a6c6e });
      }
    });
  },
  holo(kit, r, L, F, M) {
    const s = r.spec, z = s.standoff, by = -s.h / 2 - 0.05, H = kit._holo(r.faces.a.page), phase = (s.seed % 97) * 0.13;
    M.at(r.x, r.y, r.z, r.rotY, (g) => {
      g.box(0, by, z, s.w * 0.72, 0.045, 0.09, { color: 0x1c1e22 });
      for (const x of [-s.w * 0.3, s.w * 0.3]) g.box(x, by, z / 2, 0.03, 0.03, z, { color: 0x2c2e32 });
    });
    L('glow', kit._white.page).at(r.x, r.y, r.z, r.rotY, (g) => {
      const y = by + 0.0235, hw = s.w * 0.34;
      g.quad([-hw, y, z + 0.012], [hw, y, z + 0.012], [hw, y, z - 0.012], [-hw, y, z - 0.012], { uv: kit._white.uv, color: lin(s.fg, 3) });
    });
    for (const back of s.twoSided ? [false, true] : [false]) {
      H.g.at(r.x, r.y, r.z, r.rotY, (g) => faceQuad(g, r.faces.a, s.w, s.h, z, r.k, back));
      H.uv.push(0, 0, phase, s.w, 0, phase, s.w, s.h, phase, 0, s.h, phase);
    }
  },
  screen(kit, r, L, F, M) {
    const s = r.spec, d = s.depth, tr = KIND.screen.trim, fw = s.w - tr * 2, fh = s.h - tr * 2;
    M.at(r.x, r.y, r.z, r.rotY, (g) => g.box(0, 0, d / 2, s.w, s.h, d, { color: 0x121316, skip: 'nz' }));
    L('glow', r.faces.a.page).at(r.x, r.y, r.z, r.rotY, (g) => {
      faceQuad(g, r.faces.a, fw, fh, d + 0.001, r.k);
      const x = s.w / 2 - tr * 1.5, y = -s.h / 2 + tr / 2, e = 0.004;
      g.quad([x - e, y - e, d + 0.001], [x + e, y - e, d + 0.001], [x + e, y + e, d + 0.001], [x - e, y + e, d + 0.001], { uv: kit._white.uv, color: lin(0x30ff60, 4) });
    });
    L('screenB', r.faces.b.page).at(r.x, r.y, r.z, r.rotY, (g) => faceQuad(g, r.faces.b, fw, fh, d + 0.0025, r.k));
  },
};

// ------------------------------------------------------------------------------------- SignKit
export class SignKit {
  /**
   * opts: { rng, density = 1, mode = 'lit' ('lit' | 'glow'), storybook = true, glow = 1, emit = 1 }
   */
  constructor({ rng, density = 1, mode = 'lit', storybook = true, glow = 1, emit = 1 } = {}) {
    this.rng = (rng || new RNG(7)).fork('signkit');
    this.density = density;
    this.mode = mode;
    this.storybook = storybook;
    this.glowScale = glow;
    this.emitScale = emit * glow;
    this.emitters = []; this.signs = []; this.pages = []; this.stats = {};
    this._faces = new Map(); this._bands = []; this._flick = []; this._group = null; this._time = 0;
    const wc = makeCanvas(8, 8); wc.ctx.fillStyle = '#fff'; wc.ctx.fillRect(0, 0, 8, 8);
    this._white = this._face('white', wc.canvas, 4);
  }

  _face(key, canvas, pad = 4) {
    let f = this._faces.get(key);
    if (!f) this._faces.set(key, (f = { key, canvas, pw: canvas.width, ph: canvas.height, pad, page: 0, uv: null }));
    return f;
  }

  _paint(s, fw, fh, pad = 4) {
    const ppm = Math.min(KIND[s.kind].ppm * this.density, (ATLAS - 2 * pad - 2) / Math.max(fw, fh));
    const { standoff, depth, flicker, emit, casing, trimColor, backing, twoSided, sag, ...look } = s;
    const ps = { ...look, w: fw, h: fh }, key = JSON.stringify(ps) + ppm.toFixed(1);
    let p = this._faces.get(key + '#meta');
    if (!p) {
      const out = paintSign(ps, ppm);
      p = { a: this._face(key, out.canvas, pad), b: out.canvasB ? this._face(key + '#b', out.canvasB, pad) : null, posts: out.posts, lamps: out.lamps, col: dominantColor(out.canvas) };
      this._faces.set(key + '#meta', p);
    }
    return p;
  }

  add(spec, { x = 0, y = 3, z = 0, rotY = 0 } = {}) {
    if (this._group) throw new Error('[signs] add() after build()');
    const s = resolveSpec(spec, this.rng.fork(`${spec.kind}|${spec.text}|${this.signs.length}`), this.storybook);
    const K = KIND[s.kind], r = { spec: s, x, y, z, rotY, faces: null, k: null, emitter: null };
    const litLayer = this.mode === 'lit' && (s.kind === 'lightbox' || s.kind === 'vertical' || (s.kind === 'plaque' && s.style === 'lit'));
    const g = litLayer ? 1 : (K.glow || 1) * (s.light === 'spot' ? 0.7 : 1);
    r.k = s.flicker > 0 || litLayer ? [1, 1, 1] : [g, g, g];
    r.glow = g;
    let col = null, off = (s.depth || 0.03) + 0.55, omni = false, area = s.w * s.h;
    if (s.kind === 'led') {
      const fh = s.h - 0.024, pitch = fh / s.rows, cols = Math.min(LED_W, Math.round((s.w - 0.024) / pitch));
      r.band = { text: s.text, rows: s.rows, cols, color: s.fg, phase: this.rng.int(0, LED_W - 1), y: 0, speed: s.speed };
      this._bands.push(r.band);
      col = { hex: s.fg, energy: 0.1 };
    } else {
      const tr = s.kind === 'plaque' && s.style !== 'lit' ? 0 : (K.trim || 0);
      const p = this._paint(s, s.w - tr * 2, s.h - tr * 2, s.kind === 'holo' ? 10 : 4);
      r.faces = p; r.posts = p.posts; r.lamps = p.lamps;
      const unlit = s.kind === 'banner' || (s.kind === 'plaque' && s.style !== 'lit');
      if (!unlit) col = p.col;
      if (s.kind === 'vertical') { off = s.standoff + s.w / 2; omni = true; }
      if (s.kind === 'neon') area *= 0.6;
      if (s.kind === 'holo') off = s.standoff + 0.45;
    }
    if (col && s.emit > 0) r.emitter = this._emit(r, col, area, off, omni);
    this.signs.push(r);
    return { emitter: r.emitter, w: s.w, h: s.h, spec: s };
  }

  _emit(r, col, area, off, omni) {
    const s = r.spec, nx = Math.sin(r.rotY), nz = Math.cos(r.rotY), tx = Math.cos(r.rotY), tz = -Math.sin(r.rotY);
    const linear = !omni && s.w > 1.6, eff = linear ? s.h * 2 : area;
    const e = {
      x: r.x + nx * off, z: r.z + nz * off, y: r.y, color: col.hex,
      intensity: +Math.min(1.6, Math.max(0.04, 1.5 * eff * col.energy * (r.glow / 2) * s.emit * this.emitScale)).toFixed(3),
      radius: +Math.min(11, Math.max(4, 4 + 2.3 * Math.sqrt(area))).toFixed(1),
    };
    if (!omni) { e.nx = nx; e.nz = nz; }
    if (linear) { const hl = s.w / 2 - 0.35; e.x2 = e.x + tx * hl; e.z2 = e.z + tz * hl; e.x -= tx * hl; e.z -= tz * hl; }
    this.emitters.push(e);
    return e;
  }

  _glow(r, L, page, layer = 'glow') {
    if (!(r.spec.flicker > 0) || this.mode === 'lit') return L(layer, page);
    const f = { g: new GeoBuilder(), page, layer, base: r.glow * this.glowScale, amount: r.spec.flicker, next: 0, until: 0, rng: new RNG(r.spec.seed), mat: null };
    this._flick.push(f);
    return f.g;
  }
  _holo(page) {
    let h = this._holos.get(page);
    if (!h) this._holos.set(page, (h = { g: new GeoBuilder(), uv: [] }));
    return h;
  }

  build() {
    if (this._group) return this._group;
    const group = this._group = new THREE.Group();
    group.name = 'signs';
    const faces = [...this._faces.values()].filter((f) => f.canvas);
    const nPages = packFaces(faces, ATLAS);
    const cv = Array.from({ length: nPages }, () => { const c = makeCanvas(ATLAS); c.ctx.fillStyle = '#000'; c.ctx.fillRect(0, 0, ATLAS, ATLAS); return c; });
    for (const f of faces) {
      const { ctx } = cv[f.page], { px: x, py: y, pw: w, ph: h, pad: p, canvas: c } = f;
      ctx.drawImage(c, 0, 0, 1, h, x - p, y, p, h); ctx.drawImage(c, w - 1, 0, 1, h, x + w, y, p, h);
      ctx.drawImage(c, 0, 0, w, 1, x, y - p, w, p); ctx.drawImage(c, 0, h - 1, w, 1, x, y + h, w, p);
      ctx.drawImage(c, x, y);
      f.uv = [x / ATLAS, 1 - (y + h) / ATLAS, (x + w) / ATLAS, 1 - y / ATLAS];
      f.canvas = null;
    }
    const wf = this._white; { const cx = (wf.uv[0] + wf.uv[2]) / 2, cy = (wf.uv[1] + wf.uv[3]) / 2; wf.uv = [cx, cy, cx, cy]; }
    this.pages = cv.map((c, i) => ({ canvas: c.canvas, texture: Object.assign(canvasTexture(c.canvas, { aniso: 16 }), { name: `signAtlas${i}` }) }));
    let ly = 1;
    for (const b of this._bands) { b.y = ly; ly += b.rows + 2; }
    this._ledH = Math.max(4, ly);
    this._ledB = new GeoBuilder(); this._ledUv1 = []; this._holos = new Map();
    const layers = new Map(), F = new GeoBuilder(), M = new GeoBuilder();
    const L = (name, page) => { const k = `${name}:${page}`; let g = layers.get(k); if (!g) layers.set(k, (g = new GeoBuilder())); return g; };
    for (const r of this.signs) BUILD[r.spec.kind](this, r, L, F, M);
    const add = (g, mat, name) => { const m = g.mesh(mat, name); if (m) group.add(m); return m; };
    this._mats = [];
    const mk = (m) => { this._mats.push(m); return m; };
    this._screenMats = [];
    for (const [key, g] of layers) {
      const [name, pi] = key.split(':'), map = this.pages[+pi].texture;
      let mat;
      if (name === 'glow') {
        mat = this.mode === 'lit'
          ? litMaterial({ map, roughness: 0.92, metalness: 0, selfLit: 0.12, grid: false, ...DECAL })
          : glowMaterial({ map, intensity: this.glowScale, vertexColors: true, ...DECAL });
      }
      else if (name === 'neon') mat = glowMaterial({ map, intensity: this.glowScale, vertexColors: true, additive: true, ...DECAL });
      else if (name === 'plate') mat = litMaterial({ map, roughness: 0.65, metalness: 0.08, selfLit: this.mode === 'lit' ? 0.08 : 0, grid: false, ...DECAL });
      else if (name === 'cloth') mat = litMaterial({ map, roughness: 0.9, grid: false });
      else { mat = glowMaterial({ map, intensity: this.glowScale, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, ...DECAL, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }); this._screenMats.push(mat); }
      const m = add(g, mk(mat), `signs:${key}`);
      if (m) {
        if (this.mode === 'lit' && (name === 'glow' || name === 'plate' || name === 'cloth')) m.receiveShadow = true;
        if (name === 'neon' || name === 'screenB') m.renderOrder = 2;
      }
    }
    const frameMesh = add(F, frameMaterial(this.mode), 'signs:frames');
    if (frameMesh) frameMesh.castShadow = frameMesh.receiveShadow = true;
    const matteMesh = add(M, matteMaterial(this.mode), 'signs:matte');
    if (matteMesh) matteMesh.castShadow = matteMesh.receiveShadow = true;
    for (const f of this._flick) {
      const map = this.pages[f.page].texture;
      f.mat = mk(glowMaterial({ map, intensity: f.base, vertexColors: true, additive: f.layer === 'neon', ...DECAL }));
      const m = add(f.g, f.mat, 'signs:flicker'); if (m) m.renderOrder = 2;
    }
    this._holoMats = [];
    for (const [pi, h] of this._holos) {
      const mat = mk(holoMaterial(this.pages[pi].texture, this.glowScale));
      const m = add(h.g, mat, `signs:holo:${pi}`);
      m.geometry.setAttribute('holoUv', new THREE.Float32BufferAttribute(h.uv, 3));
      m.renderOrder = 3;
      this._holoMats.push(mat);
    }
    if (this._bands.length) {
      const lc = makeCanvas(LED_W, this._ledH);
      lc.ctx.fillStyle = '#000'; lc.ctx.fillRect(0, 0, LED_W, this._ledH);
      for (const b of this._bands) lc.ctx.drawImage(paintLedRow(b.text, b.rows, b.color, LED_W), 0, b.y);
      const t = this.ledTexture = canvasTexture(lc.canvas, { aniso: 4 });
      t.wrapS = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter;
      const dots = cached('signs:ledDots', () => { const d = canvasTexture(ledDotMask(32), { srgb: false, repeat: true }); d.channel = 1; return d; });
      const mat = this._ledMat = mk(glowMaterial({ map: t, intensity: KIND.led.glow * this.glowScale, ...DECAL }));
      mat.aoMap = dots; mat.aoMapIntensity = 1;
      const m = add(this._ledB, mat, 'signs:led');
      m.geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(this._ledUv1, 2));
      this._ledSpeed = this._bands.reduce((a, b) => a + b.speed, 0) / this._bands.length;
    }
    this.stats = { signs: this.signs.length, faces: faces.length, pages: nPages, meshes: group.children.length, emitters: this.emitters.length };
    return group;
  }

  update(dt, t) {
    this._time = t === undefined ? this._time + dt : t;
    if (!this._group) return;
    const T = this._time;
    if (this._ledMat) this._ledMat.map.offset.x = (Math.floor(T * this._ledSpeed) % LED_W) / LED_W;
    for (const f of this._flick) {
      if (T >= f.next) { f.until = T + f.rng.range(0.15, 0.9); f.next = f.until + f.rng.range(1.2, 6) / f.amount; }
      let k = 0.97 + 0.03 * Math.sin(T * 314);
      if (T < f.until) { const h = Math.sin(Math.floor(T * 26) * 91.7 + f.page) * 43758.5; k = h - Math.floor(h) < 0.45 ? 0.08 : 0.8; }
      setGlow(f.mat, f.base * k);
    }
    for (const m of this._holoMats || []) m.userData.holo.uHoloTime.value = T;
    if (this._screenMats && this._screenMats.length) {
      const p = (T % 10) / 10, sm = (a, b) => { const x = Math.min(1, Math.max(0, (p - a) / (b - a))); return x * x * (3 - 2 * x); };
      const o = sm(0.46, 0.5) - sm(0.96, 1);
      for (const m of this._screenMats) { m.opacity = o; m.visible = o > 0.003; }
    }
  }

  dispose() {
    for (const p of this.pages) p.texture.dispose();
    if (this.ledTexture) this.ledTexture.dispose();
    for (const m of this._mats || []) m.dispose();
    if (this._group) this._group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
