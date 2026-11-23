// Rolling Ghibli hillside village vertical slice (Style A: Soft Storybook):
// Low sunlit wildflower meadow valley -> winding S-curve dirt lane climb with
// timber guardrails & hanging-lantern signpost -> unified terracotta-red-roof
// Ghibli cottages (recessed windows, stone plinths) & rotating coastal windmill
// landmark overlooking a serene coastal bay.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder } from '../core/geo.js';
import { litMaterial } from '../core/materials.js';
import { RNG } from '../core/rng.js';
import { makeCanvas, canvasTexture, fbm2D } from '../core/textures.js';
import { clamp, lerp, smoothstep } from '../core/mathx.js';
import { CURB_H } from './street-layout.js';
import {
  MEADOW_COMMON_GLSL,
  meadowUniforms,
  getTerrainMaterial,
  getGrassMaterial,
  getGrassGeometry,
  getFlowerMaterial,
  getFlowerGeometry,
  patchNoise,
} from './stylized-meadow.js';
import { placeStylizedTrees } from './stylized-trees.js';

export const COASTAL_SAMPLE = { x: 260, z: -320 };
const CX = COASTAL_SAMPLE.x;
const CZ = COASTAL_SAMPLE.z;

const HALF_EXTENT = 122;
const ROAD_HALF = 2.90;
const BAY_WATER_Y = -1.35;

// ==============================================================================
// Parametric winding valley-to-hilltop road spline (relative to CX, CZ)
// ==============================================================================
const ROAD_KNOTS = [
  [-6, 88, 0.00],    // K0: Valley meadow start
  [8, 62, 0.28],     // K1: Gentle valley sweep
  [28, 36, 1.35],    // K2: Bend toward hill foot (signpost)
  [32, 6, 4.10],     // K3: Begin steady climb
  [14, -22, 8.15],   // K4: Mid-slope climb past lower cottages
  [-8, -42, 11.40],  // K5: Entering hilltop village terrace
  [-26, -54, 12.60], // K6: Windmill plaza terrace
  [-16, -74, 12.90], // K7: Northern overlook loop
];

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1)
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function buildRoadSamples() {
  const raw = [];
  const segsPerSpan = 28;
  const n = ROAD_KNOTS.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ROAD_KNOTS[Math.max(0, i - 1)];
    const p1 = ROAD_KNOTS[i];
    const p2 = ROAD_KNOTS[i + 1];
    const p3 = ROAD_KNOTS[Math.min(n - 1, i + 2)];
    const steps = i === n - 2 ? segsPerSpan + 1 : segsPerSpan;
    for (let k = 0; k < steps; k++) {
      const t = k / segsPerSpan;
      raw.push({
        x: CX + catmullRom(p0[0], p1[0], p2[0], p3[0], t),
        z: CZ + catmullRom(p0[1], p1[1], p2[1], p3[1], t),
        y: catmullRom(p0[2], p1[2], p2[2], p3[2], t),
      });
    }
  }
  let s = 0;
  for (let i = 0; i < raw.length; i++) {
    const prev = raw[Math.max(0, i - 1)];
    const next = raw[Math.min(raw.length - 1, i + 1)];
    if (i > 0) {
      s += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
    }
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const dy = next.y - prev.y;
    const hLen = Math.hypot(dx, dz) || 1;
    raw[i].s = s;
    raw[i].tx = dx / hLen;
    raw[i].tz = dz / hLen;
    raw[i].nx = -raw[i].tz; // Left perpendicular in XZ
    raw[i].nz = raw[i].tx;
    raw[i].slope = dy / Math.hypot(next.x - prev.x, next.z - prev.z || 1);
  }
  return raw;
}

const ROAD_SAMPLES = buildRoadSamples();
const ROAD_TOTAL_S = ROAD_SAMPLES[ROAD_SAMPLES.length - 1].s;

export function hillRoadPoint(sTarget) {
  const s = clamp(sTarget, 0, ROAD_TOTAL_S);
  for (let i = 1; i < ROAD_SAMPLES.length; i++) {
    const a = ROAD_SAMPLES[i - 1];
    const b = ROAD_SAMPLES[i];
    if (s <= b.s || i === ROAD_SAMPLES.length - 1) {
      const u = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
      return {
        x: lerp(a.x, b.x, u),
        z: lerp(a.z, b.z, u),
        y: lerp(a.y, b.y, u),
        tx: lerp(a.tx, b.tx, u),
        tz: lerp(a.tz, b.tz, u),
        nx: lerp(a.nx, b.nx, u),
        nz: lerp(a.nz, b.nz, u),
        slope: lerp(a.slope, b.slope, u),
        yaw: Math.atan2(lerp(a.tx, b.tx, u), lerp(a.tz, b.tz, u)),
        s,
      };
    }
  }
  return { ...ROAD_SAMPLES[0], yaw: Math.atan2(ROAD_SAMPLES[0].tx, ROAD_SAMPLES[0].tz) };
}

function nearestRoadInfo(x, z) {
  let bestDistSq = Infinity;
  let bestY = 0;
  let bestS = 0;
  let bestX = x;
  let bestZ = z;
  for (let i = 0; i < ROAD_SAMPLES.length - 1; i++) {
    const a = ROAD_SAMPLES[i];
    const b = ROAD_SAMPLES[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const abSq = abx * abx + abz * abz;
    const t = abSq > 1e-6 ? clamp(((x - a.x) * abx + (z - a.z) * abz) / abSq, 0, 1) : 0;
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestY = lerp(a.y, b.y, t);
      bestS = lerp(a.s, b.s, t);
      bestX = px;
      bestZ = pz;
    }
  }
  return {
    dist: Math.sqrt(bestDistSq),
    roadY: bestY,
    s: bestS,
    px: bestX,
    pz: bestZ,
  };
}

// ==============================================================================
// Unified red-terracotta village layout & hilltop rotating windmill
// ==============================================================================
// House coordinates (world offset from CX, CZ), radius for grass/pad grading, padY computed after terrain def
const BUILDING_SPECS = [
  // Hero Windmill on highest hilltop ridge crest facing SSE down the valley
  { kind: 'windmill', mesh: 'Ghibli_Windmill_Tower', dx: -16, dz: -58, rotY: 0.28, halfW: 3.4, halfD: 3.4, padR: 5.5, baseY: 13.0 },
  // Hilltop Windmill Plaza Cottages (Cluster A)
  { kind: 'cottage', mesh: 'Ghibli_Cottage_B', dx: -28, dz: -42, rotY: 0.65, halfW: 4.5, halfD: 3.3, padR: 5.2, baseY: 12.1 },
  { kind: 'cottage', mesh: 'Ghibli_Cottage_A', dx: -39, dz: -54, rotY: 1.05, halfW: 3.9, halfD: 3.0, padR: 4.8, baseY: 12.6 },
  { kind: 'cottage', mesh: 'Ghibli_Cottage_C', dx: -2, dz: -52, rotY: -0.35, halfW: 3.1, halfD: 2.9, padR: 4.6, baseY: 12.2 },
  { kind: 'cottage', mesh: 'Ghibli_Cottage_A', dx: 2, dz: -30, rotY: -0.75, halfW: 3.9, halfD: 3.0, padR: 4.8, baseY: 9.8 },
  { kind: 'cottage', mesh: 'Ghibli_Cottage_B', dx: 20, dz: -38, rotY: -0.45, halfW: 4.5, halfD: 3.3, padR: 5.2, baseY: 9.4 },
  { kind: 'cottage', mesh: 'Ghibli_Cottage_C', dx: -2, dz: -74, rotY: 0.15, halfW: 3.1, halfD: 2.9, padR: 4.6, baseY: 12.9 },
  // Mid-slope climbing cluster flanking the uphill bend (Cluster B)
  { kind: 'cottage', mesh: 'Ghibli_Cottage_A', dx: 38, dz: -14, rotY: -1.25, halfW: 3.9, halfD: 3.0, padR: 4.8, baseY: 7.2 },
  { kind: 'cottage', mesh: 'Ghibli_Cottage_C', dx: 48, dz: 10, rotY: -1.45, halfW: 3.1, halfD: 2.9, padR: 4.6, baseY: 4.8 },
  { kind: 'cottage', mesh: 'Ghibli_Cottage_A', dx: 44, dz: 32, rotY: -2.15, halfW: 3.9, halfD: 3.0, padR: 4.8, baseY: 2.6 },
];

// Natural continuous hillside topography before road/terrace grading
function naturalHillHeight(dx, dz) {
  // Smooth south valley rise toward northern windmill ridge
  const hillMask = smoothstep(55.0, -32.0, dz);
  const eastRise = smoothstep(-28.0, 95.0, dx) * 4.6;
  const swell = 0.55 + 0.45 * Math.sin(dx * 0.030 + Math.cos(dz * 0.024) * 1.25);
  const undul = 0.50 + 0.50 * Math.cos(dz * 0.028 - dx * 0.018 + 0.6);

  // Broad windmill ridge crest centered around (-12, -58)
  const ridgeDist = Math.hypot((dx + 12) * 0.72, (dz + 58) * 1.05);
  const windmillCrest = (1.0 - smoothstep(10.0, 72.0, ridgeDist)) * 12.6;

  // Far northern & eastern backdrop hills for scenic horizon depth
  const backBackdrop = smoothstep(-58.0, -118.0, dz) * (5.2 + 3.0 * swell);
  const valleyRoll = 0.5 + 2.4 * swell + 2.0 * undul;
  let h = valleyRoll * (0.35 + 0.65 * hillMask) + windmillCrest * 0.85 + eastRise * 0.65 + backBackdrop;

  // Keep valley entrance around K0 [-6, 88] low & flat
  const entranceFlat = 1.0 - smoothstep(18.0, 56.0, Math.hypot(dx + 4, dz - 78));
  h = lerp(h, 0.25 * swell, entranceFlat * 0.85);

  // Coastal bay basin carved gently into the west/northwest flank (dx < -28, dz in [-48..52])
  const bayMaskX = 1.0 - smoothstep(-95.0, -28.0, Math.abs(dx + 72) > 46 ? -10 : dx);
  const bayShape = (1.0 - smoothstep(16.0, 52.0, Math.hypot((dx + 74) * 0.85, (dz - 4) * 0.72)));
  const bayDip = Math.max(bayShape, bayMaskX * 0.45 * (1.0 - smoothstep(15.0, 64.0, Math.abs(dz - 5))));
  h -= bayDip * 5.2;

  return h;
}

export function coastalHillHeight(x, z) {
  const dx = x - CX;
  const dz = z - CZ;
  let y = naturalHillHeight(dx, dz);

  // Grade cottage & windmill terrace pads smoothly into the slope
  for (const b of BUILDING_SPECS) {
    const d = Math.hypot(dx - b.dx, dz - b.dz);
    if (d < b.padR + 7.5) {
      const w = 1.0 - smoothstep(b.padR, b.padR + 7.5, d);
      y = lerp(y, b.baseY - 0.12, w * 0.85);
    }
  }

  // Grade winding road corridor cleanly slightly below road ribbon (-0.045m) so ribbon never Z-fights
  const info = nearestRoadInfo(x, z);
  const roadLock = 1.0 - smoothstep(ROAD_HALF + 0.35, ROAD_HALF + 11.5, info.dist);
  y = lerp(y, info.roadY - 0.045, roadLock);

  return y;
}

export function coastalSurfaceHeight(x, z) {
  const info = nearestRoadInfo(x, z);
  const hillY = coastalHillHeight(x, z);
  if (info.dist <= ROAD_HALF + 0.25) return info.roadY + 0.025;
  const t = smoothstep(ROAD_HALF + 0.25, ROAD_HALF + 1.4, info.dist);
  return lerp(info.roadY + 0.025, hillY, t);
}

export function inCoastalSample(x, z) {
  return Math.abs(x - CX) <= HALF_EXTENT && Math.abs(z - CZ) <= HALF_EXTENT;
}

export function coastalSidewalk(_x, _z) {
  return false;
}

function pushOutRotatedRect(pos, cx, cz, rotY, halfW, halfD, margin) {
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  // World offset -> local frame
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const wx = halfW + margin;
  const wz = halfD + margin;
  if (Math.abs(lx) >= wx || Math.abs(lz) >= wz) return;
  const pushX = wx - Math.abs(lx);
  const pushZ = wz - Math.abs(lz);
  let nx = lx;
  let nz = lz;
  if (pushX < pushZ) nx = lx >= 0 ? wx : -wx;
  else nz = lz >= 0 ? wz : -wz;
  // Local -> world
  pos.x = cx + nx * c + nz * s;
  pos.z = cz - nx * s + nz * c;
}

export function constrainCoastalSample(x, z, walking) {
  const margin = walking ? 0.42 : 0.78;
  const pos = {
    x: clamp(x, CX - 112, CX + 112),
    z: clamp(z, CZ - 108, CZ + 108),
  };

  // Push out of all hillside cottages & windmill tower
  for (const b of BUILDING_SPECS) {
    pushOutRotatedRect(pos, CX + b.dx, CZ + b.dz, b.rotY, b.halfW, b.halfD, margin);
  }

  // Prevent riding straight into deep bay water
  if (coastalHillHeight(pos.x, pos.z) < BAY_WATER_Y + 0.22) {
    const info = nearestRoadInfo(pos.x, pos.z);
    const dirX = info.px - pos.x;
    const dirZ = info.pz - pos.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    pos.x += (dirX / len) * 1.4;
    pos.z += (dirZ / len) * 1.4;
  }
  return pos;
}

// ==============================================================================
// Textures & Painterly Shaders
// ==============================================================================
function makeDirtRoadTexture() {
  const { canvas, ctx, w, h } = makeCanvas(256, 256);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const macro = fbm2D(u * 4, v * 4, 3, 29, 4);
      const grain = fbm2D(u * 22, v * 22, 2, 71, 22);
      // Warm sunlit Ghibli sand-ochre country lane
      const shade = 0.89 + macro * 0.12 + grain * 0.07;
      d[i++] = Math.min(255, Math.round(218 * shade));
      d[i++] = Math.min(255, Math.round(189 * shade));
      d[i++] = Math.min(255, Math.round(145 * shade));
      d[i++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = canvasTexture(canvas, { repeat: true, aniso: 4 });
  tex.repeat.set(1, 1);
  return tex;
}

function patchCloudShadowOnly(material, strength = 0.34, key = 'hillside-cloud-v1') {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => '';
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uMeadowTime = meadowUniforms.uMeadowTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCloudXZ = (modelMatrix * vec4(position, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ;\n' + MEADOW_COMMON_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 cs = mix(vec3(1.0), meadowCloudShadow(vCloudXZ, uMeadowTime), ${strength.toFixed(2)});
        diffuseColor.rgb *= cs;`);
  };
  material.customProgramCacheKey = () => prevKey() + '|' + key;
  return material;
}

// Painterly Ghibli gouache shader for hillside cottages, windmill & props:
// - Warm terracotta roof ribs + course laps + subtle gouache tone per tile
// - Soft brushed plaster variation (relying cleanly on Blender baked deep reveal AO)
// - Crisp daytime glass gradient on 0x527a78 windows while keeping night emissive tags intact
function createGhibliVillageMaterial() {
  const mat = litMaterial({ vertexColors: true, grid: false, roughness: 0.90 });
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uMeadowTime = meadowUniforms.uMeadowTime;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vArchWorld;
        varying vec3 vArchLocal;
        varying vec3 vArchNormW;
        varying vec3 vArchNormL;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vArchLocal = position;
        vArchNormL = normal;
        vArchWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vArchNormW = normalize(mat3(modelMatrix) * normal);`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vArchWorld;
        varying vec3 vArchLocal;
        varying vec3 vArchNormW;
        varying vec3 vArchNormL;
        ` + MEADOW_COMMON_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 wPos = vArchWorld;
        vec3 lPos = vArchLocal;
        vec3 wN = normalize(vArchNormW);
        vec3 lN = normalize(vArchNormL);
        vec3 c = diffuseColor.rgb;

        float isGlass = smoothstep(0.18, 0.08, c.r)
                      * smoothstep(1.35, 1.85, c.g / max(c.r, 0.01))
                      * smoothstep(1.25, 1.75, c.b / max(c.r, 0.01))
                      * (1.0 - smoothstep(0.25, 0.55, abs(wN.y)));

        // Sloped warm terracotta roof tiles (guarded by warm terracotta redness)
        float isTerracotta = smoothstep(0.35, 0.52, c.r) * smoothstep(1.8, 2.8, c.r / max(c.b, 0.015));
        float isRoofSlope = isTerracotta * smoothstep(0.18, 0.35, wN.y) * (1.0 - smoothstep(0.90, 0.97, wN.y));

        float isPlaster = (1.0 - isGlass) * (1.0 - isRoofSlope);

        if (isRoofSlope > 0.01) {
          vec2 slopeDir = length(lN.xz) > 0.05 ? normalize(lN.xz) : vec2(0.0, 1.0);
          vec2 acrossDir = vec2(-slopeDir.y, slopeDir.x);
          float uA = dot(lPos.xz, acrossDir);
          float vD = lPos.y * 1.45 + dot(lPos.xz, slopeDir) * 0.78;
          float colIdx = floor(uA / 0.28);
          float rowIdx = floor(vD / 0.32);
          float rib = sin(fract(uA / 0.28) * 6.28318);
          float lap = smoothstep(0.0, 0.16, fract(vD / 0.32));
          float tileRand = mHash(vec2(colIdx, rowIdx));
          float macroBrush = mNoise(wPos.xz * 0.45);
          vec3 tileTint = mix(vec3(0.90, 0.91, 0.96), vec3(1.10, 1.04, 0.96), tileRand);
          float shade = (0.91 + 0.09 * rib) * mix(0.84, 1.04, lap) * mix(0.94, 1.06, macroBrush);
          c = mix(c, c * tileTint * shade, isRoofSlope);
        }

        if (isPlaster > 0.01) {
          float pMacro = mNoise(vec2(wPos.x + wPos.z, wPos.y * 1.15) * 0.42);
          float pFine  = mNoise(vec2(wPos.x - wPos.z, wPos.y * 1.4) * 2.2);
          vec3 gouache = mix(vec3(0.95, 0.96, 1.00), vec3(1.05, 1.02, 0.96), pMacro)
                       * mix(0.97, 1.03, pFine);
          c = mix(c, c * gouache, isPlaster * 0.85);
        }

        if (isGlass > 0.01) {
          float diag = fract((lPos.x + lPos.z) * 0.45 + lPos.y * 0.65);
          float sheen = smoothstep(0.32, 0.52, diag) * (1.0 - smoothstep(0.56, 0.76, diag));
          float topGrad = smoothstep(0.6, 5.0, lPos.y);
          vec3 skyGlass = c * mix(0.92, 1.18, topGrad * 0.5 + sheen * 0.6);
          c = mix(c, skyGlass, isGlass);
        }

        vec3 cloud = mix(vec3(1.0), meadowCloudShadow(wPos.xz, uMeadowTime), 0.34);
        diffuseColor.rgb = c * cloud;`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|hillside-ghibli-village-v2';
  return mat;
}

function createBayWaterMaterial() {
  const mat = litMaterial({ color: 0x5ca4bd, roughness: 0.35, grid: false });
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uMeadowTime = meadowUniforms.uMeadowTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaterXZ;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWaterXZ = (modelMatrix * vec4(position, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaterXZ;\n' + MEADOW_COMMON_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float r1 = sin(vWaterXZ.x * 0.38 + uMeadowTime * 1.1 + mNoise(vWaterXZ * 0.14) * 3.0);
        float r2 = cos(vWaterXZ.y * 0.45 - uMeadowTime * 0.85);
        float sheen = smoothstep(0.45, 0.95, 0.5 + 0.5 * r1 * r2);
        vec3 base = mix(vec3(0.11, 0.34, 0.44), vec3(0.19, 0.48, 0.58), sheen * 0.65);
        vec3 cs = mix(vec3(1.0), meadowCloudShadow(vWaterXZ, uMeadowTime), 0.25);
        diffuseColor.rgb = base * cs;`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|hillside-bay-water-v1';
  return mat;
}

// ==============================================================================
// Terrain, Road Ribbon & Stylized Bay Builders
// ==============================================================================
function buildHillsideTerrain(root) {
  const step = 3.0;
  const coords = [];
  for (let d = -HALF_EXTENT; d <= HALF_EXTENT + 0.01; d += step) coords.push(d);
  const n = coords.length;
  const eps = 0.7;

  const pos = new Float32Array(n * n * 3);
  const nor = new Float32Array(n * n * 3);
  const indices = [];

  for (let r = 0; r < n; r++) {
    const x = CX + coords[r];
    for (let c = 0; c < n; c++) {
      const z = CZ + coords[c];
      const y = coastalHillHeight(x, z);
      const hx = (coastalHillHeight(x + eps, z) - coastalHillHeight(x - eps, z)) / (2 * eps);
      const hz = (coastalHillHeight(x, z + eps) - coastalHillHeight(x, z - eps)) / (2 * eps);
      const len = Math.hypot(hx, 1, hz) || 1;
      const v = (r * n + c) * 3;
      pos[v] = x;
      pos[v + 1] = y;
      pos[v + 2] = z;
      nor[v] = -hx / len;
      nor[v + 1] = 1 / len;
      nor[v + 2] = -hz / len;
    }
  }

  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const a = r * n + c;
      const b = a + 1;
      const d = a + n;
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
  root.add(mesh);
  return geo;
}

function buildDirtRoadRibbon(root, trackTex, trackMat) {
  const tex = trackTex(makeDirtRoadTexture());
  const mat = trackMat(patchCloudShadowOnly(
    litMaterial({ map: tex, vertexColors: true, roughness: 0.94, grid: false }),
    0.34,
    'hillside-dirt-road-v1',
  ));

  const n = ROAD_SAMPLES.length;
  // 5 cross-section vertices per sample: outer-L skirt, lane-L, center, lane-R, outer-R skirt
  const offsets = [-ROAD_HALF - 0.95, -ROAD_HALF, 0.0, ROAD_HALF, ROAD_HALF + 0.95];
  const yDrop = [-0.14, 0.025, 0.032, 0.025, -0.14];
  const cols = [0xb39a6e, 0xe8d9bc, 0xf7ecd4, 0xe8d9bc, 0xb39a6e];
  const kStride = offsets.length;

  const pos = new Float32Array(n * kStride * 3);
  const uv = new Float32Array(n * kStride * 2);
  const col = new Float32Array(n * kStride * 3);
  const nor = new Float32Array(n * kStride * 3);
  const indices = [];
  const tmpColor = new THREE.Color();

  for (let i = 0; i < n; i++) {
    const pt = ROAD_SAMPLES[i];
    const prev = ROAD_SAMPLES[Math.max(0, i - 1)];
    const next = ROAD_SAMPLES[Math.min(n - 1, i + 1)];
    const ds = Math.max(0.1, next.s - prev.s);
    const slopeY = (next.y - prev.y) / ds;
    const ny = new THREE.Vector3(-pt.tx * slopeY, 1.0, -pt.tz * slopeY).normalize();

    for (let k = 0; k < kStride; k++) {
      const idx = i * kStride + k;
      const off = offsets[k];
      pos[idx * 3] = pt.x + pt.nx * off;
      pos[idx * 3 + 1] = pt.y + yDrop[k];
      pos[idx * 3 + 2] = pt.z + pt.nz * off;
      nor[idx * 3] = ny.x;
      nor[idx * 3 + 1] = ny.y;
      nor[idx * 3 + 2] = ny.z;
      uv[idx * 2] = k / (kStride - 1);
      uv[idx * 2 + 1] = pt.s * 0.16;
      tmpColor.setHex(cols[k]);
      col[idx * 3] = tmpColor.r;
      col[idx * 3 + 1] = tmpColor.g;
      col[idx * 3 + 2] = tmpColor.b;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < kStride - 1; k++) {
      const a = i * kStride + k;
      const b = a + 1;
      const d = (i + 1) * kStride + k;
      const e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  root.add(mesh);
  return geo;
}

// ==============================================================================
// Hillside Grass Blades & Wildflowers (excluded from road, water & building pads)
// ==============================================================================
function isBlockedForFlora(x, z, roadDist) {
  if (roadDist < ROAD_HALF + 0.95) return true;
  if (coastalHillHeight(x, z) < BAY_WATER_Y + 0.35) return true;
  const dx = x - CX;
  const dz = z - CZ;
  for (const b of BUILDING_SPECS) {
    const lx = (dx - b.dx) * Math.cos(b.rotY) - (dz - b.dz) * Math.sin(b.rotY);
    const lz = (dx - b.dx) * Math.sin(b.rotY) + (dz - b.dz) * Math.cos(b.rotY);
    if (Math.abs(lx) < b.halfW + 0.85 && Math.abs(lz) < b.halfD + 0.85) return true;
  }
  return false;
}

function buildHillsideMeadowFlora(root) {
  const rng = new RNG('ghibli-hillside-flora-v2');
  const dummy = new THREE.Object3D();

  const maxGrass = 28000;
  const gMat = new Float32Array(maxGrass * 16);
  const gCol = new Float32Array(maxGrass * 3);
  const col = new THREE.Color();
  let gCount = 0;

  for (let i = 0; i < 48000 && gCount < maxGrass; i++) {
    const x = CX + rng.range(-108, 108);
    const z = CZ + rng.range(-104, 104);
    const roadInfo = nearestRoadInfo(x, z);
    if (isBlockedForFlora(x, z, roadInfo.dist)) continue;

    // Dense near foreground valley & slopes, slightly thinner only at extreme periphery
    const periphDist = Math.hypot((x - CX) * 0.9, (z - CZ) * 0.9);
    if (periphDist > 75 && rng.next() > 0.65) continue;

    const p = patchNoise(x, z);
    if (p < 0.24 && rng.next() > 0.65) continue;

    const y = coastalHillHeight(x, z);
    const heightScale = lerp(0.70, 1.38, smoothstep(0.24, 0.84, p)) * rng.range(0.86, 1.18);
    const widthScale = rng.range(0.86, 1.24);
    const leanScale = rng.range(0.88, 1.15);

    dummy.position.set(x, y - 0.03, z);
    dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
    dummy.scale.set(widthScale, heightScale, leanScale);
    dummy.updateMatrix();
    dummy.matrix.toArray(gMat, gCount * 16);

    col.setHex(rng.pick([0xffffff, 0xf2fade, 0xe8f6d2, 0xfff8e4]));
    gCol[gCount * 3] = col.r;
    gCol[gCount * 3 + 1] = col.g;
    gCol[gCount * 3 + 2] = col.b;
    gCount++;
  }

  const gGeo = getGrassGeometry();
  const grassMesh = new THREE.InstancedMesh(gGeo, getGrassMaterial(), gCount);
  grassMesh.instanceMatrix.array.set(gMat.subarray(0, gCount * 16));
  grassMesh.instanceMatrix.needsUpdate = true;
  grassMesh.instanceColor = new THREE.InstancedBufferAttribute(gCol.subarray(0, gCount * 3), 3);
  grassMesh.castShadow = false;
  grassMesh.receiveShadow = true;
  grassMesh.computeBoundingSphere();
  root.add(grassMesh);

  // Clustered white & violet roadside wildflowers (matching reference screenshots!)
  const maxFlowers = 1600;
  const fMat = new Float32Array(maxFlowers * 16);
  const fCol = new Float32Array(maxFlowers * 3);
  let fCount = 0;

  for (let c = 0; c < 130 && fCount < maxFlowers; c++) {
    const cx = CX + rng.range(-88, 88);
    const cz = CZ + rng.range(-88, 92);
    const roadInfo = nearestRoadInfo(cx, cz);
    if (isBlockedForFlora(cx, cz, roadInfo.dist)) continue;
    // Favor foreground meadow & sunny hillside slopes
    if (roadInfo.dist > 14 && rng.next() > 0.55) continue;

    const clusterHex = rng.pick([0xfff7e2, 0xfffdf2, 0x9eb8ff, 0xf7e38c]);
    const count = rng.int(7, 16);
    for (let j = 0; j < count && fCount < maxFlowers; j++) {
      const ang = rng.range(0, Math.PI * 2);
      const rad = Math.sqrt(rng.next()) * rng.range(1.2, 3.2);
      const fx = cx + Math.cos(ang) * rad;
      const fz = cz + Math.sin(ang) * rad;
      const ri = nearestRoadInfo(fx, fz);
      if (isBlockedForFlora(fx, fz, ri.dist)) continue;

      const fy = coastalHillHeight(fx, fz);
      const sc = rng.range(0.84, 1.32);
      dummy.position.set(fx, fy - 0.01, fz);
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.scale.set(sc, sc * rng.range(0.92, 1.15), sc);
      dummy.updateMatrix();
      dummy.matrix.toArray(fMat, fCount * 16);

      col.setHex(clusterHex);
      fCol[fCount * 3] = col.r;
      fCol[fCount * 3 + 1] = col.g;
      fCol[fCount * 3 + 2] = col.b;
      fCount++;
    }
  }

  const fGeo = getFlowerGeometry();
  const flowerMesh = new THREE.InstancedMesh(fGeo, getFlowerMaterial(), fCount);
  flowerMesh.instanceMatrix.array.set(fMat.subarray(0, fCount * 16));
  flowerMesh.instanceMatrix.needsUpdate = true;
  flowerMesh.instanceColor = new THREE.InstancedBufferAttribute(fCol.subarray(0, fCount * 3), 3);
  flowerMesh.castShadow = false;
  flowerMesh.receiveShadow = false;
  flowerMesh.computeBoundingSphere();
  root.add(flowerMesh);

  return [gGeo, fGeo];
}

// ==============================================================================
// Main Slice Assembly
// ==============================================================================
export function createCoastalSample(villageGltf) {
  const root = new THREE.Group();
  root.name = 'coastal-sample';

  const villageMat = createGhibliVillageMaterial();
  const kitMeshes = {};
  villageGltf.scene.traverse(obj => {
    if (!obj.isMesh || !obj.name) return;
    obj.material = villageMat;
    obj.castShadow = false;
    obj.receiveShadow = true;
    kitMeshes[obj.name] = obj;
  });

  const disposables = [villageMat];
  const trackTex = t => { disposables.push(t); return t; };
  const trackMat = m => { disposables.push(m); return m; };

  // 1) Rolling Ghibli hillside terrain (graded cleanly to cottages & winding road)
  disposables.push(buildHillsideTerrain(root));

  // 2) Warm sand-ochre dirt road ribbon climbing from valley up to hilltop windmill plaza
  disposables.push(buildDirtRoadRibbon(root, trackTex, trackMat));

  // 3) Serene stylized coastal bay water tucked into the western cove
  const bayMat = trackMat(createBayWaterMaterial());
  const bayGeo = new THREE.PlaneGeometry(116, 152, 1, 1);
  bayGeo.rotateX(-Math.PI / 2);
  disposables.push(bayGeo);
  const bayMesh = new THREE.Mesh(bayGeo, bayMat);
  bayMesh.position.set(CX - 66, BAY_WATER_Y, CZ + 2);
  bayMesh.receiveShadow = true;
  bayMesh.castShadow = false;
  root.add(bayMesh);

  // 4) Grounded contact shadow pad material under cottages/windmill
  const contactGeo = new THREE.PlaneGeometry(10.5, 8.6);
  contactGeo.rotateX(-Math.PI / 2);
  disposables.push(contactGeo);

  // Place unified red-roof cottages & Hero Rotating Coastal Windmill
  let bladesMesh = null;
  for (const b of BUILDING_SPECS) {
    const src = kitMeshes[b.mesh];
    if (!src) continue;
    const holder = new THREE.Group();
    const wx = CX + b.dx;
    const wz = CZ + b.dz;
    holder.position.set(wx, b.baseY - 0.12, wz);
    holder.rotation.y = b.rotY;

    const body = src.clone();
    holder.add(body);

    if (b.kind === 'windmill' && kitMeshes.Ghibli_Windmill_Blades) {
      bladesMesh = kitMeshes.Ghibli_Windmill_Blades.clone();
      // Exact hub coordinates printed by hillside-village.py glTF export
      bladesMesh.position.set(0.0, 10.65, 2.52);
      holder.add(bladesMesh);
    }
    root.add(holder);
  }

  // 5) Hanging-lantern Signposts at key valley & hilltop landmarks
  const staticGeos = [];
  const objTmp = new THREE.Object3D();
  const collectStaticProp = (name, x, y, z, rotY = 0, pitch = 0, scale = 1) => {
    const src = kitMeshes[name];
    if (!src) return;
    objTmp.position.set(x, y, z);
    objTmp.rotation.order = 'YXZ';
    objTmp.rotation.y = rotY;
    objTmp.rotation.x = pitch;
    objTmp.scale.setScalar(scale);
    objTmp.updateMatrix();
    const g = src.geometry.clone();
    g.applyMatrix4(objTmp.matrix);
    staticGeos.push(g);
  };

  for (const [sVal, sideOff, yawOff] of [[32, 3.8, -0.4], [84, -3.7, 0.85], [166, 3.9, 1.2]]) {
    const pt = hillRoadPoint(sVal);
    const sx = pt.x + pt.nx * sideOff;
    const sz = pt.z + pt.nz * sideOff;
    const src = kitMeshes.Ghibli_Signpost;
    if (src) {
      const clone = src.clone();
      clone.position.set(sx, coastalHillHeight(sx, sz) - 0.04, sz);
      clone.rotation.y = pt.yaw + yawOff;
      root.add(clone);
    }
  }

  // 6) Timber post-and-rail roadside guardrails along the outer uphill curve (s = 62..136m)
  for (let s = 62; s <= 136; s += 4.0) {
    const pt = hillRoadPoint(s);
    const edgeOff = -3.35; // Outer valley drop-off side
    const fx = pt.x + pt.nx * edgeOff;
    const fz = pt.z + pt.nz * edgeOff;
    const fy = coastalHillHeight(fx, fz);
    collectStaticProp('Ghibli_Fence_Seg', fx, fy - 0.05, fz, pt.yaw - Math.PI * 0.5);
  }

  // 7) Mossy boulder clusters grounding bends & ridge flanks
  for (const [rx, rz, rYaw, rScale] of [
    [-22, 54, 0.4, 1.05],
    [18, 22, 1.9, 1.15],
    [32, -16, 2.7, 0.95],
    [-38, -28, 1.1, 1.25],
    [-46, 12, 0.2, 1.20],
    [-8, -28, 2.3, 0.90],
  ]) {
    const wx = CX + rx;
    const wz = CZ + rz;
    collectStaticProp('Ghibli_Rock_Cluster', wx, coastalHillHeight(wx, wz) - 0.08, wz, rYaw, 0, rScale);
  }

  if (staticGeos.length) {
    const mergedPropsGeo = mergeGeometries(staticGeos, false);
    for (const g of staticGeos) g.dispose();
    disposables.push(mergedPropsGeo);
    const mergedPropsMesh = new THREE.Mesh(mergedPropsGeo, villageMat);
    mergedPropsMesh.receiveShadow = true;
    mergedPropsMesh.castShadow = false;
    mergedPropsMesh.matrixAutoUpdate = false;
    mergedPropsMesh.updateMatrix();
    root.add(mergedPropsMesh);
  }

  // 8) Disciplined Clustered Ghibli Leaf-Card Groves (leaving wide open sunlit grass slopes!)
  const groveCenters = [
    // Grove 1: Foreground left valley knoll
    { x: -34, z: 54, count: 5, spread: 11, scale: [0.95, 1.22] },
    // Grove 2: Mid-valley bend hollow
    { x: 16, z: 16, count: 4, spread: 8.5, scale: [0.92, 1.16] },
    // Grove 3: Eastern slope behind mid-climb cottages
    { x: 60, z: -2, count: 6, spread: 14, scale: [1.05, 1.32] },
    // Grove 4: Hilltop windmill ridge backdrop
    { x: -38, z: -70, count: 7, spread: 16, scale: [1.02, 1.30] },
    { x: 10, z: -76, count: 5, spread: 12, scale: [1.04, 1.28] },
    // Grove 5: Coastal bay grassy point
    { x: -50, z: -18, count: 4, spread: 10, scale: [0.98, 1.20] },
  ];
  const treeRng = new RNG('hillside-clustered-groves');
  const treeEntries = [];
  for (const grove of groveCenters) {
    for (let k = 0; k < grove.count; k++) {
      const ang = (k / grove.count) * Math.PI * 2 + treeRng.range(-0.35, 0.35);
      const r = k === 0 ? treeRng.range(0, 2.2) : treeRng.range(3.6, grove.spread);
      const tx = CX + grove.x + Math.cos(ang) * r;
      const tz = CZ + grove.z + Math.sin(ang) * r;
      const ri = nearestRoadInfo(tx, tz);
      if (isBlockedForFlora(tx, tz, ri.dist) || ri.dist < ROAD_HALF + 3.2) continue;
      const sc = treeRng.range(grove.scale[0], grove.scale[1]);
      treeEntries.push({
        x: tx,
        y: coastalHillHeight(tx, tz) - 0.06,
        z: tz,
        rotY: treeRng.range(0, Math.PI * 2),
        sx: sc,
        sy: sc * treeRng.range(0.95, 1.05),
        sz: sc,
        colorHex: 0xffffff,
      });
    }
  }
  placeStylizedTrees(root, treeEntries);

  // 9) Wind-swept sunlit grass blades & wildflowers across open hillside slopes
  for (const d of buildHillsideMeadowFlora(root)) disposables.push(d);

  return {
    root,
    update(time) {
      if (bladesMesh) {
        bladesMesh.rotation.z = -time * 0.45;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
