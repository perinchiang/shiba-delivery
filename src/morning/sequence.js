/** Fixed-camera interactions. Paths are in doorway or scooter space, so they also work after turning the bike. */
import * as THREE from 'three';
import { clamp01, lerp, smoothstep } from '../core/mathx.js';
import { STOPS } from './town.js';

const doorwayX = STOPS.pharmacy.x;
const thresholdInside = -4.36;
const point = new THREE.Vector3();
const target = new THREE.Vector3();

export function beginSequence(state, kind) {
  state.sequence = { kind, elapsed: 0, x: state.x, z: state.z, yaw: state.yaw };
  if (kind === 'exit') {
    state.mode = 'walk';
    Object.assign(state, { x: doorwayX, z: thresholdInside, yaw: 0 });
  }
}

export function doorFrame(state, dt, door) {
  const seq = state.sequence;
  const exiting = seq.kind === 'exit';
  const u = clamp01((seq.elapsed += dt) / (exiting ? 2.1 : 1.7));
  const open = exiting ? smoothstep(0, 0.25, u) * (1 - smoothstep(0.79, 1, u)) : smoothstep(0.12, 0.44, u);
  door.rotation.y = open * 1.66;
  const oldX = state.x, oldZ = state.z;
  if (exiting) {
    state.x = doorwayX;
    state.z = lerp(thresholdInside, -0.10, smoothstep(0.26, 0.78, u));
    state.yaw = 0;
  } else {
    state.x = lerp(seq.x, doorwayX, smoothstep(0, 0.27, u));
    state.z = u < 0.44 ? lerp(seq.z, -0.38, smoothstep(0, 0.27, u))
      : lerp(-0.38, -3.66, smoothstep(0.44, 0.98, u));
    state.yaw = Math.PI;
  }
  const travel = Math.hypot(state.x - oldX, state.z - oldZ);
  if (u === 1) {
    if (!exiting) Object.assign(state, STOPS.exit, { mode: 'shop', yaw: Math.PI });
    state.sequence = null;
    door.rotation.y = 0;
  }
  return travel;
}

export function isBoxSequence(seq) {
  return seq?.kind === 'pack' || seq?.kind === 'unpack';
}

export function boxFrame(state, dt, scooter) {
  const seq = state.sequence;
  const elapsed = (seq.elapsed += dt);
  // Approach from wherever the bike was parked before acting out the lift at the peg.
  const entering = smoothstep(0, 0.49, elapsed);
  const duration = 2.36;
  const progress = clamp01((elapsed - 0.49) / duration);
  const u = seq.kind === 'pack' ? progress : 1 - progress;
  const lift = smoothstep(0.21, 0.52, u) * (1 - smoothstep(0.77, 0.95, u));
  const step = smoothstep(0.16, 0.38, u) * (1 - smoothstep(0.78, 0.97, u));
  // Move sideways over the box only after the bottom of the bag clears its lip.
  const reachAcross = smoothstep(0.47, 0.56, u) * (1 - smoothstep(0.76, 0.94, u));
  point.lerpVectors(scooter.cargo.approach, scooter.cargo.reach, reachAcross);
  scooter.root.localToWorld(point);
  const oldX = state.x, oldZ = state.z;
  state.x = lerp(seq.x, point.x, entering);
  state.z = lerp(seq.z, point.z, entering);
  state.yaw = state.bikeYaw + Math.PI / 2;
  state.lift = lift;
  seq.u = u;
  const deploy = smoothstep(0.02, 0.14, u) * (1 - smoothstep(0.97, 1, u));
  state.stepHeight = step * scooter.packingStep(deploy);
  scooter.lid.rotation.z = -1.85 * smoothstep(0.06, 0.35, u) * (1 - smoothstep(0.81, 0.99, u));
  if (progress === 1) {
    state.cargo = seq.kind === 'pack' ? 'box' : 'hand';
    state.returnToBike = false;
    state.sequence = null;
    state.lift = state.stepHeight = 0;
    scooter.lid.rotation.z = 0;
  }
  return Math.hypot(state.x - oldX, state.z - oldZ);
}

// Show one bag at a time. It stays in the paw until it clears the rim, then drops into the hollow box.
export function positionParcel(state, shiba, scooter, looseBag) {
  const seq = state.sequence;
  const packing = isBoxSequence(seq);
  const u = packing ? seq.u ?? (seq.kind === 'pack' ? 0 : 1) : 0;
  shiba.bag.visible = packing ? u < 0.56 : state.cargo === 'hand';
  looseBag.visible = packing && u >= 0.56;
  if (!looseBag.visible) return;
  shiba.bag.getWorldPosition(point);
  scooter.root.localToWorld(target.copy(scooter.cargo.floor));
  const across = smoothstep(0.56, 0.69, u);
  looseBag.position.copy(point).lerp(target, across);
  looseBag.position.y = lerp(point.y, target.y, smoothstep(0.69, 0.81, u)) + 0.07 * scooter.root.scale.y * Math.sin(Math.PI * across);
  looseBag.rotation.set(0, state.yaw, 0);
}
