import * as THREE from 'three';
import { bake, box, cylinder, group, oval, rod, sign } from './shapes.js';

const timber = 0x734931,
  edge = 0xb98151,
  plaster = 0xf2d9ad;
const woodLid = 0x805b3d;
const jade = 0x427e72,
  darkJade = 0x285d55,
  vermilion = 0xa94832;

function lantern(g, x, y, z) {
  const lamp = group(g, x, y, z);
  rod(lamp, [0, 0.62, 0], [0, 0.33, 0], 0.017, timber);
  oval(lamp, 0, 0, 0, 0.245, 0.33, 0.245, 0xd87949);
  for (const h of [-0.24, -0.12, 0, 0.12, 0.24]) {
    const r = 0.246 * Math.sqrt(1 - (h / 0.33) ** 2);
    cylinder(lamp, 0, h, 0, r + 0.004, r + 0.004, 0.013, 0xb86437);
  }
  for (const h of [-0.3, 0.3]) cylinder(lamp, 0, h, 0, 0.115, 0.115, 0.055, timber);
  cylinder(lamp, 0, -0.43, 0, 0.025, 0.042, 0.21, vermilion);
}

export function buildBunShop(p, steamers) {
  // Set the service bay back from the arcade. Side jambs and the serving sill
  // frame a real pocket of shadow behind the baskets.
  box(p, -1.16, 1.5, -3.35, 4.62, 3, 0.28, 0xa27a54);
  box(p, 3.07, 1.5, -3.35, .80, 3, .28, 0xa27a54);
  box(p, 1.90, 1.25, -4.8, 1.52, 2.50, .16, 0x594538);
  box(p, 1.90, .055, -3.5, 1.52, .11, 2.6, 0xb48c64);
  for (const x of [-3.27, 3.27]) box(p, x, 1.52, -2.84, 0.4, 3.04, 1.6, plaster);
  box(p, 0, 0.08, -2.28, 6.6, 0.16, 2.05, 0xc29565);
  for (const x of [-2.85, 0.98, 2.84]) box(p, x, 1.41, -1.94, 0.15, 2.82, 0.2, timber);
  // A band of square glazed tiles catches the light below the cutting board.
  box(p, -0.94, 0.48, -1.97, 3.82, 0.96, 0.96, 0xdccfaf);
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 12; i++) {
      box(
        p,
        -2.69 + i * 0.318,
        0.19 + j * 0.29,
        -1.47,
        0.305,
        0.277,
        0.045,
        [0x598b7e, 0x649587, 0x709e8d][(i * 7 + j * 5) % 3],
      );
    }
  box(p, -0.94, 0.99, -1.82, 4.03, 0.14, 1.18, edge, 0.035);
  steamers.position.set(-1.05, 1.06, -1.79);
  p.add(steamers);

  // Split-timber lining and a row of glazed kitchen tiles give the recess depth.
  for (let i = 0; i < 20; i++) {
    const x = -2.79 + i * 0.19;
    box(p, x, 2.19, -3.191, 0.179, 1.17, 0.045, [0xb07e50, 0xb88958, 0xa5784c][i % 3]);
  }
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 2; j++) {
      box(p, -2.67 + i * 0.3, 1.12 + j * 0.24, -3.15, 0.29, 0.23, 0.06, 0xddcfaa);
    }
  box(p, -0.88, 1.68, -3.08, 3.52, 0.08, 0.32, timber);
  for (let i = 0; i < 4; i++) {
    const x = -2.24 + i * 0.32;
    cylinder(p, x, 1.85, -3.06, 0.105, 0.13, 0.28, 0xc19d72);
    cylinder(p, x, 1.86, -3.06, 0.114, 0.121, 0.07, 0xe8d6ad);
    cylinder(p, x, 2.01, -3.06, 0.11, 0.11, 0.035, woodLid);
  }
  // Worn hanging shop board with bronze corner pins.
  box(p, 0, 3.18, -1.99, 6.82, 0.81, 0.3, timber, 0.045);
  box(p, 0, 3.18, -1.81, 4.5, 0.72, 0.13, edge, 0.04);
  sign(p, 0, 3.18, -1.736, 4.4, 0.63, '榕记包子铺', { bg: '#245448', ink: '#ffdfa3', font: 'kai' });
  for (const x of [-2.1, 2.1]) for (const h of [2.94, 3.42]) oval(p, x, h, -1.72, 0.026, 0.026, 0.016, 0xca9a58);
  for (const x of [-2.75, 2.75]) {
    for (let i = -2; i <= 2; i++) box(p, x + i * 0.125, 3.18, -1.815, 0.035, 0.49, 0.055, edge);
  }
  // Short pan-tile canopy leaves both the nameboard and serving bay in view.
  const roof = box(p, 0, 2.82, -1.81, 6.78, 0.105, 1.16, darkJade);
  roof.rotation.x = 0.22;
  for (let i = 0; i < 35; i++) {
    const x = -3.26 + i * 0.192;
    rod(p, [x, 2.99, -2.37], [x, 2.74, -1.24], 0.067, i % 3 ? jade : 0x56897a, 0.073, 10);
  }
  for (const x of [-2.86, 2.85]) lantern(p, x, 2.12, -1.5);
  const door = group(p, 1.15, 0, -2.56);
  box(door, .75, 1.22, 0, 1.48, 2.45, .10, 0x594537);
  box(door, .75, .57, .06, 1.25, .88, .025, 0x77503a);
  rod(door, [1.33,.85,.12], [1.33,1.14,.12], .034, 0xd1ac75);
  bake(door);
  for (const x of [1.51, 2.26]) {
    box(p, x, 1.94, -2.24, 0.71, 0.91, 0.053, vermilion);
    box(p, x, 1.54, -2.201, 0.68, 0.036, 0.014, 0xe3ac77);
  }
  sign(p, 1.51, 1.99, -2.2, 0.52, 0.52, '手', { bg: '#a94832', ink: '#fff0c9', frame: false });
  sign(p, 2.26, 1.99, -2.2, 0.52, 0.52, '作', { bg: '#a94832', ink: '#fff0c9', frame: false });
  box(p, 0.29, 1.96, -2.89, 0.68, 1.13, 0.08, timber);
  sign(p, 0.29, 1.96, -2.84, 0.59, 1.03, '今日鲜肉', { vertical: true, bg: '#edd5aa', ink: '#70432c' });
  sign(p, -0.95, 0.65, -1.438, 0.92, 0.28, '进店取餐 →', { bg: '#fcdfaa', ink: '#855337' });
  return door;
}

// Transparent billows drift from the open basket and fade below the eaves.
export function bunSteam(parent, x, y, z) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 48;
  const ctx = canvas.getContext('2d');
  const fade = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  fade.addColorStop(0, 'rgba(255,250,231,0.85)');
  fade.addColorStop(0.5, 'rgba(255,250,231,0.44)');
  fade.addColorStop(1, 'rgba(255,250,231,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 48, 48);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const wisps = Array.from({ length: 9 }, () => {
    const wisp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
    parent.add(wisp);
    return wisp;
  });
  return (time) =>
    wisps.forEach((wisp, i) => {
      const age = (time * 0.42 + i / wisps.length) % 1;
      wisp.position.set(x + 0.12 * Math.sin(i * 2.4 + age * 4) + 0.12 * age, y + age * 0.88, z + 0.1 * Math.cos(i));
      wisp.scale.set(0.12 + age * 0.28, 0.2 + age * 0.32, 1);
      wisp.material.opacity = 0.45 * Math.sin(Math.PI * age);
    });
}
