import assert from 'node:assert/strict';
import { Matrix4, Mesh, Ray, Vector3 } from 'three';
import { Octree } from 'three/addons/math/Octree.js';

export function sleeveChecks(root) {
  const uniform = root.getObjectByName('Uniform');
  const jacket = uniform?.children.find(part => part.material?.name === 'Uniform · bottle green');
  assert.ok(jacket, 'continuous bottle-green Uniform mesh is present');
  const { position, skinIndex, skinWeight } = jacket.geometry.attributes;
  const sides = ['L', 'R'].map(tag => {
    const sign = tag === 'L' ? -1 : 1, side = [], shoulder = [], cuff = [];
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i);
      if (sign * x < .26) continue;
      if (y < .76 && y > .43) side.push(i);
      if (sign * x > .28 && y > .67) shoulder.push(i);
      if (sign * x > .34 && y < .57) cuff.push(i);
      let chest = 0, arm = 0;
      for (let j = 0; j < 4; j++) {
        const name = jacket.skeleton.bones[skinIndex.getComponent(i, j)].name;
        const w = skinWeight.getComponent(i, j);
        if (name === 'Chest') chest += w;
        if (name === `UpperArm_${tag}` || name === `Forearm_${tag}`) arm += w;
      }
      if (sign * x > .34 && y < .64) assert.ok(arm > .18, 'sleeve barrel has graduated arm weights');
      if (sign * x > .28 && y > .69) assert.ok(chest > .05, 'raglan shoulder retains chest influence');
    }
    assert.ok(side.length > 20, `unified ${tag} sleeve volume is present`);
    assert.ok(shoulder.length > 8, `unified ${tag} shoulder cap is rounded`);
    assert.ok(uniform.children.some(part => part.material?.name === 'Uniform · dark teal'), `${tag} ribbed cuff is exported in Uniform`);
    return { side, shoulder };
  });
  return () => {
    for (const { side, shoulder } of sides) {
      const span = indices => {
        const xs = indices.map(i => position.getX(i)), zs = indices.map(i => position.getZ(i));
        return { x: Math.max(...xs) - Math.min(...xs), z: Math.max(...zs) - Math.min(...zs) };
      };
      const barrel = span(side), cap = span(shoulder);
      assert.ok(barrel.x > .03 && barrel.z > .04, 'sleeve barrel keeps cross-sectional volume');
      assert.ok(cap.x > .02 && cap.z > .03, 'shoulder cap does not pinch');
    }
  };
}

export function gripClearanceCheck(root, handlebar) {
  const chest = root.getObjectByName('Chest'), uniform = root.getObjectByName('Uniform');
  const jacket = uniform?.children.find(part => part.material?.name === 'Uniform · bottle green');
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

