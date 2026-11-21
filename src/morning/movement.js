import { approach, clamp, damp } from '../core/mathx.js';
import { stepFreeRide } from './free-ride.js';
import { constrainToRoad } from './country-route.js';
import { CURB_Z } from './town.js';
import { beginSequence, isStandSequence, standFrame, isBoxSequence, boxFrame, doorFrame } from './sequence.js';

// Leave space for both boots when dismounting at the near curb.
export const rideMinZ = CURB_Z + .94;

export function createMovement(state, { street, scooter }, input) {
  let walking = 0, stride = 0;
  const courierScale = scooter.root.scale.y;

  function ride(dx, dz, dt) {
    if (state.phase === 'free') {
      const travel = stepFreeRide(state, dx, dz, scooter.wheelbase*courierScale, dt);
      scooter.roll(Math.sign(state.speed)*travel);
      stride += travel*3.4;
      if (state.braking && state.stand === 1) {
        state.braking = false;
        beginSequence(state, 'park');
      }
      return;
    }
    const throttle = state.braking ? 0 : -dz;
    // Let the boot fold the stand and return to the peg before the wheels move.
    if (throttle) state.stand = approach(state.stand, 0, dt / .28);
    state.throttle = Math.max(0, throttle);
    state.brakePressure = state.braking ? 1 : throttle < 0 && state.speed > 0 ? -throttle : 0;
    const targetSpeed = state.stand ? 0 : throttle * (throttle >= 0 ? 5.6 : 1.9);
    const deceleration = state.braking || throttle * state.speed < 0 ? 12 : (throttle ? 6.7 : 4.4);
    state.speed = approach(state.speed, targetSpeed, deceleration * dt);
    state.steer = damp(state.steer, state.braking ? 0 : -dx * 0.31, 12, dt);
    state.bikeYaw += Math.tan(state.steer) * state.speed / (scooter.wheelbase * courierScale) * dt;
    const sx = state.x, sz = state.z;
    state.x = clamp(sx + Math.sin(state.bikeYaw) * state.speed * dt, -7.2, 36.6);
    state.z = clamp(sz + Math.cos(state.bikeYaw) * state.speed * dt, rideMinZ, 6.45);
    const travel = Math.hypot(state.x - sx, state.z - sz);
    if (travel < 0.00001) state.speed = 0;
    state.bikeX = state.x;
    state.bikeZ = state.z;
    state.yaw = state.bikeYaw;
    scooter.roll(Math.sign(state.speed) * travel);
    stride += travel * 3.4;
    if (!state.speed && !throttle) state.stand = approach(state.stand, 1, dt / .50);
    if (state.braking && state.stand === 1) {
      state.braking = false;
      beginSequence(state, 'park');
    }
  }

  function walk(dx, dz, dt) {
    const length = Math.hypot(dx, dz), step = 2.45 * dt / Math.max(1, length);
    const inside = state.mode === 'shop';
    const oldX = state.x, oldZ = state.z;
    if (state.phase === 'free') Object.assign(state, constrainToRoad(oldX+dx*step, oldZ+dz*step, true));
    else {
      state.x = clamp(oldX + dx * step, inside ? -2.75 : -8.3, inside ? 2.75 : 37.7);
      state.z = clamp(oldZ + dz * step, inside ? -0.18 : -0.72, inside ? 2.66 : 7.1);
    }
    state.yaw = Math.atan2(dx, dz);
    const travel = Math.hypot(state.x - oldX, state.z - oldZ);
    walking = Math.min(1, travel / (2.45 * dt || 1));
    stride += travel * 5.4;
  }

  function move(dt, blocked, clearInspection) {
    walking = 0;
    if (dt <= 0) return;
    if (state.sequence) {
      if (isStandSequence(state.sequence)) {
        const seq = state.sequence, x = state.x, z = state.z;
        standFrame(state, dt, scooter);
        if (seq.approaching) {
          const travel = Math.hypot(state.x - x, state.z - z);
          walking = Math.min(1, travel / (2.4 * dt));
          stride += travel * 5.4;
        }
        return;
      }
      const travel = isBoxSequence(state.sequence) ? boxFrame(state, dt, scooter) : doorFrame(state, dt, street.doors.get(state.order.storefront));
      walking = Math.min(1, travel / (2.4 * dt || 1));
      stride += travel * 5.4;
      return;
    }
    if (blocked && state.phase === 'free') {
      state.reverseHold = state.throttle = state.brakePressure = state.steerInput = 0;
    }
    if (state.phase === 'offer' || state.phase === 'done' || state.dialog || blocked) return;
    const dx = input.axis('left', 'right'), dz = input.axis('up', 'down');
    if (dx || dz) clearInspection();
    if (state.mode === 'ride') ride(dx, dz, dt);
    else if (dx || dz) walk(dx, dz, dt);
  }
  return {
    move, reset() { walking = stride = 0; },
    get walking() { return walking; }, get stride() { return stride; },
  };
}
