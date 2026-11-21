import assert from 'node:assert/strict';
import { initialState } from '../src/morning/delivery.js';
import { centerZ, constrainToRoad, distanceAlong, landmarks, roadEnd, roadHeight, roadYaw } from '../src/morning/country-route.js';
import { rideTuning, stepFreeRide } from '../src/morning/free-ride.js';

assert.ok(distanceAlong(roadEnd) > 1200 && distanceAlong(roadEnd) < 1300);
assert.equal(roadHeight(52), 0);
for (const { x } of landmarks) {
  const z = centerZ(x);
  assert.deepEqual(constrainToRoad(x, z, false), { x, z });
  assert.deepEqual(constrainToRoad(x, z, true), { x, z });
}
for (let x = 1; x < roadEnd; x++) {
  assert.ok(distanceAlong(x) > distanceAlong(x-1));
  assert.ok(Math.abs(roadHeight(x)-roadHeight(x-1)) <= .06);
  assert.ok(Math.abs(roadYaw(x)-roadYaw(x-1)) < .05);
}

const state = { ...initialState(), phase: 'free', x: 0, z: centerZ(0) };
const dt = 1/60;
for (let frame = 0; frame < 60*190 && state.x < roadEnd-2; frame++) {
  const desired = Math.atan2(8, centerZ(state.x+8)-state.z);
  const error = Math.atan2(Math.sin(desired-state.bikeYaw), Math.cos(desired-state.bikeYaw));
  const steering = Math.max(-1, Math.min(1, -2*error));
  stepFreeRide(state, steering, -1, 1.5, dt);
  assert.ok(Math.abs(state.bank) <= .411);
}
assert.ok(state.x >= roadEnd-2);
assert.ok(state.speed > 8 && state.speed <= rideTuning.topSpeed);
Object.assign(state, { x: 450, z: centerZ(450), bikeYaw: roadYaw(450), braking: true });
let brakingDistance = 0;
for (let i=0; i<180; i++) brakingDistance += stepFreeRide(state, 0, 0, 1.5, dt);
assert.equal(state.speed, 0);
assert.equal(state.stand, 1);
assert.ok(brakingDistance > 5.2 && brakingDistance < 6.6);
console.log('PASS: continuous 1.25 km route, walkable landmarks, bridge grades, speed limit and braking distance.');

for (const fps of [30, 60, 120]) {
  const bike = { ...initialState(), stand: 0, x: 0, z: centerZ(0) };
  const tick = (drive, steer = 0) => stepFreeRide(bike, steer, -drive, 1.5, 1/fps);
  let frames = 0;
  while (frames < 3*fps && bike.speed < 25/3.6) { tick(1); frames++; }
  assert.ok(frames/fps > 1.6 && frames/fps < 1.9, 'launch to 25 km/h');
  const cruising = bike.speed;
  for (let i = 0; i < fps/2; i++) tick(0);
  assert.ok(bike.speed < cruising && bike.speed > cruising - 1, 'coasts on release');
  for (let i = 0; bike.speed > 0 && i < 2*fps; i++) tick(-1);
  assert.equal(bike.speed, 0, 'stops before reversing');
  for (let i = 0; i < Math.floor(.3*fps); i++) tick(-1);
  assert.equal(bike.speed, 0);
  tick(0);
  for (let i = 0; i < Math.floor(.3*fps); i++) tick(-1);
  assert.equal(bike.speed, 0, 'release resets the reverse delay');
  for (let i = 0; i < fps; i++) tick(-.5);
  assert.equal(bike.speed, -rideTuning.reverse/2);
  bike.braking = true;
  for (let i = 0; i < 2*fps; i++) tick(-1);
  assert.equal(bike.speed, 0);
  assert.equal(bike.stand, 1, 'parking from reverse deploys the stand');
}
console.log('PASS: throttle, coasting, reverse delay and analog reverse at 30/60/120 Hz.');
