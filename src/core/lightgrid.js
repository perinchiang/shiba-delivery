// LightGrid: the neighborhood's street-level lighting, baked once into a top-down texture.
//
// A night street is lit by hundreds of signs and shop interiors - far too many for real-time
// lights. Instead every light source is described as an *emitter* and splatted (with 2D shadows
// cast by building footprints) into a world-aligned HDR texture. Every material created through
// core/materials.js samples this texture by world position, so roads, walls, props, the moped and
// pedestrians all pick up the coloured light of whatever they are next to - for free.
//
// Emitter description (plain object):
//   {
//     x, z,            // position in metres. Put it ~0.6 m IN FRONT of the wall it is mounted on,
//                      //   never inside a building footprint (it would be shadowed by its own wall).
//     x2, z2,          // optional: second end -> a linear emitter (shop opening, long lightbox)
//     y: 3,            // height of the source above the ground
//     color: 0xff5533, // hex (sRGB) or THREE.Color
//     intensity: 1,    // 1 = an ordinary lit shop sign; open shop interior 1.5-3; tiny LED 0.3
//     radius: 9,       // reach in metres (keep <= 16)
//     nx, nz,          // optional unit facing direction: light only goes to the front half-space
//   }
import * as THREE from 'three';

const BAKE_VERT = /* glsl */ `
attribute vec4 iSeg;      // ax, az, bx, bz
attribute vec3 iColor;    // linear rgb * intensity
attribute vec4 iParams;   // radius, height, nx, nz
uniform vec2 uOrigin;
uniform vec2 uInvSize;
varying vec2 vWorld;
varying vec4 vSeg;
varying vec3 vColor;
varying vec4 vParams;
void main() {
  vec2 lo = min(iSeg.xy, iSeg.zw) - iParams.x;
  vec2 hi = max(iSeg.xy, iSeg.zw) + iParams.x;
  vec2 w = mix(lo, hi, position.xy * 0.5 + 0.5);
  vWorld = w; vSeg = iSeg; vColor = iColor; vParams = iParams;
  gl_Position = vec4(((w - uOrigin) * uInvSize) * 2.0 - 1.0, 0.0, 1.0);
}`;

const BAKE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uOcc;
uniform vec2 uOrigin;
uniform vec2 uInvSize;
uniform int uMode;
varying vec2 vWorld;
varying vec4 vSeg;
varying vec3 vColor;
varying vec4 vParams;
void main() {
  vec2 a = vSeg.xy, b = vSeg.zw, p = vWorld;
  vec2 ab = b - a;
  float l2 = dot(ab, ab);
  float t = l2 > 1e-6 ? clamp(dot(p - a, ab) / l2, 0.0, 1.0) : 0.0;
  vec2 q = a + ab * t;
  vec2 pq = q - p;
  float d = length(pq);
  float r = vParams.x, h = max(vParams.y, 1.2);
  if (d >= r) discard;
  // cosine/inverse-square-ish falloff of a source at height h, windowed to reach 0 at r
  float fall = pow(h * h / (d * d + h * h), 1.15);
  float win = 1.0 - pow(d / r, 4.0);
  fall *= win * win;
  // facing: only the front half-space of the emitter receives light
  vec2 n = vParams.zw;
  if (dot(n, n) > 0.01) fall *= smoothstep(-0.7, 0.9, dot(p - q, n));
  // 2D shadows from building footprints
  float occ = 0.0;
  for (int i = 0; i < 16; i++) {
    vec2 s = p + pq * ((float(i) + 0.5) / 16.0 * 0.9);
    occ = max(occ, texture2D(uOcc, (s - uOrigin) * uInvSize).r);
  }
  fall *= 1.0 - occ;
  if (fall <= 0.0005) discard;
  if (uMode == 0) {
    gl_FragColor = vec4(vColor * fall, 1.0);
  } else {
    float lum = dot(vColor, vec3(0.3, 0.55, 0.15)) * fall;
    vec2 dir = d > 0.05 ? pq / d : vec2(0.0);
    gl_FragColor = vec4(dir * lum, vParams.y * lum, lum);
  }
}`;

function blackTexture() {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

/** Uniforms shared (by reference) with every world material. See core/materials.js. */
export const lightGridUniforms = {
  uLgTex: { value: blackTexture() },
  uLgDirTex: { value: blackTexture() },
  uLgOrigin: { value: new THREE.Vector2(0, 0) },
  uLgInvSize: { value: new THREE.Vector2(0, 0) },
  uLgGain: { value: 4.0 },
  uLgHeightFade: { value: 11.0 },
};

export class LightGrid {
  /**
   * bounds: { minX, maxX, minZ, maxZ } in metres. texelsPerMeter: resolution (2-3 is plenty).
   */
  constructor({ bounds, texelsPerMeter = 2.5 }) {
    this.bounds = bounds;
    this.w = Math.max(4, Math.round((bounds.maxX - bounds.minX) * texelsPerMeter));
    this.h = Math.max(4, Math.round((bounds.maxZ - bounds.minZ) * texelsPerMeter));
    const mk = () => new THREE.WebGLRenderTarget(this.w, this.h, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
    this.rt = mk();
    this.rtDir = mk();
    this.occCanvas = document.createElement('canvas');
    this.occCanvas.width = this.w; this.occCanvas.height = this.h;
    this.occTex = new THREE.CanvasTexture(this.occCanvas);
    this.occTex.flipY = false; // row 0 = minZ, so v maps straight to world z
    this.occTex.minFilter = this.occTex.magFilter = THREE.LinearFilter;
    this.occTex.generateMipmaps = false;
    this.setOccluders([]);
    this.emitters = [];
    this.origin = new THREE.Vector2(bounds.minX, bounds.minZ);
    this.invSize = new THREE.Vector2(1 / (bounds.maxX - bounds.minX), 1 / (bounds.maxZ - bounds.minZ));
  }

  /**
   * Building footprints that cast 2D light shadows: [{ x, z, hw, hd, rot=0 }] (the 'wall' collider
   * records from CollisionWorld work as-is). Footprints are shrunk by `erode` metres so facades
   * themselves stay lit.
   */
  setOccluders(boxes, erode = 0.7) {
    const ctx = this.occCanvas.getContext('2d');
    const b = this.bounds;
    const sx = this.w / (b.maxX - b.minX), sz = this.h / (b.maxZ - b.minZ);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#fff';
    for (const o of boxes) {
      const hw = o.hw - erode, hd = o.hd - erode;
      if (hw <= 0.2 || hd <= 0.2) continue;
      ctx.setTransform(sx, 0, 0, sz, (o.x - b.minX) * sx, (o.z - b.minZ) * sz);
      ctx.rotate(-(o.rot || 0));
      ctx.fillRect(-hw, -hd, hw * 2, hd * 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.occTex.needsUpdate = true;
  }

  /** Render all emitters into the grid and publish it to the shared material uniforms. */
  bake(renderer, emitters) {
    this.emitters = emitters;
    const n = emitters.length;
    const seg = new Float32Array(n * 4), col = new Float32Array(n * 3), par = new Float32Array(n * 4);
    const c = new THREE.Color();
    emitters.forEach((e, i) => {
      seg[i * 4] = e.x; seg[i * 4 + 1] = e.z;
      seg[i * 4 + 2] = e.x2 ?? e.x; seg[i * 4 + 3] = e.z2 ?? e.z;
      if (e.color && e.color.isColor) c.copy(e.color); else c.set(e.color ?? 0xffffff);
      const k = e.intensity ?? 1;
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
      par[i * 4] = Math.min(e.radius ?? 9, 24); par[i * 4 + 1] = e.y ?? 3;
      par[i * 4 + 2] = e.nx ?? 0; par[i * 4 + 3] = e.nz ?? 0;
    });
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('iSeg', new THREE.InstancedBufferAttribute(seg, 4));
    geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(col, 3));
    geo.setAttribute('iParams', new THREE.InstancedBufferAttribute(par, 4));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG,
      uniforms: { uOcc: { value: this.occTex }, uOrigin: { value: this.origin }, uInvSize: { value: this.invSize }, uMode: { value: 0 } },
      depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    const cam = new THREE.Camera();
    const prevRT = renderer.getRenderTarget();
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevAuto = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    for (let mode = 0; mode < 2; mode++) {
      mat.uniforms.uMode.value = mode;
      renderer.setRenderTarget(mode === 0 ? this.rt : this.rtDir);
      renderer.clear();
      if (n > 0) renderer.render(mesh, cam);
    }
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevColor, prevAlpha);
    renderer.autoClear = prevAuto;
    geo.dispose(); mat.dispose();
    this.publish();
  }

  /** Point the shared uniforms at this grid (done automatically by bake()). */
  publish() {
    lightGridUniforms.uLgTex.value = this.rt.texture;
    lightGridUniforms.uLgDirTex.value = this.rtDir.texture;
    lightGridUniforms.uLgOrigin.value.copy(this.origin);
    lightGridUniforms.uLgInvSize.value.copy(this.invSize);
  }

  dispose() { this.rt.dispose(); this.rtDir.dispose(); this.occTex.dispose(); }
}
