import { approach, clamp } from '../core/mathx.js';
import { stepFreeRide } from './free-ride.js';
import { constrainToRoad } from './country-route.js';
import { avoidTreePits } from './street-layout.js';
import { beginSequence, isStandSequence, standFrame, isBoxSequence, boxFrame, doorFrame } from './sequence.js';

const DEFAULT_WALK_BASIS = { rightX: 1, rightZ: 0, backX: 0, backZ: 1 };

export function createMovement(state, { street, scooter }, input) {
  let walking = 0, stride = 0;
  const courierScale = scooter.root.scale.y;

  function ride(dx, dz, dt) {
    const travel = stepFreeRide(state, dx, dz, scooter.wheelbase * courierScale, dt);
    scooter.roll(Math.sign(state.speed) * travel);
    stride += travel * 3.4;
    if (state.braking && state.stand === 1) {
      state.braking = false;
      beginSequence(state, 'park');
    }
  }

  function walk(dx, dz, dt, basis = DEFAULT_WALK_BASIS) {
    const wx = dx * basis.rightX + dz * basis.backX;
    const wz = dx * basis.rightZ + dz * basis.backZ;
    const length = Math.hypot(wx, wz);
    if (length < 1e-6) return;
    const step = 2.45 * dt / Math.max(1, length);
    const inside = state.mode === 'shop';
    const oldX = state.x, oldZ = state.z;
    if (!inside) {
      Object.assign(state, constrainToRoad(oldX + wx * step, oldZ + wz * step, true));
      avoidTreePits(state);
    } else {
      state.x = clamp(oldX + wx * step, -2.75, 2.75);
      state.z = clamp(oldZ + wz * step, -0.18, 2.66);
    }
    state.yaw = Math.atan2(wx, wz);
    const travel = Math.hypot(state.x - oldX, state.z - oldZ);
    walking = Math.min(1, travel / (2.45 * dt || 1));
    stride += travel * 5.4;
  }

  function move(dt, blocked, clearInspection, walkBasis = DEFAULT_WALK_BASIS) {
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
    if (blocked) {
      state.reverseHold = state.throttle = state.brakePressure = state.steerInput = 0;
    }
    if (state.dialog || blocked) return;
    const dx = input.axis('left', 'right'), dz = input.axis('up', 'down');
    if (dx || dz) clearInspection();
    if (state.mode === 'ride') ride(dx, dz, dt);
    else if (dx || dz) walk(dx, dz, dt, walkBasis);
  }
  return {
    move, reset() { walking = stride = 0; },
    get walking() { return walking; }, get stride() { return stride; },
  };
}
