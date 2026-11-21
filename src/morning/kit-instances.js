import * as THREE from 'three';
import { litMaterial } from '../core/materials.js';

const kitPaint = litMaterial({ vertexColors: true, grid: false, roughness: 0.88 });
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

export function placeInstances(group, asset, list, castShadow = true, receiveShadow = true) {
  if (!asset || !list.length) return;
  const mesh = new THREE.InstancedMesh(asset.geometry ?? asset, asset.material ?? kitPaint, list.length);
  for (let i = 0; i < list.length; i++) {
    const [x, y, z, rotY, sx, sy, sz, colorHex] = list[i];
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (colorHex !== undefined) mesh.setColorAt(i, tint.setHex(colorHex));
  }
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.computeBoundingSphere();
  group.add(mesh);
}
