import { approach, clamp, damp, dampAngle } from '../core/mathx.js';
import { centerZ, constrainToRoad, roadHeight, roadYaw } from './country-route.js';

export const rideTuning = {
  topSpeed: 9, reverse: 1.6, acceleration: 3.4, brake: 6.5, steerAngle: .43, lateralAcceleration: 5.7,
};

export function stepFreeRide(state, dx, dz, wheelbase, dt) {
  const t = rideTuning, throttle = state.braking ? 0 : -dz;
  if (throttle) state.stand = approach(state.stand, 0, dt/.28);
  const top = throttle >= 0 ? t.topSpeed : t.reverse;
  let acceleration = .65 + .012*state.speed**2;
  if (state.braking || throttle * state.speed < 0) acceleration = t.brake;
  else if (throttle) acceleration = t.acceleration * (1 - .94*Math.min(1, (state.speed/top)**2));
  state.speed = approach(state.speed, state.stand ? 0 : throttle*top, acceleration*dt);
  const limit = Math.min(t.steerAngle, Math.atan(wheelbase*t.lateralAcceleration/Math.max(.01, state.speed**2)));
  state.steer = damp(state.steer, state.braking ? 0 : -dx*limit, 10, dt);
  const yawRate = Math.tan(state.steer)*state.speed/wheelbase;
  state.bikeYaw += yawRate*dt;
  state.bank = damp(state.bank, clamp(-Math.atan(state.speed*yawRate/9.81), -.41, .41), 7, dt);
  const x = state.x + Math.sin(state.bikeYaw)*state.speed*dt;
  const z = state.z + Math.cos(state.bikeYaw)*state.speed*dt;
  const bounded = constrainToRoad(x, z, false);
  if (Math.abs(x-bounded.x) > .0001) state.speed = 0;
  else if (Math.abs(z-bounded.z) > .0001) {
    const tangent = roadYaw(x);
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
  const speed = Math.min(1, Math.abs(state.speed)/rideTuning.topSpeed);
  const radius = 6.6+1.35*speed;
  const x = state.x - Math.sin(yaw)*radius, z = state.z - Math.cos(yaw)*radius;
  const elevation = roadHeight(state.x);
  // Keep the boom on the road side of the village houses and above bridge approaches.
  const offset = clamp(z - centerZ(x), -5.5, 5.5);
  camera.position.set(x,Math.max(roadHeight(x)+1.45, elevation+3.05),centerZ(x)+offset);
  const lead = 1.6+2.5*speed;
  focus.set(state.x+Math.sin(yaw)*lead, elevation+1.28, state.z+Math.cos(yaw)*lead);
  camera.lookAt(focus);
  camera.rotateZ(state.bank*.07);
}
