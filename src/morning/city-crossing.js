// Warm miniature city crossing: handcrafted architectural bridge between Old Street and the east gate.
import * as THREE from 'three';
import { placeInstances } from './kit-instances.js';
import { crossing } from './country-route.js';
import { cityTreePits, cityTreePitRadius, CURB_H } from './street-layout.js';
import { CITY_PALETTE as P } from './city-palette.js';
import { bake, box, curve, cylinder, group, oval, piece, rod, sign } from './shapes.js';
import { ear } from './rider.js';

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

// Reusable thin extruded straight + right-turn lane arrow in XZ plane (points -Z, turns +X).
function laneArrowGeometry() {
  const s = new Shape();
  s.moveTo(-0.32, -1.45);
  s.lineTo(-0.04, -1.45);
  s.lineTo(-0.04, -0.52);
  s.lineTo(0.64, -0.18);
  s.lineTo(0.64, -0.46);
  s.lineTo(1.26, -0.02);
  s.lineTo(0.64, 0.42);
  s.lineTo(0.64, 0.12);
  s.lineTo(-0.04, -0.20);
  s.lineTo(-0.04, 0.56);
  s.lineTo(0.30, 0.56);
  s.lineTo(-0.18, 1.56);
  s.lineTo(-0.66, 0.56);
  s.lineTo(-0.32, 0.56);
  s.closePath();
  const geo = new ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// Solid curved half-cylinder visor/hood arching over a signal lens and projecting along +Z.
function signalHood(parent, x, y, z, outerR, innerR, depth, color) {
  const s = new Shape();
  s.absarc(0, 0, outerR, -0.08 * Math.PI, 1.08 * Math.PI, false);
  s.absarc(0, 0, innerR, 1.08 * Math.PI, -0.08 * Math.PI, true);
  s.closePath();
  const geo = new ExtrudeGeometry(s, { depth, curveSegments: 14, bevelEnabled: false });
  return piece(parent, geo, color, x, y, z);
}

// Recessed circular bezel ring framing a signal lens along +Z.
function signalBezel(parent, x, y, z, outerR, innerR, depth, color) {
  const s = new Shape();
  s.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const geo = new ExtrudeGeometry(s, { depth, curveSegments: 16, bevelEnabled: false });
  return piece(parent, geo, color, x, y, z);
}

// True 3D raised street cross-section: flush side-street asphalt, raised curbstones,
// recessed gutters with drainage grates, tiled sidewalks tucked cleanly under buildings.
function sidewalkDetails(root, half, arm) {
  const sideLen = arm - half + 2;

  // 1. North & South side-street asphalt roads + flanking raised sidewalks + end garden wall
  for (const side of [-1, 1]) {
    const midZ = side * (half + sideLen / 2);
    const roadLen = sideLen - 0.05;
    const roadMidZ = side * (half + 0.05 + roadLen / 2);
    // Start cleanly at side * (half + 0.05) with top at y = -0.003 (-0.049 + 0.092 / 2),
    // tucked 3mm below the y = 0 main road across the overlap so there is zero z-fighting or seam line.
    box(root, 0, -0.049, roadMidZ, half * 2 + 0.3, 0.092, roadLen, P.asphalt);
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

  // 3. Crisp 4-way engineered road markings (zebra crosswalks, stop lines, edge lines, double-yellow, arrows, corner guides)
  const stopX = (0.24 + half - 0.42) / 2;
  const stopW = half - 0.66;
  const turnGuideR = 2.65;
  for (let i = 0; i < 4; i++) {
    const a = group(root);
    a.rotation.y = i * Math.PI / 2;
    const isMain = i % 2 === 1;

    // 9 generous painted zebra crosswalk bars
    for (let j = -4; j <= 4; j++) {
      box(a, j * 1.04, 0.015, half + 2.0, 0.50, 0.008, 2.65, P.roadPaint);
    }

    // Bold stop line spanning the right-hand approach lane cleanly
    box(a, stopX, 0.015, half + 4.35, stopW, 0.008, 0.34, P.roadPaint);

    // Continuous off-white lane edge lines
    const edgeLen = isMain ? 18.0 : arm - half - 4.0;
    for (const sx of [-1, 1]) {
      box(a, sx * (half - 0.36), 0.015, half + 4.35 + edgeLen / 2, 0.11, 0.008, edgeLen, P.roadPaint);
    }

    // Vibrant double-yellow centerline starting neatly at the stop line
    const solidLen = isMain ? 13.5 : 11.5;
    for (const dx of [-0.13, 0.13]) {
      box(a, dx, 0.016, half + 4.45 + solidLen / 2, 0.10, 0.008, solidLen, P.laneYellow);
    }
    if (!isMain) {
      for (let d = half + 4.45 + solidLen + 2.8; d + 1.4 < arm - 1.5; d += 6.2) {
        box(a, 0, 0.016, d, 0.11, 0.008, 2.8, P.laneYellow);
      }
    }

    // Painted straight + right-turn directional lane arrow on right-hand approach
    piece(a, laneArrowGeometry(), P.roadPaint, half * 0.50, 0.011, half + 8.6);

    // Subtle curved corner turn guide dashes connecting the lanes cleanly without cluttering center square
    for (const frac of [0.22, 0.50, 0.78]) {
      const phi = frac * (Math.PI / 2);
      const gx = half - turnGuideR * Math.cos(phi);
      const gz = half - turnGuideR * Math.sin(phi);
      box(a, gx, 0.015, gz, 0.10, 0.008, 0.58, P.roadPaint).rotation.y = -phi;
    }

    // Slatted drainage grate flush in the gutter just before each crosswalk
    const grate = group(a, half - 0.16, 0.018, half + 4.65);
    box(grate, 0, 0, 0, 0.26, 0.016, 0.62, P.metalDark);
    for (let g = -2; g <= 2; g++) box(grate, 0, 0.010, g * 0.11, 0.19, 0.012, 0.032, P.metal);
  }

  // 4. Two subtle flush cast-iron manhole covers in the crossing square
  for (const [mx, mz] of [[-2.1, 1.7], [2.3, -2.0]]) {
    cylinder(root, mx, 0.011, mz, 0.44, 0.44, 0.016, P.metalDark, 24);
    cylinder(root, mx, 0.020, mz, 0.36, 0.36, 0.006, P.asphaltEdge, 24);
  }
}

function streetFurniture(root, half) {
  const signalBackplate = P.signalBackplate ?? 0xe8e0cb;
  const signalWarn = P.signalWarn ?? 0xe5b84b;

  // 1. Four crafted miniature-town traffic signal poles (exact sightline positions — 榕湾百货 blade unobstructed!)
  const signalHeads = [];
  for (let i = 0; i < 4; i++) {
    const a = group(root);
    const rotY = i * Math.PI / 2;
    a.rotation.y = rotY;
    const pole = group(a, half + 0.92, 0, -(half + 1.05));

    // Stepped warm cream stone plinth (h = 0.38) + beveled dark-jade flange ring
    cylinder(pole, 0, 0.12, 0, 0.27, 0.30, 0.24, P.trimWarm, 14);
    cylinder(pole, 0, 0.31, 0, 0.21, 0.24, 0.14, P.trimCream, 14);
    cylinder(pole, 0, 0.42, 0, 0.19, 0.22, 0.08, P.metalDark, 14);
    cylinder(pole, 0, 0.48, 0, 0.14, 0.18, 0.04, P.metal, 14);

    // Slender tapered dark-jade post + tiny rounded acorn finial at y = 5.62
    cylinder(pole, 0, 3.00, 0, 0.072, 0.118, 5.04, P.metalDark, 14);
    cylinder(pole, 0, 5.54, 0, 0.095, 0.085, 0.05, P.metal, 12);
    oval(pole, 0, 5.62, 0, 0.078, 0.095, 0.078, P.metalDark);
    oval(pole, 0, 5.71, 0, 0.026, 0.035, 0.026, P.trimWarm);

    // Subtle reflective safety collar (signalWarn + dark-jade bands around y = 0.85..1.30m)
    cylinder(pole, 0, 0.91, 0, 0.123, 0.125, 0.11, signalWarn, 14);
    cylinder(pole, 0, 1.015, 0, 0.122, 0.123, 0.09, P.metalDark, 14);
    cylinder(pole, 0, 1.115, 0, 0.121, 0.122, 0.11, signalWarn, 14);
    cylinder(pole, 0, 1.21, 0, 0.120, 0.121, 0.07, P.metalDark, 14);
    cylinder(pole, 0, 1.275, 0, 0.119, 0.120, 0.06, signalWarn, 14);

    // Refined cantilever arm [0, 5.40, 0] -> [-3.25, 5.40, 0] + end cap + double diagonal brace truss
    cylinder(pole, 0, 5.40, 0, 0.096, 0.096, 0.18, P.metal, 12);
    cylinder(pole, 0, 4.75, 0, 0.094, 0.094, 0.08, P.metal, 12);
    rod(pole, [0, 5.40, 0], [-3.25, 5.40, 0], 0.066, P.metalDark, 0.056, 12);
    const armCap = cylinder(pole, -3.28, 5.40, 0, 0.068, 0.068, 0.10, P.metal, 12);
    armCap.rotation.z = Math.PI / 2;
    oval(pole, -3.35, 5.40, 0, 0.055, 0.058, 0.058, P.trimWarm);
    rod(pole, [0, 4.75, 0], [-0.85, 5.40, 0], 0.032, P.metal, 0.030, 8);
    rod(pole, [0, 5.08, 0], [-0.42, 5.40, 0], 0.026, P.metal, 0.026, 8);
    // Cantilever junction wraps the signal seam with solid overlap (no floating rear gap).
    box(pole, -3.25, 5.40, -0.12, 0.24, 0.20, 0.26, P.metal);

    // Upgraded 3-lamp main signal head at (-3.25, 4.76, 0) with cream reflective backplate, recessed bezels & curved hoods
    box(pole, -3.25, 4.76, -0.145, 0.76, 1.74, 0.05, signalBackplate, 0.025);
    box(pole, -3.25, 4.76, 0.02, 0.58, 1.56, 0.30, P.metalDark, 0.08);
    // Inset rear service cover overlaps the backplate cleanly; the top clamp is the sole neck.
    box(pole, -3.25, 4.76, -0.195, 0.44, 1.24, 0.09, P.metalDark, 0.03);
    for (let l = 0; l < 3; l++) {
      const ly = 5.22 - l * 0.46;
      signalBezel(pole, -3.25, ly, 0.16, 0.215, 0.168, 0.055, P.metal);
      signalHood(pole, -3.25, ly, 0.15, 0.22, 0.188, 0.34, P.metalDark);
      const at = new THREE.Vector3(-3.25, ly, 0.20);
      pole.localToWorld(at);
      root.worldToLocal(at);
      signalHeads.push({ at, rotY, axis: i % 2, lamp: l, scale: [0.168, 0.168, 0.095], ped: false });
    }

    // Pedestrian crossing signal box at (0, 2.72, 0.24) facing +Z toward crosswalk pedestrians
    cylinder(pole, 0, 2.72, 0, 0.115, 0.115, 0.14, P.metal, 12);
    box(pole, 0, 2.72, 0.065, 0.12, 0.14, 0.13, P.metal);
    box(pole, 0, 2.72, 0.125, 0.42, 0.76, 0.04, signalBackplate, 0.015);
    box(pole, 0, 2.72, 0.245, 0.34, 0.68, 0.23, P.metalDark, 0.045);
    for (const [py, lamp] of [[2.88, 0], [2.56, 2]]) {
      signalBezel(pole, 0, py, 0.355, 0.105, 0.082, 0.032, P.metal);
      signalHood(pole, 0, py, 0.35, 0.112, 0.094, 0.15, P.metalDark);
      const at = new THREE.Vector3(0, py, 0.375);
      pole.localToWorld(at);
      root.worldToLocal(at);
      signalHeads.push({ at, rotY, axis: i % 2, lamp, scale: [0.084, 0.084, 0.052], ped: true });
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

function spectacles(parent, frameColor = P.wood) {
  for (const side of [-1, 1]) {
    const pts = [];
    for (let a = 0; a <= 12; a++) {
      pts.push([
        side * 0.17 + Math.cos(a * Math.PI / 6) * 0.078,
        1.0 + Math.sin(a * Math.PI / 6) * 0.067,
        0.354,
      ]);
    }
    curve(parent, pts, 0.010, frameColor);
  }
  rod(parent, [-0.092, 1.008, 0.354], [0.092, 1.008, 0.354], 0.009, frameColor);
}

// Stylized miniature animal NPC matching Old Street's neighbor() scale (~1.45m) and charm.
function cityAnimal(parent, ox, oz, yaw, spec) {
  const n = group(parent, ox, CURB_H, oz);
  n.rotation.y = yaw;
  const { kind, fur, muzzle = P.trimCream, coat, sleeve = coat, shoe = P.wood, nose = 0x5c3e34 } = spec;

  // Feet, rounded torso, head & muzzle
  for (const side of [-1, 1]) oval(n, side * 0.13, 0.12, 0.03, 0.13, 0.11, 0.16, shoe);
  oval(n, 0, 0.46, 0, 0.30, 0.34, 0.24, coat);
  oval(n, 0, 0.99, 0, 0.45, 0.39, 0.356, fur);
  oval(n, 0, 0.88, kind === 'fox' ? 0.24 : 0.22, kind === 'fox' ? 0.23 : 0.27, 0.155, kind === 'fox' ? 0.19 : 0.175, muzzle);

  // Arms (bear raises right paw to hold an iced drink cup)
  for (const side of [-1, 1]) {
    if (kind === 'bear' && side === 1) {
      const arm = oval(n, 0.27, 0.54, 0.15, 0.095, 0.17, 0.095, sleeve);
      arm.rotation.x = -0.75;
      oval(n, 0.28, 0.59, 0.25, 0.068, 0.062, 0.068, fur);
    } else {
      oval(n, side * 0.27, 0.46, 0.07, 0.10, 0.175, 0.10, sleeve);
      oval(n, side * 0.27, 0.32, 0.10, 0.062, 0.055, 0.062, fur);
    }
  }

  // Species silhouette, face markings, outfits & props
  if (kind === 'bear') {
    for (const side of [-1, 1]) {
      oval(n, side * 0.30, 1.31, -0.02, 0.135, 0.135, 0.09, fur);
      oval(n, side * 0.30, 1.31, 0.045, 0.072, 0.072, 0.032, 0xe8c49b);
    }
    // Teal cafe apron over cream shirt
    oval(n, 0, 0.69, 0.05, 0.18, 0.05, 0.17, P.teal);
    oval(n, 0, 0.46, 0.01, 0.315, 0.055, 0.255, P.teal);
    box(n, 0, 0.43, 0.215, 0.34, 0.44, 0.05, P.teal, 0.02);
    box(n, 0, 0.34, 0.245, 0.16, 0.11, 0.02, P.jadeTile);
    // Iced lemon drink cup + straw in right paw
    cylinder(n, 0.29, 0.65, 0.32, 0.072, 0.054, 0.18, 0xe8b45a, 14);
    cylinder(n, 0.29, 0.64, 0.32, 0.068, 0.062, 0.06, P.trimCream, 14);
    cylinder(n, 0.29, 0.745, 0.32, 0.078, 0.076, 0.025, P.trimCream, 14);
    rod(n, [0.29, 0.74, 0.32], [0.33, 0.89, 0.34], 0.011, P.terracotta);
  } else if (kind === 'deer') {
    for (const side of [-1, 1]) {
      ear(n, side * 0.32, 1.24, -0.02, 0.56, fur, 0xf2d4b8, -side * 0.52);
      rod(n, [side * 0.14, 1.32, -0.02], [side * 0.24, 1.54, -0.01], 0.020, P.woodDark, 0.014, 8);
      rod(n, [side * 0.19, 1.43, -0.015], [side * 0.12, 1.53, 0.02], 0.014, P.woodDark, 0.010, 8);
      rod(n, [side * 0.21, 1.47, -0.01], [side * 0.30, 1.55, -0.02], 0.014, P.woodDark, 0.010, 8);
    }
    // Warm tea-house shawl & cream collar trim
    oval(n, 0, 0.66, 0.01, 0.33, 0.125, 0.265, P.terracottaDeep);
    oval(n, 0, 0.72, 0.03, 0.22, 0.065, 0.20, P.trimCream);
    box(n, 0, 0.45, 0.225, 0.055, 0.34, 0.025, P.trimWarm);
  } else if (kind === 'badger') {
    // Classic cream center blaze & slate eye-mask stripes
    oval(n, 0, 1.08, 0.255, 0.095, 0.24, 0.115, P.trimCream);
    for (const side of [-1, 1]) {
      oval(n, side * 0.175, 1.04, 0.22, 0.105, 0.195, 0.118, 0x5a6362);
      oval(n, side * 0.29, 1.29, -0.02, 0.115, 0.11, 0.075, 0x525a59);
      oval(n, side * 0.30, 1.34, 0.00, 0.075, 0.055, 0.055, P.trimCream);
    }
    // Sage-green waistcoat over cream shirt + bow-tie + spectacles
    oval(n, 0, 0.69, 0.07, 0.17, 0.085, 0.17, P.trimCream);
    oval(n, 0, 0.68, 0.23, 0.075, 0.036, 0.025, P.terracotta);
    for (let k = 0; k < 3; k++) oval(n, 0, 0.56 - k * 0.10, 0.235, 0.022, 0.022, 0.015, P.trimWarm);
    spectacles(n, P.wood);
  } else if (kind === 'turtle') {
    // Warm cream cardigan trim + dark-jade tortoise shell on back + spectacles
    oval(n, 0, 0.70, 0.04, 0.21, 0.07, 0.19, P.jade);
    for (let k = 0; k < 3; k++) oval(n, 0, 0.58 - k * 0.10, 0.238, 0.024, 0.024, 0.015, P.wood);
    oval(n, 0, 0.48, -0.13, 0.315, 0.365, 0.065, P.trimWarm);
    oval(n, 0, 0.48, -0.22, 0.30, 0.35, 0.18, P.roofJade);
    oval(n, 0, 0.56, -0.35, 0.14, 0.13, 0.07, P.teal);
    oval(n, 0, 0.38, -0.34, 0.13, 0.12, 0.07, P.teal);
    spectacles(n, P.wood);
  } else if (kind === 'fox') {
    for (const side of [-1, 1]) {
      oval(n, side * 0.24, 0.89, 0.16, 0.20, 0.14, 0.15, P.trimCream);
      ear(n, side * 0.28, 1.21, -0.02, 0.66, fur, P.trimCream, -side * 0.26);
    }
    // Jaunty teal artist beret & terracotta scarf
    const beret = oval(n, -0.03, 1.34, -0.02, 0.29, 0.095, 0.28, P.teal);
    beret.rotation.set(-0.08, 0, 0.14);
    rod(n, [-0.05, 1.42, -0.03], [-0.07, 1.49, -0.04], 0.018, P.teal);
    oval(n, 0, 0.70, 0.03, 0.27, 0.085, 0.24, P.terracotta);
    box(n, 0.12, 0.53, 0.22, 0.10, 0.26, 0.045, P.terracotta, 0.015);
    box(n, 0.12, 0.40, 0.225, 0.10, 0.03, 0.048, P.trimCream);
    // Fluffy cream-tipped tail behind
    const tail = oval(n, 0.04, 0.33, -0.34, 0.14, 0.16, 0.28, fur);
    tail.rotation.set(0.45, 0.22, 0);
    oval(n, 0.09, 0.42, -0.52, 0.11, 0.115, 0.14, P.trimCream);
  }

  // Expressive eyes & nose
  const eyeColor = kind === 'badger' ? 0x262220 : 0x3b3532;
  for (const side of [-1, 1]) oval(n, side * 0.17, 1.0, 0.323, 0.037, 0.049, 0.025, eyeColor);
  if (kind !== 'turtle') {
    const noseZ = kind === 'fox' ? 0.415 : 0.382;
    const noseRx = kind === 'bear' ? 0.055 : 0.044;
    const noseRy = kind === 'bear' ? 0.038 : 0.028;
    oval(n, 0, 0.916, noseZ, noseRx, noseRy, 0.028, nose);
  }

  bake(n);
  return n;
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

  // Static crossing architecture is already flattened into a small number of
  // meshes. Keep it as a receiver and reserve the shadow-map pass for the
  // compact old-street view where directional shadows are most noticeable.
  root.traverse(object => {
    if (object.isMesh) object.castShadow = false;
  });

  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial(), signalHeads.length);
  const disk = new THREE.Object3D(), color = new THREE.Color();
  signalHeads.forEach(({ at, rotY, scale }, i) => {
    disk.position.copy(at);
    disk.scale.set(...scale);
    disk.rotation.y = rotY;
    disk.updateMatrix();
    lamps.setMatrixAt(i, disk.matrix);
  });
  root.add(lamps);

  // Stylized animal NPCs at the 5 City Crossing pickup & delivery spots (baked individually for idle sway).
  const npcs = [
    cityAnimal(root, 11.5, 7.58, Math.PI, { kind: 'bear', fur: 0xc68a58, coat: P.wallCream, nose: P.woodDark }),
    cityAnimal(root, -11.5, 7.58, Math.PI, { kind: 'deer', fur: 0xd5a273, coat: P.terracotta, nose: P.woodDark }),
    cityAnimal(root, -11.5, -7.62, 0, { kind: 'badger', fur: 0x8e9593, coat: P.jade, sleeve: P.trimCream, nose: 0x3b3532 }),
    cityAnimal(root, -7.6, -28.17, Math.PI / 2, { kind: 'turtle', fur: 0x7ba07c, muzzle: 0xd9e1c4, coat: P.wallCream }),
    cityAnimal(root, 7.6, 27.83, -Math.PI / 2, { kind: 'fox', fur: 0xd87c46, coat: P.wallCream, nose: 0x3b3532 }),
  ];

  let last = -1;
  return time => {
    npcs.forEach((npc, idx) => {
      npc.rotation.z = Math.sin(time * 1.8 + idx * 1.3) * 0.024;
    });
    const t = time % 22, phase = t < 9 ? 0 : t < 11 ? 1 : t < 20 ? 2 : 3;
    if (last === phase) return;
    last = phase;
    signalHeads.forEach(({ axis, lamp, ped }, i) => {
      const active = axis !== Math.floor(phase / 2) ? 0 : phase % 2 ? (ped ? 0 : 1) : 2;
      lamps.setColorAt(i, color.setHex(active === lamp ? [0xff583d, 0xffcf48, 0x4cf09a][lamp] : 0x283532));
    });
    lamps.instanceColor.needsUpdate = true;
  };
}
