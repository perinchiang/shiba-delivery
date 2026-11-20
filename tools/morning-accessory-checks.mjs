/** Exercise the production skin, motion and packing path over consecutive game frames. */
import assert from 'node:assert/strict';
import * as T from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { beginSequence, boxFrame } from '../src/morning/sequence.js';

const v = (...a) => new T.Vector3(...a);
const origin = v();
const triangle = new T.Triangle();
const closest = v();
const ballTransform = new T.Matrix4();
const local = new T.Matrix4();

function skinParts(node) {
  const parts = [];
  node.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const { position, uv } = mesh.geometry.attributes;
    const indices = mesh.geometry.index.array;
    parts.push({ mesh, indices, along: uv, points: Array.from({ length: position.count }, () => v()) });
  });
  return parts;
}

function centreline(parts, scale) {
  // Opposite UV meridians identify the diameter and centre of each authored
  // ring, including across the material seam at the cream tip.
  const rings = new Map();
  for (const { mesh, along, points } of parts) {
    for (let i = 0; i < points.length; i++) {
      const u = along.getX(i),
        meridian = along.getY(i);
      if (!rings.has(u)) rings.set(u, {});
      const ring = rings.get(u);
      const sample = {
        posed: points[i],
        rest: v().fromBufferAttribute(mesh.geometry.attributes.position, i).multiplyScalar(scale),
      };
      if (meridian === 0.5) ring.a = sample;
      if (meridian === 1 || meridian === 0 || u === 1) ring.b = sample;
    }
  }
  const ordered = [...rings].sort(([a], [b]) => a - b).map(([, ring]) => ring);
  const last = v(),
    mid = v();
  function length(property) {
    let total = 0;
    for (const [i, { a, b }] of ordered.entries()) {
      mid.addVectors(a[property], b[property]).multiplyScalar(0.5);
      if (i > 0) total += mid.distanceTo(last);
      last.copy(mid);
    }
    return total;
  }
  const restLength = length('rest');
  return () => Math.abs(length('posed') / restLength - 1);
}

function sample(parts, transform) {
  for (const { mesh, points } of parts) {
    local.multiplyMatrices(transform, mesh.matrixWorld);
    for (let i = 0; i < points.length; i++) mesh.getVertexPosition(i, points[i]).applyMatrix4(local);
  }
}

// Transform triangles into the unit ball corresponding to the posed body part.
// Using face interiors as well as vertices catches cloth spanning across a cheek.
function bodyGap(parts, form, fromArc = 0) {
  const { bone, inverseBind, centre, radii } = form;
  ballTransform.multiplyMatrices(bone.matrixWorld, inverseBind).invert();
  let gap = Infinity;
  for (const { indices, along, points } of parts) {
    for (let i = 0; i < indices.length; i += 3) {
      if (
        fromArc > 0 &&
        Math.min(along.getX(indices[i]), along.getX(indices[i + 1]), along.getX(indices[i + 2])) < fromArc
      )
        continue;
      triangle.set(points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]);
      for (const p of [triangle.a, triangle.b, triangle.c])
        p.applyMatrix4(ballTransform).sub(centre).divide(radii);
      gap = Math.min(gap, triangle.closestPointToPoint(origin, closest).lengthSq());
    }
  }
  return (Math.sqrt(gap) - 1) * Math.min(radii.x, radii.y, radii.z);
}

function vehicleBounds(object, bikeInverse) {
  const box = new T.Box3();
  object.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    box.union(
      mesh.geometry.boundingBox.clone().applyMatrix4(local.multiplyMatrices(bikeInverse, mesh.matrixWorld)),
    );
  });
  return box;
}

// The distance between enclosing boxes is a lower bound on surface clearance.
function vehicleGap(parts, box) {
  let gapSq = Infinity;
  for (const { indices, points } of parts) {
    for (let i = 0; i < indices.length; i += 3) {
      const a = points[indices[i]],
        b = points[indices[i + 1]],
        c = points[indices[i + 2]];
      const dx = Math.max(0, Math.min(a.x, b.x, c.x) - box.max.x, box.min.x - Math.max(a.x, b.x, c.x));
      const dy = Math.max(0, Math.min(a.y, b.y, c.y) - box.max.y, box.min.y - Math.max(a.y, b.y, c.y));
      const dz = Math.max(0, Math.min(a.z, b.z, c.z) - box.max.z, box.min.z - Math.max(a.z, b.z, c.z));
      gapSq = Math.min(gapSq, dx * dx + dy * dy + dz * dz);
    }
  }
  return Math.sqrt(gapSq);
}

// The band follows a tailored upper jacket. Cast against its exported triangles
// at the cloth height; the old ellipsoid would fill in the new neck opening.
function clothClearance(scarf, uniform, chest) {
  let jacket;
  uniform.traverse(mesh => {
    if (mesh.material?.name === 'Uniform · bottle green') jacket = mesh;
  });
  assert.ok(jacket);
  const surface = new Octree().fromGraphNode(new T.Mesh(jacket.geometry));
  const ray = new T.Ray(), point = v(), toBind = new T.Matrix4();
  const moving = scarf.map(({ mesh, points }) => {
    const indices = [], { skinIndex, skinWeight } = mesh.geometry.attributes;
    for (let i = 0; i < points.length; i++) {
      for (let j = 0; j < 4; j++) {
        if (skinWeight.getComponent(i,j) && mesh.skeleton.bones[skinIndex.getComponent(i,j)].name === 'KerchiefEnds') {
          indices.push(i);
          break;
        }
      }
    }
    return indices;
  });
  let rigidChecked = false;
  return () => {
    toBind.multiplyMatrices(chest.bone.matrixWorld, chest.inverseBind).invert();
    let gap = Infinity;
    for (let part = 0; part < scarf.length; part++) {
      const {points} = scarf[part];
      const check = (i) => {
        point.copy(points[i]).applyMatrix4(toBind);
        ray.direction.set(-point.x, 0, -point.z).normalize();
        ray.origin.copy(point).addScaledVector(ray.direction, -.8);
        const hit = surface.rayIntersect(ray);
        if (hit) gap = Math.min(gap, hit.distance - .8);
      };
      if (rigidChecked) moving[part].forEach(check);
      else for (let i = 0; i < points.length; i++) check(i);
    }
    rigidChecked = true;
    return gap;
  };
}

export function checkAccessories(rider, scooter) {
  const dog = (n) => rider.root.getObjectByName(n),
    bike = (n) => scooter.root.getObjectByName(n);
  const tail = skinParts(dog('Curled_Tail')),
    scarf = skinParts(dog('Kerchief'));
  const chain = ['Tail', 'TailMid', 'TailTip'].map(dog);
  assert.equal(chain[1].parent, chain[0]);
  assert.equal(chain[2].parent, chain[1]);
  const skeleton = dog('Head_Coat').skeleton;
  const shape = (joint, c, r) => {
    const bone = dog(joint);
    return {
      bone,
      inverseBind: skeleton.boneInverses[skeleton.bones.indexOf(bone)],
      centre: v(...c),
      radii: v(...r),
    };
  };
  const head = shape('Head', [0, 1.25, 0.035], [0.574, 0.492, 0.463]);
  const chest = shape('Chest', [0, 0.6, 0], [0.32, 0.36, 0.25]);
  const clothGap = clothClearance(scarf, dog('Uniform'), chest);
  const shoulders = ['L', 'R'].map((s, i) =>
    shape('UpperArm_' + s, [(i ? 1 : -1) * 0.299, 0.665, 0.03], [0.105, 0.162, 0.112]),
  );
  const paws = ['L', 'R'].map((s, i) =>
    shape('Paw_' + s, [(i ? 1 : -1) * 0.309, 0.565, 0.046], [0.093, 0.102, 0.096]),
  );
  const chassis = ['Delivery_Box', 'Cargo_Lid', 'Solo_Saddle'].map(bike);
  const scale = scooter.root.scale.x;
  const strain = centreline(tail, scale);
  let maxStrain = 0;
  const min = new Map();
  const note = (name, value) => min.set(name, Math.min(min.get(name) ?? Infinity, value));
  const pose = {
    time: 0,
    dt: 1 / 60,
    stride: 0,
    walking: 0,
    mount: null,
    headTurn: 0,
    carrying: false,
    speed: 0,
    lift: 0,
  };
  // Keep the bike at a rotated stop; both coordinates and lid movement matter here.
  const yaw = 0.92;
  scooter.root.position.set(4, 0, 2.1);
  scooter.root.rotation.y = yaw;
  scooter.lid.rotation.z = 0;
  scooter.root.updateMatrixWorld(true);
  const bikeInverse = scooter.root.matrixWorld.clone().invert(),
    world = new T.Matrix4();
  const fixedBoxes = chassis.map((n) => vehicleBounds(n, bikeInverse));
  let frames = 0;
  function frame(standProgress = Number(!pose.mount)) {
    pose.time += pose.dt;
    scooter.setStand(standProgress);
    scooter.root.updateMatrixWorld(true);
    bikeInverse.copy(scooter.root.matrixWorld).invert();
    rider.pose(pose);
    rider.root.updateMatrixWorld(true);
    scooter.root.updateMatrixWorld(true);
    sample(tail, world);
    sample(scarf, world);
    maxStrain = Math.max(maxStrain, strain());
    note('tail/head', bodyGap(tail, head) * scale);
    // The first section is the anatomical insertion in the coat. The free
    // portion of the plume, measured by arc-length UV, must clear the torso.
    note('free tail/jacket', bodyGap(tail, chest, 0.25) * scale);
    note('scarf/head', bodyGap(scarf, head) * scale);
    note('cloth/jacket radial', clothGap() * scale);
    for (const sleeve of shoulders) note('tail/shoulder', bodyGap(tail, sleeve) * scale);
    for (const paw of paws) note('tail/paw', bodyGap(tail, paw) * scale);
    for (const sleeve of shoulders) note('scarf/shoulder', bodyGap(scarf, sleeve) * scale);
    for (const paw of paws) note('scarf/paw', bodyGap(scarf, paw) * scale);
    for (const part of tail) for (const p of part.points) p.applyMatrix4(bikeInverse);
    if (pose.mount && pose.speed >= 1.35) {
      // Sideways clearance is visible in the rear inspection just as height
      // above the lid is. Require at least a centimetre of the curled brush.
      const lid = fixedBoxes[1];
      const rim = lid.max.y + .142 * lid.max.z;
      let exposed = -Infinity;
      for (const { points, along } of tail) {
        for (let i = 0; i < points.length; i++) {
          if (along.getX(i) < .1) continue;
          const p = points[i];
          exposed = Math.max(exposed, p.x - lid.max.x, lid.min.x - p.x,
            (p.y + .142 * p.z - rim) / Math.hypot(1, .142));
        }
      }
      note('plume beyond rear box silhouette', exposed * scale - .01);
    }
    chassis.forEach((obj, i) => {
      const bounds = i === 1 && scooter.lid.rotation.z !== 0 ? vehicleBounds(obj, bikeInverse) : fixedBoxes[i];
      note(obj.name, vehicleGap(tail, bounds) * scale);
    });
    frames++;
  }
  function beside() {
    const p = scooter.root.localToWorld(v(-1.12, 0, 0.2));
    rider.root.position.copy(p);
    rider.root.rotation.y = yaw + Math.PI / 2;
    pose.mount = null;
    pose.speed = 0;
  }
  function onboard() {
    rider.root.position.copy(scooter.root.position);
    rider.root.rotation.y = yaw;
    pose.walking = 0;
    pose.mount = scooter.mount;
  }
  rider.resetTail();
  beside();
  for (const moving of [false, true]) {
    const envelope = new T.Box3();
    for (let i = 0; i < (moving ? 90 : 182); i++) {
      pose.walking = moving ? 1 : 0;
      pose.stride += moving ? 0.22 : 0;
      pose.headTurn = 0.78 * Math.sin(i * 0.048);
      frame();
      const tip = tail.at(-1).points.at(-1);
      envelope.expandByPoint(tip);
    }
    assert.ok(envelope.getSize(v()).length() > 0.009, 'tail must move in ' + (moving ? 'walk' : 'stand'));
  }
  onboard();
  rider.greet();
  for (let i = 0; i < 245; i++) {
    const standProgress = T.MathUtils.clamp(i < 175 ? (52 - i) / 17 : (i - 203) / 30, 0, 1);
    pose.speed = i < 175 ? T.MathUtils.clamp((i - 52) * 0.224, 0, 5.6) : Math.max(0, 5.6 - (i - 175) * 0.2);
    scooter.steer(i < 62 ? 0 : i < 95 ? 0.31 : i < 143 ? -0.31 : i < 166 ? 0.21 : 0);
    pose.headTurn = 0.78 * Math.sin(i * 0.05);
    frame(standProgress);
  }
  // Check the accessory blend across seated and standing poses.
  beside();
  frame();
  onboard();
  frame();
  beside();
  rider.greet();
  for (let i = 0; i < 55; i++) frame();
  for (const kind of ['pack', 'unpack']) {
    const side = rider.root.position;
    const s = {
      x: side.x,
      z: side.z,
      bikeYaw: yaw,
      yaw: rider.root.rotation.y,
      mode: 'walk',
      cargo: kind === 'pack' ? 'hand' : 'box',
    };
    beginSequence(s, kind);
    while (s.sequence) {
      const travel = boxFrame(s, pose.dt, scooter);
      rider.root.position.set(s.x, 0, s.z);
      rider.root.rotation.y = s.yaw;
      pose.carrying = true;
      pose.lift = s.lift;
      pose.tiptoe = s.tiptoe;
      pose.reach = s.reach;
      pose.walking = Math.min(1, travel / (pose.dt * 2.4));
      pose.stride += travel * 5.4;
      pose.headTurn = 0;
      frame();
    }
  }
  // Compare equal-speed runs at the same animation times to isolate the
  // steering spring and the one-shot greeting from the authored riding loop.
  function response(steering, greeting) {
    rider.resetTail();
    onboard();
    Object.assign(pose, { time: 0, lift: 0, carrying: false, speed: 4.2, headTurn: 0 });
    const samples = [];
    for (let i = 0; i < 150; i++) {
      pose.time += pose.dt;
      scooter.steer(steering && i >= 16 && i < 42 ? 0.31 : 0);
      if (greeting && i === 16) rider.greet();
      rider.pose(pose);
      samples.push(chain[0].quaternion.clone().normalize());
    }
    return samples;
  }
  const neutral = response(false, false);
  const differences = (samples) => samples.map((q, i) => q.angleTo(neutral[i]));
  const turning = differences(response(true, false));
  assert.ok(turning[16] < turning[24] && turning[24] < turning[36], 'steering response builds gradually');
  assert.ok(turning[42] > 0.06 && turning[149] < 0.001, 'tail follows through and settles after straightening');
  const greeting = differences(response(false, true));
  assert.ok(Math.max(...greeting.slice(17, 40)) > 0.06 && Math.max(...greeting.slice(40, 62)) > 0.06);
  assert.ok(
    greeting.slice(71).every((angle) => angle < 0.0001),
    'greeting finishes and leaves the ordinary ride pose',
  );
  assert.ok(maxStrain < 0.02, 'curl centreline stays within two percent of its rest length');
  console.log('Maximum curl centreline length change', (maxStrain * 100).toFixed(2) + '%');
  console.log(
    'Accessory sweep',
    frames,
    'frames, minimum clearances (mm)',
    Object.fromEntries([...min].map(([k, d]) => [k, +(d * 1000).toFixed(1)])),
  );
  for (const [pair, dist] of min)
    assert.ok(dist > 0, pair + ' overlaps during animation: ' + (dist * 1000).toFixed(2) + ' mm');
}
