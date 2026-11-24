// Hub #1: Rongwan Coastal Hillside Town (S2 Step 1 · Yakuza-style compact 3x3 grid)
// North green hillside & stone retaining wall -> uphill walled residential street ->
// downhill sunlit commercial slope & shortcut alleys -> central plaza w/ battery-swap
// cabinets -> animated Enoden-style green/cream coastal tram & fumikiri level crossing ->
// oceanfront boulevard, sparkling blue ocean & distant downtown skyline across the bay.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder } from '../core/geo.js';
import { litMaterial } from '../core/materials.js';
import { RNG } from '../core/rng.js';
import { makeCanvas, canvasTexture, fbm2D } from '../core/textures.js';
import { clamp, lerp, smoothstep } from '../core/mathx.js';
import { SignKit } from './sign-kit.js';
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

export const COASTAL_TOWN = { x: -420, z: -260 };
const CX = COASTAL_TOWN.x;
const CZ = COASTAL_TOWN.z;

const HALF_X = 128;
const HALF_Z = 112;
const OCEAN_Y = -1.65;
const RAIL_Z = 48.0;
const BLVD_Z = 60.0;
const SEAWALL_Z = 69.2;
const UPPER_Z = -58.0;
const PLAZA_Z = 25.0;

// ==============================================================================
// Unified Continuous Elevation & Street Layout Functions (Zero Seams)
// ==============================================================================
export function townSlopeY(dz) {
  if (dz <= -46) return 11.40;
  if (dz <= 15) return lerp(11.40, 1.85, smoothstep(-46, 15, dz));
  if (dz <= 34) return 1.85;
  if (dz <= 46) return lerp(1.85, 1.25, smoothstep(34, 46, dz));
  if (dz <= 52) return 1.25;
  if (dz <= 57) return lerp(1.25, 1.05, smoothstep(52, 57, dz));
  return 1.05;
}

function isOnRoadCorridor(dx, dz) {
  const onMain = Math.abs(dx) <= 6.6 && dz >= -62 && dz <= 65;
  const onWest = Math.abs(dx + 44) <= 4.3 && dz >= -62 && dz <= 65;
  const onEast = Math.abs(dx - 44) <= 4.7 && dz >= -62 && dz <= 65;
  const onUpper = Math.abs(dz - UPPER_Z) <= 5.0 && Math.abs(dx) <= 56;
  const onMidCross = Math.abs(dz - PLAZA_Z) <= 5.4 && Math.abs(dx) <= 56;
  const onPlaza = Math.abs(dx) <= 17.0 && dz >= 14.5 && dz <= 34.5;
  const onBlvd = dz >= 53.5 && dz <= 69.5 && Math.abs(dx) <= 116;
  return onMain || onWest || onEast || onUpper || onMidCross || onPlaza || onBlvd;
}

function roadSurfaceOffset(dx, dz) {
  // Slight 0.14m sidewalk step outside main asphalt lanes
  const inMainAsphalt = Math.abs(dx) <= 3.85 && dz >= -61 && dz <= 64.5;
  const inWestAsphalt = Math.abs(dx + 44) <= 2.60 && dz >= -61 && dz <= 64.5;
  const inEastAsphalt = Math.abs(dx - 44) <= 2.90 && dz >= -61 && dz <= 64.5;
  const inUpperAsphalt = Math.abs(dz - UPPER_Z) <= 3.0 && Math.abs(dx) <= 54;
  const inMidAsphalt = Math.abs(dz - PLAZA_Z) <= 3.5 && Math.abs(dx) <= 54;
  const inBlvdAsphalt = Math.abs(dz - BLVD_Z) <= 4.3 && Math.abs(dx) <= 116;
  if (inMainAsphalt || inWestAsphalt || inEastAsphalt || inUpperAsphalt || inMidAsphalt || inBlvdAsphalt) {
    return 0.03;
  }
  // Plaza & sidewalks sit slightly above asphalt
  if (isOnRoadCorridor(dx, dz)) return 0.15;
  return 0.0;
}

export function coastalTownTerrainHeight(x, z) {
  const dx = x - CX;
  const dz = z - CZ;
  // Drop sharply past seawall into ocean bed
  if (dz > SEAWALL_Z + 0.8) {
    const seaT = smoothstep(SEAWALL_Z + 0.8, SEAWALL_Z + 9.0, dz);
    return lerp(0.85, OCEAN_Y - 1.5, seaT);
  }

  let y = townSlopeY(dz);

  // North green hillside rising gently behind the stone retaining wall (dz < -71)
  if (dz < -69) {
    const hillT = smoothstep(-69, -110, dz);
    const wave = 0.5 + 0.5 * Math.sin(dx * 0.042 + 0.8) * Math.cos(dz * 0.035);
    y += hillT * (14.5 + 6.5 * wave);
  }

  // Soft green flanking coastal ridges outside the square town blocks (|dx| > 64)
  if (Math.abs(dx) > 62 && dz < 46) {
    const flankT = smoothstep(62, 118, Math.abs(dx)) * smoothstep(46, 12, dz);
    const swell = 0.5 + 0.5 * Math.sin(dz * 0.045 + dx * 0.025);
    y += flankT * (9.5 + 5.5 * swell);
  }

  // Keep road/plaza/rail corridors slightly recessed (-0.035m) beneath crisp paved meshes
  if (isOnRoadCorridor(dx, dz) || (Math.abs(dz - RAIL_Z) <= 2.8 && Math.abs(dx) <= 116)) {
    return townSlopeY(dz) - 0.035;
  }
  return y;
}

export function coastalTownSurfaceHeight(x, z) {
  const dx = x - CX;
  const dz = z - CZ;
  if (isOnRoadCorridor(dx, dz)) {
    return townSlopeY(dz) + roadSurfaceOffset(dx, dz);
  }
  if (Math.abs(dz - RAIL_Z) <= 2.6 && Math.abs(dx) <= 116) {
    return townSlopeY(RAIL_Z) + 0.04;
  }
  return coastalTownTerrainHeight(x, z);
}

export function inCoastalTown(x, z) {
  return Math.abs(x - CX) <= HALF_X + 6 && Math.abs(z - CZ) <= HALF_Z + 6;
}

// ==============================================================================
// Modular Town Layout: 3x3 Compact Grid (36+ Beveled Blender Buildings)
// ==============================================================================
// rotY convention: glTF front is +Z.
//   0        -> faces +Z (South, toward ocean)
//   PI       -> faces -Z (North, uphill)
//   +PI/2    -> faces +X (East)
//   -PI/2    -> faces -X (West)
const BUILDINGS = [
  // --- Central Slope Avenue · West Side (dx = -10.8, facing East +X) ---
  { mesh: 'Town_Shop_Corner',  dx: -10.9, dz: -38.0, rotY:  Math.PI / 2, halfW: 3.6, halfD: 4.1 },
  { mesh: 'Town_Shop_Tall',    dx: -10.7, dz: -26.5, rotY:  Math.PI / 2, halfW: 3.5, halfD: 3.8 },
  { mesh: 'Town_Shop_Corner',  dx: -10.9, dz: -15.0, rotY:  Math.PI / 2, halfW: 3.6, halfD: 4.1 },
  { mesh: 'Town_Shop_Tall',    dx: -10.7, dz:  -3.5, rotY:  Math.PI / 2, halfW: 3.5, halfD: 3.8 },
  { mesh: 'Town_Shop_Konbini', dx: -11.0, dz:   8.0, rotY:  Math.PI / 2, halfW: 3.7, halfD: 4.8 },

  // --- Central Slope Avenue · East Side (dx = +10.8, facing West -X) ---
  { mesh: 'Town_Shop_Tall',    dx:  10.7, dz: -38.0, rotY: -Math.PI / 2, halfW: 3.5, halfD: 3.8 },
  { mesh: 'Town_Shop_Corner',  dx:  10.9, dz: -26.5, rotY: -Math.PI / 2, halfW: 3.6, halfD: 4.1 },
  { mesh: 'Town_Shop_Tall',    dx:  10.7, dz: -15.0, rotY: -Math.PI / 2, halfW: 3.5, halfD: 3.8 },
  { mesh: 'Town_Shop_Corner',  dx:  10.9, dz:  -3.5, rotY: -Math.PI / 2, halfW: 3.6, halfD: 4.1 },
  { mesh: 'Town_Shop_Tall',    dx:  10.7, dz:   8.0, rotY: -Math.PI / 2, halfW: 3.5, halfD: 3.8 },

  // --- Central Plaza Flanking & Lower Block (facing Plaza / Cross Street) ---
  { mesh: 'Town_Shop_Konbini', dx: -24.5, dz:  15.2, rotY: 0,           halfW: 4.8, halfD: 3.7 },
  { mesh: 'Town_Shop_Corner',  dx:  24.5, dz:  15.2, rotY: 0,           halfW: 4.2, halfD: 3.6 },
  { mesh: 'Town_Shop_Corner',  dx: -14.0, dz:  37.8, rotY: Math.PI,     halfW: 4.2, halfD: 3.6 },
  { mesh: 'Town_Shop_Tall',    dx: -26.5, dz:  37.8, rotY: Math.PI,     halfW: 3.8, halfD: 3.5 },
  { mesh: 'Town_Shop_Konbini', dx:  14.5, dz:  37.8, rotY: Math.PI,     halfW: 4.8, halfD: 3.7 },
  { mesh: 'Town_Shop_Corner',  dx:  28.0, dz:  37.8, rotY: Math.PI,     halfW: 4.2, halfD: 3.6 },

  // --- Upper Residential Street · North Row (dx -48..+48, dz = -66.8, facing South +Z) ---
  { mesh: 'Town_House_SlopeA', dx: -48.0, dz: -66.8, rotY: 0,           halfW: 4.0, halfD: 3.9 },
  { mesh: 'Town_House_SlopeB', dx: -33.0, dz: -66.8, rotY: 0,           halfW: 4.4, halfD: 3.7 },
  { mesh: 'Town_House_SlopeA', dx: -18.0, dz: -66.8, rotY: 0,           halfW: 4.0, halfD: 3.9 }, // A-Chai's rented room!
  { mesh: 'Town_House_SlopeB', dx:  -3.0, dz: -66.8, rotY: 0,           halfW: 4.4, halfD: 3.7 },
  { mesh: 'Town_House_SlopeA', dx:  12.0, dz: -66.8, rotY: 0,           halfW: 4.0, halfD: 3.9 },
  { mesh: 'Town_House_SlopeB', dx:  27.5, dz: -66.8, rotY: 0,           halfW: 4.4, halfD: 3.7 },
  { mesh: 'Town_House_SlopeA', dx:  43.0, dz: -66.8, rotY: 0,           halfW: 4.0, halfD: 3.9 },

  // --- Upper Street South Side & Inner Residential Terraces (West & East Blocks) ---
  { mesh: 'Town_House_SlopeB', dx: -28.0, dz: -47.2, rotY: Math.PI,     halfW: 4.4, halfD: 3.7 },
  { mesh: 'Town_House_SlopeA', dx: -14.5, dz: -47.2, rotY: Math.PI,     halfW: 4.0, halfD: 3.9 },
  { mesh: 'Town_House_SlopeA', dx:  14.5, dz: -47.2, rotY: Math.PI,     halfW: 4.0, halfD: 3.9 },
  { mesh: 'Town_House_SlopeB', dx:  28.5, dz: -47.2, rotY: Math.PI,     halfW: 4.4, halfD: 3.7 },

  // Inner West block houses (facing West Shortcut Alley dx = -44)
  { mesh: 'Town_House_SlopeA', dx: -34.2, dz: -31.0, rotY: -Math.PI / 2, halfW: 3.9, halfD: 4.0 },
  { mesh: 'Town_House_SlopeB', dx: -34.2, dz: -15.5, rotY: -Math.PI / 2, halfW: 3.7, halfD: 4.4 },
  { mesh: 'Town_House_SlopeA', dx: -34.2, dz:   0.5, rotY: -Math.PI / 2, halfW: 3.9, halfD: 4.0 },

  // Outer West side of West Alley (facing East +X onto West Alley)
  { mesh: 'Town_House_SlopeB', dx: -53.8, dz: -35.0, rotY:  Math.PI / 2, halfW: 3.7, halfD: 4.4 },
  { mesh: 'Town_Shop_Corner',  dx: -54.0, dz: -18.5, rotY:  Math.PI / 2, halfW: 3.6, halfD: 4.1 },
  { mesh: 'Town_House_SlopeA', dx: -53.8, dz:  -2.0, rotY:  Math.PI / 2, halfW: 3.9, halfD: 4.0 },
  { mesh: 'Town_Shop_Tall',    dx: -54.0, dz:  14.0, rotY:  Math.PI / 2, halfW: 3.5, halfD: 3.8 },
  { mesh: 'Town_Shop_Corner',  dx: -54.0, dz:  37.5, rotY:  Math.PI / 2, halfW: 3.6, halfD: 4.1 },

  // Inner East block houses (facing East Shop Lane dx = +44)
  { mesh: 'Town_House_SlopeB', dx:  34.0, dz: -31.0, rotY:  Math.PI / 2, halfW: 3.7, halfD: 4.4 },
  { mesh: 'Town_House_SlopeA', dx:  34.0, dz: -15.5, rotY:  Math.PI / 2, halfW: 3.9, halfD: 4.0 },
  { mesh: 'Town_Shop_Corner',  dx:  34.2, dz:   0.5, rotY:  Math.PI / 2, halfW: 3.6, halfD: 4.1 },

  // Outer East side of East Lane (facing West -X onto East Lane)
  { mesh: 'Town_House_SlopeA', dx:  54.2, dz: -35.0, rotY: -Math.PI / 2, halfW: 3.9, halfD: 4.0 },
  { mesh: 'Town_Shop_Tall',    dx:  54.2, dz: -18.5, rotY: -Math.PI / 2, halfW: 3.5, halfD: 3.8 },
  { mesh: 'Town_House_SlopeB', dx:  54.2, dz:  -2.0, rotY: -Math.PI / 2, halfW: 3.7, halfD: 4.4 },
  { mesh: 'Town_Shop_Konbini', dx:  54.6, dz:  14.0, rotY: -Math.PI / 2, halfW: 3.7, halfD: 4.8 },
  { mesh: 'Town_Shop_Tall',    dx:  54.2, dz:  37.5, rotY: -Math.PI / 2, halfW: 3.5, halfD: 3.8 },
];

// Collision boxes (buildings + trackside embankment guard strips outside crossings)
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

export function constrainCoastalTown(x, z, walking) {
  const margin = walking ? 0.45 : 0.80;
  const pos = {
    x: clamp(x, CX - 102, CX + 102),
    z: clamp(z, CZ - 63.0, CZ + SEAWALL_Z - (walking ? 0.75 : 1.15)),
  };

  // Push cleanly out of all town buildings
  for (const b of BUILDINGS) {
    pushOutAABB(pos, CX + b.dx, CZ + b.dz, b.halfW, b.halfD, margin);
  }

  // Prevent riding straight onto the fenced railway ballast away from the 3 level crossings
  const dx = pos.x - CX;
  const dz = pos.z - CZ;
  const nearCrossing = Math.abs(dx) < 5.6 || Math.abs(dx + 44) < 4.2 || Math.abs(dx - 44) < 4.5;
  if (!nearCrossing && Math.abs(dz - RAIL_Z) < 2.2 + margin * 0.5) {
    pos.z = CZ + RAIL_Z + (dz >= RAIL_Z ? 2.2 + margin * 0.5 : -(2.2 + margin * 0.5));
  }

  return pos;
}

// ==============================================================================
// Stylized PBR Shaders: Architecture, Asphalt, Ocean & Cloud Shadows
// ==============================================================================
function createCoastalTownArchMaterial() {
  const mat = litMaterial({ vertexColors: true, grid: false, roughness: 0.89 });
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uMeadowTime = meadowUniforms.uMeadowTime;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTownWorld;
        varying vec3 vTownLocal;
        varying vec3 vTownNormW;
        varying vec3 vTownNormL;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTownLocal = position;
        vTownNormL = normal;
        vTownWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vTownNormW = normalize(mat3(modelMatrix) * normal);`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTownWorld;
        varying vec3 vTownLocal;
        varying vec3 vTownNormW;
        varying vec3 vTownNormL;
        ` + MEADOW_COMMON_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 wPos = vTownWorld;
        vec3 lPos = vTownLocal;
        vec3 wN = normalize(vTownNormW);
        vec3 lN = normalize(vTownNormL);
        vec3 c = diffuseColor.rgb;

        // Detect window glass (exact 0x527a78 blue-teal) for sunlit daytime sky glint
        float isGlass = smoothstep(0.18, 0.08, c.r)
                      * smoothstep(1.30, 1.80, c.g / max(c.r, 0.01))
                      * smoothstep(1.22, 1.72, c.b / max(c.r, 0.01))
                      * (1.0 - smoothstep(0.25, 0.55, abs(wN.y)));

        // Detect sloped roof surfaces (terracotta, coastal blue, or sage tile)
        float isSlope = smoothstep(0.20, 0.38, wN.y) * (1.0 - smoothstep(0.90, 0.97, wN.y));
        float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
        float isRoofTile = isSlope * smoothstep(0.06, 0.14, chroma);

        // Detect concrete/stone plinths & retaining bases (strictly mid-dark low-chroma stone, never white plaster/vending)
        float luma = dot(c, vec3(0.299, 0.587, 0.114));
        float isStone = (1.0 - isGlass) * (1.0 - isRoofTile)
                      * smoothstep(0.11, 0.04, chroma)
                      * smoothstep(0.46, 0.34, luma)
                      * smoothstep(0.75, 0.35, wN.y);

        float isPlaster = (1.0 - isGlass) * (1.0 - isRoofTile) * (1.0 - isStone);

        if (isRoofTile > 0.01) {
          vec2 slopeDir = length(lN.xz) > 0.05 ? normalize(lN.xz) : vec2(0.0, 1.0);
          vec2 acrossDir = vec2(-slopeDir.y, slopeDir.x);
          float uA = dot(lPos.xz, acrossDir);
          float vD = lPos.y * 1.45 + dot(lPos.xz, slopeDir) * 0.78;
          float colIdx = floor(uA / 0.28);
          float rowIdx = floor(vD / 0.34);
          float rib = sin(fract(uA / 0.28) * 6.28318);
          float lap = smoothstep(0.0, 0.18, fract(vD / 0.34));
          float tileRand = mHash(vec2(colIdx, rowIdx));
          vec3 tileTint = mix(vec3(0.92, 0.94, 0.98), vec3(1.08, 1.03, 0.97), tileRand);
          float shade = (0.92 + 0.08 * rib) * mix(0.86, 1.04, lap);
          c = mix(c, c * tileTint * shade, isRoofTile);
        }

        if (isStone > 0.01) {
          float sx = wPos.x + wPos.z;
          float row = floor(wPos.y * 2.2);
          float stagger = mod(row, 2.0) * 0.5;
          float fx = fract(sx * 0.95 + stagger);
          float fy = fract(wPos.y * 2.2);
          float mortar = smoothstep(0.0, 0.08, fx) * smoothstep(0.0, 0.08, 1.0 - fx)
                       * smoothstep(0.0, 0.11, fy) * smoothstep(0.0, 0.11, 1.0 - fy);
          float blockTone = 0.93 + 0.12 * mHash(vec2(floor(sx * 0.95 + stagger), row));
          c = mix(c, c * blockTone * mix(0.84, 1.02, mortar), isStone * 0.65);
        }

        if (isPlaster > 0.01) {
          float pMacro = mNoise(vec2(wPos.x + wPos.z, wPos.y * 1.15) * 0.40);
          float pFine  = mNoise(vec2(wPos.x - wPos.z, wPos.y * 1.50) * 2.4);
          vec3 gouache = mix(vec3(0.96, 0.97, 1.00), vec3(1.04, 1.02, 0.97), pMacro)
                       * mix(0.97, 1.03, pFine);
          c = mix(c, c * gouache, isPlaster * 0.80);
        }

        if (isGlass > 0.01) {
          float diag = fract((lPos.x + lPos.z) * 0.42 + lPos.y * 0.62);
          float sheen = smoothstep(0.32, 0.50, diag) * (1.0 - smoothstep(0.54, 0.72, diag));
          float topGrad = smoothstep(0.4, 6.0, lPos.y);
          vec3 skyGlass = c * mix(0.92, 1.24, topGrad * 0.45 + sheen * 0.65);
          c = mix(c, skyGlass, isGlass);
        }

        vec3 cloud = mix(vec3(1.0), meadowCloudShadow(wPos.xz, uMeadowTime), 0.28);
        diffuseColor.rgb = c * cloud;`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|coastal-town-arch-v1';
  return mat;
}

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
      // Clean sunlit coastal Japanese slate-blue-grey asphalt
      const s = 0.88 + macro * 0.11 + grain * 0.09;
      d[i++] = Math.min(255, Math.round(108 * s));
      d[i++] = Math.min(255, Math.round(115 * s));
      d[i++] = Math.min(255, Math.round(123 * s));
      d[i++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(canvas, { repeat: true, aniso: 4 });
}

function createOceanMaterial() {
  const mat = litMaterial({ color: 0x3f9ec4, roughness: 0.24, grid: false });
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uMeadowTime = meadowUniforms.uMeadowTime;
    shader.uniforms.uCoastZ = { value: CZ + SEAWALL_Z };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vOceanXZ;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vOceanXZ = (modelMatrix * vec4(position, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uCoastZ;
        varying vec2 vOceanXZ;
        ` + MEADOW_COMMON_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float distShore = max(0.0, vOceanXZ.y - uCoastZ);
        float w1 = sin(vOceanXZ.x * 0.28 + uMeadowTime * 1.25 + mNoise(vOceanXZ * 0.09) * 3.8);
        float w2 = cos(vOceanXZ.y * 0.42 - uMeadowTime * 1.05 + mNoise(vOceanXZ * 0.16) * 2.4);
        float glint = smoothstep(0.62, 0.96, 0.5 + 0.5 * w1 * w2);
        float sparkle = smoothstep(0.84, 0.98, mNoise(vOceanXZ * 0.72 + vec2(uMeadowTime * 0.6, -uMeadowTime * 0.45)));

        // Shallow turquoise near seawall -> rich Kamakura cobalt-azure offshore
        vec3 shallow = vec3(0.14, 0.54, 0.66);
        vec3 deep = vec3(0.08, 0.34, 0.58);
        vec3 sea = mix(shallow, deep, smoothstep(6.0, 95.0, distShore));

        // Animated shoreline foam ribbons near seawall
        float foamWave = sin(distShore * 1.4 - uMeadowTime * 2.1 + mNoise(vOceanXZ * 0.22) * 2.2);
        float foamMask = (1.0 - smoothstep(0.0, 8.5, distShore)) * smoothstep(0.28, 0.78, foamWave);
        float edgeFoam = (1.0 - smoothstep(0.0, 2.2, distShore)) * 0.75;

        sea = mix(sea, vec3(0.68, 0.88, 0.96), glint * 0.32 + sparkle * 0.38);
        sea = mix(sea, vec3(0.92, 0.96, 0.98), clamp(foamMask * 0.65 + edgeFoam, 0.0, 0.85));

        vec3 cs = mix(vec3(1.0), meadowCloudShadow(vOceanXZ, uMeadowTime), 0.22);
        diffuseColor.rgb = sea * cs;`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|coastal-town-ocean-v1';
  return mat;
}

// ==============================================================================
// Unified Terrain, Sloped Asphalt Roads, Crosswalks, Railway, Seawall & Skyline
// ==============================================================================
function buildTownTerrain(root) {
  const step = 4.0;
  const xs = [];
  const zs = [];
  for (let dx = -HALF_X; dx <= HALF_X + 0.01; dx += step) xs.push(dx);
  for (let dz = -HALF_Z; dz <= 80 + 0.01; dz += step) zs.push(dz);
  const nx = xs.length;
  const nz = zs.length;
  const eps = 0.8;

  const pos = new Float32Array(nx * nz * 3);
  const nor = new Float32Array(nx * nz * 3);
  const indices = [];

  for (let ix = 0; ix < nx; ix++) {
    const x = CX + xs[ix];
    for (let iz = 0; iz < nz; iz++) {
      const z = CZ + zs[iz];
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

// Helper: add a sloped asphalt or sidewalk ribbon along Z (constant X, varying Z)
function addSlopedRibbonZ(builder, xCenter, halfW, zStart, zEnd, steps, yOff, color, uvScale = 0.14) {
  for (let i = 0; i < steps; i++) {
    const z0 = lerp(zStart, zEnd, i / steps);
    const z1 = lerp(zStart, zEnd, (i + 1) / steps);
    const y0 = townSlopeY(z0) + yOff;
    const y1 = townSlopeY(z1) + yOff;
    const xL = CX + xCenter - halfW;
    const xR = CX + xCenter + halfW;
    const vz0 = CZ + z0;
    const vz1 = CZ + z1;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dy, dz) || 1;
    const n = [0, dz / len, -dy / len];
    builder.quad(
      [xL, y0, vz0], [xL, y1, vz1], [xR, y1, vz1], [xR, y0, vz0],
      {
        color,
        normal: n,
        uvs: [[0, z0 * uvScale], [0, z1 * uvScale], [1, z1 * uvScale], [1, z0 * uvScale]],
      },
    );
  }
}

// Helper: add a flat horizontal road ribbon along X (constant Z)
function addFlatRibbonX(builder, xStart, xEnd, zCenter, halfD, yOff, color, uvScale = 0.14) {
  const y = townSlopeY(zCenter) + yOff;
  const x0 = CX + xStart;
  const x1 = CX + xEnd;
  const z0 = CZ + zCenter - halfD;
  const z1 = CZ + zCenter + halfD;
  builder.quad(
    [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0],
    {
      color,
      normal: [0, 1, 0],
      uvs: [[xStart * uvScale, 0], [xStart * uvScale, 1], [xEnd * uvScale, 1], [xEnd * uvScale, 0]],
    },
  );
}

function buildTownRoadsAndCivil(root, trackTex, trackMat) {
  const asphaltTex = trackTex(makeAsphaltTexture());
  const asphaltMat = trackMat(litMaterial({ map: asphaltTex, vertexColors: true, roughness: 0.92, grid: false }));
  const civilMat = trackMat(createCoastalTownArchMaterial());

  const asphalt = new GeoBuilder({ uv: true, color: true });
  const civil = new GeoBuilder({ color: true });

  // 1) Three North-South sloped avenues (+0.28m overlap under curbs so zero grass seam leaks!)
  addSlopedRibbonZ(asphalt,   0.0, 4.15, -61.5, 64.5, 36, 0.03, 0xffffff);
  addSlopedRibbonZ(asphalt, -44.0, 2.88, -61.5, 64.5, 36, 0.03, 0xf2f2f2);
  addSlopedRibbonZ(asphalt,  44.0, 3.18, -61.5, 64.5, 36, 0.03, 0xf5f5f5);

  // 2) Three East-West horizontal streets (Upper Street, Central Cross Street, Coastal Boulevard)
  addFlatRibbonX(asphalt, -55,  55, UPPER_Z, 3.25, 0.036, 0xffffff);
  addFlatRibbonX(asphalt, -56,  56, PLAZA_Z, 3.72, 0.038, 0xffffff);
  addFlatRibbonX(asphalt, -124, 124, BLVD_Z, 4.55, 0.036, 0xfafafa);

  // 3) Sidewalks along all avenues (clean warm cream-grey coastal concrete)
  const sideCol = 0xe4dcc8;
  const curbCol = 0xc5bca9;
  for (const [cx, roadH, walkW] of [[0, 3.85, 2.75], [-44, 2.60, 1.65], [44, 2.90, 1.80]]) {
    for (const s of [-1, 1]) {
      // Split around Upper Street (-58), Plaza (+25), Rail (+48), and Blvd (+60)
      const spans = cx === 0
        ? [[-54.8, 14.5], [34.5, 45.2], [50.8, 55.6]]
        : [[-54.8, 21.4], [28.6, 45.2], [50.8, 55.6]];
      for (const [za, zb] of spans) {
        const segs = Math.max(4, Math.round((zb - za) / 4));
        addSlopedRibbonZ(civil, cx + s * (roadH + walkW * 0.5), walkW * 0.5, za, zb, segs, 0.145, sideCol);
        // Curb vertical step face
        for (let i = 0; i < segs; i++) {
          const z0 = lerp(za, zb, i / segs);
          const z1 = lerp(za, zb, (i + 1) / segs);
          const y0 = townSlopeY(z0);
          const y1 = townSlopeY(z1);
          const edgeX = CX + cx + s * roadH;
          if (s > 0) {
            civil.quad(
              [edgeX, y0 + 0.02, CZ + z0], [edgeX, y0 + 0.145, CZ + z0],
              [edgeX, y1 + 0.145, CZ + z1], [edgeX, y1 + 0.02, CZ + z1],
              { color: curbCol, normal: [-1, 0, 0] },
            );
          } else {
            civil.quad(
              [edgeX, y0 + 0.145, CZ + z0], [edgeX, y0 + 0.02, CZ + z0],
              [edgeX, y1 + 0.02, CZ + z1], [edgeX, y1 + 0.145, CZ + z1],
              { color: curbCol, normal: [1, 0, 0] },
            );
          }
        }
      }
    }
  }

  // Upper Residential Street sidewalks (North & South edges)
  addFlatRibbonX(civil, -55, 55, UPPER_Z - 4.05, 1.10, 0.15, sideCol);
  for (const [xa, xb] of [[-41.2, -6.6], [6.6, 41.0]]) {
    addFlatRibbonX(civil, xa, xb, UPPER_Z + 4.05, 1.10, 0.15, sideCol);
  }

  // Central Town Plaza paved warm sandstone terrace & flanking commercial lot aprons
  const plazaCol = 0xe8d9bc;
  const lotApronCol = 0xd6cfc0;
  for (const sx of [-1, 1]) {
    for (const [za, zb] of [[12.5, 21.6], [28.4, 44.8]]) {
      const xm = sx * 22.5;
      const zm = (za + zb) * 0.5;
      civil.box(CX + xm, townSlopeY(zm) + 0.02, CZ + zm, 37.2, 0.25, zb - za, { color: Math.abs(xm) < 20 ? plazaCol : lotApronCol });
    }
    // Warm sandstone corner pads right around the central intersection
    for (const [za, zb] of [[14.5, 21.6], [28.4, 34.5]]) {
      const xm = sx * 10.6;
      const zm = (za + zb) * 0.5;
      civil.box(CX + xm, townSlopeY(zm) + 0.035, CZ + zm, 13.4, 0.25, zb - za, { color: plazaCol });
    }
    // Cozy wood-and-iron plaza benches + brick tree planter rings on the 4 plaza corners
    const bY = townSlopeY(17.8) + 0.16;
    civil.box(CX + sx * 10.2, bY + 0.34, CZ + 18.2, 1.9, 0.10, 0.52, { color: 0xa4744c });
    civil.box(CX + sx * 10.2, bY + 0.62, CZ + 17.98, 1.9, 0.34, 0.08, { color: 0xa4744c });
    civil.box(CX + sx * 15.5, townSlopeY(16.0) + 0.28, CZ + 16.0, 2.2, 0.34, 2.2, { color: 0xbf8060 });
    civil.box(CX + sx * 15.5, townSlopeY(16.0) + 0.38, CZ + 16.0, 1.8, 0.18, 1.8, { color: 0x6e5a46 });
  }
  // Sloped paved yards behind the Main Avenue shops so blocks look like lived-in coastal town lots
  for (const sx of [-1, 1]) {
    addSlopedRibbonZ(civil, sx * 23.0, 17.5, -54.0, 13.0, 16, 0.06, lotApronCol);
  }
  // Upper Residential Street paved yard apron
  addFlatRibbonX(civil, -56, 56, UPPER_Z - 9.0, 6.2, 0.08, lotApronCol);
  // Oceanfront Promenade & Seawall Parapet (dz = 64.25..69.6)
  const blvdY = townSlopeY(BLVD_Z);
  civil.box(CX, blvdY + 0.06, CZ + 66.8, 232, 0.24, 5.2, { color: 0xe2dac7 });
  // Concrete seawall face plunging down below water
  civil.box(CX, -0.35, CZ + SEAWALL_Z, 232, 3.65, 0.72, { color: 0xb0a99a });
  civil.box(CX, blvdY + 0.62, CZ + SEAWALL_Z, 232, 0.22, 0.84, { color: 0xd5cebf });
  // Coastal blue-steel promenade railing posts & rails
  for (let rx = -108; rx <= 108; rx += 4.0) {
    civil.box(CX + rx, blvdY + 0.96, CZ + SEAWALL_Z - 0.18, 0.08, 0.64, 0.08, { color: 0x4b748f });
  }
  civil.box(CX, blvdY + 1.26, CZ + SEAWALL_Z - 0.18, 224, 0.07, 0.07, { color: 0x5c89a6 });
  civil.box(CX, blvdY + 0.96, CZ + SEAWALL_Z - 0.18, 224, 0.05, 0.05, { color: 0x5c89a6 });

  // North hillside stone retaining wall behind upper residential houses (dz = -72.8)
  civil.box(CX, 13.0, CZ - 72.8, 126, 4.6, 1.2, { color: 0x9c9586 });
  civil.box(CX, 15.38, CZ - 72.8, 126.4, 0.24, 1.38, { color: 0xc5bcaa });

  // 4) Crisp Japanese Road Markings: dashed center lines, edge lines & crosswalks
  const paintCol = 0xf7f2e4;
  // Main slope dashed centerline + white edge lines
  for (let z = -52; z <= 52; z += 5.2) {
    if ((z > 19 && z < 30) || (z > 44 && z < 52)) continue;
    addSlopedRibbonZ(civil, 0.0, 0.09, z, z + 2.4, 2, 0.052, paintCol);
  }
  for (const s of [-1, 1]) {
    addSlopedRibbonZ(civil, s * 3.55, 0.07, -54, 19.5, 16, 0.050, paintCol);
    addSlopedRibbonZ(civil, s * 3.55, 0.07, 30.5, 45.0, 5, 0.050, paintCol);
  }
  // Coastal Boulevard double-dashed yellow/white centerline
  for (let x = -108; x <= 108; x += 6.0) {
    if (Math.abs(x) < 6 || Math.abs(x + 44) < 5 || Math.abs(x - 44) < 5) continue;
    civil.box(CX + x, blvdY + 0.048, CZ + BLVD_Z, 2.8, 0.015, 0.16, { color: 0xf2c54b });
  }
  // Zebra crosswalks at Plaza & Railway Approach & Boulevard T-junction
  for (const cz of [19.8, 30.2, 43.2, 54.4]) {
    const wy = townSlopeY(cz) + 0.052;
    for (let k = -3; k <= 3; k++) {
      civil.box(CX + k * 0.96, wy, CZ + cz, 0.44, 0.015, 2.15, { color: paintCol });
    }
  }
  // Yellow-black fumikiri stop line & warning box ahead of tracks
  civil.box(CX, townSlopeY(44.8) + 0.052, CZ + 44.8, 7.2, 0.015, 0.36, { color: 0xf4c430 });
  civil.box(CX, townSlopeY(51.2) + 0.052, CZ + 51.2, 7.2, 0.015, 0.36, { color: 0xf4c430 });

  // 5) Iconic Single-Track Enoden Coastal Railway (dz = +48, x = -120..+120)
  const railY = townSlopeY(RAIL_Z);
  // Crushed gravel ballast bed
  civil.box(CX, railY - 0.02, CZ + RAIL_Z, 240, 0.22, 4.4, { color: 0x9b9487 });
  // Wooden sleepers along entire track
  for (let tx = -116; tx <= 116; tx += 0.92) {
    civil.box(CX + tx, railY + 0.08, CZ + RAIL_Z, 0.24, 0.09, 2.25, { color: 0x6b523e });
  }
  // Twin steel rails
  for (const rz of [-0.62, 0.62]) {
    civil.box(CX, railY + 0.145, CZ + RAIL_Z + rz, 240, 0.09, 0.08, { color: 0x6f7b82 });
  }
  // Flush concrete level crossing decks at all 3 avenues
  for (const [cx, wDeck] of [[0, 10.6], [-44, 7.2], [44, 7.8]]) {
    civil.box(CX + cx, railY + 0.095, CZ + RAIL_Z, wDeck, 0.14, 3.6, { color: 0xd0c9ba });
  }
  // Low railway concrete post-and-rail fence between crossings
  for (const [xa, xb] of [[-112, -48.5], [-39.5, -6.4], [6.4, 39.2], [48.8, 112]]) {
    for (const sideZ of [RAIL_Z - 2.25, RAIL_Z + 2.25]) {
      for (let fx = xa; fx <= xb; fx += 3.2) {
        civil.box(CX + fx, railY + 0.45, CZ + sideZ, 0.11, 0.90, 0.11, { color: 0xc8c2b4 });
      }
      civil.box(CX + (xa + xb) * 0.5, railY + 0.72, CZ + sideZ, xb - xa, 0.07, 0.07, { color: 0x455154 });
    }
  }

  // 6) Overhead Catenary Power Lines strung between main avenue & boulevard utility poles
  const addWire = (p0, p1, sag = 0.36) => {
    const segs = 6;
    const wireCol = 0x2c3235;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const x0 = lerp(p0[0], p1[0], t0);
      const z0 = lerp(p0[2], p1[2], t0);
      const y0 = lerp(p0[1], p1[1], t0) - Math.sin(Math.PI * t0) * sag;
      const x1 = lerp(p0[0], p1[0], t1);
      const z1 = lerp(p0[2], p1[2], t1);
      const y1 = lerp(p0[1], p1[1], t1) - Math.sin(Math.PI * t1) * sag;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dy, dz) || 0.01;
      const r = 0.024;
      // Thin ribbon facing up & sideways
      civil.quad(
        [x0, y0 - r, z0], [x1, y1 - r, z1], [x1, y1 + r, z1], [x0, y0 + r, z0],
        { color: wireCol, normal: [dz / len, 0, -dx / len] },
      );
      civil.quad(
        [x0 - r, y0, z0], [x1 - r, y1, z1], [x1 + r, y1, z1], [x0 + r, y0, z0],
        { color: wireCol, normal: [0, 1, 0] },
      );
    }
  };
  const poleZs = [-52, -32, -12, 8, 36, 54.5];
  for (const s of [-1, 1]) {
    const px = CX + s * 5.85;
    for (let i = 0; i < poleZs.length - 1; i++) {
      const z0 = poleZs[i];
      const z1 = poleZs[i + 1];
      const y0 = townSlopeY(z0) + 8.42;
      const y1 = townSlopeY(z1) + 8.42;
      addWire([px - 0.55, y0, CZ + z0], [px - 0.55, y1, CZ + z1], 0.34);
      addWire([px + 0.55, y0, CZ + z0], [px + 0.55, y1, CZ + z1], 0.34);
    }
  }
  // Railway overhead catenary wire above tracks
  for (let rx = -105; rx < 105; rx += 35) {
    addWire([CX + rx, railY + 5.15, CZ + RAIL_Z], [CX + rx + 35, railY + 5.15, CZ + RAIL_Z], 0.14);
  }

  // 7) Distant Cool-Toned Downtown Skyline on a wide coastal headland off to East-Southeast across the bay
  const skyRng = new RNG('rongwan-downtown-skyline-v2');
  civil.box(CX + 160, OCEAN_Y + 0.35, CZ + 298, 280, 2.0, 56, { color: 0x6f918f });
  for (let i = 0; i < 16; i++) {
    const sx = CX + 64 + i * 9.6 + skyRng.range(-1.8, 1.8);
    const sz = CZ + 292 + skyRng.range(-7, 8);
    const bw = skyRng.range(6.2, 11.0);
    const bd = skyRng.range(6.0, 10.0);
    const peak = 1.0 - smoothstep(10, 72, Math.abs(sx - (CX + 132)));
    const bh = skyRng.range(10, 20) + peak * skyRng.range(8, 20);
    const col = skyRng.pick([0x8fb0c7, 0x82a3bc, 0x99b8cc, 0x7a9bb5]);
    civil.box(sx, OCEAN_Y + bh * 0.5 + 0.8, sz, bw, bh, bd, { color: col });
  }

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

  return [asphaltGeo, civilGeo];
}

// ==============================================================================
// Sparkling Coastal Ocean Plane
// ==============================================================================
function buildTownOcean(root, trackMat) {
  const oceanMat = trackMat(createOceanMaterial());
  const geo = new THREE.PlaneGeometry(1100, 540, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, oceanMat);
  mesh.position.set(CX, OCEAN_Y, CZ + SEAWALL_Z + 266);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  root.add(mesh);
  return geo;
}

// ==============================================================================
// Hillside Backdrop Grass & Wildflowers (North hill & east/west green ridges)
// ==============================================================================
function buildTownBackdropFlora(root) {
  const rng = new RNG('coastal-town-flora-v1');
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  const maxGrass = 14000;
  const gMat = new Float32Array(maxGrass * 16);
  const gCol = new Float32Array(maxGrass * 3);
  let gCount = 0;

  for (let i = 0; i < 32000 && gCount < maxGrass; i++) {
    const dx = rng.range(-115, 115);
    const dz = rng.range(-108, 44);
    // Only grow lush Ghibli meadow grass on the north green hill & outer coastal flanks (plus track verge)
    const onNorthHill = dz < -73.8;
    const onFlankHill = Math.abs(dx) > 61.5 && dz < 42;
    const onTrackVerge = Math.abs(dz - RAIL_Z) > 2.4 && Math.abs(dz - RAIL_Z) < 5.2 && Math.abs(dx) > 9 && Math.abs(dx - 44) > 7 && Math.abs(dx + 44) > 7;
    if (!onNorthHill && !onFlankHill && !onTrackVerge) continue;

    const x = CX + dx;
    const z = CZ + dz;
    const y = coastalTownTerrainHeight(x, z);
    const p = patchNoise(x, z);
    if (p < 0.25 && rng.next() > 0.65) continue;

    dummy.position.set(x, y - 0.03, z);
    dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
    dummy.scale.set(rng.range(0.85, 1.25), lerp(0.75, 1.35, smoothstep(0.2, 0.85, p)), rng.range(0.88, 1.15));
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

  // Subtle wildflower accents on north hillside & trackside verges
  const maxF = 1100;
  const fMat = new Float32Array(maxF * 16);
  const fCol = new Float32Array(maxF * 3);
  let fCount = 0;
  for (let i = 0; i < 4000 && fCount < maxF; i++) {
    const dx = rng.range(-100, 100);
    const dz = rng.range(-104, -74.5);
    const x = CX + dx;
    const z = CZ + dz;
    const y = coastalTownTerrainHeight(x, z);
    dummy.position.set(x, y - 0.02, z);
    dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
    dummy.scale.setScalar(rng.range(0.85, 1.25));
    dummy.updateMatrix();
    dummy.matrix.toArray(fMat, fCount * 16);
    col.setHex(rng.pick([0xfff7dc, 0xffdf7a, 0xffb8a0, 0xd8eaff]));
    fCol[fCount * 3] = col.r;
    fCol[fCount * 3 + 1] = col.g;
    fCol[fCount * 3 + 2] = col.b;
    fCount++;
  }
  const flowerMesh = new THREE.InstancedMesh(getFlowerGeometry(), getFlowerMaterial(), fCount);
  flowerMesh.instanceMatrix.array.set(fMat.subarray(0, fCount * 16));
  flowerMesh.instanceMatrix.needsUpdate = true;
  flowerMesh.instanceColor = new THREE.InstancedBufferAttribute(fCol.subarray(0, fCount * 3), 3);
  flowerMesh.castShadow = false;
  flowerMesh.receiveShadow = false;
  flowerMesh.computeBoundingSphere();
  root.add(flowerMesh);
}

// ==============================================================================
// Multi-Language East-Asian Storefront Signs & Residential Door Plaques
// ==============================================================================
function buildTownSigns(root) {
  const kit = new SignKit({
    rng: new RNG('rongwan-coastal-town-signs-v1'),
    density: 1,
    mode: 'lit',
    storybook: true,
    glow: 1,
    emit: 0.9,
  });

  // Main Slope Avenue & Plaza shops (mounted cleanly onto building fascias)
  const shopSigns = [
    // West side of Main Slope Avenue (facing +X, wall at dx = -7.3)
    { text: '榕记包子铺', sub: '老面鲜肉 · 早市', bg: 0x306e66, fg: 0xfff0c8, accent: 0xf4c454, dx: -7.12, dz: -38.0, rotY: Math.PI / 2, w: 4.8, h: 0.92 },
    { text: '潮声拉面 · ラーメン', sub: '豚骨拉面 · 饺子', bg: 0xb83b32, fg: 0xfff7df, accent: 0xffd85a, dx: -7.12, dz: -26.5, rotY: Math.PI / 2, w: 4.8, h: 0.92 },
    { text: '便民药店', sub: '24H 社区药房', bg: 0x2c7865, fg: 0xffffff, accent: 0xd8f5d0, dx: -7.12, dz: -15.0, rotY: Math.PI / 2, w: 4.6, h: 0.90 },
    { text: '南风奶茶烘焙', sub: '手打柠檬 · 菠萝包', bg: 0xd67c32, fg: 0xfff8e6, accent: 0xffe488, dx: -7.12, dz:  -3.5, rotY: Math.PI / 2, w: 4.8, h: 0.92 },
    { text: '海风便利店 24H', sub: '便当 · 冰饮 · 快递', bg: 0x2e825e, fg: 0xffffff, accent: 0xffc64b, dx: -7.08, dz:   8.0, rotY: Math.PI / 2, w: 5.4, h: 0.92 },

    // East side of Main Slope Avenue (facing -X, wall at dx = +7.3)
    { text: '陈记石磨肠粉', sub: '现磨米浆 · 粥品', bg: 0xc44332, fg: 0xfff4d4, accent: 0xffd452, dx:  7.12, dz: -38.0, rotY: -Math.PI / 2, w: 4.8, h: 0.92 },
    { text: '海街咖啡 COFFEE', sub: '手冲 · 轻食', bg: 0x3b5f78, fg: 0xfdf4df, accent: 0xf5be5b, dx:  7.12, dz: -26.5, rotY: -Math.PI / 2, w: 4.8, h: 0.92 },
    { text: '阿强电动车换电', sub: '补胎 · 换电池', bg: 0x334756, fg: 0xffd54a, accent: 0xffffff, dx:  7.12, dz: -15.0, rotY: -Math.PI / 2, w: 4.8, h: 0.92 },
    { text: '丸山鲜果杂货', sub: '蜜柑 · 日用百货', bg: 0x4b7d59, fg: 0xfff8e2, accent: 0xf8c34c, dx:  7.12, dz:  -3.5, rotY: -Math.PI / 2, w: 4.8, h: 0.92 },
    { text: '海风书局', sub: '文具 · 报刊', bg: 0x456b7d, fg: 0xfff3d4, accent: 0xeec46d, dx:  7.12, dz:   8.0, rotY: -Math.PI / 2, w: 4.6, h: 0.90 },

    // Central Plaza North & South shops
    { text: '榕湾 24H 便利店', sub: '关东煮 · 咖啡', bg: 0x2e825e, fg: 0xffffff, accent: 0xf28d38, dx: -24.5, dz: 19.02, rotY: 0, w: 5.4, h: 0.92 },
    { text: '浪花茶室 · カフェ', sub: '甜品 · 刨冰', bg: 0x3e718c, fg: 0xfff7e2, accent: 0xf7ca65, dx:  24.5, dz: 19.02, rotY: 0, w: 4.8, h: 0.92 },
    { text: '坡底便当屋', sub: '热菜现炒 · 堂食外带', bg: 0xc24938, fg: 0xfff5db, accent: 0xffd55c, dx: -14.0, dz: 33.95, rotY: Math.PI, w: 4.8, h: 0.92 },
    { text: '海滨医药', sub: '常备药品 · 口罩', bg: 0x2e7d63, fg: 0xffffff, accent: 0xdff5dc, dx:  14.5, dz: 33.95, rotY: Math.PI, w: 5.0, h: 0.92 },
  ];

  for (const s of shopSigns) {
    const y = townSlopeY(s.dz) + 3.60;
    kit.add({
      kind: 'lightbox',
      text: s.text,
      sub: s.sub,
      bg: s.bg,
      fg: s.fg,
      accent: s.accent,
      w: s.w,
      h: s.h,
      layout: 'stack',
      font: 'hei',
      storybook: true,
    }, { x: CX + s.dx, y, z: CZ + s.dz, rotY: s.rotY });
  }

  // Vertical blade signs along Main Slope Avenue for authentic East-Asian depth
  const blades = [
    { text: '包子铺', bg: 0xc24232, fg: 0xfff2c9, dx: -6.95, dz: -35.4, rotY: 0 },
    { text: '拉面', bg: 0x2e6b62, fg: 0xfff2c9, dx: -6.95, dz: -24.0, rotY: 0 },
    { text: '药店', bg: 0x2c7865, fg: 0xffffff, dx: -6.95, dz: -12.6, rotY: 0 },
    { text: '咖啡', bg: 0x3b5f78, fg: 0xfff3d4, dx:  6.95, dz: -24.0, rotY: 0 },
    { text: '换电', bg: 0x334756, fg: 0xffd54a, dx:  6.95, dz: -12.6, rotY: 0 },
    { text: '书局', bg: 0x456b7d, fg: 0xfff3d4, dx:  6.95, dz:  10.4, rotY: 0 },
  ];
  for (const b of blades) {
    kit.add({
      kind: 'vertical',
      text: b.text,
      bg: b.bg,
      fg: b.fg,
      w: 0.62,
      h: 2.15,
      font: 'hei',
      storybook: true,
    }, { x: CX + b.dx, y: townSlopeY(b.dz) + 5.45, z: CZ + b.dz, rotY: b.rotY });
  }

  // Residential Door Plaques on Upper Street gate pillars (ready for S2 Step 2 door-hunting!)
  const plaques = [
    { text: '海风坡 101', dx: -49.0, dz: -62.1 },
    { text: '海风坡 102', dx: -34.0, dz: -62.1 },
    { text: '海风坡 103 · 阿柴', dx: -19.0, dz: -62.1 },
    { text: '海风坡 104', dx:  -4.0, dz: -62.1 },
    { text: '海风坡 105', dx:  11.0, dz: -62.1 },
    { text: '海风坡 106', dx:  26.5, dz: -62.1 },
    { text: '海风坡 107', dx:  42.0, dz: -62.1 },
  ];
  for (const p of plaques) {
    kit.add({
      kind: 'plaque',
      style: 'door',
      text: p.text,
      w: p.text.length > 8 ? 0.66 : 0.48,
      h: 0.24,
      bg: 0x2c5c8f,
      fg: 0xffffff,
      storybook: true,
    }, { x: CX + p.dx, y: townSlopeY(UPPER_Z) + 1.32, z: CZ + p.dz, rotY: 0 });
  }

  const group = kit.build();
  root.add(group);
  return kit;
}

// ==============================================================================
// Main Builder: Assemble Hub #1 Coastal Hillside Town
// ==============================================================================
export function createCoastalTown(townKitGltf) {
  const root = new THREE.Group();
  root.name = 'coastal-town-hub';
  const trackedGeos = [];
  const trackedMats = [];
  const trackedTex = [];
  const trackMat = m => (trackedMats.push(m), m);
  const trackTex = t => (trackedTex.push(t), t);

  const archMat = trackMat(createCoastalTownArchMaterial());

  // Extract geometry templates from Blender coastal-town-kit.glb
  const templates = {};
  if (townKitGltf?.scene) {
    townKitGltf.scene.traverse(obj => {
      if (obj.isMesh && obj.name) templates[obj.name] = obj.geometry;
    });
  }

  // 1) Terrain, roads, sidewalks, plaza, railway tracks, seawall, power lines & distant skyline
  trackedGeos.push(buildTownTerrain(root));
  trackedGeos.push(...buildTownRoadsAndCivil(root, trackTex, trackMat));
  trackedGeos.push(buildTownOcean(root, trackMat));

  // 2) Merge all static Blender Buildings into 1 single baked world-space Mesh:
  //    - Only 1 draw call for all 43 town buildings!
  //    - Automatically discovered & warmly illuminated at dusk/night by time-of-day.js!
  const dummy = new THREE.Object3D();
  const buildingParts = [];
  for (const b of BUILDINGS) {
    const src = templates[b.mesh];
    if (!src) continue;
    const g = src.clone();
    dummy.position.set(CX + b.dx, townSlopeY(b.dz) + 0.14, CZ + b.dz);
    dummy.rotation.set(0, b.rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    g.applyMatrix4(dummy.matrix);
    buildingParts.push(g);
  }
  if (buildingParts.length) {
    const mergedBuildings = mergeGeometries(buildingParts, false);
    for (const g of buildingParts) g.dispose();
    trackedGeos.push(mergedBuildings);
    const buildingsMesh = new THREE.Mesh(mergedBuildings, archMat);
    buildingsMesh.name = 'coastal-town-buildings';
    buildingsMesh.castShadow = true;
    buildingsMesh.receiveShadow = true;
    buildingsMesh.matrixAutoUpdate = false;
    buildingsMesh.updateMatrix();
    root.add(buildingsMesh);
  }

  // 3) Instanced Street Furniture: Utility Poles, Vending Machines, Battery Cabinets, Bus Stops
  const addInstancedProps = (meshName, placements, castShadow = true) => {
    const geo = templates[meshName];
    if (!geo || !placements.length) return;
    const inst = new THREE.InstancedMesh(geo, archMat, placements.length);
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const y = p.y ?? (townSlopeY(p.dz) + 0.14);
      dummy.position.set(CX + p.dx, y, CZ + p.dz);
      dummy.rotation.set(0, p.rotY || 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = castShadow;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    root.add(inst);
  };

  // Utility poles flanking Main Slope Avenue, Upper Street & Coastal Boulevard
  const poles = [];
  for (const dz of [-52, -32, -12, 8, 36, 54.5]) {
    poles.push({ dx: -5.85, dz, rotY: Math.PI / 2 });
    poles.push({ dx:  5.85, dz, rotY: -Math.PI / 2 });
  }
  for (const dx of [-34, -18, 18, 34]) {
    poles.push({ dx, dz: UPPER_Z - 4.2, rotY: 0 });
  }
  for (const dx of [-76, -34, 34, 76]) {
    poles.push({ dx, dz: BLVD_Z - 5.2, rotY: 0 });
  }
  addInstancedProps('Town_Utility_Pole', poles, false);

  // Courier Battery-Swap Cabinets at Central Plaza & Konbini
  addInstancedProps('Town_Battery_Cabinet', [
    { dx: -13.2, dz: 19.2, rotY: 0 },
    { dx:  13.2, dz: 31.2, rotY: Math.PI },
    { dx: -39.5, dz: 29.8, rotY: Math.PI / 2 },
  ], true);

  // Japanese Vending Machines
  addInstancedProps('Town_Vending', [
    { dx: -6.2, dz:  11.8, rotY: Math.PI / 2 },
    { dx:  6.2, dz: -20.5, rotY: -Math.PI / 2 },
    { dx: -15.6, dz: 19.2, rotY: 0 },
    { dx:  16.2, dz: 31.2, rotY: Math.PI },
    { dx:  40.2, dz: 12.0, rotY: -Math.PI / 2 },
  ], false);

  // Oceanfront Bus / Tram Stop Shelters
  addInstancedProps('Town_Bus_Stop', [
    { dx: -16.5, dz: 54.6, rotY: 0 },
    { dx:  17.5, dz: 54.6, rotY: 0 },
  ], true);

  // 4) Main & Secondary Railway Level Crossings (Fumikiri Posts + Animated Gates)
  //    Offset 3.1m from rail center so lowered barrier bars clear the 2.58m-wide tram cleanly!
  const railY = townSlopeY(RAIL_Z) + 0.04;
  addInstancedProps('Town_Crossing_Post', [
    { dx: -5.4, dz: RAIL_Z - 3.1, y: railY, rotY: 0 },
    { dx:  5.4, dz: RAIL_Z + 3.1, y: railY, rotY: Math.PI },
    { dx: -47.6, dz: RAIL_Z - 3.1, y: railY, rotY: 0 },
    { dx:  47.6, dz: RAIL_Z - 3.1, y: railY, rotY: 0 },
  ], false);

  const gateBars = [];
  if (templates.Town_Crossing_Bar) {
    const barDefs = [
      { dx: -5.15, dz: RAIL_Z - 3.1, rotY: 0 },
      { dx:  5.15, dz: RAIL_Z + 3.1, rotY: Math.PI },
    ];
    for (const d of barDefs) {
      const bar = new THREE.Mesh(templates.Town_Crossing_Bar, archMat);
      bar.position.set(CX + d.dx, railY + 1.05, CZ + d.dz);
      bar.rotation.y = d.rotY;
      bar.castShadow = false;
      bar.receiveShadow = true;
      root.add(bar);
      gateBars.push(bar);
    }
  }

  // 5) Animated 2-Car Green & Cream Enoden Coastal Tram!
  const tramGroup = new THREE.Group();
  tramGroup.name = 'coastal-enoden-tram';
  if (templates.Town_Tram_Car) {
    for (const offset of [-6.5, 6.5]) {
      const car = new THREE.Mesh(templates.Town_Tram_Car, archMat);
      car.position.set(offset, 0, 0);
      car.castShadow = true;
      car.receiveShadow = true;
      tramGroup.add(car);
    }
  }
  tramGroup.position.set(CX - 3.5, railY + 0.14, CZ + RAIL_Z);
  root.add(tramGroup);

  // 6) Multi-language Shop Signs & Door Plaques (1–2 draw calls via SignKit)
  const signKit = buildTownSigns(root);

  // 7) Lush Ghibli Hillside Grass, Wildflowers & Clustered Leaf-Card Trees
  buildTownBackdropFlora(root);

  const treeSpecs = [
    // North green hill canopy clusters crowning the skyline behind residential roofs
    { dx: -68, dz: -78, variant: 'tall', scale: 1.25 },
    { dx: -58, dz: -82, variant: 'wide', scale: 1.18 },
    { dx: -44, dz: -77, variant: 'tall', scale: 1.15 },
    { dx: -36, dz: -84, variant: 'wide', scale: 1.28 },
    { dx: -22, dz: -79, variant: 'tall', scale: 1.22 },
    { dx: -10, dz: -85, variant: 'wide', scale: 1.32 },
    { dx:   4, dz: -78, variant: 'tall', scale: 1.18 },
    { dx:  18, dz: -83, variant: 'wide', scale: 1.26 },
    { dx:  34, dz: -79, variant: 'tall', scale: 1.20 },
    { dx:  48, dz: -84, variant: 'wide', scale: 1.24 },
    { dx:  64, dz: -78, variant: 'tall', scale: 1.22 },
    // East & West coastal ridge trees framing the square town borders
    { dx: -70, dz: -46, variant: 'wide', scale: 1.12 },
    { dx: -68, dz: -24, variant: 'tall', scale: 1.16 },
    { dx: -72, dz:  -4, variant: 'wide', scale: 1.15 },
    { dx: -68, dz:  20, variant: 'tall', scale: 1.10 },
    { dx:  70, dz: -46, variant: 'tall', scale: 1.14 },
    { dx:  68, dz: -22, variant: 'wide', scale: 1.18 },
    { dx:  72, dz:   2, variant: 'tall', scale: 1.12 },
    { dx:  68, dz:  24, variant: 'wide', scale: 1.10 },
    // Pocket greenery inside town: Plaza corners & uphill gardens (compact & citrus)
    { dx: -15.5, dz: 15.8, variant: 'compact', scale: 0.92 },
    { dx:  15.5, dz: 15.8, variant: 'compact', scale: 0.95 },
    { dx: -24.5, dz: -38.5, variant: 'citrus', scale: 0.95 },
    { dx:  24.5, dz: -38.5, variant: 'citrus', scale: 0.95 },
    { dx: -23.5, dz:  -8.0, variant: 'compact', scale: 0.88 },
    { dx:  23.5, dz:  -8.0, variant: 'compact', scale: 0.88 },
    // Coastal promenade accent trees outside main slope sightline
    { dx: -30.0, dz: 53.5, variant: 'compact', scale: 0.94 },
    { dx:  30.0, dz: 53.5, variant: 'compact', scale: 0.94 },
  ];
  const treePositions = treeSpecs.map(t => ({
    x: CX + t.dx,
    y: (Math.abs(t.dx) < 35 && t.dz > -50 && t.dz < 56 ? townSlopeY(t.dz) + 0.22 : coastalTownTerrainHeight(CX + t.dx, CZ + t.dz)) - 0.04,
    z: CZ + t.dz,
    variant: t.variant,
    sx: t.scale,
    sy: t.scale,
    sz: t.scale,
    rotY: ((Math.abs(t.dx) * 13 + Math.abs(t.dz) * 7) % 628) / 100,
  }));
  placeStylizedTrees(root, treePositions);

  // Animation loop: Enoden tram loops across the coast & crossing gates lower smoothly
  function update(time) {
    // At time=0..2s, tram is gliding right across the iconic main slope crossing (dx ~ -3 -> +12)
    // Full loop period = 32 seconds (-118m -> +118m)
    const span = 236;
    const speed = 7.4;
    const raw = (((time * speed) + 114.5) % span + span) % span;
    const tramDx = raw - 118;
    tramGroup.position.x = CX + tramDx;

    // Lower fumikiri crossing bars when tram is approaching or crossing main avenue
    const approaching = 1.0 - smoothstep(22.0, 38.0, Math.abs(tramDx));
    const barAngle = lerp(1.32, 0.0, approaching); // 1.32 rad = raised, 0 = lowered horizontally
    for (const bar of gateBars) {
      bar.rotation.z = barAngle;
    }

    signKit.update(1 / 60, time);
  }

  // Initialize frame 0 so screenshots immediately show the tram gliding across the crossing
  update(0);

  return {
    root,
    signKit,
    update,
    dispose() {
      signKit?.dispose?.();
      for (const g of trackedGeos) g.dispose();
      for (const m of trackedMats) m.dispose();
      for (const t of trackedTex) t.dispose();
    },
  };
}
