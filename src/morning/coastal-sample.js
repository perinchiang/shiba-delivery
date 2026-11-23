// Coastal detached-house 3D vertical-slice sample (Ghibli Painterly Style A):
// A 2x2 grid of 4 walled Japanese/East-Asian style detached homes around a corner
// intersection + 2.4m cut-through lane, upgraded with procedural gouache plaster/tile/brick
// shading, deep cool eave shadows, rolling cloud-shadowed hillsides, wind-swept grass,
// wildflowers, and Ghibli leaf-card trees.
import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { litMaterial } from '../core/materials.js';
import { RNG } from '../core/rng.js';
import { makeCanvas, canvasTexture, fbm2D } from '../core/textures.js';
import { clamp, smoothstep } from '../core/mathx.js';
import { SignKit } from './sign-kit.js';
import { CURB_H } from './street-layout.js';
import { CITY_PALETTE } from './city-palette.js';
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

// Block geometry constants (world metres)
const LOT_W = 8.8;
const LOT_D = 8.2;
const LANE_HALF = 1.2;    // 2.4m walkable/rideable cut-through alley between W and E pairs
const ROW_GAP_HALF = 0.5; // 1.0m planted hedge gap between N and S pairs
const SW_WIDTH = 2.0;
const ROAD_W = 6.4;

const LOT_X_OFF = LANE_HALF + LOT_W * 0.5;     // 5.6m
const LOT_Z_OFF = ROW_GAP_HALF + LOT_D * 0.5;  // 4.6m
const INNER_SW_X = LANE_HALF + LOT_W + SW_WIDTH; // 12.0m
const INNER_SW_Z = ROW_GAP_HALF + LOT_D + SW_WIDTH; // 10.7m
const ROAD_OUT_X = INNER_SW_X + ROAD_W;        // 18.4m
const ROAD_OUT_Z = INNER_SW_Z + ROAD_W;        // 17.1m

export function inCoastalSample(x, z) {
  return Math.abs(x - CX) <= 38 && Math.abs(z - CZ) <= 36;
}

export function coastalSidewalk(x, z) {
  if (!inCoastalSample(x, z)) return false;
  const dx = Math.abs(x - CX);
  const dz = Math.abs(z - CZ);
  if (dx >= LANE_HALF && dx <= INNER_SW_X && dz <= INNER_SW_Z) return true;
  if (dx >= ROAD_OUT_X && dx <= ROAD_OUT_X + 4.4 && dz >= ROAD_OUT_Z && dz <= ROAD_OUT_Z + 4.4) return true;
  if (dx >= ROAD_OUT_X && dx <= ROAD_OUT_X + 2.4 && dz <= INNER_SW_Z) return true;
  if (dz >= ROAD_OUT_Z && dz <= ROAD_OUT_Z + 2.4 && dx <= INNER_SW_X) return true;
  return false;
}

function pushOutBox(pos, minX, maxX, minZ, maxZ, margin) {
  const x0 = minX - margin, x1 = maxX + margin;
  const z0 = minZ - margin, z1 = maxZ + margin;
  if (pos.x <= x0 || pos.x >= x1 || pos.z <= z0 || pos.z >= z1) return;
  const dl = pos.x - x0, dr = x1 - pos.x;
  const dt = pos.z - z0, db = z1 - pos.z;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) pos.x = x0;
  else if (m === dr) pos.x = x1;
  else if (m === dt) pos.z = z0;
  else pos.z = z1;
}

export function constrainCoastalSample(x, z, walking) {
  const pos = {
    x: clamp(x, CX - 24.5, CX + 24.5),
    z: clamp(z, CZ - 22.5, CZ + 22.5),
  };
  const margin = walking ? 0.38 : 0.68;
  pushOutBox(pos, CX - LANE_HALF - LOT_W, CX - LANE_HALF, CZ - LOT_Z_OFF - LOT_D * 0.5, CZ + LOT_Z_OFF + LOT_D * 0.5, margin);
  pushOutBox(pos, CX + LANE_HALF, CX + LANE_HALF + LOT_W, CZ - LOT_Z_OFF - LOT_D * 0.5, CZ + LOT_Z_OFF + LOT_D * 0.5, margin);
  pushOutBox(pos, CX - 11.15, CX - 10.15, CZ + 5.80, CZ + 7.00, walking ? 0.25 : 0.45);
  return pos;
}

// Deterministic rolling Ghibli hillside surrounding the flat town terrace & road corridors.
export function coastalHillHeight(x, z) {
  const dx = x - CX;
  const dz = z - CZ;
  const adx = Math.abs(dx);
  const adz = Math.abs(dz);

  // Keep the 4-house terrace and corner aprons flat at -0.025, rising gently past 24m
  const padMask = Math.max(smoothstep(24.0, 72.0, adx), smoothstep(23.0, 70.0, adz));

  // Smooth 2D corridor blending around the 4 extending asphalt roads (zero cliff seams)
  const ewKeep = (1.0 - smoothstep(38.0, 58.0, adx)) * (1.0 - smoothstep(3.8, 14.0, Math.abs(adz - 13.9)));
  const nsKeep = (1.0 - smoothstep(34.0, 54.0, adz)) * (1.0 - smoothstep(3.8, 14.0, Math.abs(adx - 15.2)));
  const roadSafe = 1.0 - Math.max(ewKeep, nsKeep);

  // Gentle 10-15° Ghibli rolling hills surrounding the town valley
  const northBoost = smoothstep(5.0, 95.0, -dz) * 5.0;
  const swSlope = smoothstep(28.0, 105.0, Math.hypot(dx + 16, dz - 16)) * 3.0;
  const swell = 0.55 + 0.45 * Math.sin(dx * 0.032 + Math.cos(dz * 0.025) * 1.3);
  const undul = 0.50 + 0.50 * Math.cos(dz * 0.028 - dx * 0.020 + 0.8);
  const hillBase = 1.8 + 4.4 * swell + 3.4 * undul + northBoost + swSlope;

  return -0.025 + hillBase * padMask * roadSafe;
}

function makeAsphaltTexture() {
  const { canvas, ctx, w, h } = makeCanvas(256, 256);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const macro = fbm2D(u * 4, v * 4, 3, 17, 4);
      const grain = fbm2D(u * 24, v * 24, 2, 53, 24);
      const shade = 0.90 + macro * 0.10 + grain * 0.07;
      d[i++] = Math.round(92 * shade);
      d[i++] = Math.round(98 * shade);
      d[i++] = Math.round(104 * shade);
      d[i++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = canvasTexture(canvas, { repeat: true, aniso: 4 });
  tex.repeat.set(16, 16);
  return tex;
}

function makeSidewalkTexture() {
  const { canvas, ctx, w, h } = makeCanvas(256, 256);
  ctx.fillStyle = '#e7dcc4';
  ctx.fillRect(0, 0, w, h);
  const tile = 64;
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const n = fbm2D(tx * 1.7, ty * 2.3, 2, 91, 4);
      const v = Math.round((n - 0.5) * 12);
      ctx.fillStyle = `rgb(${232 + v},${219 + v},${194 + v})`;
      ctx.fillRect(tx * tile + 2, ty * tile + 2, tile - 4, tile - 4);
    }
  }
  ctx.strokeStyle = 'rgba(155, 140, 114, 0.30)';
  ctx.lineWidth = 2;
  for (let k = 0; k <= 256; k += tile) {
    ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(256, k); ctx.stroke();
  }
  const tex = canvasTexture(canvas, { repeat: true, aniso: 4 });
  tex.repeat.set(14, 14);
  return tex;
}

function makeContactTex() {
  const { canvas, ctx } = makeCanvas(64, 64);
  const grad = ctx.createRadialGradient(32, 32, 8, 32, 32, 31);
  grad.addColorStop(0, 'rgba(62, 54, 46, 0.24)');
  grad.addColorStop(0.7, 'rgba(62, 54, 46, 0.12)');
  grad.addColorStop(1, 'rgba(62, 54, 46, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return canvasTexture(canvas, { mipmaps: false });
}

// Patch sidewalks & asphalt with gentle drifting cloud shadows matching the hills.
function patchCloudShadowOnly(material, strength = 0.34, key = 'coastal-cloud-ground-v1') {
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

// Ghibli painterly architecture shader for houses & walled yards:
// - Sloped roofs: procedural Japanese corrugated tile ribs + staggered courses + per-tile gouache tone
// - Brick fences & chimney: staggered running-bond bricks with soft warm variation
// - Plaster walls: soft gouache wash + deep cool blue-lavender eave & cornice shadows + base grounding
// - Window glass (0x527a78): crisp sky reflection gradient (preserves exact vertex colors for TOD night glow)
function createGhibliArchMaterial() {
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

        // Material classification from vertex color & normal (zero extra textures/draw calls)
        float isGlass = smoothstep(0.18, 0.08, c.r)
                      * smoothstep(1.35, 1.85, c.g / max(c.r, 0.01))
                      * smoothstep(1.25, 1.75, c.b / max(c.r, 0.01))
                      * (1.0 - smoothstep(0.25, 0.55, abs(wN.y)));

        float isRoofSlope = smoothstep(0.20, 0.36, wN.y) * (1.0 - smoothstep(0.90, 0.97, wN.y))
                          * smoothstep(2.05, 2.35, lPos.y);

        float isBrick = (1.0 - smoothstep(0.25, 0.55, abs(wN.y)))
                      * smoothstep(0.36, 0.44, c.r)
                      * smoothstep(2.05, 2.38, c.r / max(c.g, 0.02))
                      * (1.0 - smoothstep(3.10, 4.20, c.r / max(c.g, 0.02)))
                      * smoothstep(2.10, 3.00, c.r / max(c.b, 0.02))
                      * max(1.0 - smoothstep(1.25, 1.55, lPos.y), smoothstep(5.2, 5.8, lPos.y));

        float isTimber = (1.0 - smoothstep(0.25, 0.55, abs(wN.y)))
                       * (1.0 - isBrick)
                       * smoothstep(0.34, 0.45, c.r)
                       * smoothstep(1.48, 1.78, c.r / max(c.g, 0.02))
                       * (1.0 - smoothstep(1.98, 2.25, c.r / max(c.g, 0.02)));

        float isPlaster = (1.0 - isGlass) * (1.0 - isRoofSlope) * (1.0 - isBrick) * (1.0 - isTimber);

        // 1) Painted Japanese corrugated tile roofs
        if (isRoofSlope > 0.01) {
          vec2 slopeDir = length(lN.xz) > 0.05 ? normalize(lN.xz) : vec2(0.0, 1.0);
          vec2 acrossDir = vec2(-slopeDir.y, slopeDir.x);
          float uA = dot(lPos.xz, acrossDir);
          float vD = lPos.y * 1.48 + dot(lPos.xz, slopeDir) * 0.82;

          float colIdx = floor(uA / 0.25);
          float rowIdx = floor(vD / 0.30);
          float rib = sin(fract(uA / 0.25) * 6.28318);
          float rowFrac = fract(vD / 0.30);
          float lap = smoothstep(0.0, 0.14, rowFrac);
          float tileRand = mHash(vec2(colIdx, rowIdx));
          float macroBrush = mNoise(wPos.xz * 0.55);

          vec3 tileTint = mix(vec3(0.90, 0.92, 0.98), vec3(1.09, 1.04, 0.96), tileRand);
          float shade = (0.91 + 0.09 * rib) * mix(0.84, 1.04, lap) * mix(0.95, 1.05, macroBrush);
          c = mix(c, c * tileTint * shade, isRoofSlope);
        }

        // 2) Staggered warm brick fences & chimney
        if (isBrick > 0.01) {
          float uWall = lPos.x + lPos.z;
          float by = floor(lPos.y / 0.135);
          float bx = floor(uWall / 0.29 + 0.5 * mod(by, 2.0));
          float fx = fract(uWall / 0.29 + 0.5 * mod(by, 2.0));
          float fy = fract(lPos.y / 0.135);
          float mortar = min(smoothstep(0.0, 0.09, fx) * smoothstep(1.0, 0.91, fx),
                             smoothstep(0.0, 0.11, fy) * smoothstep(1.0, 0.89, fy));
          float bRand = mHash(vec2(bx, by));
          vec3 bCol = c * mix(vec3(0.88, 0.86, 0.88), vec3(1.12, 1.05, 0.96), bRand);
          vec3 mortarCol = vec3(0.76, 0.70, 0.61);
          c = mix(c, mix(mortarCol, bCol, mix(0.45, 1.0, mortar)), isBrick);
        }

        // 2b) Warm wood fence planks
        if (isTimber > 0.01) {
          float plankIdx = floor(lPos.y / 0.16);
          float plankF = fract(lPos.y / 0.16);
          float seam = smoothstep(0.0, 0.08, plankF) * smoothstep(1.0, 0.92, plankF);
          float grain = mNoise(vec2((lPos.x + lPos.z) * 1.4, lPos.y * 12.0));
          float pVar = mHash(vec2(plankIdx, floor((lPos.x + lPos.z) * 0.5)));
          vec3 wCol = c * mix(0.90, 1.10, pVar) * mix(0.93, 1.06, grain) * mix(0.75, 1.0, seam);
          c = mix(c, wCol, isTimber);
        }

        // 3) Hand-painted gouache plaster & cool Ghibli eave/cornice shadows
        if (isPlaster > 0.01) {
          float vertWall = 1.0 - smoothstep(0.25, 0.65, abs(wN.y));
          float pMacro = mNoise(vec2(wPos.x + wPos.z, wPos.y * 1.15) * 0.45);
          float pFine  = mNoise(vec2(wPos.x - wPos.z, wPos.y * 1.4) * 2.4);
          vec3 gouache = mix(vec3(0.95, 0.96, 1.00), vec3(1.05, 1.02, 0.96), pMacro)
                       * mix(0.97, 1.03, pFine);

          // Deep cool slate-blue shadows tucked cleanly under main eaves, balcony & 2F trim
          float mainEave = vertWall * smoothstep(3.85, 4.78, lPos.y) * (1.0 - smoothstep(4.95, 5.45, lPos.y));
          float midCornice = vertWall * smoothstep(2.25, 2.66, lPos.y) * (1.0 - smoothstep(2.74, 2.95, lPos.y));
          float baseAO = vertWall * (1.0 - smoothstep(0.05, 0.58, lPos.y));
          float coolMask = clamp(mainEave * 0.82 + midCornice * 0.65, 0.0, 1.0);

          vec3 shadowed = c * gouache * mix(vec3(1.0), vec3(0.70, 0.77, 0.92), coolMask * 0.52);
          shadowed *= mix(1.0, 0.84, baseAO * 0.55);
          c = mix(c, shadowed, isPlaster);
        }

        // 4) Crisp window sky reflection sheen (daytime depth while preserving night glow tag)
        if (isGlass > 0.01) {
          float diag = fract((lPos.x + lPos.z) * 0.45 + lPos.y * 0.65);
          float sheen = smoothstep(0.32, 0.52, diag) * (1.0 - smoothstep(0.56, 0.76, diag));
          float topGrad = smoothstep(0.6, 4.5, lPos.y);
          vec3 skyGlass = c * mix(0.92, 1.18, topGrad * 0.5 + sheen * 0.6);
          c = mix(c, skyGlass, isGlass);
        }

        // Subtle drifting cloud shadow linking buildings with surrounding hillsides
        vec3 cloud = mix(vec3(1.0), meadowCloudShadow(wPos.xz, uMeadowTime), 0.36);
        diffuseColor.rgb = c * cloud;`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|coastal-ghibli-arch-v1';
  return mat;
}

function addOverheadSpan(builder, p0, p1, sag = 0.42, radius = 0.018, segs = 7) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push([
      THREE.MathUtils.lerp(p0[0], p1[0], t),
      THREE.MathUtils.lerp(p0[1], p1[1], t) - 4 * sag * t * (1 - t),
      THREE.MathUtils.lerp(p0[2], p1[2], t),
    ]);
  }
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const nx = -dz / len * radius, nz = dx / len * radius;
    builder.quad(
      [a[0] - nx, a[1], a[2] - nz],
      [a[0] + nx, a[1], a[2] + nz],
      [b[0] + nx, b[1], b[2] + nz],
      [b[0] - nx, b[1], b[2] - nz],
      { color: 0x3b4442 },
    );
  }
}

function buildCoastalHillTerrain(root) {
  const half = 122;
  const step = 3.0;
  const coords = [];
  for (let d = -half; d <= half + 0.01; d += step) coords.push(d);
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

function inPavedOrLot(x, z) {
  const dx = Math.abs(x - CX);
  const dz = Math.abs(z - CZ);
  // Inner sidewalk islands + central cut-through lane + 4 walled residential lots
  if (dx <= INNER_SW_X + 0.15 && dz <= INNER_SW_Z + 0.15) return true;
  // Perimeter asphalt roads (EW & NS)
  if (dx <= 42.3 && Math.abs(dz - (INNER_SW_Z + ROAD_W * 0.5)) <= ROAD_W * 0.5 + 0.18) return true;
  if (dz <= 38.3 && Math.abs(dx - (INNER_SW_X + ROAD_W * 0.5)) <= ROAD_W * 0.5 + 0.18) return true;
  // Outer corner sidewalks & perimeter sidewalk ribbons
  if (dx >= ROAD_OUT_X - 0.15 && dx <= ROAD_OUT_X + 4.95 && dz >= ROAD_OUT_Z - 0.15 && dz <= ROAD_OUT_Z + 4.95) return true;
  if (dx >= ROAD_OUT_X - 0.15 && dx <= ROAD_OUT_X + 2.55 && dz <= INNER_SW_Z + 0.15) return true;
  if (dz >= ROAD_OUT_Z - 0.15 && dz <= ROAD_OUT_Z + 2.55 && dx <= INNER_SW_X + 0.15) return true;
  return false;
}

function buildCoastalMeadowFlora(root) {
  const rng = new RNG(8421);
  const grassTransforms = [];
  const flowerTransforms = [];
  const flowerColors = [];
  const dummy = new THREE.Object3D();

  const palette = [
    new THREE.Color(0xfff8e6), // Cream daisy
    new THREE.Color(0x8e86e8), // Meadow periwinkle
    new THREE.Color(0xffe169), // Warm buttercup
    new THREE.Color(0xb6c8f8), // Sky flower
  ];

  // Dense lush perimeter grass & sweeping hillside blades
  const totalGrass = 13500;
  for (let i = 0; i < totalGrass; i++) {
    const nearBias = i < 9200;
    const ang = rng.next() * Math.PI * 2;
    const dist = nearBias
      ? 18.0 + Math.pow(rng.next(), 1.35) * 34.0
      : 36.0 + rng.next() * 62.0;
    const px = CX + Math.cos(ang) * dist;
    const pz = CZ + Math.sin(ang) * dist;
    if (inPavedOrLot(px, pz)) continue;

    const clumping = patchNoise(px, pz);
    if (!nearBias && clumping < 0.22 && rng.chance(0.45)) continue;

    const py = coastalHillHeight(px, pz) - 0.025;
    const isHill = py > 0.25;
    const wMul = (isHill ? 1.45 : 1.05) * (0.88 + rng.next() * 0.34);
    const hMul = (0.78 + 0.56 * clumping) * (isHill ? 1.35 : 0.98) * (0.84 + rng.next() * 0.32);

    dummy.position.set(px, py, pz);
    dummy.rotation.set((rng.next() - 0.5) * 0.18, rng.next() * Math.PI * 2, (rng.next() - 0.5) * 0.18);
    dummy.scale.set(wMul, hMul, wMul);
    dummy.updateMatrix();
    grassTransforms.push(dummy.matrix.clone());
  }

  // Soft grass/herb tufts tucked along the central 1m hedge row gap between N & S lots
  for (let i = 0; i < 160; i++) {
    const sx = rng.next() < 0.5 ? -1 : 1;
    const px = CX + sx * (LANE_HALF + 0.4 + rng.next() * (LOT_W - 0.8));
    const pz = CZ + (rng.next() - 0.5) * 0.65;
    dummy.position.set(px, CURB_H - 0.02, pz);
    dummy.rotation.set(0, rng.next() * Math.PI * 2, 0);
    const s = 0.65 + rng.next() * 0.35;
    dummy.scale.set(s, s * 0.85, s);
    dummy.updateMatrix();
    grassTransforms.push(dummy.matrix.clone());
  }

  const grassMesh = new THREE.InstancedMesh(getGrassGeometry(), getGrassMaterial(), grassTransforms.length);
  for (let i = 0; i < grassTransforms.length; i++) grassMesh.setMatrixAt(i, grassTransforms[i]);
  grassMesh.instanceMatrix.needsUpdate = true;
  grassMesh.castShadow = false;
  grassMesh.receiveShadow = true;
  grassMesh.computeBoundingSphere();
  root.add(grassMesh);

  // Clustered wildflowers on foreground slopes, road borders & row gap
  for (let i = 0; i < 1400; i++) {
    const ang = rng.next() * Math.PI * 2;
    const dist = 18.0 + Math.pow(rng.next(), 1.35) * 42.0;
    const px = CX + Math.cos(ang) * dist;
    const pz = CZ + Math.sin(ang) * dist;
    if (inPavedOrLot(px, pz)) continue;

    const cluster = patchNoise(px * 0.85 + 17.0, pz * 0.85 - 9.0);
    if (cluster < 0.38 && rng.chance(0.78)) continue;

    const py = coastalHillHeight(px, pz) - 0.02;
    const sc = 0.85 + rng.next() * 0.55;
    dummy.position.set(px, py, pz);
    dummy.rotation.set((rng.next() - 0.5) * 0.24, rng.next() * Math.PI * 2, (rng.next() - 0.5) * 0.24);
    dummy.scale.set(sc, sc * (0.68 + rng.next() * 0.45), sc);
    dummy.updateMatrix();
    flowerTransforms.push(dummy.matrix.clone());

    const roll = rng.next();
    flowerColors.push(roll < 0.44 ? palette[0] : roll < 0.78 ? palette[1] : roll < 0.92 ? palette[2] : palette[3]);
  }

  const fGeo = getFlowerGeometry().clone();
  const tintArray = new Float32Array(flowerTransforms.length * 3);
  for (let i = 0; i < flowerColors.length; i++) {
    tintArray[i * 3] = flowerColors[i].r;
    tintArray[i * 3 + 1] = flowerColors[i].g;
    tintArray[i * 3 + 2] = flowerColors[i].b;
  }
  fGeo.setAttribute('aPetalTint', new THREE.InstancedBufferAttribute(tintArray, 3));

  const flowerMesh = new THREE.InstancedMesh(fGeo, getFlowerMaterial(), flowerTransforms.length);
  for (let i = 0; i < flowerTransforms.length; i++) flowerMesh.setMatrixAt(i, flowerTransforms[i]);
  flowerMesh.instanceMatrix.needsUpdate = true;
  flowerMesh.castShadow = false;
  flowerMesh.receiveShadow = true;
  flowerMesh.computeBoundingSphere();
  root.add(flowerMesh);

  return [grassMesh.geometry, fGeo];
}

function buildCozyNeighborhoodAccents(root, lots) {
  const accentMat = litMaterial({ vertexColors: true, grid: false, roughness: 0.88 });
  const geo = new GeoBuilder();

  // 1) Bright ripe citrus fruits tucked cleanly inside the 4 yard trees
  const citrusSpots = [
    [-0.36, 1.66, 0.24], [0.34, 1.84, -0.20], [0.10, 2.18, 0.34],
    [-0.22, 1.98, -0.32], [0.42, 1.56, 0.24], [-0.34, 1.72, -0.18],
  ];
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const axisY = new THREE.Vector3(0, 1, 0);

  for (const lot of lots) {
    q.setFromAxisAngle(axisY, lot.rotY);
    const treeX = lot.citrus[0], treeZ = lot.citrus[1];
    for (let k = 0; k < citrusSpots.length; k++) {
      const [ox, oy, oz] = citrusSpots[k];
      v.set(treeX + ox, oy, treeZ + oz).applyQuaternion(q);
      const wx = lot.x + v.x, wy = CURB_H + v.y, wz = lot.z + v.z;
      geo.cylinder(wx, wy - 0.045, wz, 0.058, 0.052, 0.095, { color: 0xf48c28, seg: 8 });
    }

    // Terracotta flower pot + blooms beside the right gate pillar (inside yard edge)
    v.set(1.62, 0.0, 3.38).applyQuaternion(q);
    const px = lot.x + v.x, py = CURB_H, pz = lot.z + v.z;
    geo.cylinder(px, py, pz, 0.14, 0.18, 0.28, { color: 0xc86d4b, seg: 10 });
    geo.cylinder(px, py + 0.24, pz, 0.19, 0.19, 0.06, { color: 0xd97d58, seg: 10 });
    geo.cylinder(px, py + 0.29, pz, 0.16, 0.21, 0.18, { color: 0x5c9652, seg: 8 });
    geo.box(px + 0.06, py + 0.47, pz + 0.04, 0.08, 0.06, 0.08, { color: 0xfff5d8 });
    geo.box(px - 0.07, py + 0.45, pz - 0.05, 0.07, 0.06, 0.07, { color: 0xffd75e });
  }

  // 2) Sloped 3D striped fabric awning & pastel laundry on House A (小林宅, SW lot rotY = 0)
  const sw = lots[0];
  const awX = sw.x + 1.25;
  const awZ0 = sw.z + 1.08, awZ1 = sw.z + 1.76;
  const awY0 = CURB_H + 2.40, awY1 = CURB_H + 2.12;
  for (let s = 0; s < 6; s++) {
    const x0 = awX - 0.78 + s * 0.26, x1 = x0 + 0.26;
    const col = s % 2 === 0 ? 0xd96e4c : 0xfaf0d8;
    // Sloped top surface
    geo.quad([x0, awY0, awZ0], [x0, awY1, awZ1], [x1, awY1, awZ1], [x1, awY0, awZ0], { color: col });
    // Shaded underside
    geo.quad([x1, awY0 - 0.05, awZ0], [x1, awY1 - 0.05, awZ1], [x0, awY1 - 0.05, awZ1], [x0, awY0 - 0.05, awZ0], { color: 0xb99d88 });
    // Crisp front scalloped valence drop
    geo.box((x0 + x1) * 0.5, awY1 - 0.075, awZ1 - 0.015, 0.255, 0.14, 0.04, { color: col });
  }
  for (const bx of [awX - 0.74, awX + 0.74]) {
    geo.box(bx, awY1 + 0.06, awZ0 + 0.28, 0.045, 0.045, 0.58, { color: 0x6f523d });
  }

  // Cute pastel laundry hanging cleanly inside House A's 2F balcony rail (local x=0.4..1.9, y=3.68, z=1.72)
  const laY = CURB_H + 3.55, laZ = sw.z + 1.72;
  const items = [
    { x: sw.x + 0.55, w: 0.32, h: 0.38, col: 0xfff4d9 },
    { x: sw.x + 1.02, w: 0.28, h: 0.34, col: 0x9ac6d9 },
    { x: sw.x + 1.48, w: 0.30, h: 0.36, col: 0xf0a68d },
  ];
  geo.box(sw.x + 1.02, laY + 0.21, laZ, 1.55, 0.025, 0.025, { color: 0x6f5845 });
  for (const it of items) {
    geo.box(it.x, laY, laZ, it.w, it.h, 0.03, { color: it.col });
  }

  // 3) Organic rounded leaf-puffs along the 1m planted row gap between N & S lots
  for (const sx of [-1, 1]) {
    for (let k = -3; k <= 3; k++) {
      const bx = CX + sx * LOT_X_OFF + k * 1.15;
      const bz = CZ + ((k % 2 === 0) ? 0.08 : -0.08);
      const r = 0.34 + ((Math.abs(k) % 2) * 0.08);
      const col = k % 2 === 0 ? 0x5c9652 : 0x6fa858;
      geo.cylinder(bx, CURB_H + 0.12, bz, r, r * 0.72, 0.38, { color: col, seg: 8 });
      if (k % 3 === 0) geo.box(bx + 0.08, CURB_H + 0.48, bz, 0.07, 0.06, 0.07, { color: 0xffe484 });
    }
  }

  const mesh = geo.mesh(accentMat, 'coastal-ghibli-accents');
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  root.add(mesh);
  return [accentMat, mesh.geometry];
}

export function createCoastalSample(housesGltf, _roundTreeTemplate) {
  const root = new THREE.Group();
  root.name = 'coastal-sample';

  const archMat = createGhibliArchMaterial();
  const propMat = litMaterial({ vertexColors: true, grid: false, roughness: 0.90 });
  const kitMeshes = {};
  housesGltf.scene.traverse(obj => {
    if (!obj.isMesh || !obj.name) return;
    const isArch = obj.name.startsWith('House_') || obj.name.startsWith('Lot_Wall_');
    obj.material = isArch ? archMat : propMat;
    obj.castShadow = false;
    obj.receiveShadow = true;
    kitMeshes[obj.name] = obj;
  });

  const disposables = [archMat, propMat];
  const trackTex = t => { disposables.push(t); return t; };
  const trackMat = m => { disposables.push(m); return m; };

  // 1) Rolling Ghibli hillside terrain (flat under town terrace & 4 road corridors)
  disposables.push(buildCoastalHillTerrain(root));

  // 2) Textured perimeter asphalt loop + corner intersection with drifting cloud shadows
  const asphaltTex = trackTex(makeAsphaltTexture());
  const asphaltMat = trackMat(patchCloudShadowOnly(
    litMaterial({ map: asphaltTex, roughness: 0.94, grid: false }),
    0.30,
    'coastal-asphalt-cloud-v1',
  ));
  const asphaltGeo = new GeoBuilder();
  asphaltGeo.box(CX, -0.012, CZ + INNER_SW_Z + ROAD_W * 0.5, 84, 0.024, ROAD_W, { color: 0xffffff });
  asphaltGeo.box(CX, -0.012, CZ - INNER_SW_Z - ROAD_W * 0.5, 84, 0.024, ROAD_W, { color: 0xffffff });
  asphaltGeo.box(CX - INNER_SW_X - ROAD_W * 0.5, -0.012, CZ, ROAD_W, 0.024, 76, { color: 0xffffff });
  asphaltGeo.box(CX + INNER_SW_X + ROAD_W * 0.5, -0.012, CZ, ROAD_W, 0.024, 76, { color: 0xffffff });
  const asphaltMesh = asphaltGeo.mesh(asphaltMat, 'coastal-asphalt');
  asphaltMesh.receiveShadow = true;
  root.add(asphaltMesh);

  // 3) Tiled sidewalks + central cut-through stone lane with subtle cloud shadow
  const sidewalkTex = trackTex(makeSidewalkTexture());
  const sidewalkMat = trackMat(patchCloudShadowOnly(
    litMaterial({ map: sidewalkTex, roughness: 0.92, grid: false }),
    0.34,
    'coastal-sidewalk-cloud-v1',
  ));
  const swGeo = new GeoBuilder();
  const islandW = INNER_SW_X - LANE_HALF; // 10.8m
  const islandCenterX = LANE_HALF + islandW * 0.5; // 6.6m
  for (const sx of [-1, 1]) {
    swGeo.box(CX + sx * islandCenterX, CURB_H * 0.5, CZ, islandW, CURB_H, INNER_SW_Z * 2, { color: 0xffffff });
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      swGeo.box(CX + sx * (ROAD_OUT_X + 2.4), CURB_H * 0.5, CZ + sz * (ROAD_OUT_Z + 2.4), 4.8, CURB_H, 4.8, { color: 0xf4ecd8 });
    }
    swGeo.box(CX + sx * (ROAD_OUT_X + 1.2), CURB_H * 0.5, CZ, 2.4, CURB_H, INNER_SW_Z * 2, { color: 0xf4ecd8 });
  }
  for (const sz of [-1, 1]) {
    swGeo.box(CX, CURB_H * 0.5, CZ + sz * (ROAD_OUT_Z + 1.2), INNER_SW_X * 2, CURB_H, 2.4, { color: 0xf4ecd8 });
  }
  swGeo.box(CX, 0.008, CZ, LANE_HALF * 2, 0.016, INNER_SW_Z * 2 + 0.12, { color: 0xd9cdb6 });
  const swMesh = swGeo.mesh(sidewalkMat, 'coastal-sidewalk');
  swMesh.receiveShadow = true;
  root.add(swMesh);

  // 4) Road markings, crosswalks, curbs, soil strip & overhead utility wires
  const detailMat = trackMat(litMaterial({ vertexColors: true, grid: false, roughness: 0.90 }));
  const det = new GeoBuilder();
  const roadEdgeS = CZ + INNER_SW_Z + ROAD_W * 0.5;
  const roadEdgeN = CZ - INNER_SW_Z - ROAD_W * 0.5;
  const roadEdgeW = CX - INNER_SW_X - ROAD_W * 0.5;
  const roadEdgeE = CX + INNER_SW_X + ROAD_W * 0.5;

  for (let k = -39; k <= 39; k += 2.6) {
    const wx = CX + k;
    if (Math.abs(wx - roadEdgeW) > 3.6 && Math.abs(wx - roadEdgeE) > 3.6) {
      det.box(wx, 0.008, roadEdgeS, 1.35, 0.012, 0.11, { color: CITY_PALETTE.roadPaint });
      det.box(wx, 0.008, roadEdgeN, 1.35, 0.012, 0.11, { color: CITY_PALETTE.roadPaint });
    }
  }
  for (let k = -34; k <= 34; k += 2.6) {
    const wz = CZ + k;
    if (Math.abs(wz - roadEdgeS) > 3.6 && Math.abs(wz - roadEdgeN) > 3.6) {
      det.box(roadEdgeW, 0.008, wz, 0.11, 0.012, 1.35, { color: CITY_PALETTE.roadPaint });
      det.box(roadEdgeE, 0.008, wz, 0.11, 0.012, 1.35, { color: CITY_PALETTE.roadPaint });
    }
  }
  for (let i = -3; i <= 3; i++) {
    det.box(CX - INNER_SW_X + 0.8, 0.008, roadEdgeS + i * 0.72, 1.4, 0.012, 0.34, { color: CITY_PALETTE.roadPaint });
    det.box(CX - ROAD_OUT_X - 0.8, 0.008, roadEdgeS + i * 0.72, 1.4, 0.012, 0.34, { color: CITY_PALETTE.roadPaint });
    det.box(roadEdgeW + i * 0.72, 0.008, CZ + INNER_SW_Z - 0.8, 0.34, 0.012, 1.4, { color: CITY_PALETTE.roadPaint });
    det.box(roadEdgeW + i * 0.72, 0.008, CZ + ROAD_OUT_Z + 0.8, 0.34, 0.012, 1.4, { color: CITY_PALETTE.roadPaint });
  }
  for (const sx of [-1, 1]) {
    const x0 = CX + sx * (LANE_HALF + LOT_W + SW_WIDTH - 0.12);
    det.box(x0, CURB_H * 0.55, CZ, 0.24, CURB_H * 1.06, INNER_SW_Z * 2, { color: 0xeee3cc });
    det.box(CX + sx * islandCenterX, CURB_H * 0.55, CZ + INNER_SW_Z - 0.12, islandW, CURB_H * 1.06, 0.24, { color: 0xeee3cc });
    det.box(CX + sx * islandCenterX, CURB_H * 0.55, CZ - INNER_SW_Z + 0.12, islandW, CURB_H * 1.06, 0.24, { color: 0xeee3cc });
  }
  // Low soil strip under the organic hedge puffs between North & South lots
  for (const sx of [-1, 1]) {
    det.box(CX + sx * LOT_X_OFF, CURB_H + 0.08, CZ, LOT_W - 0.4, 0.16, 0.78, { color: 0x74583f });
  }

  const poleA = [CX - 11.4, CURB_H, CZ + 4.0];
  const poleB = [CX - 11.4, CURB_H, CZ + 18.0];
  const poleC = [CX + 11.4, CURB_H, CZ + 10.2];
  for (const ox of [-0.66, 0.0, 0.66]) {
    addOverheadSpan(det, [poleA[0] + ox, CURB_H + 6.38, poleA[2]], [poleB[0] + ox, CURB_H + 6.38, poleB[2]], 0.48);
  }
  addOverheadSpan(det, [poleA[0], CURB_H + 6.38, poleA[2] + 0.1], [poleC[0], CURB_H + 6.38, poleC[2]], 0.75);

  const detailMesh = det.mesh(detailMat, 'coastal-details');
  detailMesh.receiveShadow = true;
  root.add(detailMesh);

  // 5) Assemble the 2x2 grid of 4 walled detached houses + AC units + gate nameplates + Ghibli yard citrus trees
  const contactTex = trackTex(makeContactTex());
  const contactMat = trackMat(new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false }));
  const signKit = new SignKit({ rng: new RNG(4021), mode: 'lit', storybook: true, density: 1 });

  const lots = [
    {
      name: '小林宅', sub: '101',
      x: CX - LOT_X_OFF, z: CZ + LOT_Z_OFF, rotY: 0,
      house: 'House_A', wall: 'Lot_Wall_Cream',
      citrus: [-2.8, 2.3], ac: [-3.14, 1.45, -1.25, -Math.PI / 2],
    },
    {
      name: '陈家', sub: '102',
      x: CX + LOT_X_OFF, z: CZ + LOT_Z_OFF, rotY: 0,
      house: 'House_B', wall: 'Lot_Wall_Brick',
      citrus: [2.9, 2.5], ac: [3.09, 1.35, -1.10, Math.PI / 2],
    },
    {
      name: '佐藤宅', sub: '103',
      x: CX - LOT_X_OFF, z: CZ - LOT_Z_OFF, rotY: -Math.PI / 2,
      house: 'House_C', wall: 'Lot_Wall_Timber',
      citrus: [-2.5, 2.5], ac: [2.49, 1.35, -1.65, Math.PI / 2],
    },
    {
      name: '林家', sub: '104',
      x: CX + LOT_X_OFF, z: CZ - LOT_Z_OFF, rotY: Math.PI / 2,
      house: 'House_B', wall: 'Lot_Wall_Cream',
      citrus: [2.7, 2.4], ac: [-3.04, 1.35, -1.25, -Math.PI / 2],
    },
  ];

  const yardCitrusEntries = [];
  const axisY = new THREE.Vector3(0, 1, 0);
  const vTmp = new THREE.Vector3();
  const qTmp = new THREE.Quaternion();

  const placeProp = (meshName, x, y, z, rotY = 0, scale = 1) => {
    const src = kitMeshes[meshName];
    if (!src) return null;
    const clone = src.clone();
    clone.position.set(x, y, z);
    clone.rotation.y = rotY;
    clone.scale.setScalar(scale);
    root.add(clone);
    return clone;
  };

  for (const lot of lots) {
    const lotGroup = new THREE.Group();
    lotGroup.position.set(lot.x, CURB_H, lot.z);
    lotGroup.rotation.y = lot.rotY;

    const houseMesh = kitMeshes[lot.house].clone();
    const wallMesh = kitMeshes[lot.wall].clone();
    lotGroup.add(houseMesh, wallMesh);

    const housePad = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 6.4), contactMat);
    housePad.rotation.x = -Math.PI / 2;
    housePad.position.set(0, 0.012, -1.15);
    lotGroup.add(housePad);

    const ac = kitMeshes.Prop_ACUnit.clone();
    ac.position.set(lot.ac[0], lot.ac[1], lot.ac[2]);
    ac.rotation.y = lot.ac[3];
    lotGroup.add(ac);

    root.add(lotGroup);

    // Leaf-card citrus tree in each yard
    qTmp.setFromAxisAngle(axisY, lot.rotY);
    vTmp.set(lot.citrus[0], 0, lot.citrus[1]).applyQuaternion(qTmp);
    yardCitrusEntries.push({
      x: lot.x + vTmp.x,
      y: CURB_H,
      z: lot.z + vTmp.z,
      rotY: lot.rotY + lot.x * 0.4,
      sx: 1.0,
      sy: 1.0,
      sz: 1.0,
      colorHex: 0xffffff,
      variant: 'citrus',
    });

    const localMount = new THREE.Vector3(1.18, CURB_H + 1.12, 4.162);
    localMount.applyAxisAngle(axisY, lot.rotY);
    signKit.add(
      {
        kind: 'plaque',
        style: 'door',
        text: lot.name,
        sub: lot.sub,
        w: 0.42,
        h: 0.28,
        bg: 0x2c5c8f,
        fg: 0xffffff,
        storybook: true,
        emit: 0,
      },
      { x: lot.x + localMount.x, y: localMount.y, z: lot.z + localMount.z, rotY: lot.rotY },
    );
  }

  root.add(signKit.build());

  // 6) Street corner props
  placeProp('Prop_VendingMachine', CX - 10.65, CURB_H, CZ + 6.40, -Math.PI * 0.5);
  placeProp('Prop_CornerMirror', CX - 11.62, CURB_H, CZ + 10.35, -Math.PI * 0.25);
  placeProp('Prop_UtilityPole', poleA[0], poleA[1], poleA[2], Math.PI * 0.5);
  placeProp('Prop_UtilityPole', poleB[0], poleB[1], poleB[2], Math.PI * 0.5);
  placeProp('Prop_UtilityPole', poleC[0], poleC[1], poleC[2], 0);

  // 7) Lush GPU-instanced meadow grass & wildflowers + cozy neighborhood accents
  for (const d of buildCoastalMeadowFlora(root)) disposables.push(d);
  for (const d of buildCozyNeighborhoodAccents(root, lots)) disposables.push(d);

  // 8) Ghibli leaf-card perimeter, hillside & yard citrus trees (replaces plastic broccoli spheres)
  const treeCoords = [
    // Perimeter neighborhood trees
    [CX - 22.5, CZ + 21.5, 0.3, 1.05],
    [CX - 23.0, CZ - 20.5, 1.7, 1.12],
    [CX + 23.0, CZ + 21.0, 2.4, 1.02],
    [CX + 23.0, CZ - 20.5, 3.8, 1.15],
    [CX - 6.0, CZ - 23.5, 1.1, 1.08],
    [CX + 8.0, CZ - 23.5, 2.9, 1.10],
    [CX + 25.5, CZ - 3.0, 4.2, 1.05],
    [CX + 30.5, CZ + 21.5, 0.9, 1.12],
    [CX + 34.5, CZ + 7.0, 2.1, 1.06],
    [CX + 23.5, CZ - 29.0, 3.1, 1.14],
    [CX - 23.0, CZ - 31.0, 4.5, 1.08],
    [CX - 34.5, CZ + 7.5, 1.4, 1.10],
    // Sweeping hillside grove behind & flanking the town terrace
    [CX - 38.0, CZ - 38.0, 0.7, 1.32],
    [CX - 26.0, CZ - 48.0, 2.2, 1.40],
    [CX - 8.0, CZ - 52.0, 3.5, 1.28],
    [CX + 12.0, CZ - 50.0, 1.9, 1.38],
    [CX + 32.0, CZ - 44.0, 4.1, 1.30],
    [CX + 48.0, CZ - 28.0, 0.4, 1.26],
    [CX + 52.0, CZ - 6.0, 2.7, 1.34],
    [CX + 46.0, CZ + 26.0, 1.2, 1.24],
    [CX - 46.0, CZ - 22.0, 3.9, 1.28],
    [CX - 48.0, CZ + 22.0, 0.8, 1.22],
    [CX + 26.0, CZ + 44.0, 2.5, 1.32],
    [CX - 24.0, CZ + 46.0, 4.4, 1.25],
  ];

  const treeEntries = [...yardCitrusEntries];
  for (const [tx, tz, rotY, sc] of treeCoords) {
    treeEntries.push({
      x: tx,
      y: coastalHillHeight(tx, tz),
      z: tz,
      rotY,
      sx: sc,
      sy: sc * 0.98,
      sz: sc,
      colorHex: 0xffffff,
    });
  }
  placeStylizedTrees(root, treeEntries);

  return {
    root,
    dispose() {
      signKit.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
