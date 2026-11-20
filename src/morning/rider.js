/** Shared street props and the two articulated Blender assets for the morning route. */
import * as THREE from 'three';
import { bake, box, curve, group, piece } from './shapes.js';
import { ik2 } from '../core/ik.js';

const cream = 0xffedcc, jacket = 0x26776c;
const courierScale = 0.84;
const xAxis = new THREE.Vector3(1, 0, 0), yAxis = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3(0, 0, 1);

// A padded triangular ear with a smaller inset. Its outline is rounded at all three corners.
export function ear(g, x, y, z, size, outer, inner, tilt) {
  const holder = group(g, x, y, z);
  holder.rotation.z = tilt;
  const shape = new THREE.Shape();
  shape.moveTo(-0.18, -0.03);
  shape.quadraticCurveTo(-0.22, 0.00, -0.16, 0.18);
  shape.quadraticCurveTo(-0.07, 0.46, 0.0, 0.49);
  shape.quadraticCurveTo(0.07, 0.48, 0.18, 0.12);
  shape.quadraticCurveTo(0.23, -0.035, 0.13, -0.055);
  shape.quadraticCurveTo(-0.035, -0.09, -0.18, -0.03);
  const padding = new THREE.ExtrudeGeometry(shape, {
    depth: 0.082, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.035, bevelThickness: 0.035,
  });
  piece(holder, padding, outer);
  const face = piece(holder, new THREE.ShapeGeometry(shape), inner, 0, 0.045, 0.12);
  face.scale.set(0.63, 0.72, 1);
  holder.scale.setScalar(size);
  return holder;
}

export function parcel(parent, x, y, z) {
  const bag = group(parent, x, y, z);
  box(bag, 0, 0.16, 0, 0.33, 0.32, 0.18, 0xcc9155, 0.018);
  curve(bag, [[-0.081, 0.30, 0], [-0.075, 0.392, 0], [0.06, 0.394, 0], [0.08, 0.30, 0]], 0.013, 0x91633f);
  box(bag, 0, 0.17, 0.099, 0.17, 0.10, 0.01, cream);
  box(bag, 0, 0.17, 0.106, 0.09, 0.022, 0.005, jacket);
  bake(bag);
  return bag;
}

function named(root, name) {
  const object = root.getObjectByName(name);
  if (!object) throw new Error('Missing Blender node ' + name);
  return object;
}

function prepare(asset) {
  const root = asset.scene;
  root.traverse(o => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    // Tinted optical glass transmits the sunlight to the eyes beneath it.
    o.castShadow = !o.material.transparent;
    // All skinned parts travel together with a single small courier. A cached
    // bind-pose sphere would otherwise cull an arm after mounting or lifting.
    if (o.isSkinnedMesh) o.frustumCulled = false;
  });
  root.updateMatrixWorld(true);
  return root;
}

// Sample the Blender clips at the simulation's stride, rather than the render
// clock. Reapplying each keyed property also removes last frame's additive IK.
function clipSampler(asset, root, name) {
  const clip = THREE.AnimationClip.findByName(asset.animations, name);
  if (!clip) throw new Error('Missing Blender action ' + name);
  const tracks = clip.tracks.map(track => {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
    const property = named(root, nodeName)[propertyName];
    return { property, sample: track.createInterpolant(), scratch: property.clone() };
  });
  return (phase, weight = 1) => {
    const t = phase * clip.duration;
    for (const { property, sample, scratch } of tracks) {
      const value = sample.evaluate(t);
      if (weight === 1) property.fromArray(value);
      else if (property.isQuaternion) property.slerp(scratch.fromArray(value), weight);
      else property.lerp(scratch.fromArray(value), weight);
    }
  };
}

export function createShiba(asset) {
  const root = prepare(asset), rootBone = named(root, 'Root'), chest = named(root, 'Chest'), head = named(root, 'Head');
  const stand = clipSampler(asset, root, 'Stand'), walk = clipSampler(asset, root, 'Walk'), ride = clipSampler(asset, root, 'Ride');
  const tail = ['Tail', 'TailMid', 'TailTip'].map(name => root.getObjectByName(name)).filter(bone => bone?.isBone);
  const hinge = root.getObjectByName('GoggleHinge'), clothEnds = root.getObjectByName('KerchiefEnds');
  const previousGoggles = new THREE.Quaternion(), previousCloth = new THREE.Quaternion();
  let gogglesTime = 1, previousMount = null;
  const tailTransition = tail.map(bone => bone.quaternion.clone());
  let previousMotion = '', blendTime = 1;
  let tailYaw = 0, yawVelocity = 0, ridePhase = 0, greetingAge = 1;
  const soleDepth = named(root, 'CourierRig').userData.soleDepth ?? .079;
  const rest = new Map();
  root.traverse(bone => {
    if (bone.isBone) rest.set(bone, {
      local: bone.quaternion.clone(), parent: bone.parent.getWorldQuaternion(new THREE.Quaternion()),
      world: bone.getWorldQuaternion(new THREE.Quaternion()),
    });
  });
  const at = o => o.getWorldPosition(new THREE.Vector3());
  const parts = ['L', 'R'].map((tag, i) => {
    const chain = names => {
      const [a, b, c] = names.map(prefix => named(root, prefix + '_' + tag));
      return { a, b, c, upper: at(a).distanceTo(at(b)), lower: at(b).distanceTo(at(c)) };
    };
    return { arm: chain(['UpperArm', 'Forearm', 'Paw']), leg: chain(['Thigh', 'Shin', 'Foot']),
      eye: named(root, 'Eye_' + tag), elbowPole: new THREE.Vector3(i ? .40 : -.40, -1, -.22) };
  });
  root.scale.setScalar(courierScale);
  const bag = parcel(root, 0, 0, 0), grip = parts[0].arm.c;
  const v = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), end = new THREE.Vector3(), goal = new THREE.Vector3(), pole = new THREE.Vector3();
  const q = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), delta = new THREE.Quaternion();
  const shipQ = new THREE.Quaternion(), aligned = new THREE.Quaternion();

  function turn(bone, axis, angle, fromRest = false) {
    const bind = rest.get(bone);
    delta.copy(bind.parent).invert().multiply(q.setFromAxisAngle(axis, angle)).multiply(bind.parent);
    if (fromRest) bone.quaternion.copy(bind.local);
    bone.quaternion.premultiply(delta);
  }
  function aim(bone, child, worldPoint) {
    bone.getWorldPosition(v);
    child.getWorldPosition(from).sub(v).normalize();
    to.copy(worldPoint).sub(v).normalize();
    delta.setFromUnitVectors(from, to);
    bone.parent.getWorldQuaternion(parentQ);
    q.copy(parentQ).invert().multiply(delta).multiply(parentQ);
    bone.quaternion.premultiply(q);
  }
  function solve(chain, target, direction, scale) {
    chain.a.getWorldPosition(a);
    ik2(a, target, chain.upper * scale, chain.lower * scale, direction, b, end);
    aim(chain.a, chain.b, b);
    aim(chain.b, chain.c, end);
  }
  function resetTail() {
    tailYaw = yawVelocity = ridePhase = 0;
    greetingAge = blendTime = 1;
    previousMotion = '';
    previousMount = null;
    gogglesTime = 1;
  }

  function greet() {
    greetingAge = 0;
  }

  function pose({ time, stride, walking, mount, carrying, headTurn, lift = 0, speed = 0, dt = 0 }) {
    const motion = mount ? 'ride' : walking > 0 ? 'walk' : 'stand';
    const onboard = Boolean(mount);
    if (hinge && previousMount !== onboard) {
      previousGoggles.copy(hinge.quaternion);
      gogglesTime = previousMount === null || !dt ? 1 : 0;
      previousMount = onboard;
    }
    if (motion !== previousMotion && dt > 0) {
      if (previousMotion) {
        tail.forEach((bone, i) => tailTransition[i].copy(bone.quaternion));
        if (clothEnds) previousCloth.copy(clothEnds.quaternion);
        blendTime = 0;
      }
      previousMotion = motion;
    }
    const rolling = Math.min(1, Math.abs(speed) / 5.6);
    if (mount) {
      ridePhase = (ridePhase + dt * (.48 + 1.45 * rolling)) % 1;
      ride(ridePhase);
      // The authored riding action works on its own. Mount translation and final
      // contact use the actual vehicle markers, including both roots' transforms.
      root.worldToLocal(mount.seat.getWorldPosition(rootBone.position));
      turn(chest, yAxis, mount.turn * .86);
      const worldScale = root.getWorldScale(v).y;
      chest.getWorldQuaternion(shipQ);
      for (let i = 0; i < parts.length; i++) {
        const { arm, leg, elbowPole } = parts[i];
        pole.copy(elbowPole).applyQuaternion(shipQ);
        solve(arm, mount.palms[i].getWorldPosition(goal), pole, worldScale);
        mount.feet[i].getWorldQuaternion(aligned);
        goal.set(0, soleDepth * worldScale, 0).applyQuaternion(aligned).add(mount.feet[i].getWorldPosition(v));
        pole.copy(leg.b.getWorldPosition(pole)).sub(leg.a.getWorldPosition(v)).normalize();
        solve(leg, goal, pole, worldScale);
        leg.c.parent.getWorldQuaternion(parentQ);
        leg.c.quaternion.copy(parentQ.invert()).multiply(aligned).multiply(rest.get(leg.c).world);
      }
    } else {
      if (walking < 1) stand((time % 3) / 3);
      if (walking > 0) walk(THREE.MathUtils.euclideanModulo(stride / (2 * Math.PI), 1), walking);
      turn(chest, xAxis, .007 * Math.sin(time * 2.3) * (1 - walking) * (1 - lift));
      if (lift) turn(rootBone, xAxis, lift * .15);
      if (carrying) turn(parts[0].arm.a, xAxis, -.46 - lift * 2.33, true);
      if (lift) turn(parts[1].arm.a, xAxis, -lift * .60);
    }
    if (mount && clothEnds) {
      turn(clothEnds, xAxis, .19 * rolling);
      turn(clothEnds, yAxis, -.20 * rolling * mount.turn);
    }
    if (hinge && gogglesTime < 1) {
      gogglesTime = Math.min(1, gogglesTime + dt / .34);
      hinge.quaternion.slerp(previousGoggles, 1 - THREE.MathUtils.smoothstep(gogglesTime, 0, 1));
    }
    // The clips own the curl and the stride. Add the turn in rider space
    // after sampling, so it follows the actual steering, speed and braking.
    const targetYaw = mount ? mount.turn * rolling * .62 : 0;
    const steps = Math.max(1, Math.ceil(Math.min(dt, .1) * 120));
    const h = Math.min(dt, .1) / steps;
    for (let i = 0; i < steps; i++) {
      yawVelocity += ((targetYaw - tailYaw) * 112 - 11.5 * yawVelocity) * h;
      tailYaw += yawVelocity * h;
    }
    greetingAge = Math.min(1, greetingAge + dt / .84);
    blendTime = Math.min(1, blendTime + dt / .18);
    const blend = THREE.MathUtils.smoothstep(blendTime, 0, 1);
    if (clothEnds && blend < 1) clothEnds.quaternion.slerp(previousCloth, 1 - blend);
    for (let i = 0; i < tail.length; i++) {
      const u = THREE.MathUtils.clamp((greetingAge - .04 * i) / .90, 0, 1);
      const wag = Math.sin(4 * Math.PI * u) * Math.sin(Math.PI * u) ** 2;
      turn(tail[i], yAxis, (tailYaw - i * .025 * yawVelocity + .23 * wag) * (.78 - .21 * i));
      if (blend < 1) tail[i].quaternion.slerp(tailTransition[i], 1 - blend);
    }
    turn(head, yAxis, headTurn + .034 * Math.sin(time * 1.35));
    turn(head, zAxis, .025 * Math.sin(time * 1.8));
    const blink = time % 4.65;
    for (const { eye } of parts) eye.scale.y = blink < .155 ? 1 - Math.sin(blink / .155 * Math.PI) * .93 : 1;
    bag.visible = carrying && !mount;
    if (carrying) {
      root.worldToLocal(grip.getWorldPosition(bag.position));
      bag.position.y -= .39;
      bag.rotation.z = walking * Math.sin(stride) * .06;
    }
  }
  return { root, pose, bag, grip, greet, resetTail };
}

export function createScooter(asset) {
  const root = prepare(asset), node = name => named(root, name);
  const swivel = node('Steering'), front = node('Wheel_F'), rear = node('Wheel_R');
  const inRoot = o => root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
  const frontAxle = inRoot(front), rearAxle = inRoot(rear);
  const axis = inRoot(swivel).sub(inRoot(node('SteerAxisLower'))).normalize();
  const mount = { seat: node('Seat_Rider'), turn: 0, palms: ['L', 'R'].map(t => node('PalmTarget_' + t)),
    feet: ['L', 'R'].map(t => node('Footrest_' + t)) };
  const peg = node('Packing_Peg'), stowed = peg.position.clone(), deployed = inRoot(node('Packing_Peg_Out'));
  const cargo = { floor: inRoot(node('Cargo_Floor')), approach: inRoot(node('Cargo_Approach')), reach: inRoot(node('Cargo_Reach')) };
  root.scale.setScalar(courierScale);
  return { root, mount, cargo, lid: node('Cargo_Lid'), wheelbase: frontAxle.z - rearAxle.z,
    packingStep(amount) {
      peg.position.lerpVectors(stowed, deployed, amount);
      return (peg.position.y + .012) * root.scale.y;
    },
    steer(angle) {
      mount.turn = angle;
      swivel.quaternion.setFromAxisAngle(axis, angle);
    },
    roll(distance) {
      front.rotation.x += distance / (frontAxle.y * root.scale.y);
      rear.rotation.x += distance / (rearAxle.y * root.scale.y);
    },
  };
}
