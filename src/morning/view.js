import * as THREE from 'three';
import { frameRide, resizeRideCamera } from './ride-camera.js';
import { createTireEffects } from './tire-effects.js';
import { createRideMotion } from './ride-motion.js';
import { countryCamera, maxTrialSpeed } from './free-ride.js';
import { constrainToRoad, crossing, halfWidth, roadHeight } from './country-route.js';
import { $ } from './dom.js';
import { clamp, damp, dampAngle } from '../core/mathx.js';
import { isBoxSequence, isStandSequence, positionParcel } from './sequence.js';
import { CURB_H, CURB_Z } from './street-layout.js';
import { start } from './orders.js';

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
  const { scene, country, camera, chase, sun, rooms, street, shiba, scooter, looseBag, marker, contact } = world;
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
  let portraitAngle = portraitStart, dragX;
  const stage = $('stage');
  function setCloseUp(value) {
    closeUp = value;
    portraitAngle = portraitStart;
    dragX = undefined;
    stage.classList.toggle('turntable', value && state.mode === 'ride');
    $('look').setAttribute('aria-pressed', String(value));
    $('look').querySelector('span').textContent = value ? '返回街景' : '近看阿柴';
  }
  stage.addEventListener('pointerdown', event => {
    if (!closeUp || state.mode !== 'ride' || !event.isPrimary || event.button !== 0) return;
    stage.setPointerCapture(event.pointerId);
    dragX = event.clientX;
  });
  stage.addEventListener('pointermove', event => {
    if (dragX === undefined || !stage.hasPointerCapture(event.pointerId)) return;
    portraitAngle = clamp(portraitAngle + (dragX - event.clientX) * 2.5 / stage.clientWidth, 0.30, 1.95);
    dragX = event.clientX;
  });
  stage.addEventListener('lostpointercapture', () => { dragX = undefined; });

  function clearInspection() {
    shopReview = null;
    if (closeUp) setCloseUp(false);
  }
  function reset(preset) {
    shopReview = preset;
    headTurn = .75;
    view = '';
    followYaw = state.bikeYaw;
    walkCamYaw = state.bikeYaw;
    hasPerspectivePos = false;
    camBlend = 0;
    if (state.mode === 'shop' || state.x <= OLD_STREET_LIMIT_X) {
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
    if (state.mode === 'shop' || state.x <= OLD_STREET_LIMIT_X) {
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
    const outsideTown = !inside && state.x > OLD_STREET_LIMIT_X;
    const packing = isBoxSequence(state.sequence);
    const handling = isStandSequence(state.sequence);
    const seatBlend = handling ? state.sequence.seat ?? (riding ? 1 : 0) : Number(riding);
    const atSpawn = state.phase === 'offer' && riding
      && Math.hypot(state.x - start.x, state.z - start.z) < 0.12
      && Math.abs(state.speed) < 0.05
      && state.throttle < 0.05
      && !state.reverseHold;
    const nextView = state.sequence?.approaching ? (outsideTown ? 'walk' : 'street') :
      state.braking && !state.speed ? 'stand' : state.sequence ? (handling ? 'stand' : packing ? 'box' : 'door') :
      (shopReview ? 'inspection' : (closeUp ? 'portrait' : inside ? 'shop' : !riding ? (outsideTown ? 'walk' : 'street') : atSpawn ? 'intro' : 'chase'));
    const fieldInspection = nextView === 'inspection' && shopReview.fov;
    const perspectiveView = nextView === 'chase' || nextView === 'walk' || fieldInspection;
    const activeCamera = perspectiveView ? chase : camera;
    const snap = nextView !== view;
    const room = rooms[state.order.room.template];
    for (const candidate of roomList) candidate.root.visible = inside && candidate === room;
    room.bag.visible = state.phase === 'pickup';
    country.root.visible = !inside;
    country.sky.visible = !inside && perspectiveView;
    street.eastTrees.visible = false;
    street.root.visible = !inside && state.x < 240;
    scooter.root.visible = !inside;
    if (inside) room.update(time); else street.update(time);
    const ground = inside ? 0 : roadHeight(state.x);
    const height = surfaceHeight(state.x, state.z, inside);
    const bikeHeight = surfaceHeight(state.bikeX, state.bikeZ, inside);
    const facing = closeUp && !riding ? 0.45 : state.yaw;
    shiba.root.rotation.y = riding || handling || snap ? facing : dampAngle(shiba.root.rotation.y, facing, 15, dt);
    scooter.root.rotation.y = state.bikeYaw;
    scooter.root.position.set(state.bikeX, bikeHeight, state.bikeZ);
    scooter.steer(state.steer);
    scooter.setStand(state.stand);
    const grade = inside ? 0 : roadHeight(state.bikeX + .5) - roadHeight(state.bikeX - .5);
    const rideMotion = !inside && riding && !state.sequence ? suspension.update(state, dt) : null;
    scooter.setSuspension(rideMotion?.frontTravel ?? 0, rideMotion?.rearTravel ?? 0);
    scooter.root.position.y += rideMotion?.height ?? 0;
    scooter.root.rotation.x = -Math.atan(grade * Math.sin(state.bikeYaw)) + (rideMotion?.pitch ?? 0);
    scooter.root.rotation.z += !inside && riding ? state.bank : 0;
    tireEffects.update(state, dt);
    shiba.root.rotation.order = 'YXZ';
    shiba.root.rotation.x = riding ? scooter.root.rotation.x : 0;
    shiba.root.rotation.z = !inside && riding ? state.bank : 0;
    shiba.root.position.set(state.x, riding ? scooter.root.position.y : height, state.z);
    const posed = nextView === 'portrait' || nextView === 'intro';
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
      const skyBg = inside ? 0xe2cfaa : (perspectiveView ? 0x9cd3e9 : 0xcfe0dc);
      scene.background = new THREE.Color(skyBg);
      scene.fog = new THREE.FogExp2(inside ? 0xe2cfaa : 0xdaf0f5, inside ? 0.014 : 0.016);
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
        chase.far = 245;
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
    if (!inside) {
      scene.fog.density = 0.016 - 0.0122 * THREE.MathUtils.smoothstep(state.x, 28, 120);
      country.update(state, time, scene.fog?.color, scene.fog?.density);
    }
    if (nextView === 'chase') {
      followYaw = dampAngle(followYaw, state.bikeYaw, 5.4, dt);
      walkCamYaw = followYaw;
      const fov = (aspect < .85 ? 63 : 55) + 7 * Math.min(1, Math.abs(state.speed) / maxTrialSpeed) ** 2;
      if (Math.abs(chase.fov - fov) > .03 || chase.near !== 0.25 || chase.far !== 245) {
        chase.fov = fov;
        chase.near = 0.25;
        chase.far = 245;
        chase.updateProjectionMatrix();
      }
      const prevPos = desiredEye.copy(chase.position);
      const prevFocus = desiredFocus.copy(focus);
      if (outsideTown) {
        countryCamera(chase, state, followYaw, focus);
        clearCrossingObstacles(chase.position, focus);
        chase.lookAt(focus);
        chase.rotateZ(state.bank * .07);
      } else {
        frameRide(chase, state, followYaw, focus);
      }
      if (camBlend > 0 && hasPerspectivePos && Math.hypot(prevPos.x - chase.position.x, prevPos.z - chase.position.z) < 18) {
        const alpha = 1 - Math.exp(-7.5 * dt);
        chase.position.lerpVectors(prevPos, chase.position, alpha);
        focus.lerpVectors(prevFocus, focus, alpha);
        chase.lookAt(focus);
        if (outsideTown) chase.rotateZ(state.bank * .07);
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
      if (walkBoomBlocked(walkCamYaw, walkDist)) {
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
      desiredFocus.set(state.x, height + 1.18, state.z);
      const rawX = state.x - Math.sin(walkCamYaw) * walkDist;
      const rawZ = state.z - Math.cos(walkCamYaw) * walkDist;
      desiredEye.set(rawX, Math.max(roadHeight(rawX) + 1.55, ground + 2.55), rawZ);
      clearCrossingObstacles(desiredEye, desiredFocus);
      const farJump = !hasPerspectivePos || Math.hypot(chase.position.x - desiredEye.x, chase.position.z - desiredEye.z) > 18;
      if (farJump) {
        focus.copy(desiredFocus);
        chase.position.copy(desiredEye);
        hasPerspectivePos = true;
      } else {
        const alpha = 1 - Math.exp(-6.5 * dt);
        focus.lerp(desiredFocus, alpha);
        chase.position.lerp(desiredEye, alpha);
      }
      chase.lookAt(focus);
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
    if (inside || state.x <= OLD_STREET_LIMIT_X) {
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
    // Dress the far side of a close-up; the shop row behind the lens can
    // otherwise put a counter or a tree across the boots and stand.
    const fromShopSide = !perspectiveView && camera.position.z < focus.z;
    street.shopSide.visible = !fromShopSide;
    street.opposite.visible = perspectiveView || fromShopSide;
    const lightX = Math.round(focus.x * 2) / 2;
    const lightZ = inside ? 0 : Math.round(focus.z * 2) / 2;
    sun.target.position.set(lightX, ground + .3, lightZ);
    const openCountry = inside ? 0 : THREE.MathUtils.smoothstep(state.x, 52, 170);
    sun.position.set(lightX - 6 + 20 * openCountry, ground + 11.5 - 4 * openCountry, lightZ + 7.5 - 13 * openCountry);
    view = nextView;
    if (!inside) country.sky.position.copy(activeCamera.position);
    renderer.render(scene, activeCamera);
  }

  function resize() {
    const w = $('stage').clientWidth, h = Math.max(1, $('stage').clientHeight);
    aspect = w / h;
    resizeRideCamera(chase, aspect);
    renderer.setSize(w, h, false);
    view = '';
  }
  return { draw, resize, reset, clearInspection, walkBasis, toggleCloseUp() {
    shopReview = null;
    setCloseUp(!closeUp);
  } };
}
