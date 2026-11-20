import assert from 'node:assert/strict';
import { Octree } from 'three/addons/math/Octree.js';
import { Ray, Triangle, Vector3 } from 'three';

// glTF splits the sewn jacket along material boundaries. Compare the posed
// triangles and exclude only edges meeting at the same garment vertex.
export function checkSleeves(uniform) {
  const panels = ['Uniform · bottle green', 'Uniform · sleeves'].map(name => {
    const mesh = uniform.children.find(m => m.material.name === name);
    assert.ok(mesh, name);
    const points = Array.from({ length: mesh.geometry.attributes.position.count },
      (_, i) => mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
    const index = mesh.geometry.index.array, tree = new Octree(), edges = new Map();
    for (let i = 0; i < index.length; i += 3) {
      const a = index[i], b = index[i + 1], c = index[i + 2];
      tree.addTriangle(new Triangle(points[a], points[b], points[c]));
      for (const [j, k] of [[a,b], [b,c], [c,a]]) {
        edges.set(Math.min(j,k) * points.length + Math.max(j,k), [points[j], points[k]]);
      }
    }
    tree.build();
    return { tree, edges };
  });
  const ray = new Ray(), hit = new Vector3(), candidates = [];
  for (const [source, obstacle] of [[1, 0], [0, 1], [1, 1]]) {
    for (const [a, b] of panels[source].edges.values()) {
      ray.origin.copy(a);
      const length = ray.direction.subVectors(b, a).length();
      if (length < 1e-6) continue;
      ray.direction.divideScalar(length);
      candidates.length = 0;
      panels[obstacle].tree.getRayTriangles(ray, candidates);
      for (const tri of candidates) {
        if ([tri.a, tri.b, tri.c].some(p => p.distanceToSquared(a) < 1e-12 || p.distanceToSquared(b) < 1e-12)) continue;
        if (!ray.intersectTriangle(tri.a, tri.b, tri.c, false, hit)) continue;
        const d = hit.distanceTo(a);
        assert.ok(d < 1e-6 || d > length - 1e-6, 'articulated sleeve cuts through another fabric triangle');
      }
    }
  }
}
