import { rideMinZ } from './street-layout.js';
// Eastbound centreline in world metres. X always increases, so projection also works
// immediately after a teleport or when the rider travels west back to town.
import { clamp, lerp, smoothstep } from '../core/mathx.js';

const knots = [
  [-8, 4.17], [60, 4.17], [120, 4.17], [210, 22], [320, 62],
  [440, 52], [570, -8], [685, -24], [810, 12], [915, 34], [1030, 24],
  [1130, -2], [1210, -5],
];
// Dimensions shared by the road mesh, collision, map and approach camera.
export const crossing = { x: 92, z: 4.17, half: 5.5, arm: 50 };
export const bridgeJointXs = [894, 910, 930, 950];
// One deliberately bounded road-edge study area. Keeping this in the route
// module lets the road mesh and paddy generator share the same cross-section.
export const paddyShoulderSample = { start: 748, end: 812 };
export const roadEnd = knots.at(-1)[0];
function tangent(i) {
  if (knots[i][0] <= 120) return 0;
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
  const city = 1 - smoothstep(29, 39, Math.abs(x - crossing.x));
  return 2.95 + (crossing.half - 2.95) * city + 4.9 * smoothstep(1162, 1195, x);
}
export const landmarks = [
  { id: 'street', name: '榕湾老街', x: 0 },
  { id: 'crossing', name: '城市十字路口', x: crossing.x },
  { id: 'gate', name: '镇口', x: 138 },
  { id: 'paddies', name: '稻田', x: 525 },
  { id: 'bridge', name: '河边小桥', x: 914 },
  { id: 'village', name: '村口', x: 1191 },
];
export function roadPlace(x) {
  if (x <= crossing.x-31) return '榕湾老街';
  if (Math.abs(x - crossing.x) < 31) return '城市十字路口';
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

// Distance to either end via the junction when the rider is on a side street.
export function routeDistances(x, z) {
  const sideStreet = Math.abs(x-crossing.x) <= crossing.half+1.3 && Math.abs(z-crossing.z) > crossing.half;
  const along = distanceAlong(sideStreet ? crossing.x : x);
  const extra = sideStreet ? Math.abs(z-crossing.z) : 0;
  return { town: along+extra, village: distanceAlong(roadEnd)-along+extra };
}

// Use the existing pedestrian pavement in town. Outside town the gravel shoulder
// is walkable. Leave boot clearance inside the rail when parking on the bridge.
export function constrainToRoad(x, z, walking) {
  x = clamp(x, walking ? -8.3 : -7.2, roadEnd);
  const half = halfWidth(x);
  const edge = x > 890 && x < 952 ? (walking ? .2 : .92) : (walking ? -1.3 : .45);
  const blend = smoothstep(44, 65, x);
  const mainZ = clamp(z,
    lerp(walking ? -.72 : rideMinZ, centerZ(x) - half + edge, blend),
    lerp(walking ? 7.1 : 6.45, centerZ(x) + half - edge, blend));
  if (mainZ === z || Math.abs(x - crossing.x) > 18) return { x, z: mainZ };
  // Project to the nearer road at an inside corner. This works in either direction.
  const margin = walking ? -1.3 : .45;
  const sideX = clamp(x, crossing.x - crossing.half + margin, crossing.x + crossing.half - margin);
  const sideZ = clamp(z, crossing.z - crossing.arm + margin, crossing.z + crossing.arm - margin);
  return Math.hypot(x - sideX, z - sideZ) < Math.abs(z - mainZ)
    ? { x: sideX, z: sideZ } : { x, z: mainZ };
}
