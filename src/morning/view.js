import * as THREE from 'three';
import { resizeRideCamera } from './ride-camera.js';
import { createTireEffects } from './tire-effects.js';
import { createRideMotion } from './ride-motion.js';
import { coastalCamera, maxTrialSpeed } from './free-ride.js';
import { coastalTownSurfaceHeight, constrainCoastalTown } from './coastal-town.js';
import { $ } from './dom.js';
import { clamp, damp, dampAngle } from '../core/mathx.js';
import { isBoxSequence, isStandSequence, positionParcel } from './sequence.js';

export function createView(renderer, state, world) {
  const { scene, coastalSky, coastalTown, camera, chase, timeOfDay, renderStyle, shiba, scooter, looseBag, marker, contact } = world;
  const courierScale = scooter.root.scale.y;
  const suspension = createRideMotion(scooter.frontZ, scooter.rearZ);
  const tireEffects = createTireEffects(scene, scooter);
  let headTurn = 0.75, shopReview = null;
  const focus = new THREE.Vector3();
  const cameraUp = new THREE.Vector3(0, 1, 0);
  const eyeOffset = new THREE.Vector3();
  const basis = { rightX: 1, rightZ: 0, backX: 0, backZ: 1 };
  let aspect = 1, view = '', closeUp = false, followYaw = 0, walkCamYaw = 0;
  let hasPerspectivePos = false, camBlend = 0;
  const portraitStart = Math.atan2(3.68, 2);
  let portraitAngle = portraitStart, portraitPitch = 0.20;
  let walkPitch = 0.24;
  let rideYawOffset = 0, ridePitchOffset = 0, rideOrbitIdle = 99;
  let inspectYawOffset = 0, inspectPitchOffset = 0;
  let userWalkHold = 0;
  let dragPointer = null, dragX = 0, dragY = 0;
  const orbitKeys = { left: false, right: false };
  const stage = $('stage');

  function canOrbit() {
    return !state.sequence && !state.braking;
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
    if (state.mode === 'walk') walkCamYaw = state.yaw;
  }
  function setCloseUp(value) {
    closeUp = value;
    portraitAngle = portraitStart;
    portraitPitch = 0.20;
    dragPointer = null;
    stage.classList.toggle('turntable', value);
    $('look').setAttribute('aria-pressed', String(value));
    $('look').querySelector('span').textContent = value ? '返回街景' : '近看阿柴';
  }
  function applyOrbitDelta(dx, dy) {
    if (!canOrbit()) return;
    if (shopReview) {
      inspectYawOffset += dx;
      inspectPitchOffset = clamp(inspectPitchOffset + dy, -0.35, 0.55);
      return;
    }
    if (closeUp) {
      portraitAngle += dx;
      portraitPitch = clamp(portraitPitch + dy, -0.18, 0.58);
      return;
    }
    if (state.mode === 'ride') {
      rideYawOffset += dx;
      ridePitchOffset = clamp(ridePitchOffset + dy, -0.16, 0.44);
      rideOrbitIdle = 0;
      return;
    }
    walkCamYaw += dx;
    walkPitch = clamp(walkPitch + dy, -0.12, 0.48);
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
    shopReview = preset || null;
    headTurn = 0.75;
    view = '';
    followYaw = state.bikeYaw;
    walkCamYaw = state.yaw;
    walkPitch = 0.24;
    rideYawOffset = 0;
    ridePitchOffset = 0;
    rideOrbitIdle = 99;
    inspectYawOffset = 0;
    inspectPitchOffset = 0;
    userWalkHold = 0;
    dragPointer = null;
    hasPerspectivePos = false;
    camBlend = 0;
    if (preset?.offset) {
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
  }

  function walkBasis() {
    return { ...basis };
  }

  function walkBoomBlocked(yaw, dist) {
    const rx = state.x - Math.sin(yaw) * dist;
    const rz = state.z - Math.cos(yaw) * dist;
    const safe = constrainCoastalTown(rx, rz, true);
    const wallShift = Math.hypot(rx - safe.x, rz - safe.z);
    const distToShiba = Math.hypot(safe.x - state.x, safe.z - state.z);
    return wallShift > 0.45 && distToShiba < 3.6;
  }

  const desiredFocus = new THREE.Vector3(), eye = new THREE.Vector3(), desiredEye = new THREE.Vector3();

  function draw(dt, time, { stride, walking }) {
    const riding = state.mode === 'ride';
    if (orbitKeys.left || orbitKeys.right) {
      const dir = (orbitKeys.left ? 1 : 0) - (orbitKeys.right ? 1 : 0);
      if (dir) applyOrbitDelta(dir * 1.9 * dt, 0);
    }
    userWalkHold = Math.max(0, userWalkHold - dt);
    stage.classList.toggle('orbitable', canOrbit());
    stage.classList.toggle('turntable', closeUp);

    const packing = isBoxSequence(state.sequence);
    const handling = isStandSequence(state.sequence);
    const seatBlend = handling ? state.sequence.seat ?? (riding ? 1 : 0) : Number(riding);
    const nextView = state.sequence?.approaching ? 'walk'
      : state.braking && !state.speed ? 'stand'
      : state.sequence ? (handling ? 'stand' : 'box')
      : shopReview ? 'inspection'
      : closeUp ? 'portrait'
      : !riding ? 'walk' : 'chase';
    const fieldInspection = nextView === 'inspection' && Boolean(shopReview.fov);
    const perspectiveView = nextView === 'chase' || nextView === 'walk' || nextView === 'portrait' || fieldInspection;
    const activeCamera = perspectiveView ? chase : camera;
    const snap = nextView !== view;

    coastalSky.root.visible = perspectiveView;
    coastalSky.update(time);
    coastalTown.update(time);

    const height = coastalTownSurfaceHeight(state.x, state.z, !riding);
    const bikeHeight = coastalTownSurfaceHeight(state.bikeX, state.bikeZ, false);
    const facing = closeUp && !riding ? 0.45 : state.yaw;
    shiba.root.rotation.y = riding || handling || snap ? facing : dampAngle(shiba.root.rotation.y, facing, 15, dt);
    scooter.root.rotation.y = state.bikeYaw;
    scooter.root.position.set(state.bikeX, bikeHeight, state.bikeZ);
    scooter.steer(state.steer);
    scooter.setStand(state.stand);

    const grade = coastalTownSurfaceHeight(
      state.bikeX + 0.5 * Math.sin(state.bikeYaw),
      state.bikeZ + 0.5 * Math.cos(state.bikeYaw),
      false,
    ) - coastalTownSurfaceHeight(
      state.bikeX - 0.5 * Math.sin(state.bikeYaw),
      state.bikeZ - 0.5 * Math.cos(state.bikeYaw),
      false,
    );
    const rideMotion = riding && !state.sequence ? suspension.update(state, dt) : null;
    scooter.setSuspension(rideMotion?.frontTravel ?? 0, rideMotion?.rearTravel ?? 0);
    scooter.root.position.y += rideMotion?.height ?? 0;
    scooter.root.rotation.x = -Math.atan(grade) + (rideMotion?.pitch ?? 0);
    scooter.root.rotation.z += riding ? state.bank : 0;
    tireEffects.update(state, dt);

    shiba.root.rotation.order = 'YXZ';
    shiba.root.rotation.x = riding ? scooter.root.rotation.x : 0;
    shiba.root.rotation.z = riding ? state.bank : 0;
    shiba.root.position.set(state.x, riding ? scooter.root.position.y : height, state.z);

    const posed = nextView === 'portrait';
    const lookTowardCamera = nextView === 'stand' ? 0.42 : posed ? 0.78 : -0.12;
    headTurn = damp(headTurn, riding || nextView === 'stand' ? lookTowardCamera : 0, 10, dt);
    shiba.pose({
      time, dt, stride, walking, headTurn, speed: state.speed, lift: state.lift, tiptoe: state.tiptoe, reach: state.reach,
      seatBlend, rideMotion,
      rise: handling ? state.sequence.rise : 0,
      hop: handling ? state.sequence.hop : 0,
      swing: handling ? state.sequence.swing : 0,
      mount: seatBlend > 0 ? scooter.mount : null,
      carrying: packing || state.cargo === 'hand',
    });
    positionParcel(state, shiba, scooter, looseBag);
    contact.position.set(state.x, height + 0.025, state.z);
    contact.scale.set(riding ? 1.9 : 0.90, riding ? 0.84 : 0.65, 1).multiplyScalar(courierScale);
    contact.rotation.z = riding ? state.bikeYaw - Math.PI / 2 : 0;
    marker.scale.setScalar(1 + 0.065 * Math.sin(time * 3.4));

    if (snap) {
      if (nextView === 'chase') {
        if (view === 'walk' || view === 'stand') camBlend = 0.45;
        else followYaw = state.bikeYaw;
      } else if (nextView !== 'stand') {
        followYaw = state.bikeYaw;
      }
      const heights = { portrait: 3.30, stand: 2.95, box: 3.6 };
      const widths = { portrait: 3.2, stand: 3.00, box: 3.2 };
      if (fieldInspection) {
        const halfAngle = THREE.MathUtils.degToRad(shopReview.fov / 2);
        chase.fov = shopReview.fitWidth && aspect < 1
          ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfAngle) / aspect))
          : shopReview.fov;
        chase.near = 0.12;
        chase.far = 380;
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

    timeOfDay.applyAtmosphere({
      baseFogDensity: 0.0020,
      styleFogFactor: renderStyle.fogDensityFactor(),
      useStyledFog: renderStyle.usesStyledFog(),
    });

    if (nextView === 'chase') {
      followYaw = dampAngle(followYaw, state.bikeYaw, 5.4, dt);
      if (dragPointer === null && !orbitKeys.left && !orbitKeys.right && Math.abs(state.speed) > 0.4) {
        rideOrbitIdle += dt;
        if (rideOrbitIdle > 1.5) {
          rideYawOffset = damp(rideYawOffset, 0, 3.2, dt);
          ridePitchOffset = damp(ridePitchOffset, 0, 3.2, dt);
          if (Math.abs(rideYawOffset) < 0.002 && Math.abs(ridePitchOffset) < 0.002) {
            rideYawOffset = ridePitchOffset = 0;
          }
        }
      }
      const activeYaw = followYaw + rideYawOffset;
      walkCamYaw = activeYaw;
      const fov = (aspect < 0.85 ? 55 : 46) + 6 * Math.min(1, Math.abs(state.speed) / maxTrialSpeed) ** 2;
      if (Math.abs(chase.fov - fov) > 0.03 || chase.near !== 0.25 || chase.far !== 380) {
        chase.fov = fov; chase.near = 0.25; chase.far = 380;
        chase.updateProjectionMatrix();
      }
      const prevPos = desiredEye.copy(chase.position);
      const prevFocus = desiredFocus.copy(focus);
      const userOrbited = Math.abs(rideYawOffset) > 0.005 || Math.abs(ridePitchOffset) > 0.005;
      coastalCamera(chase, state, activeYaw, focus);
      if (userOrbited) {
        const groundAtCam = coastalTownSurfaceHeight(chase.position.x, chase.position.z, false);
        chase.position.y = Math.max(groundAtCam + 1.15, chase.position.y + ridePitchOffset * 3.8);
        focus.set(state.x, height + 1.18, state.z);
      }
      chase.lookAt(focus);
      chase.rotateZ(state.bank * 0.07);
      if (camBlend > 0 && hasPerspectivePos && Math.hypot(prevPos.x - chase.position.x, prevPos.z - chase.position.z) < 18) {
        const alpha = 1 - Math.exp(-7.5 * dt);
        chase.position.lerpVectors(prevPos, chase.position, alpha);
        focus.lerpVectors(prevFocus, focus, alpha);
        chase.lookAt(focus);
        chase.rotateZ(state.bank * 0.07);
        camBlend = Math.max(0, camBlend - dt);
      } else {
        camBlend = 0;
      }
      hasPerspectivePos = true;
    } else if (nextView === 'walk') {
      const walkDist = 5.4;
      const walkFov = aspect < 0.85 ? 54 : 46;
      if (Math.abs(chase.fov - walkFov) > 0.03 || chase.near !== 0.25 || chase.far !== 380) {
        chase.fov = walkFov; chase.near = 0.25; chase.far = 380;
        chase.updateProjectionMatrix();
      }
      if (dragPointer === null && userWalkHold <= 0 && walkBoomBlocked(walkCamYaw, walkDist)) {
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
      const boomGround = coastalTownSurfaceHeight(rawX, rawZ, false);
      const rawY = Math.max(boomGround + 1.05, height + 1.12 + walkDist * Math.sin(walkPitch) + 0.55);
      desiredEye.set(rawX, rawY, rawZ);
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
      if (Math.abs(chase.fov - portraitFov) > 0.03 || chase.near !== 0.12 || chase.far !== 380) {
        chase.fov = portraitFov; chase.near = 0.12; chase.far = 380;
        chase.updateProjectionMatrix();
      }
      const radius = (riding ? 3.55 : 2.75) * courierScale;
      const baseYaw = riding ? state.bikeYaw : 0;
      const theta = baseYaw + portraitAngle;
      const horiz = radius * Math.cos(portraitPitch);
      const focusY = height + (riding ? 1.06 : 0.94) * courierScale;
      desiredFocus.set(state.x, focusY, state.z);
      desiredEye.set(
        state.x + Math.sin(theta) * horiz,
        Math.max(height + 0.45, focusY + radius * Math.sin(portraitPitch) + 0.18),
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
        scooter.root.localToWorld(desiredFocus.set(0.32, 1.05, -0.16));
        if (aspect < 0.85) desiredFocus.y -= 0.24;
        eye.set(4.65, 2.88, -2.25).applyAxisAngle(cameraUp, state.bikeYaw)
          .multiplyScalar(courierScale).add(scooter.root.position);
        eyeOffset.copy(eye).sub(desiredFocus);
      } else if (nextView === 'box') {
        scooter.root.localToWorld(desiredFocus.set(0.14, 0.90, scooter.cargo.floor.z - 0.30));
        scooter.root.localToWorld(eye.set(-1.65, 1.45, scooter.cargo.floor.z - 3.70));
        eyeOffset.copy(eye).sub(desiredFocus);
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
      }
      if (snap) focus.copy(desiredFocus); else focus.lerp(desiredFocus, 1 - Math.exp(-7 * dt));
      activeCamera.position.copy(focus).add(eyeOffset);
      activeCamera.lookAt(focus);
    }

    const fx = focus.x - activeCamera.position.x;
    const fz = focus.z - activeCamera.position.z;
    const len = Math.hypot(fx, fz);
    if (len > 0.001) {
      const nx = fx / len, nz = fz / len;
      basis.rightX = -nz; basis.rightZ = nx; basis.backX = -nx; basis.backZ = -nz;
    }

    timeOfDay.updateLightTransform({
      lightX: focus.x,
      ground: height,
      lightZ: focus.z,
      scooterRoot: scooter.root,
      groundAt: (wx, wz) => coastalTownSurfaceHeight(wx, wz, false),
    });

    view = nextView;
    coastalSky.root.position.copy(activeCamera.position);
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

  return {
    draw,
    resize,
    reset,
    clearInspection,
    walkBasis,
    toggleCloseUp() {
      shopReview = null;
      setCloseUp(!closeUp);
    },
  };
}
