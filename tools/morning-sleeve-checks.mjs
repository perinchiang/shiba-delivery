import assert from 'node:assert/strict';
import { Matrix4, Mesh, Ray, Vector3 } from 'three';
import { Octree } from 'three/addons/math/Octree.js';

// Measure two diameters on the same cross-section of the original round sleeve.
// A hand can stay on the grip even when the cloth above it has collapsed.
export function sleeveChecks(root) {
  const rings = ['L', 'R'].map(tag => {
    const mesh = root.getObjectByName('Sleeve_' + tag);
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    const ring = [], crown = [];
    let anchoredCap = false;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      // The crown above the shoulder pivot must span the front and back
      // of the sleeve. A full elbow section alone can hide a flattened cap.
      const lateral = Math.abs(position.getX(i));
      if (lateral > .29 && lateral < .33 && y > .784) crown.push(i);
      if (Math.abs(y - .69313) < .0001) ring.push(i);
      for (let j = 0; j < 4; j++) {
        if (mesh.skeleton.bones[skinIndex.getComponent(i, j)].name !== 'Chest') continue;
        const w = skinWeight.getComponent(i, j);
        if (y <= .720) assert.ok(w < .0001, 'sleeve barrel moves with the arm');
        if (w > .5) anchoredCap = true;
      }
    }
    assert.ok(anchoredCap && ring.length >= 4, 'shoulder cap and round upper sleeve are present');
    const diameters = [['getX', .196], ['getZ', .209]].map(([axis, minimum]) => {
      const sorted = ring.slice().sort((a, b) => position[axis](a) - position[axis](b));
      return { lo: sorted[0], hi: sorted.at(-1), minimum };
    });
    assert.ok(crown.length > 1, 'upper outer shoulder is filled above the arm pivot');
    crown.sort((a, b) => position.getZ(a) - position.getZ(b));
    diameters.push({ lo: crown[0], hi: crown.at(-1), minimum: .065 });
    return { mesh, diameters };
  });
  const a = new Vector3(), b = new Vector3();
  return () => {
    for (const { mesh, diameters } of rings) {
      for (const { lo, hi, minimum } of diameters) {
        mesh.getVertexPosition(lo, a);
        mesh.getVertexPosition(hi, b);
        // Original diameters at this latitude are .207 and .221 in rig space.
        const span = a.distanceTo(b);
        assert.ok(span > minimum, mesh.name + ' span ' + span.toFixed(3) + ' must exceed ' + minimum);
      }
    }
  };
}

// The front and sides of the jacket follow Chest rigidly. Its upper contour
// is cut away under the kerchief, so use the exported triangles at arm height.
export function gripClearanceCheck(root, handlebar) {
  const chest = root.getObjectByName('Chest');
  const jacket = root.getObjectByName('Uniform').children.find(part => part.material?.name === 'Uniform · bottle green');
  const surface = new Octree().fromGraphNode(new Mesh(jacket.geometry));
  const inverseBind = jacket.skeleton.boneInverses[jacket.skeleton.bones.indexOf(chest)];
  const toChest = new Matrix4(), transform = new Matrix4(), p = new Vector3(), ray = new Ray();
  const barParts = [];
  handlebar.traverse(part => { if (part.isMesh) barParts.push(part); });
  const sides = ['L', 'R'].map(tag => {
    const sleeve = root.getObjectByName('Sleeve_' + tag);
    const mitten = root.getObjectByName('Mitten_' + tag);
    const samples = [sleeve, mitten].map(mesh => {
      const position = mesh.geometry.attributes.position;
      const indices = [];
      for (let i = 0; i < position.count; i++) {
        if (mesh === mitten || position.getY(i) < .58) indices.push(i);
      }
      assert.ok(indices.length > 0);
      return { mesh, indices };
    });
    return { elbow: root.getObjectByName('Forearm_' + tag), samples };
  });
  function outside(label) {
    ray.direction.set(-p.x, 0, -p.z).normalize();
    ray.origin.copy(p).addScaledVector(ray.direction, -1);
    const hit = surface.rayIntersect(ray);
    assert.ok(!hit || hit.distance >= 1 - .0005, label + ' clears the jacket during the weight transfer');
  }
  return ({ hop, rise }) => {
    toChest.multiplyMatrices(chest.matrixWorld, inverseBind).invert();
    if (hop > 0) {
      for (const part of barParts) {
        transform.multiplyMatrices(toChest, part.matrixWorld);
        const positions = part.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          p.fromBufferAttribute(positions, i).applyMatrix4(transform);
          outside(handlebar.name);
        }
      }
    }
    if (rise <= .90 || hop >= .5) return;
    for (const { elbow, samples } of sides) {
      elbow.getWorldPosition(p).applyMatrix4(toChest);
      outside(elbow.name);
      for (const { mesh, indices } of samples) {
        transform.multiplyMatrices(toChest, mesh.matrixWorld);
        for (const i of indices) {
          mesh.getVertexPosition(i, p).applyMatrix4(transform);
          outside(mesh.name);
        }
      }
    }
  };
}
