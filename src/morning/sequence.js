/** Fixed-camera interactions. Paths are in doorway or scooter space, so they also work after turning the bike. */
import * as THREE from 'three';
import { angleDiff, clamp01, lerp, smoothstep } from '../core/mathx.js';

const thresholdInside = -4.36;
const point = new THREE.Vector3();
const target = new THREE.Vector3();
const tangent = new THREE.Vector3();
const boxOrientation = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const acrossBox = new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 2);

export function beginSequence(state, kind) {
  state.sequence = { kind, elapsed: 0, x: state.x, z: state.z, yaw: state.yaw };
  if (kind === 'exit') {
    state.mode = 'walk';
    Object.assign(state, { x: state.order.door.x, z: thresholdInside, yaw: 0 });
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
    state.x = state.order.door.x;
    state.z = lerp(thresholdInside, -0.10, smoothstep(0.26, 0.78, u));
    state.yaw = 0;
  } else {
    state.x = lerp(seq.x, state.order.door.x, smoothstep(0, 0.27, u));
    state.z = u < 0.44 ? lerp(seq.z, -0.38, smoothstep(0, 0.27, u))
      : lerp(-0.38, -3.66, smoothstep(0.44, 0.98, u));
    state.yaw = Math.PI;
  }
  const travel = Math.hypot(state.x - oldX, state.z - oldZ);
  if (u === 1) {
    if (!exiting) Object.assign(state, state.order.room.exit, { mode: 'shop', yaw: Math.PI });
    state.sequence = null;
    door.rotation.y = 0;
  }
  return travel;
}

export function isBoxSequence(seq) {
  return seq?.kind === 'pack' || seq?.kind === 'unpack';
}

export function isStandSequence(seq) {
  return seq?.kind === 'mount' || seq?.kind === 'park';
}

function approachBike(state, scooter, destination, facing) {
  const seq = state.sequence;
  if (!seq.approach) {
    // Use an upright plan of the bike. The stand tilts the chassis but the route stays on the street.
    const origin = scooter.root.position;
    const scale = scooter.root.scale.x;
    const toLocal = world => world.sub(origin).applyAxisAngle(up, -state.bikeYaw).divideScalar(scale).setY(0);
    const start = toLocal(new THREE.Vector3(seq.x, 0, seq.z));
    const end = toLocal(destination.clone());
    let path = new THREE.LineCurve3(start, end);
    if (start.x * end.x < 0) {
      const crossingZ = lerp(start.z, end.z, start.x / (start.x - end.x));
      const nose = 1.46, tail = -1.65;
      if (crossingZ > tail && crossingZ < nose) {
        const z = start.z + end.z > nose + tail ? nose : tail;
        const side = .93 * Math.sign(start.x);
        path = new THREE.CatmullRomCurve3([start, new THREE.Vector3(side, 0, z), new THREE.Vector3(-side, 0, z), end]);
      }
    }
    const distance = path.getLength() * scale;
    const travelTime = distance > .015 ? distance / 2.45 : 0;
    const turning = Math.abs(angleDiff(seq.yaw, facing)) > .06;
    const duration = travelTime > 0 || turning ? travelTime + .16 : 0;
    seq.approach = { path, travelTime, duration };
  }
  const { path, travelTime, duration } = seq.approach;
  seq.approaching = seq.elapsed < duration;
  if (!seq.approaching) {
    state.x = destination.x;
    state.z = destination.z;
    state.yaw = facing;
    return seq.elapsed - duration;
  }
  const u = travelTime > 0 ? smoothstep(0, travelTime, seq.elapsed) : 1;
  path.getPointAt(u, point).multiplyScalar(scooter.root.scale.x)
    .applyAxisAngle(up, state.bikeYaw).add(scooter.root.position);
  state.x = point.x;
  state.z = point.z;
  path.getTangentAt(u, tangent);
  const heading = travelTime > 0 ? Math.atan2(tangent.x, tangent.z) + state.bikeYaw : seq.yaw;
  const turn = seq.yaw + angleDiff(seq.yaw, heading) * smoothstep(0, .18, seq.elapsed);
  state.yaw = turn + angleDiff(turn, facing) * smoothstep(Math.max(0, travelTime - .14), duration, seq.elapsed);
  return 0;
}

// Starting from a stop already resting on the side stand: stand up on the left
// footpeg, swing the right boot cleanly over the bench saddle, then hop lightly
// down beside the bike. The two directions share contacts but have different phrasing.
export function standFrame(state, dt, scooter) {
  const seq = state.sequence, mounting = seq.kind === 'mount';
  seq.elapsed += dt;
  const beside = scooter.mount.besideWorld(target);
  const elapsed = mounting ? approachBike(state, scooter, beside, state.bikeYaw) : seq.elapsed;
  const progress = clamp01(elapsed / (mounting ? 1.72 : 1.55));
  if (mounting) {
    seq.hop = 1 - smoothstep(.02, .30, progress);
    seq.swing = 1 - smoothstep(.34, .81, progress);
    // Keep weight on the peg through the sweep, then compress and rebound on the cushion.
    seq.rise = 1 - smoothstep(.75, .90, progress)
      - .15 * smoothstep(.86, .92, progress) * (1 - smoothstep(.92, 1, progress));
  } else {
    seq.rise = smoothstep(0, .23, progress);
    seq.swing = smoothstep(.17, .69, progress);
    seq.hop = smoothstep(.70, .98, progress);
  }
  seq.seat = 1 - seq.hop;
  // Bring the bars toward the supporting peg as the hips move to that side.
  // Carry the incoming steering angle into the shot and leave the wheel straight.
  seq.entrySteer ??= state.steer ?? 0;
  const towardPeg = .108 * smoothstep(0, .21, seq.swing) + .31 * smoothstep(.26, .82, seq.swing);
  state.steer = seq.entrySteer * (1 - smoothstep(0, .22, progress)) - towardPeg * seq.rise * seq.seat;
  state.stand = 1;

  if (!seq.approaching) {
    state.x = lerp(beside.x, state.bikeX, seq.seat);
    state.z = lerp(beside.z, state.bikeZ, seq.seat);
    state.yaw = state.bikeYaw;
  }
  if (progress === 1) {
    state.mode = mounting ? 'ride' : 'walk';
    state.returnToBike = false;
    state.sequence = null;
  }
}

export function boxFrame(state, dt, scooter) {
  const seq = state.sequence;
  const oldX = state.x, oldZ = state.z;
  seq.elapsed += dt;
  target.copy(scooter.cargo.approach);
  target.y = scooter.cargo.rim;
  scooter.root.localToWorld(target);
  const elapsed = approachBike(state, scooter, target, state.bikeYaw + Math.PI / 2);
  const progress = clamp01(elapsed / 2.36);
  const u = seq.kind === 'pack' ? progress : 1 - progress;
  const lift = smoothstep(0.21, 0.52, u) * (1 - smoothstep(0.77, 0.95, u));
  const tiptoe = smoothstep(0.16, 0.38, u) * (1 - smoothstep(0.78, 0.97, u));
  // Move sideways over the box only after the bottom of the bag clears its lip.
  state.reach = smoothstep(0.47, 0.56, u) * (1 - smoothstep(0.76, 0.94, u));
  state.lift = lift;
  seq.u = u;
  state.tiptoe = tiptoe;
  scooter.lid.rotation.z = -1.85 * smoothstep(0.06, 0.35, u) * (1 - smoothstep(0.81, 0.99, u));
  if (progress === 1) {
    state.cargo = seq.kind === 'pack' ? 'box' : 'hand';
    state.returnToBike = false;
    state.sequence = null;
    state.lift = state.tiptoe = 0;
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
  scooter.root.getWorldQuaternion(boxOrientation).multiply(acrossBox);
  looseBag.quaternion.slerp(boxOrientation, across);
}
