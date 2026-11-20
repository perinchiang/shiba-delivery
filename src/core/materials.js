// World materials. EVERY surface in the neighborhood must be created through these factories so
// that it receives the baked street lighting (core/lightgrid.js), rain wetness and fog consistently.
//
//   litMaterial({...})       PBR surface lit by sky + headlight + the baked LightGrid.
//   glowMaterial({...})      Unlit emissive surface (signs, lamps, screens, LEDs). Values > 1 bloom.
//
// Options on litMaterial beyond the usual MeshStandardMaterial parameters:
//   wet: 0..1      how much rain wetness affects up-facing parts (roads 1, roofs/awnings 0.6, indoor 0)
//   selfLit: 0..n  adds albedo * selfLit as emission: use for INTERIORS (shop rooms, lit windows,
//                  stairwells) which sit inside building footprints where the LightGrid is dark.
//   grid: false    opt out of the LightGrid (rarely needed)
//   physical: true use MeshPhysicalMaterial (clearcoat for vehicle paint, etc.)
import * as THREE from 'three';
import { lightGridUniforms } from './lightgrid.js';

/** Global weather/time uniforms shared by reference with all world materials. */
export const worldUniforms = {
  ...lightGridUniforms,
  uWetness: { value: 1.0 }, // 0 dry .. 1 soaked (global)
  uTime: { value: 0 },
};

const VERT_PARS = /* glsl */ `
varying vec3 vLgWorld;
varying vec3 vLgNormal;
`;
const VERT_MAIN = /* glsl */ `
{
  vec4 lgP = vec4(transformed, 1.0);
  vec3 lgN = objectNormal;
  #ifdef USE_BATCHING
    lgP = batchingMatrix * lgP; lgN = mat3(batchingMatrix) * lgN;
  #endif
  #ifdef USE_INSTANCING
    lgP = instanceMatrix * lgP; lgN = mat3(instanceMatrix) * lgN;
  #endif
  vLgWorld = (modelMatrix * lgP).xyz;
  vLgNormal = mat3(modelMatrix) * lgN;
}
`;
const FRAG_PARS = /* glsl */ `
varying vec3 vLgWorld;
varying vec3 vLgNormal;
uniform sampler2D uLgTex;
uniform sampler2D uLgDirTex;
uniform vec2 uLgOrigin;
uniform vec2 uLgInvSize;
uniform float uLgGain;
uniform float uLgHeightFade;
uniform float uWetness;
uniform float uMatWet;
uniform float uSelfLit;
// Dense streets stack a dozen emitters on one spot; the eye adapts, so the summed irradiance gets a
// soft knee: one sign passes almost unchanged, a pile of them saturates instead of blowing out.
vec3 lgCompress(vec3 e) {
  float l = dot(e, vec3(0.3, 0.55, 0.15));
  return e / (1.0 + max(l - 0.35, 0.0) * 0.9);
}
`;
const FRAG_WET = /* glsl */ `
#ifdef LG_WET
{
  float lgWet = uMatWet * uWetness * smoothstep(0.35, 0.9, normalize(vLgNormal).y);
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.32, lgWet);
  diffuseColor.rgb *= mix(1.0, 0.7, lgWet);
}
#endif
`;
const FRAG_SELFLIT = /* glsl */ `
#ifdef LG_SELFLIT
  totalEmissiveRadiance += diffuseColor.rgb * uSelfLit;
#endif
`;
const FRAG_GRID = /* glsl */ `
#ifdef LG_GRID
{
  vec3 lgN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 lgV = normalize((vec4(geometryViewDir, 0.0) * viewMatrix).xyz);
  vec2 lgUv = (vLgWorld.xz + lgN.xz * 0.6 - uLgOrigin) * uLgInvSize;
  vec3 lgE = lgCompress(texture2D(uLgTex, lgUv).rgb);
  vec4 lgD = texture2D(uLgDirTex, lgUv);
  float lgW = max(lgD.a, 1e-4);
  vec3 lgDir = vec3(lgD.x, 0.0, lgD.y) / lgW;          // mean direction toward the light, |.| <= 1
  float lgK = clamp(length(lgDir), 0.0, 1.0);           // 1 = light comes from one direction
  float lgDy = lgD.z / lgW - vLgWorld.y;                // mean emitter height above this point
  vec3 lgL = normalize(vec3(lgDir.x, clamp(lgDy, -4.0, 4.0) * 0.3 + 0.12, lgDir.z) + vec3(0.0, 1e-3, 0.0));
  float lgNdl = mix(0.7, clamp(dot(lgN, lgL) * 0.65 + 0.35, 0.0, 1.0) * 1.25, lgK);
  float lgFade = 1.0 - smoothstep(1.0, uLgHeightFade, -lgDy);
  vec3 lgIrr = lgE * (lgFade * uLgGain);
  reflectedLight.directDiffuse += lgIrr * lgNdl * material.diffuseContribution;
  float lgR = clamp(material.roughness, 0.1, 1.0);
  float lgSh = 2.0 / (lgR * lgR * lgR * lgR) - 2.0;
  float lgNdh = max(dot(lgN, normalize(lgL + lgV)), 0.0);
  float lgSpec = min(pow(lgNdh, max(lgSh, 0.01)) * (lgSh + 2.0) * 0.125, 6.0) * clamp(dot(lgN, lgL), 0.0, 1.0) * lgK;
  reflectedLight.directSpecular += lgIrr * lgSpec * material.specularColorBlended;
}
#endif
`;

/**
 * Patch any MeshStandardMaterial / MeshPhysicalMaterial in place so it uses the world lighting.
 * opts: { wet=0, selfLit=0, grid=true }. Returns the material.
 */
export function applyWorldLighting(material, opts = {}) {
  const wet = opts.wet ?? 0, selfLit = opts.selfLit ?? 0, grid = opts.grid !== false;
  const u = { uMatWet: { value: wet }, uSelfLit: { value: selfLit } };
  material.userData.worldUniforms = u; // tweakable at runtime: material.userData.worldUniforms.uSelfLit.value = ...
  material.defines = { ...(material.defines || {}) };
  if (grid) material.defines.LG_GRID = '';
  if (wet > 0) material.defines.LG_WET = '';
  if (selfLit > 0) material.defines.LG_SELFLIT = '';
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, worldUniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_WET)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_SELFLIT)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FRAG_GRID);
  };
  const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => '';
  material.customProgramCacheKey = () => prevKey() + '|worldlit';
  return material;
}

/**
 * PBR surface with world lighting. Accepts all MeshStandardMaterial params plus
 * { wet, selfLit, grid, physical } (see header). Defaults: roughness 0.85, metalness 0.
 */
export function litMaterial(params = {}) {
  const { wet = 0, selfLit = 0, grid = true, physical = false, ...rest } = params;
  const Ctor = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new Ctor({ roughness: 0.85, metalness: 0, ...rest });
  return applyWorldLighting(m, { wet, selfLit, grid });
}

/**
 * Unlit glowing surface for anything that emits light: sign faces, neon tubes, LED strips, lamps,
 * phone screens, tail lights. `intensity` multiplies the colour/texture in HDR; the bloom pass
 * picks up everything brighter than ~1. Typical: lightbox sign 1.6-2.5, neon tube 3-5, LED dot 4-8.
 * params: { color=0xffffff, map, intensity=2, transparent, opacity, side, additive=false,
 *           alphaTest, depthWrite, fog=true, vertexColors }
 */
export function glowMaterial(params = {}) {
  const { color = 0xffffff, intensity = 2, additive = false, ...rest } = params;
  const m = new THREE.MeshBasicMaterial({ ...rest });
  m.color.set(color).multiplyScalar(intensity);
  m.userData.glow = { color: new THREE.Color(color), intensity };
  if (additive) { m.blending = THREE.AdditiveBlending; m.transparent = true; m.depthWrite = false; }
  return m;
}

/** Change a glow material's brightness later (flicker, switching a sign off). */
export function setGlow(material, intensity) {
  const g = material.userData.glow;
  if (!g) return;
  g.intensity = intensity;
  material.color.copy(g.color).multiplyScalar(intensity);
}

/** Layer for objects that must NOT appear in the wet-road planar reflection (ground decals, particles, tiny props). */
export const LAYER_NO_REFLECT = 1;
