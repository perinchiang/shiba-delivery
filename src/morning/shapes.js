/** Model-building primitives for the morning diorama. bake() batches each rigid assembly. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GeoBuilder } from '../core/geo.js';
import { litMaterial } from '../core/materials.js';
import { drawText } from '../core/textcanvas.js';

const cube = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 20, 14);
const pebble = new THREE.IcosahedronGeometry(1, 1);
const paints = new Map();
const batchPaint = litMaterial({ vertexColors: true, grid: false });

export function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  parent.add(g);
  g.position.set(x, y, z);
  return g;
}

function paint(color) {
  if (!paints.has(color)) paints.set(color, litMaterial({ color, grid: false }));
  return paints.get(color);
}

export function piece(parent, geometry, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, paint(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function box(g, x, y, z, w, h, d, color, radius = 0) {
  if (radius) return piece(g, new RoundedBoxGeometry(w, h, d, 2, radius), color, x, y, z);
  const mesh = piece(g, cube, color, x, y, z);
  mesh.scale.set(w, h, d);
  return mesh;
}

export function oval(g, x, y, z, rx, ry, rz, color, faceted = false) {
  const mesh = piece(g, faceted ? pebble : sphere, color, x, y, z);
  mesh.scale.set(rx, ry, rz);
  return mesh;
}

export function cylinder(g, x, y, z, top, bottom, h, color, segments = 20) {
  return piece(g, new THREE.CylinderGeometry(top, bottom, h, segments), color, x, y, z);
}

const up = new THREE.Vector3(0, 1, 0);
export function rod(g, a, b, radius, color, tip = radius, sides = 10) {
  const p = new THREE.Vector3(...a);
  const q = new THREE.Vector3(...b);
  const delta = q.clone().sub(p);
  const mesh = cylinder(g, (p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2,
    tip, radius, delta.length(), color, sides);
  mesh.quaternion.setFromUnitVectors(up, delta.normalize());
  return mesh;
}

export function curve(g, points, radius, color) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return piece(g, new THREE.TubeGeometry(path, Math.max(10, points.length * 4), radius, 8, false), color);
}

// Keep textured signs and animated children separate. Call before attaching moving joints.
export function bake(root) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const solids = [];
  root.traverse(o => { if (o.isMesh && !o.material.map && !o.material.vertexColors) solids.push(o); });
  if (!solids.length) return;
  const builder = new GeoBuilder();
  const matrix = new THREE.Matrix4();
  for (const o of solids) {
    builder.add(o.geometry, { m: matrix.multiplyMatrices(inverse, o.matrixWorld), color: o.material.color });
    o.removeFromParent();
    if (o.geometry !== cube && o.geometry !== sphere && o.geometry !== pebble) o.geometry.dispose();
  }
  const mesh = builder.mesh(batchPaint);
  mesh.castShadow = mesh.receiveShadow = true;
  root.add(mesh);
}

export function sign(g, x, y, z, w, h, title, {
  bg = '#f5e9c9', ink = '#294d47', font = 'kai', sub = '', frame = true, vertical = false,
} = {}) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(170, 900 / Math.max(w, h));
  canvas.width = Math.max(64, Math.round(w * scale));
  canvas.height = Math.max(64, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  const cw = canvas.width, ch = canvas.height;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);
  if (frame) {
    const edge = Math.min(cw, ch) * 0.045;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, edge * 0.27);
    ctx.strokeRect(edge, edge, cw - edge * 2, ch - edge * 2);
  }
  const band = sub ? ch * 0.28 : 0;
  drawText(ctx, title, cw * 0.06, ch * 0.06, cw * 0.88, ch * 0.88 - band,
    { font, color: ink, spacing: 0.08, weight: 800, vertical });
  if (sub) drawText(ctx, sub, cw * 0.08, ch * 0.70, cw * 0.84, ch * 0.21,
    { font: 'hei', color: ink, spacing: 0.2, weight: 600 });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    litMaterial({ map: texture, roughness: 1, selfLit: 0.12, grid: false }));
  face.position.set(x, y, z);
  face.receiveShadow = true;
  g.add(face);
  return face;
}
