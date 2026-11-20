import { Vector3 } from 'three';
import { clamp } from './mathx.js';

const direction = new Vector3();
const bend = new Vector3();

/**
 * Two-bone IK. A = root, C = target, pole = rough direction the middle joint points to.
 * outMid receives the joint, outEnd the (possibly clamped) end. Returns true when C is within reach.
 */
export function ik2(A, C, L1, L2, pole, outMid, outEnd) {
  direction.subVectors(C, A);
  let d = direction.length();
  const dmax = (L1 + L2) * 0.9985, dmin = Math.abs(L1 - L2) + 1e-3, ok = d <= dmax;
  direction.divideScalar(Math.max(d, 1e-9));
  d = clamp(d, dmin, dmax);
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  bend.copy(pole).addScaledVector(direction, -pole.dot(direction));
  if (bend.lengthSq() < 1e-10) bend.set(0, 1, 0).addScaledVector(direction, -direction.y);
  bend.normalize();
  outMid.copy(A).addScaledVector(direction, a).addScaledVector(bend, h);
  if (outEnd) outEnd.copy(A).addScaledVector(direction, d);
  return ok;
}
