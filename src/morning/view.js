import * as THREE from 'three';
import { resizeRideCamera } from './ride-camera.js';
import { createTireEffects } from './tire-effects.js';
import { createRideMotion } from './ride-motion.js';
import { countryCamera, maxTrialSpeed } from './free-ride.js';
import { constrainToRoad, crossing, halfWidth, roadHeight } from './country-route.js';
import { $ } from './dom.js';
import { clamp, damp, dampAngle } from '../core/mathx.js';
import { isBoxSequence, isStandSequence, positionParcel } from './sequence.js';
import { CURB_H, CURB_Z } from './street-layout.js';
import { inCoastalSample, coastalSurfaceHeight, coastalSidewalk } from './coastal-sample.js';
import { inCoastalTown, coastalTownSurfaceHeight } from './coastal-town.js';

const OLD_STREET_LIMIT_X = 46;
const SIGNAL_POLES = [
  [crossing.x + 6.42, crossing.z - 6.55],
  [crossing.x - 6.55, crossing.z - 6.42],
  [crossing.x - 6.42, crossing.z + 6.55],
  [crossing.x + 6.55, crossing.z + 6.42],
];
const POLE_CLEARANCE = 1.25;

function onCitySidewalk(x, z) {
  const dx = Math.abs(x - crossing.x), dz = Math.abs(z - crossing.z);
  if (dx > crossing.half && dx < 29.1 && dz > halfWidth(x)) return true;
  if (dx > crossing.half && dx < crossing.half + 4.6 && dz > crossing.half && dz < crossing.arm + 2) return true;
  if (dx < 9 && dz >= crossing.arm + 1.7 && dz < crossing.arm + 4.1) return true;
  return false;
}

function surfaceHeight(x, z, inside) {
  if (inside) return 0;
  if (inCoastalTown(x, z)) return coastalTownSurfaceHeight(x, z);
  if (inCoastalSample(x, z)) return coastalSurfaceHeight(x, z) + (coastalSidewalk(x, z) ? CURB_H : 0);
  const base = roadHeight(x);
  if (onCitySidewalk(x, z)) return base + CURB_H;
  if (x <= OLD_STREET_LIMIT_X && z < CURB_Z) return base + CURB_H;
  return base;
}

function clearCrossingObstacles(pos, target) {
  if (Math.abs(pos.x - crossing.x) > 34 || Math.abs(pos.z - crossing.z) > crossing.arm + 6) return;
  const safe = constrainToRoad(pos.x, pos.z, true);
  pos.x = safe.x;
  pos.z = safe.z;
  for (const [px, pz] of SIGNAL_POLES) {
    const dx = pos.x - px, dz = pos.z - pz;
    const d = Math.hypot(dx, dz);
    if (d < POLE_CLEARANCE) {
      const toCenterX = crossing.x - px, toCenterZ = crossing.z - pz;
      const cLen = Math.hypot(toCenterX, toCenterZ) || 1;
      let nx = d > 0.05 ? (dx / d) * 0.65 + (toCenterX / cLen) * 0.35 : toCenterX / cLen;
      let nz = d > 0.05 ? (dz / d) * 0.65 + (toCenterZ / cLen) * 0.35 : toCenterZ / cLen;
      const nLen = Math.hypot(nx, nz) || 1;
      pos.x = px + (nx / nLen) * POLE_CLEARANCE;
      pos.z = pz + (nz / nLen) * POLE_CLEARANCE;
    }
    if (target) {
      const sx = target.x - pos.x, sz = target.z - pos.z;
      const sLenSq = sx * sx + sz * sz;
      if (sLenSq > 1.0) {
        const t = clamp(((px - pos.x) * sx + (pz - pos.z) * sz) / sLenSq, 0, 1);
        if (t > 0.05 && t < 0.90) {
          const cx = pos.x + sx * t, cz = pos.z + sz * t;
          const perp = Math.hypot(px - cx, pz - cz);
          if (perp < 0.72) {
            const toCenterX = crossing.x - px, toCenterZ = crossing.z - pz;
            const cLen = Math.hypot(toCenterX, toCenterZ) || 1;
            const push = (0.78 - perp) / Math.max(0.25, 1 - t);
            pos.x += (toCenterX / cLen) * Math.min(1.6, push);
            pos.z += (toCenterZ / cLen) * Math.min(1.6, push);
          }
        }
      }
    }
  }
  const safe2 = constrainToRoad(pos.x, pos.z, true);
  pos.x = safe2.x;
  pos.z = safe2.z;
  for (const [px, pz] of SIGNAL_POLES) {
    const dx = pos.x - px, dz = pos.z - pz;
    if (Math.hypot(dx, dz) < 1.15) {
      const toCenterX = crossing.x - px, toCenterZ = crossing.z - pz;
      const cLen = Math.hypot(toCenterX, toCenterZ) || 1;
      pos.x = px + (toCenterX / cLen) * POLE_CLEARANCE;
      pos.z = pz + (toCenterZ / cLen) * POLE_CLEARANCE;
    }
  }
}

export function createView(renderer, state, world) {
  const { scene, country, coastalSample, coastalTown, camera, chase, timeOfDay, renderStyle, rooms, street, shiba, scooter, looseBag, marker, contact } = world;
  const roomList = Object.values(rooms);
  const courierScale = scooter.root.scale.y;
  const suspension = createRideMotion(scooter.frontZ, scooter.rearZ);
  const tireEffects = createTireEffects(scene, scooter);
  let headTurn = .75, shopReview;
  const focus = new THREE.Vector3();
  const cameraUp = new THREE.Vector3(0, 1, 0);
  const eyeOffset = new THREE.Vector3();
  const basis = { rightX: 1, rightZ: 0, backX: 0, backZ: 1 };
  let aspect = 1, view = '', closeUp = false, followYaw = Math.PI / 2, walkCamYaw = Math.PI / 2;
  let hasPerspectivePos = false, camBlend = 0;
  const portraitStart = Math.atan2(3.68, 2);
  let portraitAngle = portraitStart, portraitPitch = 0.20;
  let walkPitch = 0.24, streetOrbit = false;
  let rideYawOffset = 0, ridePitchOffset = 0, rideOrbitIdle = 99;
  let inspectYawOffset = 0, inspectPitchOffset = 0;
  let userWalkHold = 0;
  let dragPointer = null, dragX = 0, dragY = 0;
  const orbitKeys = { left: false, right: false };
  const stage = $('stage');

  function canOrbit() {
    return state.mode !== 'shop' && !state.sequence && !state.braking;
  }
  function recenterCamera() {
    portraitAngle = portraitStart;
    portraitPitch = 0.20;
    walkPitch = 0.24;
    rideYawOffset = 0;
    ridePitchOffset = 0;
    rideOrbitIdle = 99;
    inspectYawOffset = 0;
    inspectPitchOffset = 0;
    streetOrbit = false;
    if (state.mode === 'walk') {
      walkCamYaw = state.yaw;
    }
  }
  function setCloseUp(value) {
    closeUp = value;
    portraitAngle = portraitStart;
    portraitPitch = 0.20;
    dragPointer = null;
    stage.classList.toggle('turntable', value && state.mode !== 'shop');
    $('look').setAttribute('aria-pressed', String(value));
    $('look').querySelector('span').textContent = value ? '返回街景' : '近看阿柴';
  }
  function applyOrbitDelta(dx, dy) {
    if (!canOrbit()) return;
    const yawStep = dx;
    const pitchStep = dy;
    if (shopReview) {
      inspectYawOffset += yawStep;
      inspectPitchOffset = clamp(inspectPitchOffset + pitchStep, -0.35, 0.55);
      return;
    }
    if (closeUp) {
      portraitAngle += yawStep;
      portraitPitch = clamp(portraitPitch + pitchStep, -0.18, 0.58);
      return;
    }
    if (state.mode === 'ride') {
      rideYawOffset += yawStep;
      ridePitchOffset = clamp(ridePitchOffset + pitchStep, -0.16, 0.44);
      rideOrbitIdle = 0;
      return;
    }
    // Walking mode (Old Street, Crossing, Country, Hillside)
    walkCamYaw += yawStep;
    walkPitch = clamp(walkPitch + pitchStep, -0.12, 0.48);
    userWalkHold = 0.7;
  }
  stage.addEventListener('pointerdown', event => {
    if (!canOrbit() || !event.isPrimary || (event.button !== 0 && event.button !== 2)) return;
    if (dragPointer !== null) return;
    dragPointer = event.pointerId;
    dragX = event.clientX;
    dragY = event.clientY;
    stage.setPointerCapture(dragPointer);
  });
  stage.addEventListener('pointermove', event => {
    if (event.pointerId !== dragPointer || !stage.hasPointerCapture(event.pointerId)) return;
    const scale = 3.8 / Math.max(360, stage.clientWidth);
    const dx = (dragX - event.clientX) * scale;
    const dy = (event.clientY - dragY) * scale * 0.65;
    dragX = event.clientX;
    dragY = event.clientY;
    if (Math.abs(dx) > 1e-5 || Math.abs(dy) > 1e-5) applyOrbitDelta(dx, dy);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stage.addEventListener(type, event => {
      if (event.pointerId === dragPointer) dragPointer = null;
    });
  }
  stage.addEventListener('dblclick', () => {
    if (canOrbit()) recenterCamera();
  });
  window.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (event.code === 'BracketLeft') orbitKeys.left = true;
    else if (event.code === 'BracketRight') orbitKeys.right = true;
    else if (event.code === 'KeyR' && !event.repeat && canOrbit()) {
      event.preventDefault();
      recenterCamera();
    }
  });
  window.addEventListener('keyup', event => {
    if (event.code === 'BracketLeft') orbitKeys.left = false;
    else if (event.code === 'BracketRight') orbitKeys.right = false;
  });
  window.addEventListener('blur', () => {
    orbitKeys.left = orbitKeys.right = false;
    dragPointer = null;
  });

  function clearInspection() {
    shopReview = null;
    inspectYawOffset = 0;
    inspectPitchOffset = 0;
    if (closeUp) setCloseUp(false);
  }
  function reset(preset) {
    shopReview = preset;
    headTurn = .75;
    view = '';
    followYaw = state.bikeYaw;
    walkCamYaw = state.x <= OLD_STREET_LIMIT_X && state.mode === 'walk' ? Math.PI - 0.22 : state.bikeYaw;
    walkPitch = 0.24;
    streetOrbit = false;
    rideYawOffset = 0;
    ridePitchOffset = 0;
    rideOrbitIdle = 99;
    inspectYawOffset = 0;
    inspectPitchOffset = 0;
    userWalkHold = 0;
    dragPointer = null;
    hasPerspectivePos = false;
    camBlend = 0;
    if (state.mode === 'shop') {
      basis.rightX = 1; basis.rightZ = 0; basis.backX = 0; basis.backZ = 1;
    } else if (preset?.offset) {
      const len = Math.hypot(preset.offset[0], preset.offset[2]) || 1;
      const fx = -preset.offset[0] / len, fz = -preset.offset[2] / len;
      basis.rightX = -fz; basis.rightZ = fx; basis.backX = -fx; basis.backZ = -fz;
    } else {
      const fx = Math.sin(walkCamYaw), fz = Math.cos(walkCamYaw);
      basis.rightX = -fz; basis.rightZ = fx; basis.backX = -fx; basis.backZ = -fz;
    }
    setCloseUp(false);
    shiba.resetTail();
    suspension.reset();
    tireEffects.reset();
    shiba.root.rotation.y = scooter.root.rotation.y = state.yaw;
    scooter.lid.rotation.x = 0;
    scooter.lid.rotation.z = 0;
    for (const door of street.doors.values()) door.rotation.y = 0;
  }

  function walkBasis() {
    if (state.mode === 'shop') {
      return { rightX: 1, rightZ: 0, backX: 0, backZ: 1 };
    }
    return { ...basis };
  }

  function walkBoomBlocked(yaw, dist) {
    const rx = state.x - Math.sin(yaw) * dist;
    const rz = state.z - Math.cos(yaw) * dist;
    const safe = constrainToRoad(rx, rz, true);
    const wallShift = Math.hypot(rx - safe.x, rz - safe.z);
    const distToShiba = Math.hypot(safe.x - state.x, safe.z - state.z);
    return wallShift > 0.45 && distToShiba < 3.8;
  }

  const desiredFocus = new THREE.Vector3(), eye = new THREE.Vector3(), desiredEye = new THREE.Vector3();
  function draw(dt, time, { stride, walking }) {
    const inside = state.mode === 'shop', riding = state.mode === 'ride';
    const inHub = !inside && inCoastalTown(state.x, state.z);
    const outsideTown = !inside && (state.x > OLD_STREET_LIMIT_X || inHub);
    if (inside) {
      streetOrbit = false;
      rideYawOffset = 0;
      ridePitchOffset = 0;
    }
    if (orbitKeys.left || orbitKeys.right) {
      const dir = (orbitKeys.left ? 1 : 0) - (orbitKeys.right ? 1 : 0);
      if (dir) applyOrbitDelta(dir * 1.9 * dt, 0);
    }
    userWalkHold = Math.max(0, userWalkHold - dt);
    stage.classList.toggle('orbitable', canOrbit());
    stage.classList.toggle('turntable', closeUp && !inside);
    const packing = isBoxSequence(state.sequence);
    const handling = isStandSequence(state.sequence);
    const seatBlend = handling ? state.sequence.seat ?? (riding ? 1 : 0) : Number(riding);
    const nextView = state.sequence?.approaching ? 'walk' :
      state.braking && !state.speed ? 'stand' : state.sequence ? (handling ? 'stand' : packing ? 'box' : 'door') :
      (shopReview ? 'inspection' : (closeUp ? 'portrait' : inside ? 'shop' : !riding ? 'walk' : 'chase'));
    const fieldInspection = nextView === 'inspection' && shopReview.fov;
    const perspectiveView = nextView === 'chase' || nextView === 'walk' || nextView === 'portrait' || fieldInspection;
    const activeCamera = perspectiveView ? chase : camera;
    const snap = nextView !== view;
    const room = rooms[state.order.room.template];
    for (const candidate of roomList) candidate.root.visible = inside && candidate === room;
    room.bag.visible = state.phase === 'pickup';
    country.root.visible = !inside;
    country.sky.visible = !inside && perspectiveView;
    street.root.visible = !inside && !inHub && state.x < 240;
    if (coastalTown) coastalTown.root.visible = !inside && inHub;
    if (coastalSample) coastalSample.root.visible = !inside && !inHub;
    scooter.root.visible = !inside;
    if (inside) room.update(time); else {
      if (!inHub) {
        street.update(time);
        coastalSample?.update(time);
      } else {
        coastalTown?.update(time);
      }
    }
    const ground = inside ? 0
      : inHub ? coastalTownSurfaceHeight(state.x, state.z)
      : inCoastalSample(state.x, state.z) ? coastalSurfaceHeight(state.x, state.z) : roadHeight(state.x);
    const height = surfaceHeight(state.x, state.z, inside);
    const bikeHeight = surfaceHeight(state.bikeX, state.bikeZ, inside);
    const facing = closeUp && !riding ? 0.45 : state.yaw;
    shiba.root.rotation.y = riding || handling || snap ? facing : dampAngle(shiba.root.rotation.y, facing, 15, dt);
    scooter.root.rotation.y = state.bikeYaw;
    scooter.root.position.set(state.bikeX, bikeHeight, state.bikeZ);
    scooter.steer(state.steer);
    scooter.setStand(state.stand);
    const bikeInHub = !inside && inCoastalTown(state.bikeX, state.bikeZ);
    const bikeOnCoast = !inside && !bikeInHub && inCoastalSample(state.bikeX, state.bikeZ);
    const grade = inside ? 0 : bikeInHub
      ? (coastalTownSurfaceHeight(state.bikeX + 0.5 * Math.sin(state.bikeYaw), state.bikeZ + 0.5 * Math.cos(state.bikeYaw))
        - coastalTownSurfaceHeight(state.bikeX - 0.5 * Math.sin(state.bikeYaw), state.bikeZ - 0.5 * Math.cos(state.bikeYaw)))
      : bikeOnCoast
      ? (coastalSurfaceHeight(state.bikeX + 0.5 * Math.sin(state.bikeYaw), state.bikeZ + 0.5 * Math.cos(state.bikeYaw))
        - coastalSurfaceHeight(state.bikeX - 0.5 * Math.sin(state.bikeYaw), state.bikeZ - 0.5 * Math.cos(state.bikeYaw)))
      : (roadHeight(state.bikeX + .5) - roadHeight(state.bikeX - .5)) * Math.sin(state.bikeYaw);
    const rideMotion = !inside && riding && !state.sequence ? suspension.update(state, dt) : null;
    scooter.setSuspension(rideMotion?.frontTravel ?? 0, rideMotion?.rearTravel ?? 0);
    scooter.root.position.y += rideMotion?.height ?? 0;
    scooter.root.rotation.x = -Math.atan(grade) + (rideMotion?.pitch ?? 0);
    scooter.root.rotation.z += !inside && riding ? state.bank : 0;
    tireEffects.update(state, dt);
    shiba.root.rotation.order = 'YXZ';
    shiba.root.rotation.x = riding ? scooter.root.rotation.x : 0;
    shiba.root.rotation.z = !inside && riding ? state.bank : 0;
    shiba.root.position.set(state.x, riding ? scooter.root.position.y : height, state.z);
    const posed = nextView === 'portrait';
    const lookTowardCamera = nextView === 'stand' ? .42 : posed ? .78 : -.12;
    headTurn = damp(headTurn, riding || nextView === 'stand' ? lookTowardCamera : 0, 10, dt);
    shiba.pose({ time, dt, stride, walking, headTurn, speed: state.speed, lift: state.lift, tiptoe: state.tiptoe, reach: state.reach,
      seatBlend, rideMotion,
      rise: handling ? state.sequence.rise : 0, hop: handling ? state.sequence.hop : 0,
      swing: handling ? state.sequence.swing : 0,
      mount: seatBlend > 0 ? scooter.mount : null, carrying: packing || state.cargo === 'hand' });
    positionParcel(state, shiba, scooter, looseBag);
    contact.position.set(state.x, height + 0.025, state.z);
    contact.scale.set(riding ? 1.9 : 0.90, riding ? 0.84 : 0.65, 1).multiplyScalar(courierScale);
    contact.rotation.z = riding ? state.bikeYaw - Math.PI / 2 : 0;
    marker.scale.setScalar(1 + 0.065 * Math.sin(time * 3.4));
    if (snap) {
      if (nextView === 'walk') {
        if (view === 'street') walkCamYaw = Math.PI / 2;
      } else if (nextView === 'chase') {
        if (view === 'walk' || view === 'stand') camBlend = 0.45;
        else followYaw = state.bikeYaw;
      } else if (nextView !== 'stand') {
        followYaw = state.bikeYaw;
      }
      const heights = { portrait: 3.30, intro: 4.8, door: 4.05, stand: 2.95, box: 3.6, shop: 5.56, street: 6.15 };
      const widths = { portrait: 3.2, intro: 4.0, door: 3.25, stand: 3.00, box: 3.2, shop: 7.1, street: 5.2 };
      if (fieldInspection) {
        const halfAngle = THREE.MathUtils.degToRad(shopReview.fov / 2);
        chase.fov = shopReview.fitWidth && aspect < 1
          ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfAngle) / aspect))
          : shopReview.fov;
        chase.near = 0.12;
        chase.far = inHub ? 380 : 245;
        chase.updateProjectionMatrix();
      } else if (!perspectiveView) {
        const detailScale = nextView === 'portrait' || nextView === 'box' ? courierScale : 1;
        const h = nextView === 'inspection' ? shopReview.height : heights[nextView];
        const w = nextView === 'inspection' ? shopReview.width : widths[nextView];
        const frameHeight = Math.max(h, Math.min(11.4, w / aspect)) * detailScale;
        camera.left = -frameHeight * aspect / 2; camera.right = -camera.left;
        camera.top = frameHeight / 2; camera.bottom = -camera.top;
        camera.updateProjectionMatrix();
      }
    }
    const baseFogDensity = inside ? 0.014 : inHub ? 0.0022 : 0.016 - 0.0122 * THREE.MathUtils.smoothstep(state.x, 28, 120);
    timeOfDay.applyAtmosphere({
      inside,
      perspectiveView,
      baseFogDensity,
      styleFogFactor: renderStyle.fogDensityFactor(),
      useStyledFog: renderStyle.usesStyledFog(),
    });
    if (!inside) {
      country.update(state, time, scene.fog?.color, scene.fog?.density);
    }
    timeOfDay.syncScene();
    renderStyle.syncScene();
    if (nextView === 'chase') {
      followYaw = dampAngle(followYaw, state.bikeYaw, 5.4, dt);
      if (dragPointer === null && !orbitKeys.left && !orbitKeys.right) {
        if (Math.abs(state.speed) > 0.4) {
          rideOrbitIdle += dt;
          if (rideOrbitIdle > 1.5) {
            rideYawOffset = damp(rideYawOffset, 0, 3.2, dt);
            ridePitchOffset = damp(ridePitchOffset, 0, 3.2, dt);
            if (Math.abs(rideYawOffset) < 0.002 && Math.abs(ridePitchOffset) < 0.002) {
              rideYawOffset = 0;
              ridePitchOffset = 0;
            }
          }
        }
      }
      const activeYaw = followYaw + rideYawOffset;
      walkCamYaw = activeYaw;
      const fov = (aspect < .85 ? 63 : 55) + 7 * Math.min(1, Math.abs(state.speed) / maxTrialSpeed) ** 2;
      const far = inHub ? 380 : outsideTown ? 245 : 118;
      if (Math.abs(chase.fov - fov) > .03 || chase.near !== 0.25 || chase.far !== far) {
        chase.fov = fov;
        chase.near = 0.25;
        chase.far = far;
        chase.updateProjectionMatrix();
      }
      const prevPos = desiredEye.copy(chase.position);
      const prevFocus = desiredFocus.copy(focus);
      const userOrbited = Math.abs(rideYawOffset) > 0.005 || Math.abs(ridePitchOffset) > 0.005;
      countryCamera(chase, state, activeYaw, focus);
      if (userOrbited) {
        const groundAtCam = inCoastalTown(chase.position.x, chase.position.z)
          ? coastalTownSurfaceHeight(chase.position.x, chase.position.z)
          : inCoastalSample(chase.position.x, chase.position.z)
          ? coastalSurfaceHeight(chase.position.x, chase.position.z)
          : roadHeight(chase.position.x);
        chase.position.y = Math.max(groundAtCam + 1.15, chase.position.y + ridePitchOffset * 3.8);
        focus.set(state.x, ground + 1.18, state.z);
      }
      clearCrossingObstacles(chase.position, focus);
      chase.lookAt(focus);
      chase.rotateZ(state.bank * .07);
      if (camBlend > 0 && hasPerspectivePos && Math.hypot(prevPos.x - chase.position.x, prevPos.z - chase.position.z) < 18) {
        const alpha = 1 - Math.exp(-7.5 * dt);
        chase.position.lerpVectors(prevPos, chase.position, alpha);
        focus.lerpVectors(prevFocus, focus, alpha);
        chase.lookAt(focus);
        chase.rotateZ(state.bank * .07);
        camBlend = Math.max(0, camBlend - dt);
      } else {
        camBlend = 0;
      }
      hasPerspectivePos = true;
    } else if (nextView === 'walk') {
      const walkDist = 5.4;
      const walkFov = aspect < 0.85 ? 54 : 46;
      if (Math.abs(chase.fov - walkFov) > 0.03 || chase.near !== 0.25 || chase.far !== 245) {
        chase.fov = walkFov;
        chase.near = 0.25;
        chase.far = 245;
        chase.updateProjectionMatrix();
      }
      if (outsideTown && dragPointer === null && userWalkHold <= 0 && walkBoomBlocked(walkCamYaw, walkDist)) {
        for (let step = 0.25; step <= 2.3; step += 0.25) {
          if (!walkBoomBlocked(walkCamYaw + step, walkDist)) {
            walkCamYaw = dampAngle(walkCamYaw, walkCamYaw + step, 4.5, dt);
            break;
          }
          if (!walkBoomBlocked(walkCamYaw - step, walkDist)) {
            walkCamYaw = dampAngle(walkCamYaw, walkCamYaw - step, 4.5, dt);
            break;
          }
        }
      }
      desiredFocus.set(state.x, height + 1.12, state.z);
      const horiz = walkDist * Math.cos(walkPitch);
      const rawX = state.x - Math.sin(walkCamYaw) * horiz;
      const rawZ = state.z - Math.cos(walkCamYaw) * horiz;
      const boomGround = inCoastalTown(rawX, rawZ) ? coastalTownSurfaceHeight(rawX, rawZ)
        : inCoastalSample(rawX, rawZ) ? coastalSurfaceHeight(rawX, rawZ) : roadHeight(rawX);
      const rawY = Math.max(boomGround + 1.05, height + 1.12 + walkDist * Math.sin(walkPitch) + 0.55);
      desiredEye.set(rawX, rawY, rawZ);
      if (outsideTown) clearCrossingObstacles(desiredEye, desiredFocus);
      const farJump = !hasPerspectivePos || Math.hypot(chase.position.x - desiredEye.x, chase.position.z - desiredEye.z) > 18;
      if (farJump) {
        focus.copy(desiredFocus);
        chase.position.copy(desiredEye);
        hasPerspectivePos = true;
      } else {
        const alpha = 1 - Math.exp(-(dragPointer !== null ? 18 : 7.5) * dt);
        focus.lerp(desiredFocus, alpha);
        chase.position.lerp(desiredEye, alpha);
      }
      chase.lookAt(focus);
    } else if (nextView === 'portrait') {
      const portraitFov = aspect < 0.85 ? 46 : 38;
      if (Math.abs(chase.fov - portraitFov) > 0.03 || chase.near !== 0.12 || chase.far !== 245) {
        chase.fov = portraitFov;
        chase.near = 0.12;
        chase.far = inHub ? 380 : 245;
        chase.updateProjectionMatrix();
      }
      const radius = (riding ? 3.55 : 2.75) * courierScale;
      const baseYaw = riding ? state.bikeYaw : 0;
      const theta = baseYaw + portraitAngle;
      const horiz = radius * Math.cos(portraitPitch);
      const focusY = (riding ? ground + 1.06 : height + 0.94) * courierScale + (riding ? 0 : (1 - courierScale) * height);
      desiredFocus.set(state.x, focusY, state.z);
      desiredEye.set(
        state.x + Math.sin(theta) * horiz,
        Math.max(ground + 0.45, focusY + radius * Math.sin(portraitPitch) + 0.18),
        state.z + Math.cos(theta) * horiz,
      );
      if (snap) {
        focus.copy(desiredFocus);
        chase.position.copy(desiredEye);
      } else {
        const alpha = 1 - Math.exp(-(dragPointer !== null ? 20 : 10) * dt);
        focus.lerp(desiredFocus, alpha);
        chase.position.lerp(desiredEye, alpha);
      }
      chase.lookAt(focus);
      hasPerspectivePos = true;
    } else {
      if (nextView === 'stand') {
        scooter.root.localToWorld(desiredFocus.set(.32, 1.05, -.16));
        if (aspect < .85) desiredFocus.y -= .24;
        eye.set(4.65, 2.88, -2.25).applyAxisAngle(cameraUp, state.bikeYaw)
          .multiplyScalar(courierScale).add(scooter.root.position);
        if (!outsideTown) eye.z = Math.max(eye.z, -.95);
        eyeOffset.copy(eye).sub(desiredFocus);
      } else if (nextView === 'box') {
        scooter.root.localToWorld(desiredFocus.set(0.14, 0.90, scooter.cargo.floor.z - 0.30));
        scooter.root.localToWorld(eye.set(-1.65, 1.45, scooter.cargo.floor.z - 3.70));
        eyeOffset.copy(eye).sub(desiredFocus);
      } else if (nextView === 'door') {
        desiredFocus.set(state.order.door.x, 1.27, -1.48);
        eyeOffset.set(1.55, 2.05, 8.7);
      } else if (shopReview) {
        desiredFocus.fromArray(shopReview.focus);
        eyeOffset.fromArray(shopReview.offset);
        if (Math.abs(inspectYawOffset) > 1e-4 || Math.abs(inspectPitchOffset) > 1e-4) {
          eyeOffset.applyAxisAngle(cameraUp, inspectYawOffset);
          const horiz = Math.hypot(eyeOffset.x, eyeOffset.z);
          if (horiz > 0.05) {
            const pitch = clamp(Math.atan2(eyeOffset.y, horiz) + inspectPitchOffset, -0.25, 0.85);
            const dist = eyeOffset.length();
            const scaleH = Math.cos(pitch) * dist / horiz;
            eyeOffset.x *= scaleH;
            eyeOffset.z *= scaleH;
            eyeOffset.y = Math.sin(pitch) * dist;
          }
        }
      } else if (posed) {
        desiredFocus.set(state.x, ground + (riding ? 1.21 : 1.10) * courierScale, state.z);
        if (riding) {
          eye.set(4.19 * Math.sin(portraitAngle), 1.92, 4.19 * Math.cos(portraitAngle))
            .applyAxisAngle(cameraUp, state.bikeYaw).multiplyScalar(courierScale).add(scooter.root.position);
          if (!outsideTown) eye.z = Math.max(eye.z, -.95);
          eyeOffset.copy(eye).sub(desiredFocus);
        } else eyeOffset.set(0.8, 2.5, 9.2);
      } else {
        desiredFocus.set(inside ? 0 : state.x, inside ? 1.50 : ground + 1.74, inside ? -0.12 : state.z - 0.63);
        eyeOffset.set(inside ? -3.3 : 2.95, inside ? 4.60 : 3.9, 11);
      }
      if (snap) focus.copy(desiredFocus); else focus.lerp(desiredFocus, 1 - Math.exp(-7 * dt));
      activeCamera.position.copy(focus).add(eyeOffset);
      if (!inside && !fieldInspection && Math.abs(state.x - crossing.x) < 29) {
        // Keep the close-up parking view on the street side of the city facades.
        const pos = activeCamera.position, safe = constrainToRoad(pos.x, pos.z, true);
        if (Math.hypot(pos.x - safe.x, pos.z - safe.z) > .01) {
          pos.y += Math.min(3, Math.hypot(pos.x - safe.x, pos.z - safe.z) * .45);
          pos.x = safe.x; pos.z = safe.z;
        }
      }
      activeCamera.lookAt(focus);
    }
    if (inside) {
      basis.rightX = 1; basis.rightZ = 0; basis.backX = 0; basis.backZ = 1;
    } else {
      const fx = focus.x - activeCamera.position.x;
      const fz = focus.z - activeCamera.position.z;
      const len = Math.hypot(fx, fz);
      if (len > 0.001) {
        const nx = fx / len, nz = fz / len;
        basis.rightX = -nz; basis.rightZ = nx; basis.backX = -nx; basis.backZ = -nz;
      }
    }
    // Hide the shop facade row only when the camera orbits behind it on Old Street
    // so a 360-degree close-up or walk orbit never gets blocked by a storefront wall.
    const behindOldShops = !inside && !outsideTown && activeCamera.position.z < -1.35;
    const fromShopSide = (!perspectiveView && camera.position.z < focus.z) || behindOldShops;
    street.shopSide.visible = !fromShopSide;
    street.opposite.visible = (perspectiveView && !(activeCamera.position.z > 6.6 && !outsideTown)) || fromShopSide;
    const lightX = Math.round(focus.x * 2) / 2;
    const lightZ = inside ? 0 : Math.round(focus.z * 2) / 2;
    const openCountry = inside ? 0 : inHub ? 1 : THREE.MathUtils.smoothstep(state.x, 52, 170);
    timeOfDay.updateLightTransform({ inside, openCountry, lightX, ground, lightZ, scooterRoot: scooter.root });
    view = nextView;
    if (!inside) country.sky.position.copy(activeCamera.position);
    renderStyle.render(scene, activeCamera);
  }

  function resize() {
    const w = $('stage').clientWidth, h = Math.max(1, $('stage').clientHeight);
    aspect = w / h;
    resizeRideCamera(chase, aspect);
    renderer.setSize(w, h, false);
    renderStyle.resize(w, h);
    view = '';
  }
  return { draw, resize, reset, clearInspection, walkBasis, toggleCloseUp() {
    shopReview = null;
    setCloseUp(!closeUp);
  } };
}
