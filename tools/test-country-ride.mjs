#!/usr/bin/env node
/** Verify Clean-Slate Rongwan Coastal Corner terrain, flush-wall Haikaze-so collision, 2F stairs & riding bounds. */
import assert from 'node:assert/strict';
import {
  HERO_HAIKAZE,
  WORLD_BOUNDS,
  SEAWALL_Z,
  heroLocalToWorld,
  townSlopeY,
  coastalTownSurfaceHeight,
  constrainCoastalTown,
  townPlace,
} from '../src/morning/coastal-town.js';
import { stepFreeRide } from '../src/morning/free-ride.js';
import { initialState } from '../src/morning/delivery.js';

// 1) Continuous downhill slope from hillside (-48) -> Haikaze-so plaza (0..29) -> seawall (47+)
assert.ok(townSlopeY(-48) > townSlopeY(-20) && townSlopeY(-20) > townSlopeY(10));
assert.equal(townSlopeY(10), 1.85);
assert.equal(townSlopeY(47), 1.05);

// 2) Haikaze-so exterior staircase & 2F corridor elevation (walking vs riding)
const stairBottom = heroLocalToWorld(4.9, -2.2);
const stairMid = heroLocalToWorld(4.9, 0.2);
const stairTop = heroLocalToWorld(4.9, 2.8);
const door201 = heroLocalToWorld(3.35, -0.80);
const frontBalcony = heroLocalToWorld(0.0, -3.0);

const yBot = coastalTownSurfaceHeight(stairBottom.x, stairBottom.z, true);
const yMid = coastalTownSurfaceHeight(stairMid.x, stairMid.z, true);
const yTop = coastalTownSurfaceHeight(stairTop.x, stairTop.z, true);
const y201 = coastalTownSurfaceHeight(door201.x, door201.z, true);
const yBalc = coastalTownSurfaceHeight(frontBalcony.x, frontBalcony.z, true);

assert.ok(Math.abs(yBot - (HERO_HAIKAZE.baseY + 0.12)) < 0.02, 'stair bottom pad grounded');
assert.ok(yMid > yBot + 1.2 && yMid < yTop - 1.0, 'stair mid climbs smoothly');
assert.ok(Math.abs(yTop - (HERO_HAIKAZE.baseY + 3.25)) < 0.02, 'stair top reaches 2F landing');
assert.ok(Math.abs(y201 - (HERO_HAIKAZE.baseY + 3.25)) < 0.02, '201 corridor elevated at 2F');
assert.ok(Math.abs(yBalc - (HERO_HAIKAZE.baseY + 3.25)) < 0.02, 'front balcony elevated at 2F');
assert.equal(townPlace(door201.x, door201.z), '海风庄 · 二楼走廊');

// 3) Riding cannot enter building footprint or staircase; walking CAN climb stairs & enter 2F corridor
const rideInside = constrainCoastalTown(HERO_HAIKAZE.x, HERO_HAIKAZE.z, false);
assert.ok(
  Math.abs(rideInside.x - HERO_HAIKAZE.x) > 4.2 || Math.abs(rideInside.z - HERO_HAIKAZE.z) > 3.9,
  'scooter pushed outside Haikaze-so footprint',
);
const walkStair = constrainCoastalTown(stairMid.x, stairMid.z, true);
assert.ok(Math.hypot(walkStair.x - stairMid.x, walkStair.z - stairMid.z) < 0.01, 'walker stays cleanly inside staircase');
const walkLanding = constrainCoastalTown(heroLocalToWorld(4.3, 3.0).x, heroLocalToWorld(4.3, 3.0).z, true);
assert.ok(Math.hypot(walkLanding.x - heroLocalToWorld(4.3, 3.0).x, walkLanding.z - heroLocalToWorld(4.3, 3.0).z) < 0.01, 'walker passes cleanly from top landing into 2F corridor');
const walk201 = constrainCoastalTown(door201.x, door201.z, true);
assert.ok(Math.hypot(walk201.x - door201.x, walk201.z - door201.z) < 0.01, 'walker stands cleanly at 201 door');

// 4) World bounds keep riders off the seawall drop
const nearSea = constrainCoastalTown(0, SEAWALL_Z + 10, false);
assert.ok(nearSea.z <= SEAWALL_Z - 1.1, 'seawall guardrail stops scooter');
assert.ok(nearSea.x >= WORLD_BOUNDS.minX && nearSea.x <= WORLD_BOUNDS.maxX);

// 5) Free-ride physics accelerates smoothly downhill without NaN
const st = initialState();
st.x = 0; st.z = -25; st.bikeX = 0; st.bikeZ = -25; st.yaw = 0; st.bikeYaw = 0;
for (let i = 0; i < 120; i++) stepFreeRide(st, 0, -1, 1.05, 1 / 60);
assert.ok(Number.isFinite(st.z) && st.z > -20 && st.speed > 5, 'scooter accelerates smoothly down coastal slope');

console.log('PASS: Rongwan Coastal Corner slope, Haikaze-so 2F stairs/collision, seawall & riding physics.');
