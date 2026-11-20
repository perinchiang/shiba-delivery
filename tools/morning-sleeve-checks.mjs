import assert from 'node:assert/strict';
import { Vector3 } from 'three';

// Measure two diameters on the same cross-section of the original round sleeve.
// A hand can stay on the grip even when the cloth above it has collapsed.
export function sleeveChecks(root) {
  const rings = ['L', 'R'].map(tag => {
    const mesh = root.getObjectByName('Sleeve_' + tag);
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    const ring = [];
    let anchoredCap = false;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
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
    return { mesh, diameters };
  });
  const a = new Vector3(), b = new Vector3();
  return () => {
    for (const { mesh, diameters } of rings) {
      for (const { lo, hi, minimum } of diameters) {
        mesh.getVertexPosition(lo, a);
        mesh.getVertexPosition(hi, b);
        // Original diameters at this latitude are .207 and .221 in rig space.
        assert.ok(a.distanceTo(b) > minimum, 'round sleeve retains width and depth in the posed mesh');
      }
    }
  };
}
