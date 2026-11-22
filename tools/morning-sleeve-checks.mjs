import assert from 'node:assert/strict';
import { Matrix4, Mesh, Ray, Vector3 } from 'three';
import { Octree } from 'three/addons/math/Octree.js';

export function sleeveChecks(root) {
  const uniform = root.getObjectByName('Uniform');
  const jacket = uniform?.children.find(part => part.material?.name === 'Uniform · courier yellow');
  assert.ok(jacket, 'courier-yellow jacket mesh is present');
  const { position, skinIndex, skinWeight } = jacket.geometry.attributes;
  const sides = ['L', 'R'].map(tag => {
    const sign = tag === 'L' ? -1 : 1, side = [], shoulder = [], cuff = [];
    let shoulderChest = false, barrelArm = false;
    let shoulderUpperMax = 0, wristForeMax = 0;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i);
      if (sign * x > .20 && y < .82 && y > .44) side.push(i);
      if (sign * x > .22 && y > .70) shoulder.push(i);
      if (sign * x > .34 && y < .57) cuff.push(i);
      let chest = 0, arm = 0;
      for (let j = 0; j < 4; j++) {
        const name = jacket.skeleton.bones[skinIndex.getComponent(i, j)].name;
        const w = skinWeight.getComponent(i, j);
        if (name === 'Chest') chest += w;
        if (name === `UpperArm_${tag}` || name === `Forearm_${tag}`) arm += w;
      }
      if (sign * x > .30 && y < .64 && arm > .18) barrelArm = true;
      if (sign * x > .22 && y > .70 && chest > .05) shoulderChest = true;
      let upper = 0, forearm = 0;
      for (let j = 0; j < 4; j++) {
        const name = jacket.skeleton.bones[skinIndex.getComponent(i, j)].name;
        const w = skinWeight.getComponent(i, j);
        if (name === `UpperArm_${tag}`) upper += w;
        if (name === `Forearm_${tag}`) forearm += w;
      }
      if (sign * x > .20 && y > .67) shoulderUpperMax = Math.max(shoulderUpperMax, upper);
      if (sign * x > .31 && y < .54) wristForeMax = Math.max(wristForeMax, forearm);
    }
    assert.ok(side.length > 20, `${tag} sleeve volume is present`);
    assert.ok(shoulder.length > 8, `${tag} shoulder cap is rounded`);
    assert.ok(shoulderChest, `${tag} shoulder cap retains chest influence`);
    assert.ok(barrelArm, `${tag} sleeve barrel has graduated arm weights`);
    assert.ok(shoulderUpperMax > .70, `${tag} shoulder UpperArm weight stays monotonic (>0.7)`);
    assert.ok(wristForeMax > .85, `${tag} wrist Forearm weight stays monotonic (>0.85)`);
    assert.ok(uniform.children.some(part => part.material?.name === 'Uniform · charcoal trim'), `${tag} charcoal cuff is exported in Uniform`);
    // A real underarm separation check: sample two vertical bands and compare
    // the nearest outer torso vertex with the inner sleeve wall.  This catches
    // a sleeve that merely has a different skin group while still intersecting
    // the belly volume.
    for (const centre of [.62, .70]) {
      const band = .055;
      let bodyEdge = 0, sleeveEdge = Infinity;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i);
        if (Math.abs(y - centre) > band) continue;
        let arm = 0;
        for (let j = 0; j < 4; j++) {
          const name = jacket.skeleton.bones[skinIndex.getComponent(i, j)].name;
          if (name === `UpperArm_${tag}` || name === `Forearm_${tag}`) arm += skinWeight.getComponent(i, j);
        }
        if (arm < .05 && Math.abs(x) < .24) bodyEdge = Math.max(bodyEdge, sign * x);
        if (arm > .25 && sign * x > .20) {
          sleeveEdge = Math.min(sleeveEdge, sign * x);
        }
      }
      assert.ok(Number.isFinite(sleeveEdge) && sleeveEdge - bodyEdge > .002,
        `${tag} keeps a measurable underarm air gap at y=${centre.toFixed(2)}`);
    }
    return { side, shoulder };
  });
  return () => {
    for (const { side, shoulder } of sides) {
      const span = indices => {
        const xs = indices.map(i => position.getX(i)), zs = indices.map(i => position.getZ(i));
        return { x: Math.max(...xs) - Math.min(...xs), z: Math.max(...zs) - Math.min(...zs) };
      };
      const barrel = span(side), cap = span(shoulder);
      assert.ok(barrel.x > .025 && barrel.z > .035, 'sleeve barrel keeps cross-sectional volume');
      assert.ok(cap.x > .02 && cap.z > .025, 'shoulder cap does not pinch');
    }
  };
}

export function gripClearanceCheck(root, handlebar) {
  const chest = root.getObjectByName('Chest'), uniform = root.getObjectByName('Uniform');
  const jacket = uniform?.children.find(part => part.material?.name === 'Uniform · courier yellow');
  assert.ok(jacket, 'uniform jacket surface is available for clearance checks');
  const surface = new Octree().fromGraphNode(new Mesh(jacket.geometry));
  const inverseBind = jacket.skeleton.boneInverses[jacket.skeleton.bones.indexOf(chest)];
  const toChest = new Matrix4(), transform = new Matrix4(), p = new Vector3(), ray = new Ray();
  const barParts = [];
  handlebar.traverse(part => { if (part.isMesh) barParts.push(part); });
  function outside(label) {
    ray.direction.set(-p.x, 0, -p.z).normalize();
    ray.origin.copy(p).addScaledVector(ray.direction, -1);
    const hit = surface.rayIntersect(ray);
    assert.ok(!hit || hit.distance >= 1 - .0005, label + ' clears the jacket during the weight transfer');
  }
  return ({ hop, rise }) => {
    toChest.multiplyMatrices(chest.matrixWorld, inverseBind).invert();
    if (hop > 0) for (const part of barParts) {
      transform.multiplyMatrices(toChest, part.matrixWorld);
      for (let i = 0; i < part.geometry.attributes.position.count; i++) {
        p.fromBufferAttribute(part.geometry.attributes.position, i).applyMatrix4(transform);
        outside(handlebar.name);
      }
    }
    if (rise <= .90 || hop >= .5) return;
    for (const tag of ['L', 'R']) for (const name of ['Paw_', 'Mitten_']) {
      const mesh = root.getObjectByName(name + tag);
      mesh.getWorldPosition(p).applyMatrix4(toChest);
      outside(mesh.name);
    }
  };
}

