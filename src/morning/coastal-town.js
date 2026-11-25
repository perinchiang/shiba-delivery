// Clean-Slate Rongwan Coastal Corner World (centered cleanly at world origin 0, 0)
// North green hillside & stone retaining wall -> sunlit downhill coastal slope ->
// Hero Building "海风庄" (Gate 2 Pure-Blender + AI PBR asset with walkable exterior steel stairs
// & 2F corridor) -> coastal railway bed -> oceanfront boulevard, seawall promenade & sparkling sea.
import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { litMaterial } from '../core/materials.js';
import { RNG } from '../core/rng.js';
import { makeCanvas, canvasTexture, fbm2D } from '../core/textures.js';
import { clamp, lerp, smoothstep } from '../core/mathx.js';
import {
  MEADOW_COMMON_GLSL,
  meadowUniforms,
  updateMeadowEnv,
  getTerrainMaterial,
  getGrassMaterial,
  getGrassGeometry,
  getFlowerMaterial,
  getFlowerGeometry,
  patchNoise,
} from './stylized-meadow.js';
import { placeStylizedTrees } from './stylized-trees.js';

export const WORLD_BOUNDS = Object.freeze({
  minX: -66,
  maxX: 66,
  minZ: -54,
  maxZ: 54.4,
});

export const OCEAN_Y = -1.65;
export const PLAZA_Z = 10.5;
export const RAIL_Z = 37.0;
export const BLVD_Z = 47.0;
export const SEAWALL_Z = 55.5;
const HALF_X = 96;
const HALF_Z_NORTH = -92;

// Hero Building "海风庄" (Gate 2 Pure-Blender + AI PBR v4) anchored at the sunlit SE corner.
// Local Blender (bx, by, bz) maps to world via:
//   x = HERO_HAIKAZE.x - bx,  y = HERO_HAIKAZE.baseY + bz,  z = HERO_HAIKAZE.z + by  (rotY = PI).
export const HERO_HAIKAZE = Object.freeze({
  x: 10.6,
  z: 21.0,
  rotY: Math.PI,
  baseY: 1.85 + 0.145,
});

export function heroLocalToWorld(bx, by, bz = 0) {
  return {
    x: HERO_HAIKAZE.x - bx,
    y: HERO_HAIKAZE.baseY + bz,
    z: HERO_HAIKAZE.z + by,
  };
}

// Unified continuous slope elevation along Z (zero seams between road, plaza & seafront).
export function townSlopeY(z) {
  if (z <= -48) return 10.40;
  if (z <= 0) return lerp(10.40, 1.85, smoothstep(-48, 0, z));
  if (z <= 29.0) return 1.85;
  if (z <= 35.0) return lerp(1.85, 1.25, smoothstep(29.0, 35.0, z));
  if (z <= 40.0) return 1.25;
  if (z <= 44.5) return lerp(1.25, 1.05, smoothstep(40.0, 44.5, z));
  return 1.05;
}

// Single-valued walkable elevation on Haikaze-so's 14-step exterior steel stairs & 2F open corridor.
export function heroHaikazeElevation(x, z) {
  const bx = HERO_HAIKAZE.x - x;
  const by = z - HERO_HAIKAZE.z;
  const baseY = HERO_HAIKAZE.baseY;
  // Exterior steel staircase (bottom pad -> 14 steps -> top landing bridge)
  if (bx >= 4.22 && bx <= 5.62 && by >= -2.72 && by <= 3.84) {
    if (by <= -1.95) return baseY + 0.12;
    if (by >= 2.35) return baseY + 3.25;
    const t = (by - (-1.95)) / (2.35 - (-1.95));
    return baseY + lerp(0.12, 3.25, t);
  }
  // 2F open-air L-shaped concrete corridor & front balcony (outside 2F apartment core)
  if (bx >= -4.24 && bx <= 4.28 && by >= -3.94 && by <= 3.94) {
    if (bx >= 2.52 || by <= -2.18) return baseY + 3.25;
  }
  return null;
}

function isOnRoadCorridor(x, z) {
  const onMain = Math.abs(x) <= 6.2 && z >= -55 && z <= 52;
  const onCross = Math.abs(z - PLAZA_Z) <= 5.2 && Math.abs(x) <= 54;
  const onHeroPad = x >= 3.8 && x <= 19.2 && z >= 13.5 && z <= 27.6;
  const onWestPlaza = x >= -16.0 && x <= -3.8 && z >= 13.5 && z <= 24.0;
  const onBlvd = z >= 41.5 && z <= 56.0 && Math.abs(x) <= 84;
  return onMain || onCross || onHeroPad || onWestPlaza || onBlvd;
}

function roadSurfaceOffset(x, z) {
  const inMainAsphalt = Math.abs(x) <= 3.85 && z >= -54 && z <= 51.5;
  const inCrossAsphalt = Math.abs(z - PLAZA_Z) <= 3.45 && Math.abs(x) <= 52;
  const inBlvdAsphalt = Math.abs(z - BLVD_Z) <= 4.25 && Math.abs(x) <= 82;
  if (inMainAsphalt || inCrossAsphalt || inBlvdAsphalt) return 0.03;
  if (isOnRoadCorridor(x, z)) return 0.145;
  return 0.0;
}

export function coastalTownTerrainHeight(x, z) {
  if (z > SEAWALL_Z + 0.8) {
    const seaT = smoothstep(SEAWALL_Z + 0.8, SEAWALL_Z + 9.0, z);
    return lerp(0.85, OCEAN_Y - 1.5, seaT);
  }
  let y = townSlopeY(z);

  // North lush hillside rising softly behind the stone retaining wall (z < -60)
  if (z < -58) {
    const hillT = smoothstep(-58, -90, z);
    const wave = 0.5 + 0.5 * Math.sin(x * 0.05 + 0.8) * Math.cos(z * 0.045);
    y += hillT * (12.0 + 5.5 * wave);
  }

  // Gentle coastal meadow swells flanking the corner blocks (keeps sightlines to Haikaze-so open!)
  if (Math.abs(x) > 22 && z < 32) {
    const flankT = smoothstep(22, 74, Math.abs(x)) * smoothstep(32, -8, z);
    const swell = 0.5 + 0.5 * Math.sin(z * 0.05 + x * 0.03);
    y += flankT * (7.5 + 4.5 * swell);
  }

  if (isOnRoadCorridor(x, z) || (Math.abs(z - RAIL_Z) <= 2.8 && Math.abs(x) <= 88)) {
    return townSlopeY(z) - 0.035;
  }
  return y;
}

export function coastalTownSurfaceHeight(x, z, includeElevated = true) {
  if (includeElevated) {
    const heroY = heroHaikazeElevation(x, z);
    if (heroY !== null) return heroY;
  }
  if (isOnRoadCorridor(x, z)) {
    return townSlopeY(z) + roadSurfaceOffset(x, z);
  }
  if (Math.abs(z - RAIL_Z) <= 2.6 && Math.abs(x) <= 88) {
    return townSlopeY(RAIL_Z) + 0.04;
  }
  return coastalTownTerrainHeight(x, z);
}

export function townPlace(x, z) {
  const bx = HERO_HAIKAZE.x - x;
  const by = z - HERO_HAIKAZE.z;
  const elev = heroHaikazeElevation(x, z);
  if (elev !== null) {
    return elev > HERO_HAIKAZE.baseY + 2.6 ? '海风庄 · 二楼走廊' : '海风庄 · 外挂楼梯';
  }
  if (Math.abs(bx) < 7.2 && by >= -8.0 && by <= -3.5) return '海风拉面门前';
  if (z < -10) return '榕湾观海坡道';
  if (Math.abs(z - RAIL_Z) < 4.5) return '海岸铁道口';
  if (z > 41) return '海滨观海大道';
  return '榕湾海风街角';
}

// ==============================================================================
// Collision: Haikaze-so Flush-Wall 1F + Walkable Stairs + 2F Corridor + World Bounds
// ==============================================================================
function pushOutAABB(pos, cx, cz, halfW, halfD, margin) {
  const lx = pos.x - cx;
  const lz = pos.z - cz;
  const wx = halfW + margin;
  const wz = halfD + margin;
  if (Math.abs(lx) >= wx || Math.abs(lz) >= wz) return;
  const px = wx - Math.abs(lx);
  const pz = wz - Math.abs(lz);
  if (px < pz) pos.x = cx + (lx >= 0 ? wx : -wx);
  else pos.z = cz + (lz >= 0 ? wz : -wz);
}

function pushOutHeroLocal(pos, bx0, bx1, by0, by1, margin) {
  const cx = HERO_HAIKAZE.x - (bx0 + bx1) * 0.5;
  const cz = HERO_HAIKAZE.z + (by0 + by1) * 0.5;
  pushOutAABB(pos, cx, cz, (bx1 - bx0) * 0.5, (by1 - by0) * 0.5, margin);
}

export function constrainCoastalTown(x, z, walking) {
  const margin = walking ? 0.42 : 0.78;
  const pos = {
    x: clamp(x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
    z: clamp(z, WORLD_BOUNDS.minZ, SEAWALL_Z - (walking ? 0.75 : 1.15)),
  };

  if (!walking) {
    // Riding: keep scooter strictly outside Haikaze-so main body & exterior staircase footprint
    pushOutHeroLocal(pos, -4.32, 4.32, -3.96, 3.96, margin);
    pushOutHeroLocal(pos, 4.25, 5.65, -2.75, 3.85, 0.62);
  } else {
    // Walking: solid 1F/2F core + perimeter rails with 2 clean openings:
    //   1) Staircase bottom entry (by = -2.70, bx in [4.25..5.60])
    //   2) Staircase top landing -> 2F corridor doorway (bx = 4.25, by in [2.35..3.80])
    const r = 0.24;
    // W0: 2F solid apartment core (also seals 1F interior)
    pushOutHeroLocal(pos, -4.20, 2.55, -2.20, 3.90, r);
    // W1: Front 1F wall & 2F front balcony rail
    pushOutHeroLocal(pos, -4.25, 4.25, -3.98, -3.82, r);
    // W2: Flush stair-side 1F wall & 2F corridor rail (stops at by=+2.30 for top doorway!)
    pushOutHeroLocal(pos, 4.18, 4.32, -3.90, 2.30, r);
    // W3: 2F corridor rear rail
    pushOutHeroLocal(pos, 2.55, 4.33, 3.82, 3.98, r);
    // W4: Staircase top landing rear rail
    pushOutHeroLocal(pos, 4.25, 5.66, 3.72, 3.88, r);
    // W5: Staircase outer railing & steel stringer
    pushOutHeroLocal(pos, 5.52, 5.68, -2.70, 3.88, r);
    // W6: East end railing of 2F front balcony
    pushOutHeroLocal(pos, -4.28, -4.12, -3.98, -2.20, r);
  }

  // Keep riders off the fenced railway track away from the main avenue level crossing
  if (Math.abs(pos.x) > 5.4 && Math.abs(pos.z - RAIL_Z) < 2.2 + margin * 0.45) {
    pos.z = RAIL_Z + (pos.z >= RAIL_Z ? 2.2 + margin * 0.45 : -(2.2 + margin * 0.45));
  }

  return pos;
}

// ==============================================================================
// Stylized Surface Materials: Coastal Asphalt, Warm Masonry & Animated Ocean
// ==============================================================================
function makeAsphaltTexture() {
  const { canvas, ctx, w, h } = makeCanvas(256, 256);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const macro = fbm2D(u * 4, v * 4, 3, 17, 4);
      const grain = fbm2D(u * 32, v * 32, 2, 83, 32);
      const s = 0.88 + macro * 0.11 + grain * 0.09;
      d[i++] = Math.min(255, Math.round(112 * s));
      d[i++] = Math.min(255, Math.round(119 * s));
      d[i++] = Math.min(255, Math.round(127 * s));
      d[i++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(canvas, { repeat: true, aniso: 4 });
}

function createCivilMaterial() {
  const mat = litMaterial({ vertexColors: true, grid: false, roughness: 0.90 });
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uMeadowTime = meadowUniforms.uMeadowTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCivilW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCivilW = (modelMatrix * vec4(position, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCivilW;\n' + MEADOW_COMMON_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grain = mNoise(vCivilW.xz * 1.15 + vCivilW.y * 0.8);
        vec3 cloud = mix(vec3(1.0), meadowCloudShadow(vCivilW.xz, uMeadowTime), 0.24);
        diffuseColor.rgb *= mix(0.96, 1.04, grain) * cloud;`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|rongwan-civil-v2';
  return mat;
}

function createOceanMaterial() {
  const mat = litMaterial({ color: 0x3f9ec4, roughness: 0.24, grid: false });
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  const waterTintUniform = { value: new THREE.Color(0xffffff) };
  mat.userData.waterTintUniform = waterTintUniform;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uMeadowTime = meadowUniforms.uMeadowTime;
    shader.uniforms.uCoastZ = { value: SEAWALL_Z };
    shader.uniforms.uWaterTint = waterTintUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vOceanXZ;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vOceanXZ = (modelMatrix * vec4(position, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uCoastZ;
        uniform vec3 uWaterTint;
        varying vec2 vOceanXZ;
        ` + MEADOW_COMMON_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float distShore = max(0.0, vOceanXZ.y - uCoastZ);
        float w1 = sin(vOceanXZ.x * 0.28 + uMeadowTime * 1.25 + mNoise(vOceanXZ * 0.09) * 3.8);
        float w2 = cos(vOceanXZ.y * 0.42 - uMeadowTime * 1.05 + mNoise(vOceanXZ * 0.16) * 2.4);
        float glint = smoothstep(0.62, 0.96, 0.5 + 0.5 * w1 * w2);
        float sparkle = smoothstep(0.84, 0.98, mNoise(vOceanXZ * 0.72 + vec2(uMeadowTime * 0.6, -uMeadowTime * 0.45)));

        vec3 shallow = vec3(0.14, 0.54, 0.66);
        vec3 deep = vec3(0.08, 0.34, 0.58);
        vec3 sea = mix(shallow, deep, smoothstep(6.0, 95.0, distShore));

        float foamWave = sin(distShore * 1.4 - uMeadowTime * 2.1 + mNoise(vOceanXZ * 0.22) * 2.2);
        float foamMask = (1.0 - smoothstep(0.0, 8.5, distShore)) * smoothstep(0.28, 0.78, foamWave);
        float edgeFoam = (1.0 - smoothstep(0.0, 2.2, distShore)) * 0.75;

        sea = mix(sea, vec3(0.68, 0.88, 0.96), glint * 0.32 + sparkle * 0.38);
        sea = mix(sea, vec3(0.92, 0.96, 0.98), clamp(foamMask * 0.65 + edgeFoam, 0.0, 0.85));

        vec3 cs = mix(vec3(1.0), meadowCloudShadow(vOceanXZ, uMeadowTime), 0.20);
        diffuseColor.rgb = sea * cs * uWaterTint;`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|rongwan-ocean-v2';
  return mat;
}

// ==============================================================================
// Terrain, Sloped Roads, Corner Terrace, Railway Bed & Seawall Promenade
// ==============================================================================
function buildTownTerrain(root) {
  const step = 4.0;
  const xs = [];
  const zs = [];
  for (let x = -HALF_X; x <= HALF_X + 0.01; x += step) xs.push(x);
  for (let z = HALF_Z_NORTH; z <= 68 + 0.01; z += step) zs.push(z);
  const nx = xs.length;
  const nz = zs.length;
  const eps = 0.8;

  const pos = new Float32Array(nx * nz * 3);
  const nor = new Float32Array(nx * nz * 3);
  const indices = [];

  for (let ix = 0; ix < nx; ix++) {
    const x = xs[ix];
    for (let iz = 0; iz < nz; iz++) {
      const z = zs[iz];
      const y = coastalTownTerrainHeight(x, z);
      const hx = (coastalTownTerrainHeight(x + eps, z) - coastalTownTerrainHeight(x - eps, z)) / (2 * eps);
      const hz = (coastalTownTerrainHeight(x, z + eps) - coastalTownTerrainHeight(x, z - eps)) / (2 * eps);
      const len = Math.hypot(hx, 1, hz) || 1;
      const v = (ix * nz + iz) * 3;
      pos[v] = x;
      pos[v + 1] = y;
      pos[v + 2] = z;
      nor[v] = -hx / len;
      nor[v + 1] = 1 / len;
      nor[v + 2] = -hz / len;
    }
  }
  for (let ix = 0; ix < nx - 1; ix++) {
    for (let iz = 0; iz < nz - 1; iz++) {
      const a = ix * nz + iz;
      const b = a + 1;
      const d = a + nz;
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

function addSlopedRibbonZ(builder, xCenter, halfW, zStart, zEnd, steps, yOff, color, uvScale = 0.14) {
  for (let i = 0; i < steps; i++) {
    const z0 = lerp(zStart, zEnd, i / steps);
    const z1 = lerp(zStart, zEnd, (i + 1) / steps);
    const y0 = townSlopeY(z0) + yOff;
    const y1 = townSlopeY(z1) + yOff;
    const xL = xCenter - halfW;
    const xR = xCenter + halfW;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dy, dz) || 1;
    const n = [0, dz / len, -dy / len];
    builder.quad(
      [xL, y0, z0], [xL, y1, z1], [xR, y1, z1], [xR, y0, z0],
      { color, normal: n, uvs: [[0, z0 * uvScale], [0, z1 * uvScale], [1, z1 * uvScale], [1, z0 * uvScale]] },
    );
  }
}

function addFlatRibbonX(builder, xStart, xEnd, zCenter, halfD, yOff, color, uvScale = 0.14) {
  const y = townSlopeY(zCenter) + yOff;
  const z0 = zCenter - halfD;
  const z1 = zCenter + halfD;
  builder.quad(
    [xStart, y, z0], [xStart, y, z1], [xEnd, y, z1], [xEnd, y, z0],
    { color, normal: [0, 1, 0], uvs: [[xStart * uvScale, 0], [xStart * uvScale, 1], [xEnd * uvScale, 1], [xEnd * uvScale, 0]] },
  );
}

function buildRoadsAndCivil(root) {
  const asphaltTex = makeAsphaltTexture();
  const asphaltMat = litMaterial({ map: asphaltTex, vertexColors: true, roughness: 0.92, grid: false });
  const civilMat = createCivilMaterial();

  const asphalt = new GeoBuilder({ uv: true, color: true });
  const civil = new GeoBuilder({ color: true });

  // 1) Main Coastal Slope Avenue (North-South, x = 0)
  addSlopedRibbonZ(asphalt, 0.0, 4.10, -54.5, 51.5, 34, 0.03, 0xffffff);
  // 2) Cross Street running past Haikaze-so shopfront (z = PLAZA_Z = 10.5)
  addFlatRibbonX(asphalt, -52, 52, PLAZA_Z, 3.65, 0.036, 0xffffff);
  // 3) Oceanfront Boulevard (z = BLVD_Z = 47.0)
  addFlatRibbonX(asphalt, -86, 86, BLVD_Z, 4.45, 0.036, 0xfafafa);

  // 4) Sidewalks & Curbs along Main Avenue
  const sideCol = 0xe5ddc9;
  const curbCol = 0xc5bca9;
  for (const s of [-1, 1]) {
    const spans = [[-53.5, 6.8], [14.2, 34.4], [39.6, 42.6]];
    for (const [za, zb] of spans) {
      const segs = Math.max(4, Math.round((zb - za) / 4));
      addSlopedRibbonZ(civil, s * (3.85 + 1.25), 1.25, za, zb, segs, 0.145, sideCol);
      for (let i = 0; i < segs; i++) {
        const z0 = lerp(za, zb, i / segs);
        const z1 = lerp(za, zb, (i + 1) / segs);
        const y0 = townSlopeY(z0);
        const y1 = townSlopeY(z1);
        const edgeX = s * 3.85;
        if (s > 0) {
          civil.quad(
            [edgeX, y0 + 0.02, z0], [edgeX, y0 + 0.145, z0],
            [edgeX, y1 + 0.145, z1], [edgeX, y1 + 0.02, z1],
            { color: curbCol, normal: [-1, 0, 0] },
          );
        } else {
          civil.quad(
            [edgeX, y0 + 0.145, z0], [edgeX, y0 + 0.02, z0],
            [edgeX, y1 + 0.02, z1], [edgeX, y1 + 0.145, z1],
            { color: curbCol, normal: [1, 0, 0] },
          );
        }
      }
    }
  }

  // Cross Street north & south sidewalks
  for (const [xa, xb] of [[-52, -6.2], [6.2, 52]]) {
    addFlatRibbonX(civil, xa, xb, PLAZA_Z - 4.45, 1.0, 0.145, sideCol);
    addFlatRibbonX(civil, xa, xb, PLAZA_Z + 4.45, 1.0, 0.145, sideCol);
  }

  // Warm sandstone hero terrace pad directly beneath & framing Haikaze-so (zero floating edges!)
  const plazaCol = 0xeadbc0;
  civil.box(11.4, 1.85 + 0.02, 20.8, 15.2, 0.25, 13.8, { color: plazaCol });
  // Subtle warm stone curb border around Haikaze-so's corner pad
  civil.box(11.4, 1.85 + 0.075, 13.92, 15.3, 0.14, 0.24, { color: curbCol });
  // Cozy corner bench & planter pocket across the street on the west plaza corner
  civil.box(-10.0, 1.85 + 0.02, 18.8, 12.2, 0.25, 9.6, { color: 0xe2d5bb });
  civil.box(-8.4, 1.85 + 0.44, 16.5, 2.0, 0.10, 0.54, { color: 0xa6744c });
  civil.box(-8.4, 1.85 + 0.72, 16.74, 2.0, 0.32, 0.08, { color: 0xa6744c });
  civil.box(-12.5, 1.85 + 0.30, 17.5, 2.3, 0.36, 2.3, { color: 0xbf8060 });
  civil.box(-12.5, 1.85 + 0.40, 17.5, 1.9, 0.18, 1.9, { color: 0x6e5a46 });

  // 5) Crisp Japanese Road Markings: dashed center lines, edge lines & crosswalks
  const paintCol = 0xf7f2e4;
  for (let z = -48; z <= 33; z += 5.2) {
    if (z > 5.0 && z < 15.5) continue;
    addSlopedRibbonZ(civil, 0.0, 0.09, z, Math.min(34, z + 2.4), 2, 0.052, paintCol);
  }
  for (const s of [-1, 1]) {
    addSlopedRibbonZ(civil, s * 3.55, 0.07, -50, 6.2, 16, 0.050, paintCol);
    addSlopedRibbonZ(civil, s * 3.55, 0.07, 15.0, 34.4, 6, 0.050, paintCol);
  }
  const blvdY = townSlopeY(BLVD_Z);
  for (let x = -78; x <= 78; x += 6.0) {
    if (Math.abs(x) < 6) continue;
    civil.box(x, blvdY + 0.048, BLVD_Z, 2.8, 0.015, 0.16, { color: 0xf2c54b });
  }
  // Zebra crosswalks around Haikaze-so intersection & railway crossing
  for (const cz of [5.8, 15.2, 33.4, 41.8]) {
    const wy = townSlopeY(cz) + 0.052;
    for (let k = -3; k <= 3; k++) {
      civil.box(k * 0.96, wy, cz, 0.44, 0.015, 2.1, { color: paintCol });
    }
  }
  // Yellow crossing stop lines
  civil.box(0, townSlopeY(34.8) + 0.052, 34.8, 7.2, 0.015, 0.34, { color: 0xf4c430 });
  civil.box(0, townSlopeY(39.4) + 0.052, 39.4, 7.2, 0.015, 0.34, { color: 0xf4c430 });

  // 6) Coastal Single-Track Railway Bed (ready for upcoming Blender Enoden tram & fumikiri kit)
  const railY = townSlopeY(RAIL_Z);
  civil.box(0, railY - 0.02, RAIL_Z, 180, 0.22, 4.4, { color: 0x9b9487 });
  for (let tx = -84; tx <= 84; tx += 0.94) {
    civil.box(tx, railY + 0.08, RAIL_Z, 0.24, 0.09, 2.25, { color: 0x6b523e });
  }
  for (const rz of [-0.62, 0.62]) {
    civil.box(0, railY + 0.145, RAIL_Z + rz, 180, 0.09, 0.08, { color: 0x6f7b82 });
  }
  civil.box(0, railY + 0.095, RAIL_Z, 10.6, 0.14, 3.6, { color: 0xd0c9ba });
  for (const [xa, xb] of [[-82, -6.2], [6.2, 82]]) {
    for (const sideZ of [RAIL_Z - 2.25, RAIL_Z + 2.25]) {
      for (let fx = xa; fx <= xb; fx += 3.4) {
        civil.box(fx, railY + 0.44, sideZ, 0.11, 0.88, 0.11, { color: 0xc8c2b4 });
      }
      civil.box((xa + xb) * 0.5, railY + 0.72, sideZ, xb - xa, 0.07, 0.07, { color: 0x455154 });
    }
  }

  // 7) Oceanfront Promenade, Seawall & Coastal Blue-Steel Railing (z = 51..56)
  civil.box(0, blvdY + 0.06, 53.3, 174, 0.24, 4.8, { color: 0xe2dac7 });
  civil.box(0, -0.35, SEAWALL_Z, 174, 3.65, 0.72, { color: 0xb0a99a });
  civil.box(0, blvdY + 0.62, SEAWALL_Z, 174, 0.22, 0.84, { color: 0xd5cebf });
  for (let rx = -80; rx <= 80; rx += 4.0) {
    civil.box(rx, blvdY + 0.96, SEAWALL_Z - 0.18, 0.08, 0.64, 0.08, { color: 0x4b748f });
  }
  civil.box(0, blvdY + 1.26, SEAWALL_Z - 0.18, 164, 0.07, 0.07, { color: 0x5c89a6 });
  civil.box(0, blvdY + 0.96, SEAWALL_Z - 0.18, 164, 0.05, 0.05, { color: 0x5c89a6 });

  // 8) North Hillside Stone Retaining Wall crest (z = -58)
  civil.box(0, 12.1, -58.5, 96, 4.0, 1.15, { color: 0x9e9788 });
  civil.box(0, 14.2, -58.5, 96.4, 0.24, 1.35, { color: 0xc7beac });

  const asphaltGeo = asphalt.build();
  const asphaltMesh = new THREE.Mesh(asphaltGeo, asphaltMat);
  asphaltMesh.receiveShadow = true;
  asphaltMesh.castShadow = false;
  asphaltMesh.matrixAutoUpdate = false;
  asphaltMesh.updateMatrix();
  root.add(asphaltMesh);

  const civilGeo = civil.build();
  const civilMesh = new THREE.Mesh(civilGeo, civilMat);
  civilMesh.receiveShadow = true;
  civilMesh.castShadow = false;
  civilMesh.matrixAutoUpdate = false;
  civilMesh.updateMatrix();
  root.add(civilMesh);
}

function buildOcean(root) {
  const oceanMat = createOceanMaterial();
  const geo = new THREE.PlaneGeometry(980, 520, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, oceanMat);
  mesh.position.set(0, OCEAN_Y, SEAWALL_Z + 256);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  root.add(mesh);
  return oceanMat.userData.waterTintUniform;
}

function buildBackdropFlora(root) {
  const rng = new RNG('rongwan-corner-flora-v2');
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  const maxGrass = 11500;
  const gMat = new Float32Array(maxGrass * 16);
  const gCol = new Float32Array(maxGrass * 3);
  let gCount = 0;

  for (let i = 0; i < 28000 && gCount < maxGrass; i++) {
    const x = rng.range(-82, 82);
    const z = rng.range(-84, 34);
    if (isOnRoadCorridor(x, z)) continue;
    // Leave a neat margin around Haikaze-so terrace & roads
    if (x > 2.0 && x < 21.0 && z > 12.0 && z < 28.5) continue;
    if (Math.abs(x) < 7.0 && z > -56 && z < 45) continue;
    if (Math.abs(z - PLAZA_Z) < 6.0 && Math.abs(x) < 55) continue;

    const y = coastalTownTerrainHeight(x, z);
    const p = patchNoise(x, z);
    if (p < 0.24 && rng.next() > 0.65) continue;

    dummy.position.set(x, y - 0.03, z);
    dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
    dummy.scale.set(rng.range(0.85, 1.28), lerp(0.76, 1.38, smoothstep(0.2, 0.85, p)), rng.range(0.88, 1.18));
    dummy.updateMatrix();
    dummy.matrix.toArray(gMat, gCount * 16);

    col.setHex(rng.pick([0xffffff, 0xf2fade, 0xe8f6d2, 0xfff8e4]));
    gCol[gCount * 3] = col.r;
    gCol[gCount * 3 + 1] = col.g;
    gCol[gCount * 3 + 2] = col.b;
    gCount++;
  }

  const grassMesh = new THREE.InstancedMesh(getGrassGeometry(), getGrassMaterial(), gCount);
  grassMesh.instanceMatrix.array.set(gMat.subarray(0, gCount * 16));
  grassMesh.instanceMatrix.needsUpdate = true;
  grassMesh.instanceColor = new THREE.InstancedBufferAttribute(gCol.subarray(0, gCount * 3), 3);
  grassMesh.castShadow = false;
  grassMesh.receiveShadow = true;
  grassMesh.computeBoundingSphere();
  root.add(grassMesh);

  // Wildflower clusters on the sunlit hillside & meadow flanks
  const maxF = 900;
  const fMat = new Float32Array(maxF * 16);
  const fCol = new Float32Array(maxF * 3);
  let fCount = 0;
  for (let i = 0; i < 3600 && fCount < maxF; i++) {
    const x = rng.range(-68, 68);
    const z = rng.range(-78, 28);
    if (isOnRoadCorridor(x, z)) continue;
    if (x > 1.0 && x < 22.0 && z > 10.0 && z < 30.0) continue;
    if (Math.abs(x) < 8.5 || Math.abs(z - PLAZA_Z) < 6.8) continue;

    const y = coastalTownTerrainHeight(x, z);
    dummy.position.set(x, y - 0.02, z);
    dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
    dummy.scale.setScalar(rng.range(0.85, 1.30));
    dummy.updateMatrix();
    dummy.matrix.toArray(fMat, fCount * 16);
    col.setHex(rng.pick([0xfff7dc, 0xffdf7a, 0xffb8a0, 0xd8eaff]));
    fCol[fCount * 3] = col.r;
    fCol[fCount * 3 + 1] = col.g;
    fCol[fCount * 3 + 2] = col.b;
    fCount++;
  }
  const fGeo = getFlowerGeometry().clone();
  fGeo.setAttribute('aPetalTint', new THREE.InstancedBufferAttribute(fCol.subarray(0, fCount * 3), 3));
  const flowerMesh = new THREE.InstancedMesh(fGeo, getFlowerMaterial(), fCount);
  flowerMesh.instanceMatrix.array.set(fMat.subarray(0, fCount * 16));
  flowerMesh.instanceMatrix.needsUpdate = true;
  flowerMesh.castShadow = false;
  flowerMesh.receiveShadow = false;
  flowerMesh.computeBoundingSphere();
  root.add(flowerMesh);
}

function buildCoastalTrees(root) {
  const rng = new RNG('rongwan-corner-trees-v2');
  const entries = [];
  const pushTree = (x, z, variant, s = 1.0) => {
    const y = coastalTownTerrainHeight(x, z);
    entries.push({
      x, y, z,
      rotY: rng.range(0, Math.PI * 2),
      sx: s * rng.range(0.92, 1.10),
      sy: s * rng.range(0.92, 1.12),
      sz: s * rng.range(0.92, 1.10),
      variant,
    });
  };

  // Curated hero-framing coastal trees (carefully clear of camera angles toward Haikaze-so!)
  pushTree(21.2, 22.8, 'wide', 1.12);   // East garden backdrop behind Haikaze-so
  pushTree(24.8, 17.5, 'tall', 1.02);   // Sunlit tree peeking behind east eaves
  pushTree(19.5, 29.0, 'citrus', 1.05); // Warm coastal citrus near back corner
  pushTree(-12.5, 17.5, 'compact', 0.92); // West plaza planter shade tree
  pushTree(-17.8, 22.0, 'wide', 1.15);
  pushTree(-22.0, 4.0, 'tall', 1.10);
  pushTree(18.5, 3.0, 'compact', 0.95); // Distant NE corner framing
  pushTree(26.0, 2.2, 'wide', 1.12);

  // Slope avenue framing groves (west & east hillsides)
  for (let z = -48; z <= -8; z += 11.5) {
    pushTree(-13.5 - rng.range(0, 5.5), z + rng.range(-2, 2), rng.pick(['tall', 'wide', 'compact']), rng.range(0.96, 1.24));
    pushTree(13.5 + rng.range(0, 5.5), z + rng.range(-2, 2), rng.pick(['tall', 'wide', 'compact']), rng.range(0.96, 1.24));
  }

  // North ridge lush Ghibli backdrop woods
  for (let i = 0; i < 34; i++) {
    const x = rng.range(-72, 72);
    const z = rng.range(-82, -61.5);
    pushTree(x, z, rng.pick(['wide', 'tall', 'compact']), rng.range(1.05, 1.45));
  }

  // Outer coastal flank woods
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const x = sx * rng.range(28, 70);
      const z = rng.range(-46, 30);
      if (Math.abs(z - PLAZA_Z) < 7.5) continue;
      pushTree(x, z, rng.pick(['wide', 'tall', 'compact', 'citrus']), rng.range(0.95, 1.32));
    }
  }

  placeStylizedTrees(root, entries);
}

function mountHaikazeHero(root, haikazeGltf, maxAniso) {
  const heroRoot = haikazeGltf.scene.clone(true);
  heroRoot.name = 'hero-haikaze';
  heroRoot.position.set(HERO_HAIKAZE.x, HERO_HAIKAZE.baseY, HERO_HAIKAZE.z);
  heroRoot.rotation.y = HERO_HAIKAZE.rotY;

  const aniso = Math.min(8, maxAniso || 4);
  heroRoot.traverse(obj => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    let isGlass = false;
    let isTinyGlow = false;
    for (const m of mats) {
      if (!m) continue;
      const mname = m.name || '';
      m.userData.preservePbr = true;
      for (const tex of [m.map, m.normalMap, m.roughnessMap, m.emissiveMap]) {
        if (tex) {
          tex.anisotropy = aniso;
          tex.needsUpdate = true;
        }
      }
      if (mname === 'Arch_Window_Glass') {
        isGlass = true;
        m.transparent = true;
        m.opacity = 0.28;
        m.depthWrite = false;
        m.roughness = 0.08;
        m.metalness = 0.12;
        m.envMapIntensity = 1.35;
      } else if (mname === 'Game_Solid_Metal') {
        m.envMapIntensity = 1.15;
      } else if (mname === 'Arch_Mosaic_Tiles') {
        m.envMapIntensity = 0.95;
      } else if (mname === 'Emissive_Vending' || mname === 'Arch_Porch_Lamp' || mname === 'Prop_Lantern_Paper') {
        isTinyGlow = true;
      }
    }
    obj.castShadow = !isGlass && !isTinyGlow;
    obj.receiveShadow = !isGlass;
  });

  root.add(heroRoot);
  return heroRoot;
}

export function createCoastalTown(haikazeGltf, maxAniso = 4) {
  const root = new THREE.Group();
  root.name = 'rongwan-coastal-corner';

  buildTownTerrain(root);
  buildRoadsAndCivil(root);
  const waterTintUniform = buildOcean(root);
  buildBackdropFlora(root);
  buildCoastalTrees(root);
  const heroRoot = mountHaikazeHero(root, haikazeGltf, maxAniso);

  return {
    root,
    heroRoot,
    waterTintUniform,
    update(time) {
      updateMeadowEnv(time);
    },
  };
}
