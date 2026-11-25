// Painterly Ghibli-style meadow terrain shader, GPU-instanced wind-swept grass blades,
// cloud shadows, and wildflowers for Rongwan Coastal Hillside.
import * as THREE from 'three';
import { litMaterial } from '../core/materials.js';

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
  return mix(vec3(0.46, 0.64, 0.78), vec3(1.08, 1.05, 0.96), lit);
}

float meadowGust(vec2 xz, float t) {
  float w1 = sin(dot(xz, vec2(0.26, 0.44)) - t * 2.25 + 1.45 * mNoise(xz * 0.085));
  float w2 = sin(dot(xz, vec2(-0.18, 0.52)) - t * 3.05 + 0.90 * mNoise(xz * 0.16));
  return 0.62 * w1 + 0.28 * w2;
}
`;

export function patchNoise(x, z) {
  const a = 0.5 + 0.5 * Math.sin(x * 0.082 + Math.cos(z * 0.074) * 1.6);
  const b = 0.5 + 0.5 * Math.cos(z * 0.115 - x * 0.061 + 1.3);
  return 0.62 * a + 0.38 * b;
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
    const toWorld = (lx, ly, lz) => [sp.ox + lx * c + lz * s, ly, sp.oz - lx * s + lz * c];
    const nWorld = (lx, ly, lz) => [lx * c + lz * s, ly, -lx * s + lz * c];

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
    const [tx, ty, tz] = toWorld(0, sp.h, sp.curve);
    const [tnx, tny, tnz] = nWorld(0, 0.55, 0.83);
    pos.push(tx, ty, tz);
    nor.push(tnx, tny, tnz);
    bladeAttr.push(1.0, sp.phase);

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
  const flowerAttr = [];
  const idx = [];

  const pushV = (x, y, z, nx, ny, nz, h, part) => {
    const i = pos.length / 3;
    pos.push(x, y, z);
    nor.push(nx, ny, nz);
    flowerAttr.push(h, part);
    return i;
  };

  const stemH = 0.42;
  const s0 = pushV(-0.012, 0.0, 0.0, 0, 0.4, 0.9, 0.0, 0.0);
  const s1 = pushV(0.012, 0.0, 0.0, 0, 0.4, 0.9, 0.0, 0.0);
  const s2 = pushV(-0.009, stemH, 0.03, 0, 0.4, 0.9, 1.0, 0.0);
  const s3 = pushV(0.009, stemH, 0.03, 0, 0.4, 0.9, 1.0, 0.0);
  idx.push(s0, s1, s3, s0, s3, s2);

  const cx = 0, cy = stemH + 0.005, cz = 0.03;
  const centerIdx = pushV(cx, cy + 0.012, cz, 0, 1, 0, 1.0, 0.5);
  const ringR = 0.024;
  const ring = [];
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    ring.push(pushV(cx + Math.cos(a) * ringR, cy + 0.004, cz + Math.sin(a) * ringR, 0, 1, 0, 1.0, 0.5));
  }
  for (let p = 0; p < 5; p++) idx.push(centerIdx, ring[(p + 1) % 5], ring[p]);

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
