// Small math helpers shared by every module. Pure functions, no three.js dependency.
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));
export const smoothstep = (a, b, v) => {
  const t = clamp01(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
};
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Frame-rate independent exponential approach. lambda ~ "how many e-folds per second". */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Move a toward b by at most maxDelta. */
export const approach = (a, b, maxDelta) => (a < b ? Math.min(a + maxDelta, b) : Math.max(a - maxDelta, b));

/** Wrap angle to (-PI, PI]. */
export const wrapAngle = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
/** Shortest signed difference b - a. */
export const angleDiff = (a, b) => wrapAngle(b - a);
export const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));

export const dist2 = (x0, z0, x1, z1) => Math.hypot(x1 - x0, z1 - z0);

/**
 * World heading convention used everywhere:
 *   yaw = 0 faces +Z, yaw increases counter-clockwise seen from above (turning left).
 *   forward = (sin(yaw), 0, cos(yaw)),  right = (-cos(yaw), 0, sin(yaw))   [right-handed, Y up]
 * An Object3D built facing +Z just needs `obj.rotation.y = yaw`.
 */
export const fwdX = (yaw) => Math.sin(yaw);
export const fwdZ = (yaw) => Math.cos(yaw);
export const yawOf = (dx, dz) => Math.atan2(dx, dz);

/** Distance from point p to segment ab in 2D; returns {d, t, x, z} (closest point). */
export function pointSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? clamp01(((px - ax) * vx + (pz - az) * vz) / l2) : 0;
  const x = ax + vx * t, z = az + vz * t;
  return { d: Math.hypot(px - x, pz - z), t, x, z };
}

export const fmtMoney = (v) => '¥' + (Math.round(v * 10) / 10).toFixed(1);
