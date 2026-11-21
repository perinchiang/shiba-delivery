// Eastbound centreline in world metres. X always increases, so projection also works
// immediately after a teleport or when the rider travels west back to town.
import { clamp, lerp, smoothstep } from '../core/mathx.js';

const knots = [
  [-8, 4.17], [60, 4.17], [120, 4.17], [210, 22], [320, 62],
  [440, 52], [570, -8], [685, -24], [810, 12], [915, 34], [1030, 24],
  [1130, -2], [1210, -5],
];
export const roadEnd = knots.at(-1)[0];
function tangent(i) {
  const [xa, za] = knots[Math.max(0, i - 1)], [xb, zb] = knots[Math.min(knots.length - 1, i + 1)];
  return (zb - za) / (xb - xa);
}
export function centerZ(x) {
  let i = 1;
  while (i < knots.length - 1 && x > knots[i][0]) i++;
  const [a, za] = knots[i - 1], [b, zb] = knots[i];
  const t = clamp((x - a) / (b - a), 0, 1), u = 1 - t;
  return lerp(za, zb, t*t*(3-2*t)) + (b-a)*t*u*(u*tangent(i-1) - t*tangent(i));
}
export function roadHeight(x) {
  return 1.75 * (smoothstep(861, 907, x) - smoothstep(934, 982, x));
}
export const roadYaw = x => Math.atan2(1, (centerZ(x + .5) - centerZ(x - .5)));
export function halfWidth(x) {
  return 2.95 + 4.9 * smoothstep(1162, 1195, x);
}
export const landmarks = [
  { id: 'street', name: '榕湾老街', x: 0 },
  { id: 'gate', name: '镇口', x: 138 },
  { id: 'paddies', name: '稻田', x: 525 },
  { id: 'bridge', name: '河边小桥', x: 914 },
  { id: 'village', name: '村口', x: 1191 },
];
export function roadPlace(x) {
  if (x < 55) return '榕湾老街';
  if (x < 210) return '镇口';
  if (x < 842) return '稻田';
  return x < 1010 ? '河边小桥' : '村口';
}
const metres = [0];
for (let x = 1; x <= roadEnd; x++) {
  metres.push(metres[x - 1] + Math.hypot(1, centerZ(x)-centerZ(x-1), roadHeight(x)-roadHeight(x-1)));
}
export function distanceAlong(x) {
  const near = clamp(x, 0, roadEnd);
  return lerp(metres[Math.floor(near)], metres[Math.ceil(near)], near % 1);
}

// Use the existing pedestrian pavement in town. Outside town the gravel shoulder
// is walkable. Leave boot clearance inside the rail when parking on the bridge.
export function constrainToRoad(x, z, walking) {
  x = clamp(x, walking ? -8.3 : -7.2, roadEnd);
  const half = halfWidth(x);
  const edge = x > 890 && x < 952 ? (walking ? .2 : .92) : (walking ? -1.3 : .45);
  const blend = smoothstep(44, 65, x);
  return { x, z: clamp(z,
    lerp(walking ? -.72 : 1.89, centerZ(x) - half + edge, blend),
    lerp(walking ? 7.1 : 6.45, centerZ(x) + half - edge, blend)) };
}
