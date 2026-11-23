import { approach, clamp, damp, dampAngle, lerp, smoothstep } from '../core/mathx.js';
import { centerZ, crossing, constrainToRoad, roadHeight, roadYaw } from './country-route.js';
import { inCoastalSample, coastalSurfaceHeight } from './coastal-sample.js';

export const trialLimitsKmh = [50, 32.4, 25, 35];
export const maxTrialSpeed = trialLimitsKmh[0] / 3.6;

export const rideTuning = {
  topSpeed: maxTrialSpeed, reverse: 1.6, reverseDelay: .35,
  launchAccel: 4.7, powerPerKg: 2800 / 150, brake: 7,
  steerAngle: .43, lateralAcceleration: 5.7,
};

// A light thumb input still sets a walking-speed target for precise manoeuvres.
function updateSpeed(state, drive, dt) {
  const t = rideTuning;
  const speed = state.speed;
  const slowing = state.braking || drive * speed < 0;
  const forward = Math.max(0, drive);
  state.throttle = approach(state.throttle, forward, (forward > state.throttle ? 11 : 18) * dt);
  const brake = state.braking ? 1 : slowing ? Math.abs(drive) : 0;
  state.brakePressure = approach(state.brakePressure, brake, (brake > state.brakePressure ? 14 : 24) * dt);
  if (drive >= 0 || speed > 0) state.reverseHold = 0;
  else if (speed === 0) state.reverseHold += dt;

  const rollingDrag = .13 + .0021 * speed ** 2;
  const coast = rollingDrag + 1.05 * smoothstep(0, 2.2, Math.abs(speed)) * (1 - state.brakePressure);
  if (slowing || state.stand || drive === 0) {
    return approach(speed, 0, (coast + t.brake * state.brakePressure) * dt);
  }
  if (drive < 0) {
    if (speed === 0 && state.reverseHold < t.reverseDelay) return 0;
    return approach(speed, drive * t.reverse, 1.7 * dt);
  }
  const target = t.topSpeed * drive;
  if (speed >= target) return approach(speed, target, coast * dt);
  const thrust = Math.min(t.launchAccel, t.powerPerKg / Math.max(.5, speed));
  return approach(speed, target, Math.min(thrust * state.throttle, 4 * (target - speed)) * dt);
}

export function stepFreeRide(state, dx, dz, wheelbase, dt) {
  const t = rideTuning, throttle = state.braking ? 0 : -dz;
  if (throttle) state.stand = approach(state.stand, 0, dt/.28);
  state.speed = updateSpeed(state, throttle, dt);
  const limit = Math.min(t.steerAngle, Math.atan(wheelbase*t.lateralAcceleration/Math.max(.01, state.speed**2)));
  const target = state.braking ? 0 : -dx;
  const returning = Math.abs(target) < Math.abs(state.steerInput) || target * state.steerInput < 0;
  const rate = returning ? 8.5 : lerp(5.5, 3.4, smoothstep(2, 10, Math.abs(state.speed)));
  state.steerInput = approach(state.steerInput, target, rate * dt);
  state.steer = state.steerInput * limit;
  const yawRate = Math.tan(state.steer)*state.speed/wheelbase;
  state.bikeYaw += yawRate*dt;
  state.bank = damp(state.bank, clamp(-Math.atan(state.speed*yawRate/9.81), -.41, .41), 7, dt);
  const x = state.x + Math.sin(state.bikeYaw)*state.speed*dt;
  const z = state.z + Math.cos(state.bikeYaw)*state.speed*dt;
  const bounded = constrainToRoad(x, z, false);
  const hitX = Math.abs(x-bounded.x) > .0001, hitZ = Math.abs(z-bounded.z) > .0001;
  const sideWall = hitX && Math.abs(bounded.x-crossing.x) <= crossing.half;
  const endOfArm = hitZ && Math.abs(bounded.x-crossing.x) <= crossing.half && Math.abs(bounded.z-crossing.z) > crossing.arm-1;
  if (endOfArm || (hitX && !sideWall)) state.speed = 0;
  else if (hitX || hitZ) {
    const tangent = sideWall ? 0 : roadYaw(x);
    const target = Math.cos(tangent-state.bikeYaw)>=0 ? tangent : tangent+Math.PI;
    state.bikeYaw = dampAngle(state.bikeYaw, target, 4.8, dt);
    state.speed *= Math.exp(-2.8*dt);
  }
  const travel = Math.hypot(bounded.x-state.x,bounded.z-state.z);
  Object.assign(state,bounded,{ bikeX: bounded.x, bikeZ: bounded.z, yaw: state.bikeYaw });
  if (!throttle && !state.speed) state.stand = approach(state.stand, 1, dt/.5);
  return travel;
}

export function countryCamera(camera, state, yaw, focus) {
  const speed = Math.min(1, Math.abs(state.speed)/maxTrialSpeed);
  const radius = 6.6+1.35*speed;
  const x = state.x - Math.sin(yaw)*radius, z = state.z - Math.cos(yaw)*radius;
  const inSample = inCoastalSample(state.x, state.z);
  const elevation = inSample ? coastalSurfaceHeight(state.x, state.z) : roadHeight(state.x);
  const boomGround = inSample ? coastalSurfaceHeight(x, z) : roadHeight(x);
  // Keep the boom on the road side of the village houses and above bridge approaches.
  const offset = clamp(z - centerZ(x), -5.5, 5.5);
  const boom = inSample ? { x, z }
    : state.x <= 46 ? { x, z: clamp(z, -0.4, 7.2) }
    : Math.abs(state.x - crossing.x) < 29
      ? constrainToRoad(x, z, true) : { x, z: centerZ(x)+offset };
  camera.position.set(boom.x, Math.max(boomGround + (inSample ? 1.55 : 1.45), elevation + 3.05), boom.z);
  const lead = 1.6+2.5*speed;
  focus.set(state.x+Math.sin(yaw)*lead, elevation+1.28, state.z+Math.cos(yaw)*lead);
  camera.lookAt(focus);
  camera.rotateZ(state.bank*.07);
}
