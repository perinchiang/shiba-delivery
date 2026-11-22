// Warm miniature city crossing: handcrafted architectural bridge between Old Street and the east gate.
import * as THREE from 'three';
import { placeInstances } from './kit-instances.js';
import { crossing } from './country-route.js';
import { cityTreePits, cityTreePitRadius, CURB_H } from './street-layout.js';
import { CITY_PALETTE as P } from './city-palette.js';
import { bake, box, cylinder, group, oval, piece, rod, sign } from './shapes.js';

const { Shape, ExtrudeGeometry } = THREE;

// Potted succulent/shrub echoing Old Street's shopfront planters.
function pottedPlant(parent, x, y, z, scale = 0.85, flowers = true) {
  const p = group(parent, x, y, z);
  p.scale.setScalar(scale);
  cylinder(p, 0, 0.22, 0, 0.24, 0.17, 0.44, P.terracotta, 12);
  cylinder(p, 0, 0.42, 0, 0.26, 0.24, 0.08, 0xe29d73, 12);
  cylinder(p, 0, 0.47, 0, 0.21, 0.21, 0.015, P.soil, 12);
  for (let i = 0; i < 6; i++) {
    const a = i * 2.4, r = 0.19 + (i % 2) * 0.05;
    const lx = Math.sin(a) * r, lz = Math.cos(a) * r;
    const leaf = oval(p, lx * 0.6, 0.62 + (i % 3) * 0.08, lz * 0.6,
      0.09, 0.25, 0.10, [0x619676, 0x87ad75, 0x477f63][i % 3]);
    leaf.rotation.set(lz * 2.3, 0, -lx * 2.3);
    if (flowers && i % 2 === 0) oval(p, lx, 0.84 + (i % 3) * 0.08, lz, 0.07, 0.06, 0.065, 0xf5bc67);
  }
}

// Old Street-style layered window facing local +Z (outward onto the street).
function layeredWindow(parent, x, y, w, h, shutterColor, { shutters = false, flowers = false, frameColor = P.trimCream } = {}) {
  box(parent, x, y, 0.04, w + 0.18, h + 0.18, 0.10, frameColor);
  box(parent, x, y, 0.095, w, h, 0.045, P.glass);
  box(parent, x - w * 0.23, y + h * 0.19, 0.122, w * 0.41, h * 0.48, 0.02, P.glassLight);
  box(parent, x + w * 0.23, y + h * 0.19, 0.122, w * 0.41, h * 0.48, 0.02, 0x7ca299);
  box(parent, x, y, 0.135, 0.06, h, 0.04, frameColor);
  box(parent, x, y - h * 0.10, 0.135, w, 0.055, 0.04, frameColor);
  box(parent, x, y - h / 2 - 0.06, 0.15, w + 0.28, 0.10, 0.26, P.trimWarm);
  if (shutters) {
    for (const s of [-1, 1]) {
      const sx = x + s * (w / 2 + 0.21);
      box(parent, sx, y, 0.075, 0.24, h + 0.04, 0.08, shutterColor);
      for (let j = -2; j <= 2; j++) {
        box(parent, sx, y + j * (h * 0.17), 0.12, 0.20, 0.032, 0.025, P.trimCream);
      }
    }
  }
  if (flowers) {
    box(parent, x, y - h / 2 + 0.06, 0.28, w * 0.72, 0.18, 0.22, P.terracotta);
    for (let k = -1; k <= 1; k++) {
      oval(parent, x + k * w * 0.21, y - h / 2 + 0.21, 0.28, 0.11, 0.11, 0.10, [0x619676, 0x7ca875, 0x4f8468][k + 1], true);
      if (k !== 0) oval(parent, x + k * w * 0.19, y - h / 2 + 0.29, 0.31, 0.045, 0.045, 0.045, 0xf6c36b);
    }
  }
}

// Scalloped striped fabric awning projecting outward (+Z), echoing Old Street.
function scallopedAwning(parent, width, y, stripeColor, depth = 1.15) {
  const count = Math.max(6, Math.round(width / 0.62));
  const step = width / count;
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) * step - width / 2;
    const tint = i % 2 ? P.trimCream : stripeColor;
    const slope = box(parent, x, y, depth * 0.52, step + 0.004, 0.075, depth, tint);
    slope.rotation.x = 0.22;
    box(parent, x, y - 0.20, depth * 1.01, step, 0.19, 0.06, tint);
    oval(parent, x, y - 0.30, depth * 1.01, step * 0.49, 0.075, 0.035, tint);
  }
  rod(parent, [-width / 2 + 0.12, y - 0.14, depth * 0.96], [width / 2 - 0.12, y - 0.14, depth * 0.96], 0.032, P.woodDark);
}

// Projecting timber/masonry balcony facing local +Z with vertical railing posts.
function balcony(parent, width, y, railColor, { plants = false } = {}) {
  box(parent, 0, y, 0.46, width, 0.14, 0.94, P.trimCream);
  box(parent, 0, y - 0.09, 0.44, width - 0.12, 0.07, 0.86, P.trimWarm);
  const railZ = 0.88;
  const posts = Math.max(4, Math.round(width / 0.55));
  for (let i = 0; i <= posts; i++) {
    const x = -width / 2 + 0.10 + (i / posts) * (width - 0.20);
    rod(parent, [x, y + 0.06, railZ], [x, y + 0.72, railZ], 0.030, railColor);
  }
  for (const s of [-1, 1]) {
    const sx = s * (width / 2 - 0.10);
    rod(parent, [sx, y + 0.72, 0.04], [sx, y + 0.72, railZ], 0.038, railColor);
    rod(parent, [sx, y + 0.34, 0.04], [sx, y + 0.34, railZ], 0.028, railColor);
  }
  rod(parent, [-width / 2 + 0.06, y + 0.72, railZ], [width / 2 - 0.06, y + 0.72, railZ], 0.044, railColor);
  rod(parent, [-width / 2 + 0.08, y + 0.34, railZ], [width / 2 - 0.08, y + 0.34, railZ], 0.028, railColor);
  if (plants) {
    pottedPlant(parent, -width * 0.30, y + 0.07, 0.48, 0.65, true);
    pottedPlant(parent, width * 0.30, y + 0.07, 0.48, 0.60, false);
  }
}

// Sloped jade-tiled Lingnan shopfront eave with warm wood brackets & optional lanterns.
function tiledEave(parent, width, y, tileColor = P.roofJade, { lanterns = false } = {}) {
  const eave = box(parent, 0, y, 0.66, width + 0.40, 0.12, 1.38, tileColor);
  eave.rotation.x = 0.24;
  // Subtle tile ridge ribs across the sloped eave
  const ribs = Math.max(8, Math.round(width / 0.58));
  const step = width / ribs;
  for (let i = 0; i <= ribs; i++) {
    const x = -width / 2 + i * step;
    const rib = box(parent, x, y + 0.06, 0.66, 0.07, 0.06, 1.38, P.teal);
    rib.rotation.x = 0.24;
  }
  box(parent, 0, y - 0.18, 1.31, width + 0.44, 0.11, 0.10, P.trimCream);
  const brackets = Math.max(3, Math.round(width / 2.8));
  for (let i = 0; i <= brackets; i++) {
    const x = -width / 2 + 0.45 + (i / brackets) * (width - 0.90);
    rod(parent, [x, y - 0.48, 0.06], [x, y - 0.16, 0.96], 0.040, P.wood);
  }
  if (lanterns) {
    const xs = width > 12 ? [-4.4, 0, 4.4] : [-2.8, 2.8];
    for (const x of xs) {
      rod(parent, [x, y - 0.18, 1.02], [x, y - 0.46, 1.02], 0.022, P.woodDark);
      cylinder(parent, x, y - 0.50, 1.02, 0.12, 0.16, 0.07, P.woodDark, 12);
      oval(parent, x, y - 0.74, 1.02, 0.22, 0.26, 0.22, P.lantern);
      cylinder(parent, x, y - 0.99, 1.02, 0.14, 0.11, 0.06, P.woodDark, 12);
      box(parent, x, y - 1.14, 1.02, 0.045, 0.22, 0.045, 0xe3b155);
    }
  }
}

// Ground-floor glazed shopfront bays (properly layered: wall behind, glass in front, mullions on top).
function shopfrontBays(parent, width, baseColor, {
  frameColor = P.trimCream,
  lattice = false,
  jadeTiles = false,
  arcade = false,
} = {}) {
  const bays = Math.max(3, Math.floor(width / 3.0));
  const step = width / bays;
  for (let i = 0; i < bays; i++) {
    const x = (i + 0.5) * step - width / 2;
    const winW = step - (arcade ? 0.56 : 0.40);
    // Wainscot kickplate (y = 0.28..1.02)
    box(parent, x, 0.65, 0.06, winW + 0.08, 0.74, 0.12, jadeTiles ? P.jadeTile : baseColor);
    if (jadeTiles) {
      const cols = Math.max(3, Math.round(winW / 0.42));
      for (let c = 1; c < cols; c++) {
        box(parent, x - winW / 2 + (c / cols) * winW, 0.65, 0.125, 0.022, 0.72, 0.015, P.trimCream);
      }
      box(parent, x, 0.65, 0.125, winW + 0.04, 0.022, 0.015, P.trimCream);
    }
    box(parent, x, 1.04, 0.10, winW + 0.14, 0.09, 0.20, frameColor);
    // Recessed glazed shop window (y = 1.08..2.86)
    box(parent, x, 1.98, 0.05, winW, 1.78, 0.08, P.glass);
    box(parent, x - winW * 0.23, 2.28, 0.095, winW * 0.40, 0.92, 0.02, P.glassLight);
    box(parent, x + winW * 0.23, 2.28, 0.095, winW * 0.40, 0.92, 0.02, 0x7aa299);
    // Mullions / lattice grilles cleanly IN FRONT of the glass
    if (lattice) {
      for (const dx of [-winW * 0.26, 0, winW * 0.26]) {
        rod(parent, [x + dx, 1.10, 0.12], [x + dx, 2.86, 0.12], 0.032, P.wood);
      }
      for (const dy of [1.62, 2.30]) {
        rod(parent, [x - winW / 2 + 0.06, dy, 0.12], [x + winW / 2 - 0.06, dy, 0.12], 0.032, P.wood);
      }
      box(parent, x, 2.86, 0.11, winW + 0.14, 0.10, 0.14, P.wood);
    } else {
      box(parent, x, 1.98, 0.11, 0.075, 1.78, 0.05, frameColor);
      box(parent, x, 1.70, 0.11, winW, 0.065, 0.05, frameColor);
    }
    // Pilasters between bays
    const pilasterW = arcade ? 0.44 : 0.28;
    const pilasterD = arcade ? 0.42 : 0.24;
    box(parent, x - step / 2 + pilasterW / 2 - 0.02, 1.72, pilasterD * 0.45, pilasterW, 3.10, pilasterD, frameColor);
    if (arcade) {
      box(parent, x - step / 2 + pilasterW / 2 - 0.02, 0.36, pilasterD * 0.48, pilasterW + 0.10, 0.38, pilasterD + 0.08, P.trimWarm);
    }
  }
  const endW = arcade ? 0.44 : 0.28;
  const endD = arcade ? 0.42 : 0.24;
  box(parent, width / 2 - endW / 2 + 0.02, 1.72, endD * 0.45, endW, 3.10, endD, frameColor);
  // Crisp ground-floor cornice belt
  box(parent, 0, 3.28, 0.28, width + 0.30, 0.22, 0.62, arcade ? P.trimCream : baseColor);
  box(parent, 0, 3.14, 0.56, width + 0.30, 0.08, 0.10, P.trimCream);
}

// Upper-floor facades with distinct per-building window styles and subtle cornice belts.
function upperFacade(parent, width, floors, accent, style = 'standard') {
  const bays = Math.max(2, Math.floor(width / 2.9));
  const step = width / bays;
  for (let f = 0; f < floors; f++) {
    const y = 4.92 + f * 2.75;
    for (let i = 0; i < bays; i++) {
      const x = (i + 0.5) * step - width / 2;
      const winW = style === 'heritage' ? step * 0.56 : step * 0.52;
      const winH = style === 'heritage' ? 1.62 : 1.48;
      layeredWindow(parent, x, y, winW, winH, accent, {
        shutters: style === 'cafe' || style === 'tea' || (style === 'residential' && (i + f) % 2 === 0),
        flowers: style === 'bookshop' || (style === 'cafe' && f === 0 && i % 2 === 1),
        frameColor: style === 'tea' || style === 'bookshop' ? P.trimWarm : P.trimCream,
      });
      if (style === 'heritage' && i < bays - 1) {
        box(parent, x + step / 2, y, 0.07, 0.24, 2.55, 0.16, P.trimCream);
      }
    }
    if (f < floors - 1) {
      box(parent, 0, y + 1.38, 0.12, width + 0.26, 0.14, 0.28, P.trimCream);
    }
  }
}

// Full-footprint pitched tiled roof built directly on the building group `b`.
function pitchedRoof(b, width, depth, h, roofColor, { dormer = false, chimney = false, ridgeAxis = 'x' } = {}) {
  const over = 0.48;
  const ridgeH = 1.65;
  const rw = width + over * 2;
  const rd = depth + over * 2;
  if (ridgeAxis === 'x') {
    const slopeLen = Math.hypot(rd / 2, ridgeH);
    const tilt = Math.atan2(ridgeH, rd / 2);
    for (const s of [-1, 1]) {
      const p = box(b, 0, h + ridgeH / 2 - 0.06, s * rd / 4, rw, 0.18, slopeLen + 0.12, roofColor);
      p.rotation.x = s * tilt;
      box(b, 0, h - 0.08, s * (rd / 2), rw + 0.06, 0.16, 0.16, P.trimCream);
    }
    // Gable fill triangles using stepped cream-framed gable blocks
    for (let k = 0; k < 5; k++) {
      const frac = (k + 0.5) / 5;
      const gw = depth * (1 - frac * 0.88);
      box(b, 0, h + frac * ridgeH * 0.85, 0, width - 0.06, ridgeH * 0.24, gw, P.wallCream);
    }
    box(b, 0, h + ridgeH + 0.02, 0, rw + 0.12, 0.20, 0.28, P.metalDark);
  } else {
    const slopeLen = Math.hypot(rw / 2, ridgeH);
    const tilt = Math.atan2(ridgeH, rw / 2);
    for (const s of [-1, 1]) {
      const p = box(b, s * rw / 4, h + ridgeH / 2 - 0.06, 0, slopeLen + 0.12, 0.18, rd, roofColor);
      p.rotation.z = -s * tilt;
      box(b, s * (rw / 2), h - 0.08, 0, 0.16, 0.16, rd + 0.06, P.trimCream);
    }
    for (let k = 0; k < 5; k++) {
      const frac = (k + 0.5) / 5;
      const gw = width * (1 - frac * 0.88);
      box(b, 0, h + frac * ridgeH * 0.85, 0, gw, ridgeH * 0.24, depth - 0.06, P.wallCream);
    }
    box(b, 0, h + ridgeH + 0.02, 0, 0.28, 0.20, rd + 0.12, P.metalDark);
  }
  if (dormer) {
    const d = group(b, 0, h + 0.65, depth * 0.22);
    box(d, 0, 0, 0, 2.2, 1.25, 1.8, P.wallCream);
    box(d, 0, 0.72, 0, 2.5, 0.18, 2.1, roofColor);
    layeredWindow(d, 0, 0.04, 1.1, 0.72, P.wood, { frameColor: P.trimCream });
  }
  if (chimney) {
    box(b, width * 0.26, h + ridgeH * 0.75, depth * 0.16, 0.68, 1.35, 0.68, P.terracottaDeep);
    box(b, width * 0.26, h + ridgeH * 0.75 + 0.72, depth * 0.16, 0.82, 0.14, 0.82, P.trimCream);
  }
}

// Per-corner bespoke architecture & storytelling props (all exterior elements at +Z).
function cornerShop(b, front, end, width, depth, h, name, accent) {
  if (name === '榕湾百货') {
    shopfrontBays(front, width, P.terracottaDeep, { arcade: true });
    shopfrontBays(end, depth, P.terracottaDeep, { arcade: true });
    // Showcase merchandise tucked behind the ground-floor arcade windows
    for (const x of [-4.0, 0, 4.0]) {
      for (let k = 0; k < 3; k++) {
        box(front, x + (k - 1) * 0.42, 1.45 + k * 0.14, 0.14, 0.32, 0.62, 0.10, [0xd4a466, 0xb87364, 0x7ca297][k]);
      }
    }
    // Wide fascia signboard on front
    box(front, 0, 3.74, 0.34, width * 0.78, 0.84, 0.42, P.terracottaDeep);
    sign(front, 0, 3.75, 0.56, width * 0.74, 0.70, name, { bg: '#f6e1b2', ink: '#345e56' });
    // Iconic vertical crimson blade sign on end (shifted clear of NW traffic signal arm!)
    const blade = group(end, 0.9, 6.75, 0.86);
    box(blade, 0, 0, 0, 1.24, 4.55, 0.36, P.terracottaDeep, 0.08);
    sign(blade, 0, 0, 0.195, 1.08, 4.36, name, { bg: '#a65748', ink: '#fff0c9', vertical: true });
    for (const y of [-1.50, 1.50]) {
      rod(end, [0.9, 6.75 + y, 0.04], [0.9, 6.75 + y, 0.74], 0.06, P.metalDark);
    }
    // Heritage stepped Art-Deco/Lingnan parapet crest framing the clock tower
    box(b, 0, h + 0.20, 0, width + 0.46, 0.30, depth + 0.46, P.trimCream);
    box(b, 0, h + 0.50, 0, width - 0.18, 0.42, depth - 0.18, P.terracottaDeep);
    box(b, 0, h + 0.76, 0, width + 0.12, 0.14, depth + 0.12, P.trimWarm);
    pottedPlant(end, -3.9, CURB_H, 1.15, 0.92, true);
    pottedPlant(front, -5.8, CURB_H, 1.05, 0.88, false);
  } else if (name === '南方冰室') {
    shopfrontBays(front, width, P.teal, { jadeTiles: true });
    shopfrontBays(end, depth, P.teal, { jadeTiles: true });
    scallopedAwning(front, width - 0.6, 2.94, P.teal, 1.18);
    scallopedAwning(end, depth - 0.6, 2.94, P.teal, 1.24);
    box(front, 0, 3.68, 0.30, width * 0.66, 0.80, 0.38, P.teal);
    sign(front, 0, 3.69, 0.50, width * 0.62, 0.66, name, { bg: '#f6e4b8', ink: '#2e635c' });
    box(end, 0, 3.68, 0.30, depth * 0.62, 0.76, 0.36, P.teal);
    sign(end, 0, 3.69, 0.49, depth * 0.58, 0.62, name, { bg: '#f6e4b8', ink: '#2e635c' });
    // Outdoor cafe bistro tables & stools under the side awning
    for (const x of [-2.3, 1.8]) {
      cylinder(end, x, CURB_H + 0.76, 1.55, 0.46, 0.46, 0.08, P.trimWarm, 16);
      cylinder(end, x, CURB_H + 0.38, 1.55, 0.06, 0.11, 0.72, P.metalDark, 10);
      for (const s of [-1, 1]) {
        cylinder(end, x + s * 0.64, CURB_H + 0.44, 1.55, 0.22, 0.22, 0.09, P.teal, 12);
        cylinder(end, x + s * 0.64, CURB_H + 0.22, 1.55, 0.07, 0.10, 0.42, P.metalDark, 10);
      }
    }
    // 2F balconies with potted plants on both street faces
    balcony(end, 5.4, 4.10, P.teal, { plants: true });
    balcony(front, 6.2, 4.10, P.teal, { plants: true });
    // Recessed 3F rooftop sunroom & warm timber pergola cleanly centered on roof `b`!
    box(b, 0, h + 0.16, 0, width + 0.38, 0.26, depth + 0.38, P.trimCream);
    box(b, 1.4, h + 1.38, 0.6, width * 0.54, 2.25, depth * 0.56, P.wallSage);
    box(b, 1.4, h + 2.58, 0.6, width * 0.58, 0.22, depth * 0.60, P.roofJade);
    // Warm timber pergola trellis overlooking the corner roof terrace
    const perg = group(b, -width * 0.22, h + 0.28, -depth * 0.14);
    for (const px of [-2.4, 2.4]) for (const pz of [-2.0, 2.0]) {
      rod(perg, [px, 0, pz], [px, 2.15, pz], 0.075, P.wood);
    }
    for (let k = -3; k <= 3; k++) {
      box(perg, k * 0.78, 2.22, 0, 0.10, 0.12, 4.5, P.wood);
    }
    for (const pz of [-2.0, 2.0]) box(perg, 0, 2.12, pz, 5.2, 0.12, 0.12, P.woodDark);
    pottedPlant(b, -width * 0.34, h + 0.28, -depth * 0.34, 0.85, true);
    pottedPlant(b, -width * 0.12, h + 0.28, -depth * 0.34, 0.78, false);
  } else if (name === '春风书局') {
    shopfrontBays(front, width, P.wood, { frameColor: P.trimWarm });
    shopfrontBays(end, depth, P.wood, { frameColor: P.trimWarm });
    scallopedAwning(front, width - 0.6, 2.94, P.jade, 1.15);
    scallopedAwning(end, depth - 0.6, 2.94, P.jade, 1.15);
    box(front, 0, 3.68, 0.30, width * 0.68, 0.78, 0.36, P.jade);
    sign(front, 0, 3.69, 0.49, width * 0.64, 0.64, name, { bg: '#f6e4b8', ink: '#31594f' });
    box(end, 0, 3.68, 0.30, depth * 0.64, 0.74, 0.36, P.jade);
    sign(end, 0, 3.69, 0.49, depth * 0.60, 0.60, name, { bg: '#f6e4b8', ink: '#31594f' });
    // Outdoor wooden bookstall facing the crossing on `end` and `front`
    box(front, -1.6, CURB_H + 0.62, 0.76, 3.4, 1.16, 0.56, P.wood);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 8; i++) {
        box(front, -1.6 + (i - 3.5) * 0.38, CURB_H + 0.40 + row * 0.52, 1.06, 0.27, 0.38 + 0.05 * (i % 2), 0.08,
          [P.terracotta, P.jade, P.laneYellow, P.wallBlush][(i + row) % 4]).rotation.z = (i % 3 - 1) * 0.07;
      }
    }
    pottedPlant(front, 2.8, CURB_H, 0.95, 0.85, true);
    pottedPlant(end, 2.6, CURB_H, 0.95, 0.80, true);
    // Full-footprint pitched tiled roof with cute dormer on `b`
    pitchedRoof(b, width, depth, h, P.roofTerra, { dormer: true, ridgeAxis: 'x' });
  } else {
    // 海棠茶行 (SW Foreground Hero Right) — Lingnan tea house with sloped green-tile eave & lanterns!
    shopfrontBays(front, width, P.wood, { frameColor: P.trimWarm, lattice: true, jadeTiles: true });
    shopfrontBays(end, depth, P.wood, { frameColor: P.trimWarm, lattice: true, jadeTiles: true });
    tiledEave(front, width - 0.2, 3.06, P.roofJade, { lanterns: true });
    tiledEave(end, depth - 0.2, 3.06, P.roofJade, { lanterns: true });
    box(front, 0, 3.74, 0.30, width * 0.68, 0.80, 0.36, P.woodDark);
    sign(front, 0, 3.75, 0.49, width * 0.64, 0.66, name, { bg: '#f6e1b2', ink: '#4c3525' });
    box(end, 0, 3.74, 0.30, depth * 0.62, 0.76, 0.36, P.woodDark);
    sign(end, 0, 3.75, 0.49, depth * 0.58, 0.62, name, { bg: '#f6e1b2', ink: '#4c3525' });
    // Cozy wooden tea bench + terracotta potted plants on the sidewalk
    box(front, -2.0, CURB_H + 0.46, 0.96, 1.85, 0.10, 0.46, P.wood);
    for (const bx of [-2.75, -1.25]) box(front, bx, CURB_H + 0.22, 0.96, 0.12, 0.44, 0.36, P.woodDark);
    pottedPlant(front, -4.6, CURB_H, 1.00, 0.90, true);
    pottedPlant(front, 3.6, CURB_H, 1.00, 0.84, true);
    pottedPlant(end, -2.8, CURB_H, 1.00, 0.84, false);
    // 2F warm timber balcony on street-facing front
    balcony(front, 6.4, 4.18, P.woodDark, { plants: true });
    // Stepped Lingnan cornice roofline with decorative green tile cap
    box(b, 0, h + 0.16, 0, width + 0.44, 0.26, depth + 0.44, P.trimCream);
    box(b, 0, h + 0.42, 0, width - 0.24, 0.32, depth - 0.24, P.roofJade);
    box(b, 0, h + 0.62, 0, width + 0.10, 0.12, depth + 0.10, P.trimWarm);
  }
}

// Three genuinely distinct silhouettes for side-street residential blocks.
function residentialRoof(b, variant, width, depth, h) {
  if (variant === 0) {
    pitchedRoof(b, width, depth, h, P.roofJade, { chimney: true, ridgeAxis: 'z' });
  } else if (variant === 1) {
    // Old Street-style flat parapet + water tank + drying rail with laundry
    box(b, 0, h + 0.18, 0, width + 0.34, 0.26, depth + 0.34, P.trimCream);
    box(b, 0, h + 0.38, 0, width - 0.16, 0.24, depth - 0.16, P.terracotta);
    cylinder(b, width * 0.24, h + 0.96, -depth * 0.12, 0.56, 0.56, 1.02, 0x8ca69c, 16);
    for (const dy of [0.62, 0.98, 1.32]) cylinder(b, width * 0.24, h + dy, -depth * 0.12, 0.59, 0.59, 0.045, P.metalDark, 16);
    rod(b, [-width * 0.30, h + 0.32, depth * 0.14], [-width * 0.30, h + 1.25, depth * 0.14], 0.04, P.metalDark);
    rod(b, [width * 0.02, h + 0.32, depth * 0.14], [width * 0.02, h + 1.25, depth * 0.14], 0.04, P.metalDark);
    rod(b, [-width * 0.30, h + 1.08, depth * 0.14], [width * 0.02, h + 1.08, depth * 0.14], 0.028, P.metalDark);
    for (let k = 0; k < 3; k++) {
      box(b, -width * 0.23 + k * 0.68, h + 0.82, depth * 0.14, 0.42, 0.52, 0.05, [P.trimCream, P.wallBlush, P.jade][k]);
    }
  } else {
    // Stepped terrace roof with cream parapet and terracotta coping
    box(b, 0, h + 0.16, 0, width + 0.36, 0.24, depth + 0.36, P.trimCream);
    box(b, 0, h + 0.72, 0, width * 0.62, 0.98, depth * 0.58, P.wallCream);
    box(b, 0, h + 1.28, 0, width * 0.68, 0.18, depth * 0.64, P.roofTerra);
  }
}

function block(root, x, z, width, depth, floors, sideX, sideZ, wall, accent, name, variant = 0) {
  const b = group(root, x, 0, z);
  const h = 3.9 + floors * 2.75;
  // Grounded stone plinth & clean full-height plaster volume
  box(b, 0, 0.18, 0, width + 0.28, 0.36, depth + 0.28, P.curbFace);
  box(b, 0, 0.36 + (h - 0.36) / 2, 0, width, h - 0.36, depth, wall);
  box(b, 0, h - 0.08, 0, width + 0.32, 0.20, depth + 0.32, P.trimCream);

  // Local +Z faces outward onto the main street (`front`) and side street (`end`).
  const front = group(b, 0, 0, -sideZ * depth / 2);
  front.rotation.y = sideZ < 0 ? 0 : Math.PI;
  const end = group(b, -sideX * width / 2, 0, 0);
  end.rotation.y = -sideX * Math.PI / 2;

  const style = name === '榕湾百货' ? 'heritage'
    : name === '南方冰室' ? 'cafe'
    : name === '春风书局' ? 'bookshop'
    : name === '海棠茶行' ? 'tea'
    : 'residential';

  upperFacade(front, width, floors, accent, style);
  upperFacade(end, depth, floors, accent, style);

  if (name) {
    cornerShop(b, front, end, width, depth, h, name, accent);
  } else {
    shopfrontBays(front, width, accent, { frameColor: P.trimCream });
    shopfrontBays(end, depth, accent, { frameColor: P.trimCream });
    for (const y of [4.15, 6.90].slice(0, floors)) {
      balcony(end, depth * 0.58, y, accent, { plants: y < 5 });
    }
    residentialRoof(b, variant, width, depth, h);
  }
}

// Iconic Rongwan Department Store clock tower rising cleanly above the 2F heritage roofline.
function clockTower(root) {
  const tower = group(root, 12.7, 0, -12.6);
  box(tower, 0, 10.2, 0, 3.8, 5.4, 3.8, P.wallApricot);
  for (const sx of [-1.76, 1.76]) for (const sz of [-1.76, 1.76]) {
    box(tower, sx, 10.2, sz, 0.34, 5.4, 0.34, P.trimCream);
  }
  box(tower, 0, 13.02, 0, 4.35, 0.34, 4.35, P.trimCream);
  box(tower, 0, 13.40, 0, 3.55, 0.44, 3.55, P.roofJade);
  box(tower, 0, 13.80, 0, 2.45, 0.38, 2.45, P.teal);
  box(tower, 0, 14.12, 0, 1.35, 0.28, 1.35, P.trimWarm);
  rod(tower, [0, 14.24, 0], [0, 14.95, 0], 0.055, P.trimWarm);
  oval(tower, 0, 14.98, 0, 0.12, 0.12, 0.12, P.laneYellow);
  for (const angle of [0, -Math.PI / 2]) {
    const face = group(tower, 0, 11.45, 0);
    face.rotation.y = angle;
    const rim = cylinder(face, 0, 0, 1.92, 1.16, 1.16, 0.15, P.metalDark, 32);
    rim.rotation.x = Math.PI / 2;
    const dial = cylinder(face, 0, 0, 2.01, 1.03, 1.03, 0.08, P.trimCream, 32);
    dial.rotation.x = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      box(face, 0.86 * Math.sin(a), 0.86 * Math.cos(a), 2.07, 0.055, 0.16, 0.035, P.metalDark).rotation.z = -a;
    }
    box(face, 0.21, 0.20, 2.11, 0.08, 0.62, 0.05, P.metalDark).rotation.z = -0.80;
    box(face, -0.14, -0.32, 2.13, 0.07, 0.76, 0.05, P.metalDark).rotation.z = -0.42;
  }
}

// Old Street-style beveled circular terracotta brick tree pit.
function brickTreePit(root, x, z, i) {
  const pit = group(root, x, CURB_H, z);
  const count = 16, pitch = Math.PI * 2 / count;
  const inner = cityTreePitRadius - 0.17;
  const shape = new Shape();
  shape.absarc(0, 0, cityTreePitRadius - 0.012, 0.025, pitch - 0.025, false);
  shape.absarc(0, 0, inner + 0.012, pitch - 0.025, 0.025, true);
  shape.closePath();
  const brick = new ExtrudeGeometry(shape, {
    depth: 0.18, curveSegments: 2, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.012, bevelThickness: 0.012,
  });
  brick.rotateX(-Math.PI / 2);
  cylinder(pit, 0, 0.05, 0, cityTreePitRadius - 0.023, cityTreePitRadius - 0.023, 0.10, P.soil, 32);
  cylinder(pit, 0, 0.107, 0, inner + 0.014, inner + 0.014, 0.02, P.soilClod[2], 32);
  for (let j = 0; j < count; j++) {
    piece(pit, brick, P.brickClay[(j + Math.floor(j / 3) + i) % P.brickClay.length], 0, 0.015, 0).rotation.y = pitch * j;
  }
  for (let j = 0; j < 9; j++) {
    const a = j * 2.4, r = 0.25 + (j % 4) * 0.10;
    oval(pit, r * Math.cos(a), 0.13, r * Math.sin(a), 0.035, 0.018, 0.028, P.soilClod[j % P.soilClod.length], true);
  }
}

// True 3D raised street cross-section: flush side-street asphalt, raised curbstones,
// recessed gutters with drainage grates, tiled sidewalks tucked cleanly under buildings.
function sidewalkDetails(root, half, arm) {
  const sideLen = arm - half + 2;

  // 1. North & South side-street asphalt roads + flanking raised sidewalks + end garden wall
  for (const side of [-1, 1]) {
    const midZ = side * (half + sideLen / 2);
    box(root, 0, -0.04, midZ, half * 2 + 0.3, 0.095, sideLen, P.asphalt);
    for (const flank of [-1, 1]) {
      const curbX = flank * half;
      const walkW = 4.6; // Tucks well under the side-street buildings so ZERO grass bleeds out!
      box(root, curbX + flank * (walkW / 2), 0.07, midZ, walkW, 0.14, sideLen, P.sidewalkTop);
      box(root, curbX + flank * 0.06, 0.068, midZ, 0.16, 0.15, sideLen, P.curbFace);
      box(root, curbX - flank * 0.16, 0.012, midZ, 0.30, 0.018, sideLen, P.gutter);
      const count = Math.floor(sideLen / 1.8);
      for (let i = 0; i < count; i++) {
        const z = side * (half + 0.95 + i * 1.8);
        box(root, curbX + flank * 0.13, 0.144, z, 0.24, 0.028, 1.72, i % 2 ? P.curbTop : P.curbAlt);
        if (i % 2 === 0) box(root, curbX + flank * (walkW / 2 + 0.1), 0.142, z, walkW - 0.35, 0.008, 0.022, P.sidewalkJoint);
      }
    }
    // Side-street terminal sidewalk & low warm garden wall
    box(root, 0, 0.07, side * (arm + 2.9), 18.0, 0.14, 2.4, P.sidewalkTop);
    box(root, 0, 0.144, side * (arm + 1.82), 18.0, 0.028, 0.24, P.curbTop);
    box(root, 0, 0.62, side * (arm + 4.2), 18.0, 1.20, 0.45, P.trimWarm);
    box(root, 0, 1.25, side * (arm + 4.2), 18.4, 0.12, 0.56, P.roofJade);
  }

  // 2. Four quadrant main-road (East-West) raised sidewalks extending cleanly under all 4 corner shops
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const curbZ = sz * half;
      const walkD = 4.8; // Reaches from z=5.5 to z=10.3 (under building front at z=8.8!) — ZERO green grass gap!
      const len = 23.6;
      const centerX = sx * (half + len / 2);
      box(root, centerX, 0.07, curbZ + sz * (walkD / 2), len, 0.14, walkD, P.sidewalkTop);
      box(root, centerX, 0.068, curbZ + sz * 0.06, len, 0.15, 0.16, P.curbFace);
      box(root, centerX, 0.012, curbZ - sz * 0.16, len, 0.018, len > 0 ? 0.30 : 0.30, P.gutter);
      const blocks = Math.floor(len / 1.8);
      for (let i = 0; i < blocks; i++) {
        const bx = sx * (half + 0.95 + i * 1.8);
        box(root, bx, 0.144, curbZ + sz * 0.13, 1.72, 0.028, 0.24, i % 2 ? P.curbTop : P.curbAlt);
        if (i % 2 === 0) box(root, bx, 0.142, curbZ + sz * (walkD / 2 + 0.1), 0.022, 0.008, walkD - 0.35, P.sidewalkJoint);
      }
      // Subtle rounded corner apron highlight & tactile ochre warning strip at crosswalk entries
      box(root, sx * (half + 1.45), 0.143, sz * (half + 1.45), 2.55, 0.010, 2.55, P.sidewalkAlt);
      box(root, sx * (half + 1.9), 0.146, sz * (half + 0.52), 2.2, 0.012, 0.30, P.trimWarm);
      box(root, sx * (half + 0.52), 0.146, sz * (half + 1.9), 0.30, 0.012, 2.2, P.trimWarm);
    }
  }

  // 3. Crisp 4-way intersection markings (zebra crosswalks, stop lines, double-yellow approaches)
  for (let i = 0; i < 4; i++) {
    const a = group(root);
    a.rotation.y = i * Math.PI / 2;
    for (let j = -5; j <= 5; j++) box(a, j * 0.92, 0.026, half + 1.9, 0.47, 0.018, 2.35, P.roadPaint);
    box(a, half / 2, 0.026, half + 4.0, half - 0.4, 0.018, 0.23, P.roadPaint);
    for (const dx of [-0.13, 0.13]) box(a, dx, 0.027, half + 9.4, 0.09, 0.018, 10.4, P.laneYellow);
    if (i % 2 === 0) {
      for (let d = 23; d < arm - 2; d += 7) box(a, 0, 0.023, d, 0.12, 0.016, 2.8, 0xe5cc93);
    }
    // Slatted drainage grate flush in the gutter just before each crosswalk
    const grate = group(a, half - 0.22, 0.018, half + 4.65);
    box(grate, 0, 0, 0, 0.30, 0.016, 0.62, P.metalDark);
    for (let g = -2; g <= 2; g++) box(grate, 0, 0.010, g * 0.11, 0.22, 0.012, 0.032, P.metal);
  }

  // 4. Two subtle flush cast-iron manhole covers in the crossing square
  for (const [mx, mz] of [[-2.1, 1.7], [2.3, -2.0]]) {
    cylinder(root, mx, 0.015, mz, 0.44, 0.44, 0.022, P.metalDark, 24);
    cylinder(root, mx, 0.027, mz, 0.36, 0.36, 0.008, P.asphaltEdge, 24);
  }
}

function streetFurniture(root, half) {
  // 1. Four refined miniature-town traffic signal poles (connected arms, clean sightline to 榕湾百货!)
  const signalHeads = [];
  for (let i = 0; i < 4; i++) {
    const a = group(root);
    a.rotation.y = i * Math.PI / 2;
    const pole = group(a, half + 0.92, 0, -(half + 1.05));
    cylinder(pole, 0, 0.22, 0, 0.22, 0.28, 0.44, P.trimCream, 12);
    cylinder(pole, 0, 0.46, 0, 0.25, 0.25, 0.08, P.metal, 12);
    cylinder(pole, 0, 2.95, 0, 0.075, 0.125, 5.10, P.metalDark, 12);
    // Horizontal arm connected cleanly from pole center (x=0) to head (x=-3.25)
    rod(pole, [0, 5.38, 0], [-3.25, 5.38, 0], 0.068, P.metalDark, 0.062, 10);
    rod(pole, [0, 4.92, 0], [-0.58, 5.38, 0], 0.035, P.metal, 0.035, 8);
    box(pole, -3.25, 4.78, 0, 0.56, 1.54, 0.36, P.metalDark, 0.09);
    for (let l = 0; l < 3; l++) {
      box(pole, -3.25, 5.31 - l * 0.47, 0.20, 0.46, 0.085, 0.44, P.metalDark);
      const at = new THREE.Vector3(-3.25, 5.18 - l * 0.47, 0.22);
      pole.localToWorld(at);
      root.worldToLocal(at);
      signalHeads.push({ at, axis: i % 2, lamp: l });
    }
  }

  // 2. Vintage curved-neck town streetlamps spaced neatly along the sidewalks
  const lampSpots = [
    [-15.2, -(half + 0.68), 0, 1],
    [15.2, -(half + 0.68), 0, 1],
    [-15.2, half + 0.68, 0, -1],
    [15.2, half + 0.68, 0, -1],
    [-(half + 0.68), -17.5, 1, 0],
    [half + 0.68, 17.5, -1, 0],
  ];
  for (const [lx, lz, dx, dz] of lampSpots) {
    const lamp = group(root, lx, CURB_H, lz);
    cylinder(lamp, 0, 0.22, 0, 0.13, 0.18, 0.44, P.metal, 10);
    cylinder(lamp, 0, 1.80, 0, 0.055, 0.085, 3.16, P.metalDark, 10);
    rod(lamp, [0, 3.32, 0], [dx * 0.52, 3.55, dz * 0.52], 0.038, P.metalDark);
    cylinder(lamp, dx * 0.56, 3.48, dz * 0.56, 0.08, 0.22, 0.12, P.metal, 12);
    oval(lamp, dx * 0.56, 3.30, dz * 0.56, 0.16, 0.19, 0.16, P.trimCream);
  }

  // 3. Curated corner bollards following each quadrant curb edge cleanly
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pts = [
        [sx * (half + 0.55), sz * (half + 2.55)],
        [sx * (half + 1.55), sz * (half + 1.55)],
        [sx * (half + 2.55), sz * (half + 0.55)],
      ];
      for (const [bx, bz] of pts) {
        cylinder(root, bx, CURB_H + 0.28, bz, 0.095, 0.11, 0.56, P.trimCream, 12);
        oval(root, bx, CURB_H + 0.57, bz, 0.105, 0.05, 0.105, P.teal);
      }
    }
  }

  // 4. Classic jade-green miniature postbox near 春风书局 corner (well clear of lamps & poles)
  const post = group(root, -10.8, CURB_H, -(half + 1.15));
  cylinder(post, 0, 0.12, 0, 0.30, 0.34, 0.24, P.curbFace, 16);
  cylinder(post, 0, 0.78, 0, 0.25, 0.27, 1.12, P.teal, 18);
  cylinder(post, 0, 1.38, 0, 0.31, 0.31, 0.12, P.trimCream, 18);
  oval(post, 0, 1.46, 0, 0.27, 0.10, 0.27, P.teal);
  box(post, 0, 1.08, 0.25, 0.26, 0.08, 0.05, P.trimCream);

  return signalHeads;
}

export function createCityCrossing(parent, banyan) {
  const { x, z, half, arm } = crossing;
  const root = group(parent, x, 0, z);
  const trees = [];

  sidewalkDetails(root, half, arm);

  // Deliberate, shared tree-pit composition; synchronized 1:1 with street-layout.js avoidance.
  cityTreePits.forEach(([ox, oz, scale], i) => {
    brickTreePit(root, ox, oz, i);
    trees.push([ox, CURB_H + 0.13, oz, 0.90 + i * 2.4, scale, scale * 1.03, scale]);
  });

  // Four hero corner buildings (all 2 upper floors so Clock Tower stands proud as the unmistakable focal landmark!)
  // plus side-street residential blocks with 3 distinct roof silhouettes.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const east = sx > 0, north = sz < 0;
      const wall = east ? (north ? P.wallApricot : P.wallSage) : (north ? P.wallOlive : P.wallSand);
      const accent = east ? (north ? P.terracottaDeep : P.teal) : (north ? P.jade : P.terracotta);
      const name = east ? (north ? '榕湾百货' : '南方冰室') : (north ? '春风书局' : '海棠茶行');
      block(root, sx * 16.7, sz * 14.0, 15.0, 10.4, 2, sx, sz, wall, accent, name);

      for (const [j, d] of [25.5, 38.0, 48.0].entries()) {
        block(root, sx * (13.9 + (j % 2)), sz * d, 9.2, j === 2 ? 6.5 : 10.3, 1 + ((j + Number(east)) % 3),
          sx, sz, [P.wallSand, P.wallBlush, P.wallSage][j], accent, '', (j + Number(east)) % 3);
      }
    }
  }

  clockTower(root);

  // Enamel street blade at the SE corner facing riders arriving from Old Street (clear of traffic pole).
  const blade = group(root, 8.6, 0, 8.3);
  blade.rotation.y = -Math.PI / 2;
  cylinder(blade, 0, 1.85, 0, 0.07, 0.09, 3.7, P.metalDark);
  box(blade, 0, 3.48, 0, 3.1, 0.71, 0.13, P.teal);
  sign(blade, 0, 3.48, 0.075, 3.0, 0.65, '榕湾中路', { bg: '#346e69', ink: '#fff2cd', font: 'hei' });

  const signalHeads = streetFurniture(root, half);

  bake(root);
  placeInstances(root, banyan, trees);

  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial(), signalHeads.length);
  const disk = new THREE.Object3D(), color = new THREE.Color();
  signalHeads.forEach(({ at }, i) => {
    disk.position.copy(at);
    disk.scale.set(0.175, 0.175, 0.105);
    disk.rotation.y = Math.floor(i / 3) * Math.PI / 2;
    disk.updateMatrix();
    lamps.setMatrixAt(i, disk.matrix);
  });
  root.add(lamps);

  let last = -1;
  return time => {
    const t = time % 22, phase = t < 9 ? 0 : t < 11 ? 1 : t < 20 ? 2 : 3;
    if (last === phase) return;
    last = phase;
    signalHeads.forEach(({ axis, lamp }, i) => {
      const active = axis !== Math.floor(phase / 2) ? 0 : phase % 2 ? 1 : 2;
      lamps.setColorAt(i, color.setHex(active === lamp ? [0xff6045, 0xffca50, 0x6cf3ae][lamp] : 0x384641));
    });
    lamps.instanceColor.needsUpdate = true;
  };
}
