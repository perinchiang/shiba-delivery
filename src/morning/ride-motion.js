import { clamp, damp, lerp, smoothstep } from '../core/mathx.js';
import { RAIL_Z } from './coastal-town.js';

// Subtle road bumps (coastal railway track crossing at z = RAIL_Z, plus exported rail bump coord for tests).
export const roadBumpCoords = [RAIL_Z];

function surfaceOffset(coord) {
  let y = 0.008 * Math.sin(0.78 * coord) + 0.005 * Math.sin(1.85 * coord + 1.1);
  for (const bump of roadBumpCoords) {
    const distance = Math.abs(bump - coord);
    if (distance < 0.58) y += 0.070 * (1 - smoothstep(0, 0.58, distance));
  }
  return y;
}

function spring() {
  return { offset: 0, velocity: 0 };
}

function advance(s, target, frequency, damping, dt) {
  s.velocity += (frequency ** 2 * (target - s.offset) - 2 * damping * frequency * s.velocity) * dt;
  s.offset += s.velocity * dt;
}

// Axle coordinates are measured from the actual motorcycle GLB, in world metres.
export function createRideMotion(frontZ, rearZ) {
  const front = spring(), rear = spring(), shoulders = spring(), helmet = spring();
  const output = { height: 0, pitch: 0, frontTravel: 0, rearTravel: 0, torso: 0, head: 0 };
  let lastCoord, lastSpeed, acceleration = 0;

  function reset() {
    for (const s of [front, rear, shoulders, helmet]) s.offset = s.velocity = 0;
    for (const key of Object.keys(output)) output[key] = 0;
    acceleration = 0;
    lastCoord = undefined;
  }

  function update(state, dt) {
    const speed = state.speed;
    const moving = smoothstep(0.1, 1.2, Math.abs(speed));
    // Track longitudinal axis (Z when riding across the coastal railway, or X if bikeZ is omitted in unit tests).
    const useZ = state.bikeZ !== undefined && Math.abs(Math.cos(state.bikeYaw)) >= Math.abs(Math.sin(state.bikeYaw));
    const coord = useZ ? state.bikeZ : state.bikeX;
    const dAxis = useZ ? Math.cos(state.bikeYaw) : Math.sin(state.bikeYaw);
    let wheelF = 0, wheelR = 0;
    if (lastCoord === undefined) { lastCoord = coord; lastSpeed = speed; }
    if (dt > 0) {
      const dv = speed - lastSpeed;
      const measured = !speed && Math.abs(dv) > 0.8 ? 0 : clamp(dv / dt, -8, 5);
      acceleration = damp(acceleration, measured, 15, dt);
      const steps = Math.ceil(dt * 120), h = dt / steps;
      for (let i = 1; i <= steps; i++) {
        const at = lerp(lastCoord, coord, i / steps);
        wheelF = surfaceOffset(at + dAxis * frontZ) * moving;
        wheelR = surfaceOffset(at + dAxis * rearZ) * moving;
        advance(front, wheelF + acceleration * 0.007, 22, 0.58, h);
        advance(rear, wheelR - acceleration * 0.004, 18, 0.56, h);
        const tuck = 0.068 * smoothstep(30 / 3.6, 50 / 3.6, speed);
        const torso = tuck - 0.015 * acceleration - 0.22 * (rear.velocity + 0.4 * front.velocity);
        advance(shoulders, clamp(torso, -0.12, 0.16), 18, 0.72, h);
        const pitch = Math.atan2(rear.offset - front.offset, frontZ - rearZ);
        advance(helmet, -0.70 * (pitch + shoulders.offset), 11, 0.64, h);
      }
      output.pitch = Math.atan2(rear.offset - front.offset, frontZ - rearZ);
      output.height = lerp(rear.offset, front.offset, -rearZ / (frontZ - rearZ));
      output.frontTravel = wheelF - front.offset;
      output.rearTravel = wheelR - rear.offset;
      output.torso = shoulders.offset;
      output.head = helmet.offset;
    }
    lastCoord = coord;
    lastSpeed = speed;
    return output;
  }
  return { update, reset };
}
