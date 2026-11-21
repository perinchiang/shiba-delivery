import { clamp, damp, lerp, smoothstep } from '../core/mathx.js';
import { bridgeJointXs } from './country-route.js';

// Surface height above the long road grade, in metres. Broad undulations read
// through the seated rider. Each expansion joint gives the tyres a shorter pulse.
function surfaceOffset(x) {
  const country = smoothstep(70, 130, x);
  let y = country * (.012 * Math.sin(.83*x) + .008 * Math.sin(1.97*x + 1.2));
  for (const joint of bridgeJointXs) {
    const distance = Math.abs(joint - x);
    if (distance < .58) y += .070 * (1 - smoothstep(0, .58, distance));
  }
  return y;
}

function spring() {
  return { offset: 0, velocity: 0 };
}

function advance(s, target, frequency, damping, dt) {
  s.velocity += (frequency**2*(target - s.offset) - 2*damping*frequency*s.velocity)*dt;
  s.offset += s.velocity*dt;
}

// Axle coordinates are measured from the actual motorcycle GLB, in world metres.
export function createRideMotion(frontZ, rearZ) {
  const front = spring(), rear = spring(), shoulders = spring(), helmet = spring();
  const output = { height: 0, pitch: 0, frontTravel: 0, rearTravel: 0, torso: 0, head: 0 };
  let lastX, lastSpeed, acceleration = 0;

  function reset() {
    for (const s of [front, rear, shoulders, helmet]) s.offset = s.velocity = 0;
    for (const key of Object.keys(output)) output[key] = 0;
    acceleration = 0;
    lastX = undefined;
  }

  function update(state, dt) {
    const x = state.bikeX, speed = state.speed;
    const moving = smoothstep(.1, 1.2, Math.abs(speed));
    const dx = Math.sin(state.bikeYaw);
    let wheelF = 0, wheelR = 0;
    if (lastX === undefined) { lastX = x; lastSpeed = speed; }
    if (dt > 0) {
      // Opening the map can stop the bike in place between two frames.
      const dv = speed - lastSpeed;
      const measured = !speed && Math.abs(dv) > .8 ? 0 : clamp(dv/dt, -8, 5);
      acceleration = damp(acceleration, measured, 15, dt);
      const steps = Math.ceil(dt * 120), h = dt / steps;
      for (let i = 1; i <= steps; i++) {
        const at = lerp(lastX, x, i / steps);
        wheelF = surfaceOffset(at + dx*frontZ)*moving;
        wheelR = surfaceOffset(at + dx*rearZ)*moving;
        // Under braking the fork compresses and the rear shock unloads.
        advance(front, wheelF + acceleration*.007, 22, .58, h);
        advance(rear, wheelR - acceleration*.004, 18, .56, h);
        const tuck = .068 * smoothstep(30/3.6, 50/3.6, speed);
        const torso = tuck - .015*acceleration - .22*(rear.velocity + .4*front.velocity);
        advance(shoulders, clamp(torso, -.12, .16), 18, .72, h);
        const pitch = Math.atan2(rear.offset-front.offset, frontZ-rearZ);
        advance(helmet, -.70*(pitch + shoulders.offset), 11, .64, h);
      }
      output.pitch = Math.atan2(rear.offset-front.offset, frontZ-rearZ);
      output.height = lerp(rear.offset, front.offset, -rearZ/(frontZ-rearZ));
      output.frontTravel = wheelF - front.offset;
      output.rearTravel = wheelR - rear.offset;
      output.torso = shoulders.offset;
      output.head = helmet.offset;
    }
    lastX = x;
    lastSpeed = speed;
    return output;
  }
  return { update, reset };
}
