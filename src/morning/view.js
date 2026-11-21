import * as THREE from 'three';
import { frameRide, resizeRideCamera } from './ride-camera.js';
import { createTireEffects } from './tire-effects.js';
import { createRideMotion } from './ride-motion.js';
import { countryCamera, maxTrialSpeed } from './free-ride.js';
import { constrainToRoad, crossing, halfWidth, roadHeight } from './country-route.js';
import { $ } from './dom.js';
import { clamp, damp, dampAngle } from '../core/mathx.js';
import { isBoxSequence, isStandSequence, positionParcel } from './sequence.js';
import { CURB_H, CURB_Z } from './town.js';

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
  let aspect = 1, view = '', closeUp = false, followYaw = Math.PI / 2;
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
    setCloseUp(false);
    shiba.resetTail();
    suspension.reset();
    tireEffects.reset();
    shiba.root.rotation.y = scooter.root.rotation.y = state.yaw;
    scooter.lid.rotation.z = 0;
    for (const door of street.doors.values()) door.rotation.y = 0;
  }

  const desiredFocus = new THREE.Vector3(), eye = new THREE.Vector3();
  function draw(dt, time, { stride, walking }) {
    const inside = state.mode === 'shop', riding = state.mode === 'ride';
    const packing = isBoxSequence(state.sequence);
    const handling = isStandSequence(state.sequence);
    const seatBlend = handling ? state.sequence.seat ?? (riding ? 1 : 0) : Number(riding);
    const nextView = state.sequence?.approaching ? 'street' :
      state.braking && !state.speed ? 'stand' : state.sequence ? (handling ? 'stand' : packing ? 'box' : 'door') :
      (shopReview ? 'inspection' : (closeUp ? 'portrait' : inside ? 'shop' : !riding ? 'street' : state.phase === 'offer' ? 'intro' : 'chase'));
    const fieldInspection = nextView === 'inspection' && shopReview.fov;
    const activeCamera = nextView === 'chase' || fieldInspection ? chase : camera;
    const snap = nextView !== view;
    const room = rooms[state.order.room.template];
    for (const candidate of roomList) candidate.root.visible = inside && candidate === room;
    room.bag.visible = state.phase === 'pickup';
    const free = state.phase === 'free';
    const outsideTown = free && state.x > 52;
    country.root.visible = free;
    if (free) country.update(state, time, scene.fog?.color, scene.fog?.density);
    street.eastTrees.visible = !free;
    street.root.visible = !inside && (!free || state.x < 240);
    scooter.root.visible = !inside;
    if (inside) room.update(time); else street.update(time);
    const ground = free ? roadHeight(state.x) : 0;
    const cityCurb = free && Math.abs(state.x-crossing.x) < 28
      && Math.abs(state.z-crossing.z) > halfWidth(state.x) && Math.abs(state.x-crossing.x) > crossing.half;
    const height = ground + (cityCurb ? .115 : !inside && !outsideTown && state.z < CURB_Z ? CURB_H : 0);
    const facing = closeUp && !riding ? 0.45 : state.yaw;
    shiba.root.rotation.y = riding || handling || snap ? facing : dampAngle(shiba.root.rotation.y, facing, 15, dt);
    scooter.root.rotation.y = state.bikeYaw;
    scooter.root.position.set(state.bikeX, free ? roadHeight(state.bikeX) : 0, state.bikeZ);
    scooter.steer(state.steer);
    scooter.setStand(state.stand);
    const grade = free ? roadHeight(state.bikeX+.5)-roadHeight(state.bikeX-.5) : 0;
    const rideMotion = free && riding && !state.sequence ? suspension.update(state, dt) : null;
    scooter.setSuspension(rideMotion?.frontTravel ?? 0, rideMotion?.rearTravel ?? 0);
    scooter.root.position.y += rideMotion?.height ?? 0;
    scooter.root.rotation.x = -Math.atan(grade*Math.sin(state.bikeYaw)) + (rideMotion?.pitch ?? 0);
    scooter.root.rotation.z += free && riding ? state.bank : 0;
    tireEffects.update(state, dt);
    shiba.root.rotation.order = 'YXZ';
    shiba.root.rotation.x = riding ? scooter.root.rotation.x : 0;
    shiba.root.rotation.z = free && riding ? state.bank : 0;
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
      const skyBg = inside ? 0xe2cfaa : (nextView === 'chase' || fieldInspection ? 0x9cd3e9 : 0xcfe0dc);
      scene.background = new THREE.Color(skyBg);
      scene.fog = new THREE.FogExp2(inside ? 0xe2cfaa : 0xdaf0f5, inside ? 0.014 : 0.016);
      followYaw = state.bikeYaw;
      const heights = { portrait: 3.30, intro: 4.8, door: 4.05, stand: 2.95, box: 3.6, shop: 5.56, street: 6.15 };
      const widths = { portrait: 3.2, intro: 4.0, door: 3.25, stand: 3.00, box: 3.2, shop: 7.1, street: 5.2 };
      if (fieldInspection) {
        chase.fov = shopReview.fov;
        chase.far = 245;
        chase.updateProjectionMatrix();
      } else if (nextView !== 'chase') {
        const detailScale = nextView === 'portrait' || nextView === 'box' ? courierScale : 1;
        const h = nextView === 'inspection' ? shopReview.height : heights[nextView];
        const w = nextView === 'inspection' ? shopReview.width : widths[nextView];
        const widthFit = shopReview?.fitWidth ? w / aspect : Math.min(11.4, w / aspect);
        const frameHeight = Math.max(h, widthFit) * detailScale;
        camera.left = -frameHeight * aspect / 2; camera.right = -camera.left;
        camera.top = frameHeight / 2; camera.bottom = -camera.top;
        camera.updateProjectionMatrix();
      }
    }
    if (nextView === 'chase') {
      followYaw = dampAngle(followYaw, state.bikeYaw, 5.4, dt);
      const fov = (aspect < .85 ? 63 : 55) + (free ? 7*Math.min(1, Math.abs(state.speed)/maxTrialSpeed)**2 : 0);
      if (Math.abs(chase.fov-fov) > .03) { chase.fov = fov; chase.updateProjectionMatrix(); }
      const far = free ? 245 : 100;
      if (chase.far !== far) { chase.far = far; chase.updateProjectionMatrix(); }
      if (outsideTown) countryCamera(chase, state, followYaw, focus);
      else frameRide(chase, state, followYaw, focus);
    } else {
      if (nextView === 'stand') {
        scooter.root.localToWorld(desiredFocus.set(.32, 1.05, -.16));
        if (aspect < .85) desiredFocus.y -= .24;
        eye.set(4.65, 2.88, -2.25).applyAxisAngle(cameraUp, state.bikeYaw)
          .multiplyScalar(courierScale).add(scooter.root.position);
        if (!outsideTown) eye.z = Math.max(eye.z, -.95);
        eyeOffset.copy(eye).sub(desiredFocus);
      } else if (nextView === 'box') {
        scooter.root.localToWorld(desiredFocus.set(-0.24, 1.07, scooter.cargo.floor.z + 0.15));
        scooter.root.localToWorld(eye.set(.35, 2.35, -4.35));
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
        desiredFocus.set(inside ? 0 : state.x, inside ? 1.50 : ground+1.74, inside ? -0.12 : state.z - 0.63);
        eyeOffset.set(inside ? -3.3 : 2.95, inside ? 4.60 : 3.9, 11);
      }
      if (snap) focus.copy(desiredFocus); else focus.lerp(desiredFocus, 1 - Math.exp(-7 * dt));
      activeCamera.position.copy(focus).add(eyeOffset);
      if (free && !fieldInspection && Math.abs(state.x-crossing.x)<29) {
        // Keep the walking/parking view on the street side of the city facades.
        const pos = activeCamera.position, safe = constrainToRoad(pos.x,pos.z,true);
        if (Math.hypot(pos.x-safe.x,pos.z-safe.z) > .01) {
          pos.y += Math.min(3,Math.hypot(pos.x-safe.x,pos.z-safe.z)*.45);
          pos.x=safe.x; pos.z=safe.z;
        }
      }
      activeCamera.lookAt(focus);
    }
    // Dress the far side of a close-up; the shop row behind the lens can
    // otherwise put a counter or a tree across the boots and stand.
    const fromShopSide = nextView !== 'chase' && camera.position.z < focus.z;
    street.shopSide.visible = !fromShopSide;
    street.opposite.visible = nextView === 'chase' || fromShopSide;
    const lightX = Math.round(focus.x * 2) / 2;
    const lightZ = free ? Math.round(focus.z*2)/2 : 0;
    sun.target.position.set(lightX, ground+.3, lightZ);
    const openCountry = free ? THREE.MathUtils.smoothstep(state.x, 52, 170) : 0;
    sun.position.set(lightX - 6 + 20*openCountry, ground + 11.5 - 4*openCountry, lightZ + 7.5 - 13*openCountry);
    if (free) scene.fog.density = 0.016 - 0.0122 * THREE.MathUtils.smoothstep(state.x, 28, 120);
    view = nextView;
    if (free) country.sky.position.copy(activeCamera.position);
    renderer.render(scene, activeCamera);
  }

  function resize() {
    const w = $('stage').clientWidth, h = Math.max(1, $('stage').clientHeight);
    aspect = w / h;
    resizeRideCamera(chase, aspect);
    renderer.setSize(w, h, false);
    view = '';
  }
  return { draw, resize, reset, clearInspection, toggleCloseUp() {
    shopReview = null;
    setCloseUp(!closeUp);
  } };
}
