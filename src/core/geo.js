// GeoBuilder: accumulate many primitives into ONE BufferGeometry (position, normal, uv, color).
// Generators should build a handful of big merged meshes (one per material) instead of thousands
// of small Mesh objects - draw calls are the main performance budget of the neighborhood.
//
// Colors: pass hex numbers (sRGB, like CSS) or THREE.Color; they are stored as linear vertex colors.
// Use materials with `vertexColors: true` to have them multiply the material colour / texture.
//
// UVs: every primitive takes `uv`:
//   undefined / 'world'  -> metres * uvScale (default 1): textures tile at a constant world density
//   [u0, v0, u1, v1]      -> the primitive's faces are mapped onto this rectangle (atlas cell)
import * as THREE from 'three';

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const WHITE = [1, 1, 1];

function rgb(color) {
  if (color === undefined || color === null) return WHITE;
  if (Array.isArray(color)) return color;
  if (color.isColor) return [color.r, color.g, color.b];
  _c.set(color);
  return [_c.r, _c.g, _c.b];
}

export class GeoBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
    this._stack = [];
    this._m = null; // current transform (Matrix4) applied to everything added
  }
  get vertexCount() { return this.pos.length / 3; }
  get empty() { return this.idx.length === 0; }

  /** Run fn with an extra transform applied to everything it adds (nestable). */
  with(matrix, fn) {
    this._stack.push(this._m);
    this._m = this._m ? this._m.clone().multiply(matrix) : matrix.clone();
    try { fn(this); } finally { this._m = this._stack.pop(); }
    return this;
  }
  /** Shortcut: translate (x,y,z) + rotate around Y, then run fn. */
  at(x, y, z, rotY, fn) {
    const m = new THREE.Matrix4().makeRotationY(rotY || 0).setPosition(x, y, z);
    return this.with(m, fn);
  }

  _push(x, y, z, nx, ny, nz, u, v, c, m) {
    _v.set(x, y, z); _n.set(nx, ny, nz);
    if (m) { _v.applyMatrix4(m); _n.applyMatrix3(_nm).normalize(); }
    this.pos.push(_v.x, _v.y, _v.z);
    this.nor.push(_n.x, _n.y, _n.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
  }
  _matrix(local) {
    let m = this._m;
    if (local) m = m ? m.clone().multiply(local) : local;
    if (m) _nm.getNormalMatrix(m);
    return m;
  }

  /**
   * Quad from four corners [x,y,z] in counter-clockwise order seen from the front.
   * opts: { color, colors:[c0,c1,c2,c3] (per-corner, for baked gradients/AO), uv:[u0,v0,u1,v1], uvScale, m, normal:[x,y,z] }
   * With world UVs, u runs along a->b in metres and v along a->d.
   */
  quad(a, b, c, d, opts = {}) {
    const m = this._matrix(opts.m);
    const base = this.vertexCount;
    let nx, ny, nz;
    if (opts.normal) [nx, ny, nz] = opts.normal;
    else {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    }
    let u0, v0, u1, v1;
    if (Array.isArray(opts.uv)) [u0, v0, u1, v1] = opts.uv;
    else {
      const s = opts.uvScale ?? 1;
      const off = opts.uvOffset || [0, 0];
      u0 = off[0] * s; v0 = off[1] * s;
      u1 = u0 + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * s;
      v1 = v0 + Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]) * s;
    }
    const cs = opts.colors ? opts.colors.map(rgb) : null;
    const col = cs ? null : rgb(opts.color);
    this._push(a[0], a[1], a[2], nx, ny, nz, u0, v0, cs ? cs[0] : col, m);
    this._push(b[0], b[1], b[2], nx, ny, nz, u1, v0, cs ? cs[1] : col, m);
    this._push(c[0], c[1], c[2], nx, ny, nz, u1, v1, cs ? cs[2] : col, m);
    this._push(d[0], d[1], d[2], nx, ny, nz, u0, v1, cs ? cs[3] : col, m);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }

  /**
   * Axis-aligned box centred at (x, y, z) with size (w, h, d) -- note y is the CENTRE.
   * opts: {
   *   rotY,                  // yaw around the box centre
   *   color,                 // one colour, or
   *   colors: {px,nx,py,ny,pz,nz}, // per-face colours (missing faces fall back to `color`)
   *   uv, uvScale,           // see header; uv may also be {px:[..],nx:[..],...} per face
   *   skip: 'ny,nz',         // faces to leave out (hidden faces cost fill + vertices)
   *   shade: 0.25,           // darken the bottom vertices of the side faces by this fraction (cheap AO)
   *   m,                     // extra local Matrix4
   * }
   */
  box(x, y, z, w, h, d, opts = {}) {
    let local = opts.m || null;
    if (opts.rotY) {
      const r = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(opts.rotY)).multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
      local = local ? local.clone().multiply(r) : r;
    }
    const skip = opts.skip || '';
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const x0 = x - hx, x1 = x + hx, y0 = y - hy, y1 = y + hy, z0 = z - hz, z1 = z + hz;
    const faces = {
      px: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
      nx: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      py: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      ny: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      pz: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      nz: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    };
    const baseCol = rgb(opts.color);
    for (const f in faces) {
      if (skip.includes(f)) continue;
      const p = faces[f];
      const fc = opts.colors && opts.colors[f] !== undefined ? rgb(opts.colors[f]) : baseCol;
      const q = { m: local, uvScale: opts.uvScale, uvOffset: opts.uvOffset };
      if (opts.uv && !Array.isArray(opts.uv) && typeof opts.uv === 'object') q.uv = opts.uv[f];
      else if (Array.isArray(opts.uv)) q.uv = opts.uv;
      if (opts.shade && f !== 'py' && f !== 'ny') {
        const k = 1 - opts.shade;
        const dark = [fc[0] * k, fc[1] * k, fc[2] * k];
        q.colors = [dark, dark, fc, fc];
      } else q.color = fc;
      this.quad(p[0], p[1], p[2], p[3], q);
    }
    return this;
  }

  /**
   * Vertical wall rectangle from (x0,z0) to (x1,z1) between heights y0..y1.
   * Front-face normal = normalize(-dz, 0, dx) where (dx,dz) = b - a.
   * Example: a wall drawn from -X to +X (dx > 0, dz = 0) faces +Z.
   */
  wall(x0, z0, x1, z1, y0, y1, opts = {}) {
    return this.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], opts);
  }

  /** Horizontal rectangle at height y facing up (or down with opts.down). */
  floor(x0, z0, x1, z1, y, opts = {}) {
    if (opts.down) return this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], opts);
    return this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], opts);
  }

  /**
   * Cylinder / cone / tube along +Y with its BASE centre at (x, y, z).
   * opts: { color, seg=10, caps=true, m, uv, uvScale, arc (radians, default full) }
   */
  cylinder(x, y, z, rBottom, rTop, h, opts = {}) {
    const seg = opts.seg ?? 10;
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, opts.caps === false, 0, opts.arc ?? Math.PI * 2);
    g.translate(x, y + h / 2, z);
    this.add(g, opts);
    g.dispose();
    return this;
  }

  /**
   * Append any BufferGeometry (indexed or not). opts: { m, color, uv:[u0,v0,u1,v1] (remap its 0..1 uvs), keepColor }
   * If the geometry has its own vertex colours they are multiplied by `color`.
   */
  add(geom, opts = {}) {
    const m = this._matrix(opts.m);
    const base = this.vertexCount;
    const p = geom.attributes.position, n = geom.attributes.normal, t = geom.attributes.uv, gc = geom.attributes.color;
    const col = rgb(opts.color);
    const r = Array.isArray(opts.uv) ? opts.uv : null;
    const s = opts.uvScale ?? 1;
    const tmp = [0, 0, 0];
    for (let i = 0; i < p.count; i++) {
      let u = t ? t.getX(i) : 0, v = t ? t.getY(i) : 0;
      if (r) { u = r[0] + (r[2] - r[0]) * u; v = r[1] + (r[3] - r[1]) * v; } else { u *= s; v *= s; }
      let c = col;
      if (gc) { tmp[0] = col[0] * gc.getX(i); tmp[1] = col[1] * gc.getY(i); tmp[2] = col[2] * gc.getZ(i); c = tmp; }
      this._push(p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0, u, v, c, m);
    }
    if (geom.index) { const ix = geom.index; for (let i = 0; i < ix.count; i++) this.idx.push(base + ix.getX(i)); }
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return this;
  }

  /** Finish. Returns an indexed BufferGeometry with position/normal/uv/color and computed bounds. */
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  /** Finish and wrap in a Mesh (frustum-cullable, static). Returns null if nothing was added. */
  mesh(material, name = '') {
    if (this.empty) return null;
    const mesh = new THREE.Mesh(this.build(), material);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

/**
 * Group builders by key so a generator can write `batch.get('tileWall').box(...)` and end up with
 * one mesh per material. `materials` maps key -> THREE.Material (or a function returning one).
 */
export class GeoBatch {
  constructor() { this.map = new Map(); }
  get(key) {
    let b = this.map.get(key);
    if (!b) this.map.set(key, (b = new GeoBuilder()));
    return b;
  }
  /** Build all into `group` (created if omitted). */
  build(materials, group = new THREE.Group(), namePrefix = '') {
    for (const [key, b] of this.map) {
      if (b.empty) continue;
      const mat = typeof materials === 'function' ? materials(key) : materials[key];
      if (!mat) { console.warn('[GeoBatch] no material for', key); continue; }
      group.add(b.mesh(mat, namePrefix + key));
    }
    return group;
  }
}

/** Dispose geometries/materials/textures under an object (for dev viewers / district reloads). */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose();
      m.dispose();
    }
  });
}
