// Painterly Ghibli-style rolling meadow terrain, GPU-instanced wind-swept grass blades,
// cloud shadows, and clustered wildflowers for non-paddy countryside stretches.
import * as THREE from 'three';
import { litMaterial } from '../core/materials.js';
import { rngFrom } from '../core/rng.js';
import { centerZ, halfWidth, roadEnd } from './country-route.js';

export const meadowUniforms = {
  uMeadowTime: { value: 0 },
};

export function updateMeadowEnv(time) {
  meadowUniforms.uMeadowTime.value = time;
}

export const MEADOW_COMMON_GLSL = /* glsl */ `
uniform float uMeadowTime;

float mHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float mNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mHash(i), mHash(i + vec2(1.0, 0.0)), f.x),
    mix(mHash(i + vec2(0.0, 1.0)), mHash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

vec3 meadowTint(vec2 xz) {
  float nBroad = mNoise(xz * 0.026 + vec2(2.3, 5.1));
  float nMed   = mNoise(xz * 0.078 + vec2(11.4, 3.7));
  float nFine  = mNoise(xz * 0.42  + vec2(7.1, 14.2));
  float blend  = clamp(nBroad * 0.62 + nMed * 0.38, 0.0, 1.0);

  // Linear-sRGB meadow tones harmonized with morning lighting & country road verge
  vec3 coolLush = vec3(0.082, 0.305, 0.062);
  vec3 midLush  = vec3(0.165, 0.430, 0.068);
  vec3 warmSun  = vec3(0.268, 0.520, 0.075);

  vec3 col = mix(coolLush, midLush, smoothstep(0.18, 0.58, blend));
  col = mix(col, warmSun, smoothstep(0.54, 0.88, blend));
  col *= mix(0.92, 1.07, nFine);
  return col;
}

vec3 meadowCloudShadow(vec2 xz, float t) {
  vec2 cuv = xz * 0.022 + t * vec2(0.022, 0.013);
  float c = 0.65 * mNoise(cuv) + 0.35 * mNoise(cuv * 2.15 + vec2(7.3, 4.9));
  float lit = smoothstep(0.36, 0.64, c);
  return mix(vec3(0.42, 0.62, 0.76), vec3(1.10, 1.06, 0.96), lit);
}

float meadowGust(vec2 xz, float t) {
  float w1 = sin(dot(xz, vec2(0.26, 0.44)) - t * 2.25 + 1.45 * mNoise(xz * 0.085));
  float w2 = sin(dot(xz, vec2(-0.18, 0.52)) - t * 3.05 + 0.90 * mNoise(xz * 0.16));
  return 0.62 * w1 + 0.28 * w2;
}
`;

function smoothstep(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Deterministic rolling Ghibli hillside elevation outside the flat road & cottage belt.
export function meadowHeight(x, z) {
  const isBackdrop = x > roadEnd;
  const refX = isBackdrop ? roadEnd : x;
  const cz = centerZ(refX);
  const hw = halfWidth(refX);
  const edgeLat = Math.max(0, Math.abs(z - cz) - (hw + 1.65));

  // Keep cottages, yards, and roadside trees safely grounded (-0.22) up to 23m from skirt.
  const latRise = smoothstep(23, 76, edgeLat);
  const backRise = isBackdrop ? smoothstep(1238, 1304, x) : 0;
  const hillMask = Math.max(latRise, backRise);

  // Fade hills down smoothly before crossing / paddy transitions so chunks meet seamlessly.
  const fadeX = x < 500
    ? smoothstep(136, 154, x) * (1 - smoothstep(178, 196, x))
    : smoothstep(1068, 1094, x);

  const swell = 0.55 + 0.45 * Math.sin(x * 0.026 + Math.cos(z * 0.021) * 1.4);
  const undul = 0.50 + 0.50 * Math.cos(z * 0.029 - x * 0.017 + Math.sin(x * 0.014) * 1.6);
  const ridge = 1.6 + 5.8 * swell + 4.8 * undul;

  return -0.22 + ridge * hillMask * fadeX;
}

// Exact Y height on road verge (hw + 0.68 .. hw + 1.65) or meadow terrain beyond.
function groundYAt(x, z) {
  const refX = Math.min(x, roadEnd);
  const cz = centerZ(refX);
  const hw = halfWidth(refX);
  const d = Math.abs(z - cz);
  if (x <= roadEnd && d < hw + 1.68) {
    const t = THREE.MathUtils.clamp((d - (hw + 0.68)) / 1.07, 0, 1);
    return THREE.MathUtils.lerp(-0.025, -0.22, t);
  }
  return meadowHeight(x, z);
}

function meadowIntervals(start, end) {
  const out = [];
  const wLo = Math.max(start, 136);
  const wHi = Math.min(end, 196);
  if (wLo < wHi) out.push([wLo, wHi]);

  const eLo = Math.max(start, 1068);
  const eHi = Math.min(end, roadEnd);
  if (eLo < eHi) out.push([eLo, eHi]);
  return out;
}

let terrainMat;
let grassMat;
let flowerMat;
let sharedGrassGeo;
let sharedFlowerGeo;

export function getTerrainMaterial() {
  if (terrainMat) return terrainMat;
  terrainMat = litMaterial({ grid: false, roughness: 0.95 });
  const prev = terrainMat.onBeforeCompile;
  terrainMat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uMeadowTime = meadowUniforms.uMeadowTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMeadowXZ;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vMeadowXZ = (modelMatrix * vec4(position, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMeadowXZ;\n' + MEADOW_COMMON_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = meadowTint(vMeadowXZ) * meadowCloudShadow(vMeadowXZ, uMeadowTime);`);
  };
  terrainMat.customProgramCacheKey = () => 'rongwan-meadow-terrain-v1';
  return terrainMat;
}

export function getGrassMaterial() {
  if (grassMat) return grassMat;
  grassMat = litMaterial({ grid: false, roughness: 0.86, side: THREE.DoubleSide });
  const prev = grassMat.onBeforeCompile;
  grassMat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uMeadowTime = meadowUniforms.uMeadowTime;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aBlade;
        varying vec2 vMeadowXZ;
        varying float vBladeH;
        varying float vGust;
        ` + MEADOW_COMMON_GLSL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBladeH = aBlade.x;
        #ifdef USE_INSTANCING
          vec4 rootW = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vMeadowXZ = rootW.xz;
          float gust = meadowGust(vMeadowXZ, uMeadowTime + aBlade.y * 0.45);
          float flutter = 0.07 * sin(uMeadowTime * 4.4 + vMeadowXZ.x * 1.9 + vMeadowXZ.y * 1.4 + aBlade.y * 6.2831);
          vGust = gust;
          float flex = vBladeH * vBladeH;
          vec2 dispXZ = vec2(0.76, 0.65) * ((0.10 + 0.19 * gust + flutter) * flex);
          vec2 col0 = instanceMatrix[0].xz;
          vec2 col2 = instanceMatrix[2].xz;
          transformed.x += dot(col0, dispXZ) / max(dot(col0, col0), 1e-4);
          transformed.z += dot(col2, dispXZ) / max(dot(col2, col2), 1e-4);
          transformed.y -= 0.16 * length(dispXZ) * flex;
        #else
          vMeadowXZ = position.xz;
          vGust = 0.0;
        #endif`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vMeadowXZ;
        varying float vBladeH;
        varying float vGust;
        ` + MEADOW_COMMON_GLSL)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        // Keep DoubleSide blade shading cohesive & bright from every angle (undo back-face inversion toward ground)
        vec3 upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        normal = normalize(mix(normal * faceDirection, upView, 0.84));`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 cloud = meadowCloudShadow(vMeadowXZ, uMeadowTime);
        vec3 baseCol = meadowTint(vMeadowXZ) * cloud;
        vec3 rootCol = baseCol * 0.94;
        vec3 tipCol  = baseCol * vec3(1.52, 1.46, 0.90) + vec3(0.088, 0.130, 0.010) * cloud;
        float hMix = smoothstep(0.04, 0.90, vBladeH);
        diffuseColor.rgb = mix(rootCol, tipCol, hMix);
        float sheen = smoothstep(-0.20, 0.80, vGust) * smoothstep(0.22, 0.88, vBladeH);
        diffuseColor.rgb *= mix(0.94, 1.24, sheen);`);
  };
  grassMat.customProgramCacheKey = () => 'rongwan-meadow-grass-v1';
  return grassMat;
}

export function getFlowerMaterial() {
  if (flowerMat) return flowerMat;
  flowerMat = litMaterial({ grid: false, roughness: 0.78, side: THREE.DoubleSide });
  const prev = flowerMat.onBeforeCompile;
  flowerMat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uMeadowTime = meadowUniforms.uMeadowTime;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aFlower;
        attribute vec3 aPetalTint;
        varying vec2 vMeadowXZ;
        varying float vFlowH;
        varying float vPart;
        varying vec3 vPetalTint;
        ` + MEADOW_COMMON_GLSL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFlowH = aFlower.x;
        vPart = aFlower.y;
        vPetalTint = aPetalTint;
        #ifdef USE_INSTANCING
          vec4 rootW = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vMeadowXZ = rootW.xz;
          float gust = meadowGust(vMeadowXZ, uMeadowTime);
          float flex = vFlowH * vFlowH;
          vec2 dispXZ = vec2(0.76, 0.65) * ((0.09 + 0.17 * gust) * flex);
          vec2 col0 = instanceMatrix[0].xz;
          vec2 col2 = instanceMatrix[2].xz;
          transformed.x += dot(col0, dispXZ) / max(dot(col0, col0), 1e-4);
          transformed.z += dot(col2, dispXZ) / max(dot(col2, col2), 1e-4);
          transformed.y -= 0.14 * length(dispXZ) * flex;
        #else
          vMeadowXZ = position.xz;
        #endif`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vMeadowXZ;
        varying float vFlowH;
        varying float vPart;
        varying vec3 vPetalTint;
        ` + MEADOW_COMMON_GLSL)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        vec3 upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        normal = normalize(mix(normal * faceDirection, upView, 0.68));`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 cloud = meadowCloudShadow(vMeadowXZ, uMeadowTime);
        vec3 stemCol = mix(meadowTint(vMeadowXZ) * 0.85, vec3(0.18, 0.44, 0.08), vFlowH) * cloud;
        vec3 centerCol = vec3(0.92, 0.62, 0.04) * cloud;
        vec3 petalCol = vPetalTint * cloud;
        vec3 col = vPart < 0.25 ? stemCol : (vPart < 0.75 ? centerCol : petalCol);
        diffuseColor.rgb = col;`);
  };
  flowerMat.customProgramCacheKey = () => 'rongwan-meadow-flower-v1';
  return flowerMat;
}

export function getGrassGeometry() {
  if (sharedGrassGeo) return sharedGrassGeo;

  const pos = [];
  const nor = [];
  const bladeAttr = [];
  const idx = [];

  // Three asymmetric graceful curved blades per tuft (15 triangles total)
  const specs = [
    { ox: 0.0, oz: 0.0, rot: 0.0, h: 0.52, w: 0.115, curve: 0.24, phase: 0.0 },
    { ox: 0.11, oz: -0.055, rot: 2.05, h: 0.43, w: 0.102, curve: 0.21, phase: 0.33 },
    { ox: -0.095, oz: 0.085, rot: 4.18, h: 0.35, w: 0.095, curve: 0.18, phase: 0.67 },
  ];
  const rows = [
    { t: 0.0, w: 1.0 },
    { t: 0.36, w: 0.74 },
    { t: 0.72, w: 0.40 },
  ];

  for (const sp of specs) {
    const c = Math.cos(sp.rot), s = Math.sin(sp.rot);
    const toWorld = (lx, ly, lz) => [
      sp.ox + lx * c + lz * s,
      ly,
      sp.oz - lx * s + lz * c,
    ];
    const nWorld = (lx, ly, lz) => [
      lx * c + lz * s,
      ly,
      -lx * s + lz * c,
    ];

    const base = pos.length / 3;
    for (const r of rows) {
      const y = sp.h * r.t;
      const z = sp.curve * r.t * r.t;
      const hw = sp.w * 0.5 * r.w;
      const [nx, ny, nz] = nWorld(0, 0.45, 0.89);
      for (const side of [-1, 1]) {
        const [px, py, pz] = toWorld(side * hw, y, z + Math.abs(side) * 0.008);
        pos.push(px, py, pz);
        nor.push(nx, ny, nz);
        bladeAttr.push(r.t, sp.phase);
      }
    }
    // Tip vertex
    const [tx, ty, tz] = toWorld(0, sp.h, sp.curve);
    const [tnx, tny, tnz] = nWorld(0, 0.55, 0.83);
    pos.push(tx, ty, tz);
    nor.push(tnx, tny, tnz);
    bladeAttr.push(1.0, sp.phase);

    // 2 quads + 1 top triangle = 5 tris
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
    idx.push(base + 2, base + 3, base + 5, base + 2, base + 5, base + 4);
    idx.push(base + 4, base + 5, base + 6);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aBlade', new THREE.Float32BufferAttribute(bladeAttr, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  sharedGrassGeo = geo;
  return geo;
}

export function getFlowerGeometry() {
  if (sharedFlowerGeo) return sharedFlowerGeo;

  const pos = [];
  const nor = [];
  const flowerAttr = []; // [heightNorm, part: 0=stem, 0.5=center, 1=petal]
  const idx = [];

  const pushV = (x, y, z, nx, ny, nz, h, part) => {
    const i = pos.length / 3;
    pos.push(x, y, z);
    nor.push(nx, ny, nz);
    flowerAttr.push(h, part);
    return i;
  };

  // Slender stem (cross-strip or ribbon) rising to y = 0.42
  const stemH = 0.42;
  const s0 = pushV(-0.012, 0.0, 0.0, 0, 0.4, 0.9, 0.0, 0.0);
  const s1 = pushV(0.012, 0.0, 0.0, 0, 0.4, 0.9, 0.0, 0.0);
  const s2 = pushV(-0.009, stemH, 0.03, 0, 0.4, 0.9, 1.0, 0.0);
  const s3 = pushV(0.009, stemH, 0.03, 0, 0.4, 0.9, 1.0, 0.0);
  idx.push(s0, s1, s3, s0, s3, s2);

  // Cupped 5-petal blossom centered at (0, stemH, 0.03) tilted slightly upward/outward
  const cx = 0, cy = stemH + 0.005, cz = 0.03;
  const centerIdx = pushV(cx, cy + 0.012, cz, 0, 1, 0, 1.0, 0.5);
  const ringR = 0.024;
  const ring = [];
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    ring.push(pushV(cx + Math.cos(a) * ringR, cy + 0.004, cz + Math.sin(a) * ringR, 0, 1, 0, 1.0, 0.5));
  }
  for (let p = 0; p < 5; p++) {
    idx.push(centerIdx, ring[(p + 1) % 5], ring[p]);
  }

  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    const da = 0.42;
    const ca = Math.cos(a), sa = Math.sin(a);
    const pBase = pushV(cx + ca * 0.014, cy, cz + sa * 0.014, 0, 1, 0, 1.0, 1.0);
    const pL = pushV(cx + Math.cos(a - da) * 0.068, cy + 0.018, cz + Math.sin(a - da) * 0.068, 0, 1, 0, 1.0, 1.0);
    const pTip = pushV(cx + ca * 0.095, cy + 0.024, cz + sa * 0.095, 0, 1, 0, 1.0, 1.0);
    const pR = pushV(cx + Math.cos(a + da) * 0.068, cy + 0.018, cz + Math.sin(a + da) * 0.068, 0, 1, 0, 1.0, 1.0);
    idx.push(pBase, pTip, pL, pBase, pR, pTip);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aFlower', new THREE.Float32BufferAttribute(flowerAttr, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  sharedFlowerGeo = geo;
  return geo;
}

function buildMeadowTerrain(group, lo, hi) {
  const xs = [];
  const step = 2.5;
  for (let x = lo; x < hi - 0.01; x += step) xs.push(x);
  xs.push(hi);

  const dists = [0, 1.5, 4, 7.5, 12, 17, 23, 30, 39, 50, 64, 82, 105, 135, 172, 215];
  const cols = dists.length;
  const rows = xs.length;
  const eps = 0.6;

  for (const side of [-1, 1]) {
    const pos = new Float32Array(rows * cols * 3);
    const nor = new Float32Array(rows * cols * 3);
    const indices = [];

    for (let r = 0; r < rows; r++) {
      const x = xs[r];
      const cz = centerZ(x);
      const skirt = halfWidth(x) + 1.65;

      for (let c = 0; c < cols; c++) {
        const d = dists[c];
        const z = cz + side * (skirt + d);
        const y = meadowHeight(x, z);

        // Smooth analytical finite-difference normal so adjacent chunks match seamlessly
        const hx = (meadowHeight(x + eps, z) - meadowHeight(x - eps, z)) / (2 * eps);
        const hz = (meadowHeight(x, z + eps) - meadowHeight(x, z - eps)) / (2 * eps);
        const len = Math.hypot(hx, 1, hz) || 1;

        const v = (r * cols + c) * 3;
        pos[v] = x;
        pos[v + 1] = y;
        pos[v + 2] = z;
        nor[v] = -hx / len;
        nor[v + 1] = 1 / len;
        nor[v + 2] = -hz / len;
      }
    }

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        if (side > 0) indices.push(a, b, d, b, e, d);
        else indices.push(a, d, b, b, d, e);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, getTerrainMaterial());
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }
}

function buildBackdropTerrain(group, lo, hi) {
  const xs = [];
  const step = 4.0;
  for (let x = lo; x < hi - 0.01; x += step) xs.push(x);
  xs.push(hi);

  const cz = centerZ(roadEnd);
  const skirt = halfWidth(roadEnd) + 1.65;
  const dists = [0, 1.5, 4, 7.5, 12, 17, 23, 30, 39, 50, 64, 82, 105, 135, 172, 215];
  const offs = [
    ...dists.slice().reverse().map(d => -(skirt + d)),
    0,
    ...dists.map(d => skirt + d),
  ];
  const cols = offs.length;
  const rows = xs.length;
  const eps = 0.6;
  const pos = new Float32Array(rows * cols * 3);
  const nor = new Float32Array(rows * cols * 3);
  const indices = [];

  for (let r = 0; r < rows; r++) {
    const x = xs[r];
    for (let c = 0; c < cols; c++) {
      const z = cz + offs[c];
      const y = meadowHeight(x, z);
      const hx = (meadowHeight(x + eps, z) - meadowHeight(x - eps, z)) / (2 * eps);
      const hz = (meadowHeight(x, z + eps) - meadowHeight(x, z - eps)) / (2 * eps);
      const len = Math.hypot(hx, 1, hz) || 1;
      const v = (r * cols + c) * 3;
      pos[v] = x;
      pos[v + 1] = y;
      pos[v + 2] = z;
      nor[v] = -hx / len;
      nor[v + 1] = 1 / len;
      nor[v + 2] = -hz / len;
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, getTerrainMaterial());
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  group.add(mesh);
}

function isExcluded(x, z, excludeRects) {
  for (let i = 0; i < excludeRects.length; i++) {
    const r = excludeRects[i];
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return true;
  }
  return false;
}

// Smooth deterministic organic clumping factor (0..1) in world XZ
export function patchNoise(x, z) {
  return 0.5 + 0.5 * Math.sin(x * 0.14 + Math.cos(z * 0.17) * 1.6) * Math.cos(z * 0.13 - Math.sin(x * 0.11) * 1.3);
}

function buildStylizedGrassAndFlowers(group, lo, hi, excludeRects) {
  const span = hi - lo;
  if (span <= 0) return;

  const rng = rngFrom('吉卜力草地', lo);
  const nearTarget = Math.round(span * 185); // Lush dense foreground carpet near road & yards
  const midTarget = Math.round(span * 52);   // Sweeping hillside grass waves

  const grassTransforms = [];
  const dummy = new THREE.Object3D();

  const tryPlaceGrass = (px, pz, distFromRoad, isHill) => {
    if (isExcluded(px, pz, excludeRects)) return;
    const clumping = patchNoise(px, pz);
    // Keep foreground dense; occasionally leave subtle breathing variation on hill slopes
    if (isHill && clumping < 0.20 && rng.chance(0.45)) return;

    const py = groundYAt(px, pz) - 0.025;
    const vergeFade = smoothstep(0.75, 1.70, distFromRoad);
    const heightMul = THREE.MathUtils.lerp(0.52, 1.0, vergeFade) * (0.76 + 0.56 * clumping) * (isHill ? 1.45 : 1.0);
    const widthMul = (isHill ? 1.50 : 1.06) * rng.range(0.90, 1.24);

    dummy.position.set(px, py, pz);
    dummy.rotation.set(rng.range(-0.10, 0.10), rng.range(0, Math.PI * 2), rng.range(-0.10, 0.10));
    dummy.scale.set(widthMul, heightMul * rng.range(0.84, 1.18), widthMul);
    dummy.updateMatrix();
    grassTransforms.push(dummy.matrix.clone());
  };

  // 1. Dense foreground belt hugging the road verge and cottage yards (0.8m .. 14.5m from road)
  const grassEndX = Math.min(hi, 1265);
  const grassSpan = Math.max(0, grassEndX - lo);
  if (grassSpan > 0) {
    for (let i = 0; i < nearTarget; i++) {
      const px = lo + rng.next() * grassSpan;
      const refX = Math.min(px, roadEnd);
      const cz = centerZ(refX);
      const hw = halfWidth(refX);
      const side = rng.sign();
      // Concentrate heavily in the 0.8m..10m roadside & yard strip
      const u = rng.next();
      const distFromRoad = px > roadEnd
        ? -2.0 + u * 18.5
        : 0.78 + Math.pow(u, 1.75) * 14.5;
      const pz = px > roadEnd ? cz + (rng.next() * 2 - 1) * 28 : cz + side * (hw + distFromRoad);
      tryPlaceGrass(px, pz, Math.abs(distFromRoad), false);
    }

    // 2. Mid-range rolling hillside tufts (14.5m .. 54m) to carry wind waves onto the slopes
    for (let i = 0; i < midTarget; i++) {
      const px = lo + rng.next() * grassSpan;
      const refX = Math.min(px, roadEnd);
      const cz = centerZ(refX);
      const hw = halfWidth(refX);
      const side = rng.sign();
      const distFromRoad = 14.5 + Math.pow(rng.next(), 1.25) * 40.0;
      const pz = cz + side * (hw + distFromRoad);
      tryPlaceGrass(px, pz, distFromRoad, true);
    }
  }

  if (grassTransforms.length > 0) {
    const grassMesh = new THREE.InstancedMesh(getGrassGeometry(), getGrassMaterial(), grassTransforms.length);
    for (let i = 0; i < grassTransforms.length; i++) {
      grassMesh.setMatrixAt(i, grassTransforms[i]);
    }
    grassMesh.instanceMatrix.needsUpdate = true;
    grassMesh.castShadow = false;
    grassMesh.receiveShadow = true;
    grassMesh.computeBoundingSphere();
    group.add(grassMesh);
  }

  // 3. Clustered wildflowers in foreground meadow patches
  const flowerTarget = Math.round(grassSpan * 13.5);
  const flowerTransforms = [];
  const flowerColors = [];
  const palette = [
    new THREE.Color(0xfff8e6), // Cream white daisy
    new THREE.Color(0x8e86e8), // Meadow periwinkle violet
    new THREE.Color(0xffe169), // Warm buttercup
    new THREE.Color(0xb6c8f8), // Soft sky flower
  ];

  for (let i = 0; i < flowerTarget; i++) {
    const px = lo + rng.next() * grassSpan;
    const refX = Math.min(px, roadEnd);
    const cz = centerZ(refX);
    const hw = halfWidth(refX);
    const side = rng.sign();
    const distFromRoad = 1.00 + Math.pow(rng.next(), 1.50) * 14.0;
    const pz = px > roadEnd ? cz + (rng.next() * 2 - 1) * 24 : cz + side * (hw + distFromRoad);
    if (isExcluded(px, pz, excludeRects)) continue;

    // Organic flower drift clustering so blooms appear in natural drifts rather than uniform grid
    const cluster = patchNoise(px * 0.85 + 17.0, pz * 0.85 - 9.0);
    if (cluster < 0.40 && rng.chance(0.80)) continue;

    const py = groundYAt(px, pz) - 0.02;
    const sc = rng.range(0.85, 1.42) * (0.72 + 0.42 * smoothstep(1.0, 2.5, distFromRoad));
    dummy.position.set(px, py, pz);
    dummy.rotation.set(rng.range(-0.14, 0.14), rng.range(0, Math.PI * 2), rng.range(-0.14, 0.14));
    dummy.scale.set(sc, sc * rng.range(0.66, 1.18), sc);
    dummy.updateMatrix();
    flowerTransforms.push(dummy.matrix.clone());

    const roll = rng.next();
    const c = roll < 0.44 ? palette[0] : roll < 0.78 ? palette[1] : roll < 0.92 ? palette[2] : palette[3];
    flowerColors.push(c);
  }

  if (flowerTransforms.length > 0) {
    const fGeo = getFlowerGeometry().clone();
    const tintArray = new Float32Array(flowerTransforms.length * 3);
    for (let i = 0; i < flowerColors.length; i++) {
      tintArray[i * 3] = flowerColors[i].r;
      tintArray[i * 3 + 1] = flowerColors[i].g;
      tintArray[i * 3 + 2] = flowerColors[i].b;
    }
    fGeo.setAttribute('aPetalTint', new THREE.InstancedBufferAttribute(tintArray, 3));

    const flowerMesh = new THREE.InstancedMesh(fGeo, getFlowerMaterial(), flowerTransforms.length);
    for (let i = 0; i < flowerTransforms.length; i++) {
      flowerMesh.setMatrixAt(i, flowerTransforms[i]);
    }
    flowerMesh.instanceMatrix.needsUpdate = true;
    flowerMesh.castShadow = false;
    flowerMesh.receiveShadow = true;
    flowerMesh.computeBoundingSphere();
    group.add(flowerMesh);
  }
}

export function addStylizedMeadow(group, start, end, excludeRects = []) {
  for (const [lo, hi] of meadowIntervals(start, end)) {
    buildMeadowTerrain(group, lo, hi);
    buildStylizedGrassAndFlowers(group, lo, hi, excludeRects);
  }
  if (start < roadEnd && end >= roadEnd) {
    buildBackdropTerrain(group, roadEnd, 1360);
    buildStylizedGrassAndFlowers(group, roadEnd, 1265, excludeRects);
  }
}
