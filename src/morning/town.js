/** Build the exterior street and the pharmacy's separate walk-in room. Coordinates are in metres. */
import * as THREE from 'three';
import { placeInstances } from './kit-instances.js';
import { RNG } from '../core/rng.js';
import { bake, box, curve, cylinder, group, oval, piece, rod, sign } from './shapes.js';
import { buildBunShop, bunSteam } from './bun-shop.js';
import { ear, parcel } from './rider.js';

import { bunFacade, streetResident } from './orders.js';

import { CURB_H, CURB_Z, treePitRadius, treePitZ, streetTreeXs } from './street-layout.js';
const cream = 0xffecc5, wood = 0x986643, teal = 0x397d73;
const glass = 0x547c77, glassLight = 0x86a9a0, charcoal = 0x485953;

function plant(g, x, y, z, size, flowers = false) {
  const p = group(g, x, y, z);
  p.scale.setScalar(size);
  cylinder(p, 0, 0.23, 0, 0.25, 0.17, 0.46, 0xc77953, 14);
  cylinder(p, 0, 0.44, 0, 0.27, 0.25, 0.09, 0xe5a076, 14);
  cylinder(p, 0, 0.488, 0, 0.225, 0.225, 0.014, 0x695442, 14);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, r = 0.22 + (i % 2) * 0.065;
    const x1 = Math.sin(a) * r, z1 = Math.cos(a) * r;
    const leaf = oval(p, x1 * 0.61, 0.65 + (i % 3) * 0.09, z1 * 0.61,
      0.093, 0.28, 0.108, [0x619676, 0x87ad75, 0x477f63][i % 3]);
    leaf.rotation.set(z1 * 2.5, 0, -x1 * 2.5);
    if (flowers && i % 2 === 0) oval(p, x1, 0.88 + (i % 3) * 0.09, z1, 0.077, 0.066, 0.072, 0xf5bc67);
  }
}

function windowFrame(g, x, y, z, w, h, trim, shutters = false) {
  box(g, x, y, z, w + 0.13, h + 0.13, 0.10, trim);
  box(g, x, y, z + 0.055, w, h, 0.042, glass);
  box(g, x - w * 0.245, y + h * 0.18, z + 0.079, w * 0.43, h * 0.53, 0.024, glassLight);
  box(g, x + w * 0.245, y + h * 0.18, z + 0.079, w * 0.43, h * 0.53, 0.024, 0x91ada0);
  box(g, x, y, z + 0.10, 0.055, h, 0.05, trim);
  box(g, x, y - h * 0.11, z + 0.10, w, 0.052, 0.05, trim);
  box(g, x, y - h * 0.52, z + 0.08, w + 0.27, 0.085, 0.26, trim);
  if (shutters) {
    for (const side of [-1, 1]) {
      const px = x + side * (w * 0.5 + 0.17);
      box(g, px, y, z, 0.24, h, 0.13, teal);
      for (let j = 0; j < 5; j++) box(g, px, y + (j - 2) * h / 5.7, z + 0.084, 0.23, 0.035, 0.035, 0x80a08a);
    }
  }
}

function awning(g, color) {
  const count = 13, width = 6.37 / count;
  for (let i = 0; i < count; i++) {
    const x = (i - 6) * width, tint = i % 2 ? cream : color;
    const fabric = box(g, x, 2.73, -1.60, width + 0.002, 0.065, 0.98, tint);
    fabric.rotation.x = 0.23;
    box(g, x, 2.53, -1.12, width, 0.16, 0.06, tint);
    oval(g, x, 2.456, -1.12, width * 0.50, 0.074, 0.035, tint);
  }
  rod(g, [-3.12, 2.56, -1.145], [3.12, 2.56, -1.145], 0.034, wood);
}

function porch(g, residential) {
  const width = residential ? 3.1 : 5.95, x = residential ? 1.1 : 0;
  const roof = box(g, x, 2.75, -1.67, width, 0.17, 1.02, residential ? 0x849b89 : 0x718d78);
  roof.rotation.x = 0.12;
  box(g, x, 2.63, -1.16, width, 0.12, 0.09, residential ? wood : teal);
  for (const side of [-1, 1]) {
    const anchor = x + side * (width / 2 - 0.30);
    rod(g, [anchor, 2.14, -2.0], [anchor, 2.69, -1.29], 0.038, residential ? wood : teal);
  }
  if (!residential) {
    for (const lx of [-1.22, 1.53]) {
      rod(g, [lx, 2.69, -1.45], [lx, 2.50, -1.45], 0.023, 0x795c43);
      cylinder(g, lx, 2.47, -1.45, 0.07, 0.15, 0.09, 0xb89053);
      oval(g, lx, 2.36, -1.45, 0.14, 0.13, 0.14, 0xffe4a0);
    }
  }
}

function streetShop(g, spec, i, steamers) {
  const { x, name, sub, wall, stripe, ink } = spec;
  const p = group(g, x, CURB_H, 0);
  const top = 5.10 + (i % 3) * 0.42;
  const pharmacy = name === '便民药店';
  // The pharmacy has a real passage through the façade; the door can fold into it.
  const jambLeft = 0.66, jambRight = 2.44;
  function facade(y, z, width, height, depth, color) {
    if (!pharmacy) { box(p, 0, y, z, width, height, depth, color); return; }
    const half = width / 2;
    box(p, (jambLeft - half) / 2, y, z, half + jambLeft, height, depth, color);
    box(p, (jambRight + half) / 2, y, z, half - jambRight, height, depth, color);
  }
  if (steamers) {
    box(p, 0, (top + 2.84) / 2, -3.75, 6.94, top - 2.84, 3.26, wall);
  } else {
    facade(top / 2, -3.75, 6.94, top, 3.26, wall);
    facade(0.40, -2.10, 6.91, 0.80, 0.12, spec.base);
  }
  if (pharmacy) {
    box(p, 1.55, (top + 2.40) / 2, -3.75, 1.78, top - 2.40, 3.26, wall);
    box(p, 1.55, 1.19, -5.24, 1.78, 2.40, 0.12, 0x876e50);
    box(p, 1.55, -0.032, -3.56, 1.78, 0.067, 3.26, 0xc6ad87);
  }
  box(p, 0, top, -3.72, 7.10, 0.16, 3.54, cream);
  box(p, 0, top + 0.14, -2.13, 6.95, 0.21, 0.15, spec.base);
  box(p, 0, 3.65, -2.05, 6.94, 0.10, 0.30, cream);
  const upper = (top + 3.67) / 2;
  for (const wx of [-1.77, 0.05, 1.85]) windowFrame(p, wx, upper, -2.09, 1.09, top - 3.96, cream, i % 3 === 0);
  // A parapet, water tank and drying rail break the row-house silhouette.
  if (i % 2 === 0) {
    cylinder(p, -2.01, top + 0.38, -3.2, 0.53, 0.53, 0.76, 0x91aaa1);
    for (const dy of [0.12, 0.42, 0.73]) cylinder(p, -2.01, top + dy, -3.2, 0.55, 0.55, 0.043, charcoal);
  } else {
    rod(p, [-2.1, top, -3.1], [-2.1, top + 0.86, -3.1], 0.036, charcoal);
    rod(p, [-2.1, top + 0.61, -3.1], [-0.47, top + 0.61, -3.1], 0.033, charcoal);
    for (let j = 0; j < 3; j++) box(p, -1.83 + j * 0.46, top + 0.40, -3.1, 0.33, 0.47, 0.045, [cream, stripe, spec.base][j]);
  }

  if (steamers) {
    const door = buildBunShop(p, steamers);
    bake(p);
    return door;
  }
  box(p, 0, 3.20, -2.01, 6.39, 0.76, 0.22, spec.base, 0.047);
  sign(p, 0, 3.2, -1.887, 6.25, 0.654, name, { bg: spec.sign, ink, sub });
  if (name === '便民药店' || name === '榕树里') porch(p, name === '榕树里');
  else awning(p, stripe);
  windowFrame(p, -1.23, 1.45, -2.06, 2.87, 1.35, spec.base);
  // Closed glazed shopfronts give only a hint of light until the rider opens the door.
  if (pharmacy) {
    for (const px of [0.64, 2.46]) box(p, px, 1.20, -2.01, 0.09, 2.4, 0.16, spec.base);
    box(p, 1.55, 2.40, -2.01, 1.92, 0.12, 0.16, spec.base);
  } else box(p, 1.55, 1.19, -2.01, 1.42, 2.37, 0.15, spec.base);
  const door = group(p, 0.945, 0, -1.918);
  box(door, 0.605, 1.18, 0, 1.21, 2.21, 0.08, stripe);
  box(door, 0.605, 1.61, 0.049, 0.99, 1.02, 0.035, name === '便民药店' ? 0xe8d798 : glassLight);
  box(door, 0.605, 0.59, 0.058, 0.99, 0.54, 0.035, spec.base);
  rod(door, [1.055, 0.90, 0.103], [1.055, 1.22, 0.103], 0.034, cream);
  if (name === '便民药店') {
    door.position.x = jambLeft;
    door.scale.set(1.78 / 1.21, 1.07, 1);
    bake(door);
  }
  box(p, 1.55, 0.018, -1.60, 1.43, 0.036, 0.48, 0xa98058);
  plant(p, -2.88, 0, -1.5, 0.85 + (i % 2) * 0.17, i % 2 === 0);
  plant(p, 2.77, 0, -1.56, 0.73, true);

  if (name === '陈记肠粉') {
    box(p, -1.29, 0.49, -1.29, 1.78, 0.93, 0.66, 0xc18156, 0.045);
    box(p, -1.29, 0.99, -1.29, 1.90, 0.09, 0.76, cream);
    for (let j = 0; j < 3; j++) cylinder(p, -1.61, 1.11 + j * 0.13, -1.32, 0.31, 0.33, 0.14, j % 2 ? wood : 0xc69460);
    cylinder(p, -1.61, 1.48, -1.32, 0.22, 0.34, 0.10, 0xe2ba7d);
    oval(p, -1.61, 1.55, -1.32, 0.062, 0.042, 0.049, wood);
    for (let j = 0; j < 4; j++) {
      cylinder(p, -1.01, 1.075 + j * 0.048, -1.28, 0.136, 0.090, 0.066, 0xe6d9ad);
    }
    cylinder(p, -0.65, 1.135, -1.33, 0.048, 0.054, 0.21, 0x86563c);
    cylinder(p, -0.65, 1.26, -1.33, 0.030, 0.033, 0.06, 0xba5d42);
    sign(p, -0.80, 0.60, -0.944, 0.59, 0.38, '现蒸', { ink: '#994c35' });
    sign(p, -1.21, 1.52, -1.924, 0.79, 0.35, '早市', { bg: '#edcc88', ink: '#714934' });
    sign(p, -2.27, 1.46, -1.924, 0.53, 0.72, '鲜虾肠', { bg: '#f9dab2', ink: '#934c39', vertical: true });
    sign(p, 2.68, 1.67, -2.009, 0.37, 0.49, '12', { bg: '#688c7d', ink: '#fff2c8', font: 'hei' });
    box(p, 0.28, 1.80, -1.92, 0.26, 0.48, 0.06, 0xc08569);
  } else if (name === '便民药店') {
    box(p, -2.94, 2.64, -1.51, 0.10, 0.10, 1.21, teal);
    box(p, -2.92, 2.04, -0.97, 0.70, 0.77, 0.15, teal, 0.074);
    box(p, -2.92, 2.04, -0.875, 0.43, 0.135, 0.04, cream);
    box(p, -2.92, 2.04, -0.867, 0.14, 0.43, 0.04, cream);
    sign(p, -1.77, 1.32, -1.915, 0.91, 0.40, '营业中', { bg: '#fff1c7', ink: '#397967' });
    box(p, -0.66, 0.934, -1.90, 0.98, 0.068, 0.28, wood);
    for (let j = 0; j < 3; j++) {
      const px = -0.94 + j * 0.29;
      cylinder(p, px, 1.11, -1.91, 0.083, 0.089, 0.27 + j * 0.036, 0x98734e);
      cylinder(p, px, 1.26 + j * 0.018, -1.91, 0.071, 0.071, 0.045, cream);
    }
  } else if (name === '榕树里') {
    sign(p, 2.68, 1.88, -1.991, 0.47, 0.55, '3', { bg: '#327b70', ink: '#ffebbd', font: 'hei' });
    box(p, -0.89, 0.63, -1.56, 1.50, 0.09, 0.48, wood);
    for (const px of [-1.51, -0.27]) box(p, px, 0.33, -1.56, 0.10, 0.60, 0.31, charcoal);
  } else if (i % 2 === 0) {
    for (const px of [-2.10, -1.43, -0.76]) plant(p, px, 0, -1.25, 0.56, true);
  }
  bake(p);
  return door;
}

const shops = [
  [-12, '石湾茶楼', '一盅两件', 0xe1c897, 0x8ea382, 0x6e9584, '#f4e2b5', '#436753'],
  [bunFacade.x, '榕记包子铺', '手作现蒸', 0xb9ccc0, 0x7daba3, 0xc07b61, '#f4dfbc', '#934f43'],
  [2, '陈记肠粉', '石 磨 米 浆', 0xf3ce9f, 0xb77c54, 0xce7653, '#f7e4b9', '#883f32'],
  [9, '便民药店', '榕湾老街　·　早七时开门', 0xc0d2b2, 0x518d7c, 0x6fa891, '#306e66', '#ffebbe'],
  [16, '榕湾邮局', '信 件 收 寄', 0xe2d5af, 0x668b70, 0x708a6a, '#eee5c6', '#4d715d'],
  [23, '阿娟花档', '时 花 鲜 切', 0xe8c2b0, 0xc08579, 0xe4a29a, '#f5d7bd', '#924c48'],
  [30, '榕树里', '街 坊 住 宅', 0xe1c49d, 0x9c805e, 0x7aa18b, '#eddec3', '#4a6655'],
  [37, '南记糖水', '陈皮绿豆沙', 0xc6d3bd, 0x6d9183, 0x95ac84, '#eddfbd', '#507263'],
  [44, '永安冰室', '冻柠茶　·　菠萝油', 0xb9ccc0, 0x7daba3, 0xc07b61, '#f4dfbc', '#934f43'],
].map(([x, name, sub, wall, base, stripe, signColor, ink]) =>
  ({ x, name, sub, wall, base, stripe, sign: signColor, ink }));

function neighbor(g, x, y, z, rabbit) {
  const n = group(g, x, y, z);
  const coat = rabbit ? 0xe8e6cd : 0x9f6861, fur = rabbit ? 0xf4dfc7 : 0xbcb5a5;
  for (const side of [-1, 1]) oval(n, side * 0.13, 0.12, 0.03, 0.13, 0.11, 0.16, wood);
  oval(n, 0, 0.46, 0, 0.30, 0.34, 0.24, coat);
  if (rabbit) {
    oval(n, 0, 0.70, 0.044, 0.20, 0.075, 0.19, teal);
    box(n, 0.13, 0.54, 0.21, 0.09, 0.075, 0.02, teal);
  }
  oval(n, 0, 0.99, 0, 0.45, 0.39, 0.356, fur);
  oval(n, 0, 0.88, 0.22, 0.27, 0.16, 0.175, cream);
  for (const side of [-1, 1]) {
    if (rabbit) {
      const ear = oval(n, side * 0.195, 1.47, -0.03, 0.105, 0.32, 0.10, fur);
      ear.rotation.z = -side * 0.12;
      const inset = oval(n, side * 0.198, 1.49, 0.057, 0.05, 0.22, 0.023, 0xdbad9c);
      inset.rotation.z = ear.rotation.z;
    } else {
      ear(n, side * 0.27, 1.23, -0.04, 0.58, fur, 0xca9e95, -side * 0.21);
      for (let i = 0; i < 2; i++) rod(n, [side * 0.26, 0.89 - i * 0.065, 0.27],
        [side * 0.43, 0.91 - i * 0.10, 0.22], 0.010, charcoal);
    }
    oval(n, side * 0.17, 1.0, 0.323, 0.037, 0.049, 0.025, 0x3b3532);
    oval(n, side * 0.27, 0.46, 0.07, 0.10, 0.175, 0.10, coat);
    if (rabbit) {
      const points = [];
      for (let a = 0; a <= 12; a++) points.push([side * 0.17 + Math.cos(a * Math.PI / 6) * 0.078,
        1.0 + Math.sin(a * Math.PI / 6) * 0.067, 0.354]);
      curve(n, points, 0.010, wood);
    }
  }
  oval(n, 0, 0.916, 0.38, 0.042, 0.028, 0.026, 0x855850);
  bake(n);
  return n;
}

// One moulded wedge per brick, with an open soil bed and a recessed mortar joint.
function treePits(parent) {
  const beds = group(parent);
  const count = 16, pitch = Math.PI * 2 / count;
  const inner = treePitRadius - .17, joint = .025;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, treePitRadius - .012, joint, pitch - joint, false);
  shape.absarc(0, 0, inner + .012, pitch - joint, joint, true);
  shape.closePath();
  const brick = new THREE.ExtrudeGeometry(shape, {
    depth: .18, curveSegments: 2, bevelEnabled: true, bevelSegments: 1, bevelSize: .012, bevelThickness: .012,
  });
  brick.rotateX(-Math.PI / 2);
  const clay = [0xb87957, 0xc18763, 0xae7255, 0xc08a68];
  const soilHeight = .105;
  for (const [i, x] of streetTreeXs.entries()) {
    const bed = group(beds, x, CURB_H, treePitZ);
    // The dark base sits behind the joints. Soil meets the inside brick face.
    cylinder(bed, 0, .05, 0, treePitRadius - .023, treePitRadius - .023, .10, 0x715441, 48);
    cylinder(bed, 0, soilHeight, 0, inner + .014, inner + .014, .020, 0x71513a, 48);
    for (let j = 0; j < count; j++) {
      piece(bed, brick, clay[(j + Math.floor(j / 3) + i) % clay.length], 0, .015, 0).rotation.y = pitch * j;
    }
    const rng = new RNG('street-soil-' + i);
    for (let j = 0; j < 11; j++) {
      const a = j * 2.4, r = rng.range(.32, inner - .06);
      oval(bed, r * Math.cos(a), soilHeight + .011, r * Math.sin(a), rng.range(.023, .046), .012, .027,
        rng.pick([0x806047, 0x947257, 0x6a4c36]), true);
    }
  }
  bake(beds);
  return CURB_H + soilHeight + .01;
}

export function createStreet(steamers, banyan) {
  const root = new THREE.Group();
  const road = group(root);
  box(road, 12, -0.17, 2, 80, 0.33, 23, 0xaaa598);
  const back = -2.15, pavementWidth = CURB_Z - back;
  box(road, 12, .05, (back + CURB_Z) / 2, 73, .18, pavementWidth, 0xd5c2a1);
  for (let i = -17; i < 51; i++) {
    box(road, i, 0.076, CURB_Z - .105, 0.978, 0.138, 0.21, i % 4 === 0 ? 0xd4bf99 : 0xe3cfab);
    if (i % 2 === 0) box(road, i, .141, (back + CURB_Z - .22) / 2, .018, .003, pavementWidth - .22, 0xbcae94);
    if (i % 3 === 0) box(road, i, 0.005, (CURB_Z + 7.05) / 2, 1.18, 0.009, 0.075, 0xe2d4b8);
    if (i % 7 === 0) {
      box(road, i, 0.009, CURB_Z + .22, 0.52, 0.01, 0.20, 0x787d72);
      for (let j = 0; j < 6; j++) box(road, i - 0.20 + j * 0.079, 0.017, CURB_Z + .22, 0.022, 0.008, 0.16, 0xa0a395);
    }
  }
  for (const cross of [-5.45, 20.0, 36.3]) {
    for (let i = 0; i < 8; i++) box(road, cross, 0.006, CURB_Z + .36 + i * .53, 1.22, 0.01, 0.26, 0xe4dcca);
  }
  bake(road);
  const shopSide = group(root);
  const doors = new Map();
  shops.forEach((shop, i) => {
    const door = streetShop(shopSide, shop, i, shop.name === '榕记包子铺' ? steamers : null);
    doors.set(shop.name, door);
  });
  // The chase camera sees both sides of the road and the bend at its far end.
  const opposite = group(root, 27, 0, 7.05);
  opposite.rotation.y = Math.PI;
  ['海棠饼家', '榕湾照相馆', '街坊修鞋', '青禾书店', '莲记粉面', '顺风车行', '阿莲裁缝', '新桥茶庄'].forEach((name, i) => {
    streetShop(opposite, { ...shops[i], name, sub: '' }, i);
  });
  const far = group(root);
  // Leave clearance beyond both ends of the playable street for the longer chase boom.
  const eastTrees = group(root);
  for (const x of [-19, 49.5]) {
    const grove = [1.7, 5.9, 10.4].map((z, i) => [x, .12, z, i * 2.4, 1.05, 1.02, 1.05]);
    placeInstances(x > 0 ? eastTrees : far, banyan, grove);
  }
  box(far, 13, 0.07, 8.43, 68, 0.15, 2.78, 0xd3c2a4);
  bake(far);
  bake(eastTrees);
  const rng = new RNG('morning-roofs');
  const skyline = group(root);
  for (let i = -6; i <= 17; i++) {
    const h = rng.range(5.2, 9.2), x = i * 3.8;
    box(skyline, x, h / 2, -12 - i % 3, rng.range(3.2, 4.7), h, 2.5, rng.pick([0xaac2b5, 0xbac6b4, 0xbac9b9]));
    for (let k = 0; k < 3; k++) box(skyline, x + k - 1, h - 1.1, -10.71 - i % 3, 0.45, 0.75, 0.07, 0x93afa3);
  }
  bake(skyline);
  const soilTop = treePits(shopSide);
  const streetTrees = streetTreeXs.map((x, i) => {
    const scale = i === 1 ? .48 : .56 + (i % 3) * .05;
    return [x, soilTop, treePitZ, .90 + i * 2.4, scale, scale, scale];
  });
  placeInstances(shopSide, banyan, streetTrees);
  const updateSteam = bunSteam(shopSide, bunFacade.x - 1.83, CURB_H + 1.67, -1.91);
  const cat = neighbor(shopSide, streetResident.point.x, CURB_H, streetResident.point.z - 0.40, false);
  cat.rotation.y = -0.23;
  const steam = [];
  for (let i = 0; i < 4; i++) steam.push(oval(shopSide, 0, 0, 0, 0.07, 0.13, 0.07, 0xffebcb));
  return { root, shopSide, opposite, eastTrees, doors, update(t) {
    updateSteam(t);
    steam.forEach((puff, i) => {
      const life = (t * 0.53 + i * 0.25) % 1;
      const r = (0.048 + life * 0.08) * Math.sin(life * Math.PI);
      puff.position.set(0.39 + Math.sin(life * 4.2 + i) * 0.085, 1.70 + life * 0.77, -1.31);
      puff.scale.set(r, r * 1.5, r);
    });
    cat.rotation.z = Math.sin(t * 1.9) * 0.022;
  } };
}

function shopRoom() {
  const root = new THREE.Group();
  const room = group(root);
  box(room, 0, -0.20, 0, 8.7, 0.38, 6.50, 0xbc9474, 0.12);
  for (let x = -5; x <= 5; x++) {
    for (let z = -4; z <= 4; z++) box(room, x * 0.77, -0.017, z * 0.70, 0.758, 0.034, 0.688,
      (x + z) % 2 ? 0xe0d0ac : 0xe8d9b9);
  }
  box(room, 0, 2.05, -3.11, 8.58, 4.1, 0.20, 0xefdbb3);
  box(room, 0, 0.63, -2.97, 8.58, 1.26, 0.14, 0x82aa93);
  box(room, 0, 1.28, -2.90, 8.58, 0.086, 0.14, 0x4d8273);
  box(room, -4.24, 1.10, -0.20, 0.15, 2.20, 5.64, 0xb7cbb3);
  box(room, 4.24, 0.40, -0.20, 0.15, 0.80, 5.64, 0xb7cbb3);
  box(room, 0, 0.012, 2.48, 1.70, 0.024, 0.70, 0x8b9c82);
  return { root, room };
}

export function createPharmacy() {
  const { root, room } = shopRoom();
  box(room, -0.15, 3.47, -2.92, 3.93, 0.84, 0.15, wood, 0.05);
  sign(room, -0.15, 3.47, -2.832, 3.80, 0.72, '便民药店', { ink: '#326953', sub: '街 坊 老 店' });

  const rng = new RNG('pharmacy-shelves');
  for (const x of [-2.68, 2.62]) {
    box(room, x, 1.57, -2.73, 2.18, 2.82, 0.32, 0xab805a, 0.04);
    box(room, x, 1.57, -2.545, 2.00, 2.63, 0.055, 0x765b46);
    for (let row = 0; row < 4; row++) {
      const y = 0.38 + row * 0.64;
      box(room, x, y, -2.40, 2.14, 0.085, 0.39, 0xd5a878);
      for (let j = 0; j < 5; j++) {
        const px = x - 0.81 + j * 0.40, h = rng.range(0.24, 0.42);
        const color = rng.pick([0x91aa8f, 0xd5ac6c, 0xc68c77, 0x92b2ad, 0xe6cfab]);
        if (j % 3 === 1) {
          cylinder(room, px, y + h / 2 + 0.05, -2.37, 0.105, 0.12, h, color, 12);
          cylinder(room, px, y + h + 0.06, -2.37, 0.087, 0.087, 0.07, cream, 12);
        } else {
          box(room, px, y + h / 2 + 0.05, -2.37, 0.27, h, 0.19, color);
          box(room, px, y + h * 0.65, -2.266, 0.22, 0.046, 0.012, cream);
        }
      }
    }
  }
  const rabbit = neighbor(root, -1.02, 0.39, -1.58, true);
  const counter = group(room, 0, 0, -1.06);
  box(counter, 0, 0.51, 0, 3.72, 1.01, 0.80, 0x609581, 0.09);
  box(counter, 0, 1.025, 0, 3.84, 0.13, 0.92, wood, 0.055);
  for (let i = -8; i < 9; i++) box(counter, i * 0.205, 0.53, 0.405, 0.023, 0.78, 0.032, 0x4d8475);
  sign(counter, 0.89, 0.62, 0.435, 1.08, 0.44, '取件处', { bg: '#f2dfaf', ink: '#356352' });
  counter.scale.y = 0.71;
  plant(room, -3.37, 0, -0.83, 1.35);
  const bag = parcel(root, 0.64, 0.776, -0.88);
  bake(room);
  return { root, bag, update(t) { rabbit.rotation.z = Math.sin(t * 1.7) * 0.025; } };
}

export function createBunRoom(display) {
  const { root, room } = shopRoom();
  // Timber posts frame a prep window into the kitchen.
  for (const x of [-3.98, -1.35, 1.58, 3.98]) box(room, x, 2.03, -2.87, .14, 4.02, .19, wood);
  box(room, 0, 3.89, -2.83, 8.18, .17, .23, wood);
  box(room, 0, 3.07, -2.83, 2.62, .77, .17, wood, .045);
  sign(room, 0, 3.07, -2.733, 2.50, .67, '榕记包子铺', { bg: '#26594c', ink: '#ffe1a2' });
  for (const x of [-2.65, 2.72]) {
    box(room, x, 2.03, -2.85, 2.18, 1.35, .16, wood);
    box(room, x, 2.03, -2.75, 1.98, 1.16, .06, 0xa8c3ae);
    for (const dx of [-.47, 0, .47]) box(room, x + dx, 2.03, -2.70, .055, 1.16, .055, wood);
    box(room, x, 2.19, -2.70, 2, .055, .055, wood);
  }
  // A stove and removable bamboo stacks sit next to the short handoff counter.
  box(room, -2.42, .47, -1.14, 2.55, .94, 1.34, 0x397367, .06);
  box(room, -2.42, .97, -1.14, 2.66, .10, 1.42, 0xb28c62, .04);
  display.scale.setScalar(.78);
  display.position.set(-2.40, 1.02, -1.12);
  room.add(display);
  const steam = bunSteam(root, -3, 1.49, -1.21);
  box(room, .83, .36, -1.10, 3.85, .72, .96, 0xc49762, .04);
  for (let i = 0; i < 16; i++) box(room, -.96 + i * .24, .38, -.607, .033, .64, .032, 0xa9764e);
  box(room, .83, .75, -1.10, 4, .10, 1.09, wood, .04);
  sign(room, .90, .42, -.58, 1.17, .37, '骑手取餐', { bg: '#25594e', ink: '#ffe5af' });
  const bag = parcel(root, .75, .80, -.81);
  // Folded paper sacks and the red towel mark the packing end of the counter.
  for (let i = 0; i < 4; i++) {
    const sack = box(room, .94 + i * .012, .815 + i * .022, -1.29, .39, .019, .24, 0xd7ad78);
    sack.rotation.y = .04 * i;
  }
  box(room, 1.41, .784, -.64, .35, .055, .24, 0xb3684c);
  box(room, 1.41, .639, -.547, .35, .30, .041, 0xb3684c);
  for (const y of [.53,.57]) box(room, 1.41, y, -.523, .35, .016, .012, cream);
  sign(room, -2.24, .50, -.448, .50, .48, '蒸', { bg: '#305f54', ink: '#e7bf83' });
  // The rolling pin, flour and freshly portioned dough read at counter height.
  box(room, 2.07, .828, -1.10, 1.14, .055, .70, 0xddb67d, .035);
  rod(room, [1.61,.93,-1.30], [2.38,.93,-1.20], .080, 0xbd8452);
  rod(room, [1.48,.93,-1.32], [2.50,.93,-1.185], .034, wood);
  for (let i = 0; i < 3; i++) oval(room, 1.74 + i * .29, .91, -.96, .118, .065, .105, cream);
  for (const [i, name] of ['鲜肉包', '香菇包', '豆沙包'].entries()) {
    const x = -.87 + i * .62;
    box(room, x, 2.02, -2.82, .51, 1.12, .10, wood, .025);
    sign(room, x, 2.02, -2.757, .44, 1.04, name, { bg: '#ecd1a1', ink: '#75452e', vertical: true });
  }
  // Keep the cook visible above the service top, with a low work platform at his feet.
  box(room, -.57, .14, -1.87, 1.10, .28, .73, wood);
  const chef = neighbor(root, -.57, .29, -1.85, false);
  cylinder(chef, 0, 1.29, 0, .32, .38, .15, cream);
  for (const x of [-.21, 0, .21]) oval(chef, x, 1.41, 0, .19, .15, .21, 0xffebc7);
  box(chef, 0, .46, .221, .38, .46, .044, 0x537d6c, .026);
  bake(chef);
  bake(room);
  return { root, bag, update(time) {
    steam(time);
    chef.rotation.z = Math.sin(time * 1.8) * .022;
  } };
}
