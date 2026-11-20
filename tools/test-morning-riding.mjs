#!/usr/bin/env node
/** Validate the shipped GLBs, the exported pose clips and their contacts in street coordinates. */
import assert from 'node:assert/strict';
import { checkAccessories } from './morning-accessory-checks.mjs';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createScooter, createShiba, parcel } from '../src/morning/rider.js';
import { beginSequence, boxFrame, positionParcel } from '../src/morning/sequence.js';
import { frameRide, resizeRideCamera } from '../src/morning/ride-camera.js';

// Node has no GPU texture decoder. Check the embedded PNG here; WebKit/Chrome
// decode and render that same image in the gameplay and screenshot tests.
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const png = new DataView(await blob.arrayBuffer());
  assert.equal(png.getUint32(0), 0x89504e47);
  return { width: png.getUint32(16), height: png.getUint32(20), close() {} };
};
if (!globalThis.ProgressEvent) globalThis.ProgressEvent = class {
  constructor(type, options) { Object.assign(this, { type }, options); }
};
async function load(name) {
  const data = await readFile(new URL('../art/morning/' + name + '.glb', import.meta.url));
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
}
const [character, vehicle] = await Promise.all([load('shiba-courier'), load('monkey-delivery')]);
const rider = createShiba(character), scooter = createScooter(vehicle), mount = scooter.mount;
assert.deepEqual(character.animations.map(clip => clip.name).sort(), ['Ride', 'Stand', 'Walk']);
assert.ok(character.scene.getObjectByName('Head_Coat').material.map.image.width >= 512);
const dog = name => rider.root.getObjectByName(name), bike = name => scooter.root.getObjectByName(name);
const at = node => node.getWorldPosition(new THREE.Vector3());
const bounds = node => new THREE.Box3().setFromObject(node, true);
const basePose = { time: 1, stride: 0, walking: 0, carrying: false, headTurn: -.12 };
const point = new THREE.Vector3(), focus = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const down = up.clone().negate(), ray = new THREE.Raycaster();
const hips = ['L', 'R'];
function surface(object, origin, dir = down) {
  object.traverseVisible(node => { if (node.isSkinnedMesh) node.computeBoundingSphere(); });
  ray.set(origin.clone().addScaledVector(dir, -3), dir);
  return ray.intersectObject(object, true)[0]?.point.y;
}
function vertices(object, use) {
  object.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      use(mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld));
    }
  });
}
rider.pose({ ...basePose, mount: null });
rider.root.updateMatrixWorld(true);
const form = ['Root', 'Pelvis', 'Chest', 'Head', ...hips.flatMap(s => ['UpperArm_', 'Forearm_', 'Paw_', 'Thigh_', 'Shin_', 'Foot_'].map(n => n + s))];
const bindPose = form.map(name => [name, at(dog(name)), dog(name).getWorldScale(new THREE.Vector3())]);
const fixedLengths = hips.flatMap(s => [['UpperArm_', 'Forearm_'], ['Forearm_', 'Paw_'], ['Thigh_', 'Shin_'], ['Shin_', 'Foot_']]
  .map(([a, b]) => [a + s, b + s, at(dog(a + s)).distanceTo(at(dog(b + s)))]));
const box = bike('Delivery_Box'), saddle = bike('Solo_Saddle'), tank = bike('Two_Tone_Tank');
function assertClearsBodyPart(object, bone, centre, radii) {
  const skin = dog('Head_Coat').skeleton;
  const current = bone.matrixWorld.clone().multiply(skin.boneInverses[skin.bones.indexOf(bone)]).invert();
  const tri = new THREE.Triangle(), origin = new THREE.Vector3();
  object.traverse(mesh => {
    if (!mesh.isMesh) return;
    const transform = current.clone().multiply(mesh.matrixWorld);
    const { index, attributes } = mesh.geometry;
    const positions = Array.from({ length: attributes.position.count }, (_, i) =>
      mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(transform).sub(centre).divide(radii));
    for (let i = 0; i < index.count; i += 3) {
      tri.set(positions[index.getX(i)], positions[index.getX(i+1)], positions[index.getX(i+2)]);
      assert.ok(tri.closestPointToPoint(origin, point).length() > .995, object.name + ' clears ' + bone.name);
    }
  });
}
// The two lobes of the smile must actually show in front of the muzzle.
const head = dog('Head'), skin = dog('Head_Coat').skeleton;
const headFromBind = head.matrixWorld.clone().multiply(skin.boneInverses[skin.bones.indexOf(head)]);
const smile = dog('Muzzle_Smile');
for (const x of [-.048, .048]) {
  const eye = new THREE.Vector3(x, 1.092, .75).applyMatrix4(headFromBind);
  ray.set(eye, new THREE.Vector3(0, 0, -1).transformDirection(headFromBind));
  const hit = ray.intersectObjects([smile, dog('Muzzle'), dog('Head_Coat')], true)[0];
  assert.ok(hit && smile.getObjectById(hit.object.id), 'visible smile on each side of the nose');
}
for (const s of hips) assert.ok(Math.abs(bounds(dog('Shoe_'+s)).min.y) < .001, 'standing soles are grounded');
let worstGrip = 0, minTail = Infinity;
for (const yaw of [0, 1.74, -2.30]) {
  for (const root of [rider.root, scooter.root]) {
    root.position.set(2*yaw, 0, -yaw); root.rotation.y = yaw;
  }
  for (let step = -10; step <= 10; step++) {
    const angle = step * .031;
    scooter.steer(angle);
    rider.pose({ ...basePose, mount });
    rider.root.updateMatrixWorld(true); scooter.root.updateMatrixWorld(true);
    for (const [a, b, length] of fixedLengths) {
      assert.ok(Math.abs(at(dog(a)).distanceTo(at(dog(b))) - length) < 2e-5, a + ' retains its standing length');
    }
    for (const [name, , scale] of bindPose) {
      assert.ok(dog(name).getWorldScale(point).distanceTo(scale) < 2e-5, name + ' retains standing scale');
    }
    const seatY = surface(saddle, at(bike('Seat_Contact')));
    assert.ok(Math.abs(bounds(dog('Uniform')).min.y - seatY) < .002, 'rump sits on the saddle');
    for (const [i, s] of hips.entries()) {
      const paw = at(dog('Paw_'+s)), elbow = at(dog('Forearm_'+s)), arm = at(dog('UpperArm_'+s));
      worstGrip = Math.max(worstGrip, paw.distanceTo(at(mount.palms[i])));
      const bend = elbow.clone().sub(arm).angleTo(paw.clone().sub(elbow));
      assert.ok(bend > .45 && bend < 1.75, 'elbow remains bent');
      const rubber = at(bike('Grip_'+s));
      const overlap = surface(bike('Swept_Handlebar'), rubber) - surface(dog('Mitten_'+s), rubber, up);
      assert.ok(overlap > .012 && overlap < .052, 'paw cups physical rubber at ' + angle);
      const tread = surface(bike('Rider_Footpegs'), at(mount.feet[i]));
      assert.ok(Math.abs(bounds(dog('Shoe_'+s)).min.y - tread) < .001, 'sole rests on its own peg');
      if (step===0 && yaw===0) {
        const sign=i?1:-1;
        const hip = at(dog('Thigh_'+s)), knee = at(dog('Shin_'+s)), ankle = at(dog('Foot_'+s));
        const lean = Math.atan2(arm.z - hip.z, arm.y - hip.y);
        assert.ok(lean > .16 && lean < .48, 'rider leans forward from the hips');
        assert.ok(knee.z > ankle.z + .009 && sign*(knee.x-hip.x) > .035, 'knees straddle the frame ahead of the ankles');
        const sole = dog('Shoe_'+s);
        for (const [x,z] of [[-.035,0],[.035,0],[0,-.033],[0,.033]]) {
          const sample = mount.feet[i].localToWorld(new THREE.Vector3(x, 0, z));
          assert.ok(Math.abs(surface(sole,sample,up) - surface(bike('Rider_Footpegs'),sample)) < .001,
            'a flat area of each sole meets its peg');
        }
        for (const object of [saddle,tank]) {
          assertClearsBodyPart(object,dog('Thigh_'+s),new THREE.Vector3(sign*.151,.295,0),new THREE.Vector3(.117,.16,.117));
          assertClearsBodyPart(object,dog('Shin_'+s),new THREE.Vector3(sign*.151,.152,.018),new THREE.Vector3(.098,.104,.096));
        }
      }
    }
    if (yaw === 0 && step % 5 === 0) {
      for (const headTurn of [basePose.headTurn, -.78, .78]) {
        rider.pose({ ...basePose, mount, headTurn });
        rider.root.updateMatrixWorld(true);
        for (const part of [dog('Mitten_L'), dog('Mitten_R'), bike('Fork_Headlamp_and_Mirrors')]) {
          assertClearsBodyPart(part, head, new THREE.Vector3(0,1.25,.035), new THREE.Vector3(.574,.492,.463));
        }
      }
      rider.pose({ ...basePose, mount });
      rider.root.updateMatrixWorld(true);
    }
    if (yaw===0 && step===0) {
      assertClearsBodyPart(saddle,dog('Chest'),new THREE.Vector3(0,.60,0),new THREE.Vector3(.32,.36,.25));
      assertClearsBodyPart(saddle,dog('Pelvis'),new THREE.Vector3(0,.41,-.005),new THREE.Vector3(.27,.17,.22));
      const envelope=bounds(box).union(bounds(scooter.lid));
      vertices(dog('Curled_Tail'), p=>{minTail=Math.min(minTail,envelope.distanceToPoint(p));});
      assert.ok(minTail>.005,'curled tail clears the closed delivery box');
      assert.ok(envelope.max.y < at(dog('UpperArm_L')).y-.12,'shoulders rise above box');
      const rear = bounds(bike('Wheel_R'));
      assert.ok(envelope.min.z >= rear.min.z && envelope.getCenter(point).z < rear.max.z,'box sits above rear wheel inside tail length');
    }
  }
}
assert.ok(worstGrip<.001,'both front paws remain on their markers');
for (const root of [rider.root,scooter.root]) {root.position.set(0,0,0);root.rotation.y=0;}
scooter.steer(0);scooter.root.updateMatrixWorld(true);
const floor = scooter.root.localToWorld(scooter.cargo.floor.clone());
assert.ok(surface(scooter.lid,floor)>floor.y+.34,'closed lid covers the loading bay');
scooter.lid.rotation.z=-1.85;scooter.root.updateMatrixWorld(true);
assert.equal(surface(scooter.lid,floor),undefined,'lid opens away from the loading bay');
assert.ok(Math.abs(surface(box,floor)-floor.y)<.001,'cargo target rests on the hollow floor');
scooter.lid.rotation.z=0;
// Use conservative bounds for each visible mesh. This also covers the protruding ears, mirrors and box.
const corners = [];
for (const angle of [-0.31, 0, 0.31]) {
  scooter.steer(angle);
  rider.pose({ ...basePose, mount });
  for (const root of [rider.root, scooter.root]) {
    root.updateMatrixWorld(true);
    root.traverseVisible(object => {
      if (!object.isMesh) return;
      const geometry = object.isSkinnedMesh ? object : object.geometry;
      geometry.computeBoundingBox();
      const { min, max } = geometry.boundingBox;
      for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
        corners.push(new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld));
      }
    });
  }
}
for (const aspect of [1.6, 360 / 780, 320 / 900]) {
  const camera = new THREE.PerspectiveCamera(55, aspect, 0.12, 100);
  resizeRideCamera(camera, aspect);
  for (const z of [1.62, 3.9, 6.45]) {
    for (let degrees = 0; degrees < 360; degrees += 5) {
      const yaw = THREE.MathUtils.degToRad(degrees), bike = { x: 14, z, bikeYaw: yaw };
      for (const lag of [-0.34, 0, 0.34]) {
        frameRide(camera, bike, yaw + lag, focus);
        camera.updateMatrixWorld();
        let minY = Infinity, maxY = -Infinity;
        for (const corner of corners) {
          point.copy(corner).applyAxisAngle(up, yaw);
          point.x += bike.x;
          point.z += z;
          point.project(camera);
          assert.ok(Math.abs(point.x) < 0.98 && Math.abs(point.y) < 0.96, 'whole rider stays in the frame');
          minY = Math.min(minY, point.y);
          maxY = Math.max(maxY, point.y);
        }
        assert.ok((maxY - minY) / 2 < 0.34, 'rider and scooter leave room for the street');
      }
    }
  }
}
rider.pose({ ...basePose, mount: null, walking: 1, stride: Math.PI / 2 });
assert.ok(at(dog('Foot_L')).distanceTo(at(dog('Foot_R'))) > .3, 'walk clip takes a step');
rider.pose({ ...basePose, mount: null });
for (const [name, position] of bindPose) assert.ok(at(dog(name)).distanceTo(position) < 2e-5, 'restored ' + name);
// Drive the real load and unload sequences at a rotated parking spot. Use
// the full bag mesh so a moving handle or bottom corner cannot pass the lip.
const scene = new THREE.Scene();
scene.add(rider.root, scooter.root);
const looseBag = parcel(scene, 0, 0, 0);
looseBag.scale.copy(rider.root.scale);
for (const kind of ['pack', 'unpack']) {
  const state = { x: 2, z: 2, bikeYaw: .73, yaw: .73 + Math.PI / 2, mode: 'walk',
    cargo: kind === 'pack' ? 'hand' : 'box' };
  scooter.root.position.set(3, 0, 3);
  scooter.root.rotation.y = state.bikeYaw;
  scooter.root.updateMatrixWorld(true);
  beginSequence(state, kind);
  const envelope = new THREE.Box3();
  let time = 1.2, stride = 0, crossingFrames = 0;
  while (state.sequence) {
    const dt = .01, travel = boxFrame(state, dt, scooter);
    time += dt;
    stride += travel * 5.4;
    rider.root.position.set(state.x, state.stepHeight, state.z);
    rider.root.rotation.y = state.yaw;
    rider.pose({ time, stride, walking: Math.min(1, travel / (2.4 * dt)), mount: null, carrying: true,
      headTurn: 0, lift: state.lift });
    positionParcel(state, rider, scooter, looseBag);
    scene.updateMatrixWorld(true);
    const u = state.sequence?.u;
    if (u === undefined || u < .45 || u > .83) continue;
    envelope.makeEmpty();
    vertices(rider.bag.visible ? rider.bag : looseBag, p => envelope.expandByPoint(scooter.root.worldToLocal(p)));
    if (envelope.min.x < -.222 && envelope.max.x > -.238) {
      crossingFrames++;
      assert.ok(envelope.min.y > 1.124, kind + ' clears the near wall');
    }
    if (u >= .81) {
      assert.ok(envelope.min.z > scooter.cargo.floor.z - .179 && envelope.max.z < scooter.cargo.floor.z + .179);
      assert.ok(envelope.max.y < 1.116 && envelope.min.y >= scooter.cargo.floor.y - .001, 'bag fits under the closed lid');
    }
  }
  assert.ok(crossingFrames > 0);
}
// Sample the two garment surfaces at the tail insertion in pelvis space.
const uniformParts = [];
dog('Uniform').traverse(mesh => { if (mesh.isMesh) uniformParts.push(mesh); });
const jacket = uniformParts.find(mesh => mesh.material.name === 'Uniform · bottle green');
const trousers = uniformParts.find(mesh => mesh.material.name === 'Uniform · dark teal');
const goggles = dog('Helmet_Goggles'), pivot = dog('GoggleHinge'), tailBase = dog('Tail');
const bindToWorld = bone => bone.matrixWorld.clone().multiply(skin.boneInverses[skin.bones.indexOf(bone)]);
function firstSurface(object, origin, direction, bind) {
  object.traverse(m => {
    if (m.isSkinnedMesh) {
      m.computeBoundingSphere();
      if (m.boundingBox) m.computeBoundingBox();
    }
  });
  ray.set(origin.clone().applyMatrix4(bind), direction.clone().transformDirection(bind));
  return ray.intersectObject(object, true)[0];
}
rider.resetTail();
let maxSeam = 0;
for (const mounted of [false,true,false]) {
  const start = pivot.quaternion.clone();
  const hingeAngles = [];
  for (let i = 0; i < 24; i++) {
    scooter.steer(.31 * Math.sin(i*.57));
    rider.pose({ ...basePose, time: i/30, dt: 1/30, stride: i*.4, walking: mounted ? 0 : 1,
      mount: mounted ? mount : null, headTurn: .78*Math.sin(i*.37), speed: mounted ? 5 : 0 });
    rider.root.updateMatrixWorld(true);
    hingeAngles.push(start.angleTo(pivot.quaternion));
    const pelvis = bindToWorld(dog('Pelvis'));
    const rootInPelvis = at(tailBase).applyMatrix4(pelvis.clone().invert());
    const origin = new THREE.Vector3(rootInPelvis.x,rootInPelvis.y,-.8);
    const jersey = firstSurface(jacket,origin,new THREE.Vector3(0,0,1),pelvis);
    const waistband = firstSurface(trousers,origin,new THREE.Vector3(0,0,1),pelvis);
    assert.ok(jersey && waistband, 'tail emerges where both garments are present');
    maxSeam = Math.max(maxSeam, Math.abs(jersey.distance-waistband.distance));
    const insertion = rootInPelvis.z - jersey.point.applyMatrix4(pelvis.clone().invert()).z;
    assert.ok(insertion > 0 && insertion < .030, 'the root is seated just inside the hem');
    if (i !== 18) continue;
    for (const side of [-1,1]) {
      const headBind = bindToWorld(head), eyePoint = new THREE.Vector3(side*.238,1.279,.90);
      const forward = new THREE.Vector3(0,0,-1);
      const eye = firstSurface(dog(side < 0 ? 'Eye_L_Mesh' : 'Eye_R_Mesh'),eyePoint,forward,headBind);
      const lens = firstSurface(goggles,eyePoint,forward,headBind);
      assert.ok(eye);
      if (mounted) assert.ok(lens?.object.material.transparent && lens.distance < eye.distance,
        'both eyes are behind the transparent glass');
      else assert.ok(!lens, 'both eyes are clear when the goggles are raised');
    }
  }
  if (mounted) {
    assert.ok(hingeAngles[0] < .05 && hingeAngles[4] > .20 && hingeAngles[10] > .60,
      'the same pair of goggles swings down over consecutive riding frames');
    assert.ok(Math.abs(hingeAngles[11]-hingeAngles[23]) < .001);
  }
}
assert.ok(maxSeam < .010, 'the jacket and trousers meet at the tail base through steering');
console.log('Maximum gap between garment surfaces at the tail root', (1000*maxSeam).toFixed(2), 'mm');
checkAccessories(rider, scooter);
console.log('PASS: Blender clips, loadable skin, fixed limb lengths, rump/foot/grip contact, solo box, hinge and camera.');
console.log('Max palm error', (worstGrip*1000).toFixed(3), 'mm; conservative tail/box clearance', (minTail*1000).toFixed(1), 'mm.');
