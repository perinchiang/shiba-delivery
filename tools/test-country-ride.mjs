import assert from 'node:assert/strict';
import { Scene } from 'three';
import { createTireEffects } from '../src/morning/tire-effects.js';
import { initialState } from '../src/morning/delivery.js';
import { centerZ, crossing, constrainToRoad, distanceAlong, landmarks, roadEnd, roadHeight, roadYaw } from '../src/morning/country-route.js';
import { COASTAL_TOWN, HERO_HAIKAZE, coastalTownSurfaceHeight, constrainCoastalTown } from '../src/morning/coastal-town.js';
import { rideTuning, stepFreeRide, trialLimitsKmh } from '../src/morning/free-ride.js';

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

const defaultSpeed = rideTuning.topSpeed;
assert.equal(defaultSpeed * 3.6, 50);
for (const limit of trialLimitsKmh) {
  rideTuning.topSpeed = limit / 3.6;
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
  assert.ok(state.speed > rideTuning.topSpeed - .1 && state.speed <= rideTuning.topSpeed);
  Object.assign(state, { x: 450, z: centerZ(450), bikeYaw: roadYaw(450), braking: true });
  let brakingDistance = 0;
  for (let i=0; i<180; i++) brakingDistance += stepFreeRide(state, 0, 0, 1.5, dt);
  assert.equal(state.speed, 0);
  assert.equal(state.stand, 1);
  const expected = rideTuning.topSpeed ** 2 / (2 * rideTuning.brake);
  assert.ok(Math.abs(brakingDistance - expected) < 1);
  console.log(limit + ' km/h: braking distance ' + brakingDistance.toFixed(2) + ' m');
}
rideTuning.topSpeed = defaultSpeed;

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

// Turn at neighbourhood speeds, then ride back out of each branch to the old street.
function followStops(bike, stops) {
  for (const [x,z] of stops) {
    for (let frame=0; frame<600 && Math.hypot(bike.x-x,bike.z-z)>1.2; frame++) {
      const desired=Math.atan2(x-bike.x,z-bike.z);
      const error=Math.atan2(Math.sin(desired-bike.bikeYaw), Math.cos(desired-bike.bikeYaw));
      stepFreeRide(bike, Math.max(-1,Math.min(1,-2*error)), -.30, 1.5, 1/60);
    }
    assert.ok(Math.hypot(bike.x-x,bike.z-z)<1.3, 'reached '+[x,z]);
  }
}
for (const side of [-1,1]) {
  const {x,z,half,arm} = crossing;
  const bike = {...initialState(),x:x-20,z,stand:0};
  followStops(bike, [[x-6,z],[x-2,z+side*2],[x,z+side*7],[x,z+side*36]]);
  // The pavements keep the teleported, parked and riding positions on the same arm.
  for (const walking of [false,true]) {
    const wall=constrainToRoad(x+9,z+side*36,walking);
    assert.ok(wall.x<x+8 && wall.x>x+4);
    assert.equal(wall.z,z+side*36);
    const end=constrainToRoad(x,z+side*(arm+3),walking);
    assert.ok(Math.abs(end.z-z)<=arm+1.3);
    assert.deepEqual(constrainToRoad(x,z+side*arm*.8,walking),{x,z:z+side*arm*.8});
  }
  bike.bikeYaw = side>0 ? Math.PI : 0;
  followStops(bike, [[x,z+side*half],[x-2,z+side*2],[x-8,z],[x-28,z]]);
}
console.log('PASS: both city turns, side street curbs, endpoints and return to the main road.');

// Straight cruising, reverse and a scene jump must never paint a phantom skid.
const stage = new Scene();
const bike = { ...initialState(),phase:'free',stand:0,x:crossing.x,z:crossing.z };
const effects = createTireEffects(stage, {
  frontZ:.7,rearZ:-.8,rearContact:out=>out.set(bike.x-.8,0,bike.z),
});
const dust = stage.children.find(mesh=>mesh.isInstancedMesh);
const marks = stage.children.find(mesh=>!mesh.isInstancedMesh);
function runEffect(frames, acceleration) {
  for (let i=0;i<frames;i++) {
    bike.speed += acceleration/60;
    bike.x += bike.speed/60;
    effects.update(bike,1/60);
  }
}
bike.throttle=1;
runEffect(45,4);
assert.ok(dust.count>0 && marks.geometry.drawRange.count===0,'launch only kicks up dust');
runEffect(90,0);
assert.equal(dust.count,0,'cruise clears the dust');
bike.throttle=0; bike.brakePressure=1;
runEffect(8,-7);
assert.ok(marks.geometry.drawRange.count>0,'braking leaves a short tyre mark');
effects.reset();
assert.equal(marks.geometry.drawRange.count,0,'teleport clears the old mark');
bike.brakePressure=0; bike.speed=6; bike.steer=.22;
runEffect(15,0);
assert.ok(marks.geometry.drawRange.count>0,'cornering at speed leaves a tyre mark');
bike.speed=-1;
runEffect(100,0);
assert.equal(dust.count+marks.geometry.drawRange.count,0,'effects expire in reverse');
console.log('PASS: rear tyre effects on launch, cruise, braking, cornering, reverse and teleport.');

// Direction A Hero Building ("海风庄"): walkable exterior steel stairs, 2F corridor & collision isolation.
{
  const heroWorld = (bx, by) => ({
    x: COASTAL_TOWN.x + HERO_HAIKAZE.dx - bx,
    z: COASTAL_TOWN.z + HERO_HAIKAZE.dz + by,
  });
  const baseY = HERO_HAIKAZE.baseY;

  // 1) Riding cannot enter the Hero Building body or exterior steel staircase.
  const rideHit = heroWorld(4.92, 0.0);
  const rideOut = constrainCoastalTown(rideHit.x, rideHit.z, false);
  assert.ok(Math.hypot(rideOut.x - rideHit.x, rideOut.z - rideHit.z) > 0.5, 'scooter blocked from climbing stairs');

  // 2) Walking smoothly enters stair foot, climbs 14 steps continuously to 2F, turns onto corridor & front balcony.
  const stairRoute = [
    [4.92, -3.20], // sidewalk approach right in front of stair foot
    [4.92, -2.35], // bottom concrete landing pad (+0.12m)
    [4.92, -0.80], // lower flight
    [4.92,  0.60], // mid flight
    [4.92,  2.35], // top of stairs (+3.25m)
    [4.92,  3.00], // top steel landing bridge
    [3.40,  3.00], // 2F doorway onto open-air corridor
    [3.40,  1.35], // outside Door 202
    [3.40, -0.80], // outside Door 201
    [3.40, -3.00], // 2F front-right balcony corner
    [-2.50, -3.00], // 2F front balcony above 1F noodle shop
  ];
  let prevY = 0;
  for (let i = 0; i < stairRoute.length; i++) {
    const [bx, by] = stairRoute[i];
    const p = heroWorld(bx, by);
    const bounded = constrainCoastalTown(p.x, p.z, true);
    assert.ok(Math.hypot(bounded.x - p.x, bounded.z - p.z) < 0.01, `walk point ${i} (${bx},${by}) unobstructed`);
    const y = coastalTownSurfaceHeight(p.x, p.z, true);
    if (i === 1) assert.ok(Math.abs(y - (baseY + 0.12)) < 0.01, 'bottom stair pad elevation');
    if (i >= 4) assert.ok(Math.abs(y - (baseY + 3.25)) < 0.01, `2F elevation at step ${i}`);
    if (i >= 1 && i <= 4) assert.ok(y >= prevY, 'monotonic climb up exterior steel stairs');
    prevY = y;
  }

  // 3) Ground sidewalk walker cannot clip/teleport onto 2F front balcony across W1 railing/wall barrier.
  const frontTry = heroWorld(-1.0, -3.95);
  const frontConstrained = constrainCoastalTown(frontTry.x, frontTry.z, true);
  assert.ok(frontConstrained.z - (COASTAL_TOWN.z + HERO_HAIKAZE.dz) <= -4.20, 'ground walker stopped outside 1F shop wall');

  // 4) 2F balcony walker cannot fall off through the front railing.
  const railTry = heroWorld(-1.0, -3.70);
  const railConstrained = constrainCoastalTown(railTry.x, railTry.z, true);
  assert.ok(railConstrained.z - (COASTAL_TOWN.z + HERO_HAIKAZE.dz) >= -3.56, '2F walker kept safely inside front railing');

  // 5) Ground-only query (used by scooter headlight beam & chase camera) stays at ground level under 2F.
  const under2F = heroWorld(3.40, -0.80);
  const groundOnlyY = coastalTownSurfaceHeight(under2F.x, under2F.z, false);
  assert.ok(groundOnlyY < baseY + 0.5, 'ground-only surface query never jumps to 2F');
  console.log('PASS: Hero Building walkable exterior staircase, 2F corridor & barrier collision.');
}
