// Render-style pipeline (off / a / b / c) for S1 visual style comparison.
// - off: baseline renderer (zero post passes, zero outline meshes)
// - a:   Soft Storybook (matte PBR + cool blue-violet shadows + non-gray fog + subtle bloom + LGG grade)
// - b:   Cel-Shaded Toon + Selective Inverted-Hull Outlines (3-band stepped ramp + cool shadows +
//        merged welded-normal outlines ONLY on Shiba [1 call], Scooter [7 calls], and NPCs [1 call each])
// - c:   Pixelated 3D control (1/3.5-res nearest-neighbor RenderTarget + 4x4 Bayer dither/quantize; DOM UI untouched)
import * as THREE from 'three';

export const STYLE_ORDER = Object.freeze(['off', 'a', 'b', 'c']);

export const STYLE_LABELS = Object.freeze({
  off: '当前(off)',
  a: 'A 柔和绘本',
  b: 'B 卡通描边',
  c: 'C 像素3D',
});

const controlsByRenderer = new WeakMap();

export function registerRendererControls(renderer, controls) {
  controlsByRenderer.set(renderer, controls);
}

export function getRendererControls(renderer) {
  return controlsByRenderer.get(renderer) || null;
}

const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BLOOM_EXTRACT_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexelSize;
uniform float uThreshold;
varying vec2 vUv;

vec3 prefilter(vec3 c) {
  float luma = max(c.r, max(c.g, c.b));
  float knee = 0.28;
  float soft = clamp(luma - uThreshold + knee, 0.0, 2.0 * knee);
  soft = (soft * soft) / (4.0 * knee + 1e-4);
  float contrib = max(luma - uThreshold, soft) / max(luma, 1e-4);
  return c * contrib;
}

void main() {
  vec2 o = uTexelSize * 1.25;
  vec3 c = prefilter(texture2D(tDiffuse, vUv + vec2(-o.x, -o.y)).rgb)
         + prefilter(texture2D(tDiffuse, vUv + vec2( o.x, -o.y)).rgb)
         + prefilter(texture2D(tDiffuse, vUv + vec2(-o.x,  o.y)).rgb)
         + prefilter(texture2D(tDiffuse, vUv + vec2( o.x,  o.y)).rgb);
  gl_FragColor = vec4(c * 0.25, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uDirection;
varying vec2 vUv;

void main() {
  vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
  sum += texture2D(tDiffuse, vUv + uDirection * 1.384615).rgb * 0.316216;
  sum += texture2D(tDiffuse, vUv - uDirection * 1.384615).rgb * 0.316216;
  sum += texture2D(tDiffuse, vUv + uDirection * 3.230769).rgb * 0.070270;
  sum += texture2D(tDiffuse, vUv - uDirection * 3.230769).rgb * 0.070270;
  gl_FragColor = vec4(sum, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform float uBloomStrength;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSaturation;
uniform float uContrast;
uniform float uVignette;
uniform float uPaperGrain;
uniform float uPixelMode;
uniform vec2 uPixelRes;
uniform float uColorLevels;
varying vec2 vUv;

vec3 applyGrade(vec3 c) {
  c = c * uGain + uLift * (1.0 - c);
  c = max(c, vec3(0.0));
  c = pow(c, 1.0 / max(uGamma, vec3(0.05)));
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, uSaturation);
  c = (c - 0.21) * uContrast + 0.21;
  return clamp(c, 0.0, 1.0);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int idx = q.y * 4 + q.x;
  float m[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
  );
  return (m[idx] + 0.5) / 16.0 - 0.5;
}

void main() {
  vec2 uv = vUv;
  vec2 pixCoord = floor(vUv * uPixelRes);
  if (uPixelMode > 0.5) {
    uv = (pixCoord + 0.5) / uPixelRes;
  }

  vec3 col = texture2D(tDiffuse, uv).rgb;
  if (uBloomStrength > 0.001) {
    col += texture2D(tBloom, uv).rgb * uBloomStrength;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>

  vec3 graded = applyGrade(gl_FragColor.rgb);

  if (uVignette > 0.001) {
    vec2 centered = (vUv - 0.5) * vec2(1.12, 1.0);
    float d2 = dot(centered, centered);
    float vig = 1.0 - smoothstep(0.22, 0.78, d2) * uVignette;
    graded *= vig;
  }

  gl_FragColor = vec4(graded, 1.0);
  #include <colorspace_fragment>

  if (uPixelMode > 0.5 && uColorLevels > 1.0) {
    float d = bayer4(pixCoord) / uColorLevels;
    gl_FragColor.rgb = clamp(floor((gl_FragColor.rgb + d) * uColorLevels + 0.5) / uColorLevels, 0.0, 1.0);
  } else if (uPaperGrain > 0.001) {
    float lumaSrgb = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
    float n = (hash21(floor(gl_FragCoord.xy * 0.5)) - 0.5) * uPaperGrain * smoothstep(0.08, 0.45, lumaSrgb);
    gl_FragColor.rgb = clamp(gl_FragColor.rgb + n, 0.0, 1.0);
  }
}
`;

// Inverted-hull outline shaders supporting both rigid Mesh and SkinnedMesh with
// distance-adaptive thickness (works identically under Perspective and Orthographic cameras).
const OUTLINE_VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
#include <fog_pars_vertex>
uniform float uOutlineWidth;

void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>

  vec4 mvBase = modelViewMatrix * vec4(transformed, 1.0);
  float isOrtho = step(0.5, projectionMatrix[3][3]);
  float perspScale = clamp(-mvBase.z * 0.165, 0.40, 1.75);
  float orthoScale = clamp(0.32 / max(projectionMatrix[1][1], 0.04), 0.42, 1.55);
  float distScale = mix(perspScale, orthoScale, isOrtho);

  // Extrude along smooth welded normal in object space, compensating for non-uniform scale if any.
  transformed += normalize(objectNormal) * (uOutlineWidth * distScale);
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const OUTLINE_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uOutlineColor;

void main() {
  gl_FragColor = vec4(uOutlineColor, 1.0);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Fullscreen triangle (1 draw call, zero diagonal seam).
function createFullscreenQuad() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const mesh = new THREE.Mesh(geo, null);
  mesh.frustumCulled = false;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  quadScene.add(mesh);
  return {
    mesh,
    draw(renderer, material, target) {
      mesh.material = material;
      renderer.setRenderTarget(target);
      renderer.render(quadScene, cam);
    },
    dispose() { geo.dispose(); },
  };
}

// Compute welded smooth vertex normals by averaging normals across colocated vertices.
// Eliminates cracks at hard bevel/box corners when extruding inverted hulls.
function computeWeldedNormals(positions, normals) {
  const count = positions.length / 3;
  const buckets = new Map();
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    let acc = buckets.get(key);
    if (!acc) {
      acc = [0, 0, 0];
      buckets.set(key, acc);
    }
    acc[0] += normals[i * 3];
    acc[1] += normals[i * 3 + 1];
    acc[2] += normals[i * 3 + 2];
  }
  const out = new Float32Array(positions.length);
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    const acc = buckets.get(key);
    const len = Math.hypot(acc[0], acc[1], acc[2]) || 1;
    out[i * 3] = acc[0] / len;
    out[i * 3 + 1] = acc[1] / len;
    out[i * 3 + 2] = acc[2] / len;
  }
  return out;
}

// Merge multiple rigid meshes into 1 BufferGeometry expressed in `targetGroup` local space.
function buildMergedRigidOutlineGeo(meshes, targetGroup) {
  targetGroup.updateWorldMatrix(true, true);
  const invTarget = targetGroup.matrixWorld.clone().invert();
  const rel = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  let totalVerts = 0;
  const prepared = [];
  for (const mesh of meshes) {
    const g = mesh.geometry;
    if (!g?.attributes?.position || !g.attributes.normal) continue;
    const nonIdx = g.index ? g.toNonIndexed() : g;
    totalVerts += nonIdx.attributes.position.count;
    prepared.push({ mesh, geo: nonIdx, owned: Boolean(g.index) });
  }
  if (!totalVerts) return null;

  const posOut = new Float32Array(totalVerts * 3);
  const norOut = new Float32Array(totalVerts * 3);
  let offset = 0;

  for (const { mesh, geo, owned } of prepared) {
    rel.multiplyMatrices(invTarget, mesh.matrixWorld);
    nm.getNormalMatrix(rel);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(rel);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      posOut[offset] = v.x; posOut[offset + 1] = v.y; posOut[offset + 2] = v.z;
      norOut[offset] = n.x; norOut[offset + 1] = n.y; norOut[offset + 2] = n.z;
      offset += 3;
    }
    if (owned) geo.dispose();
  }

  const smoothNor = computeWeldedNormals(posOut, norOut);
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posOut, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(smoothNor, 3));
  merged.computeBoundingSphere();
  return merged;
}

// Merge multiple SkinnedMeshes sharing one skeleton into 1 SkinnedMesh BufferGeometry (1 draw call!).
function buildMergedSkinnedOutlineGeo(skinnedMeshes) {
  let totalVerts = 0;
  const prepared = [];
  for (const mesh of skinnedMeshes) {
    const g = mesh.geometry;
    if (!g?.attributes?.position || !g.attributes.normal || !g.attributes.skinIndex || !g.attributes.skinWeight) continue;
    const nonIdx = g.index ? g.toNonIndexed() : g;
    totalVerts += nonIdx.attributes.position.count;
    prepared.push({ geo: nonIdx, owned: Boolean(g.index) });
  }
  if (!totalVerts) return null;

  const posOut = new Float32Array(totalVerts * 3);
  const norOut = new Float32Array(totalVerts * 3);
  const idxOut = new Uint16Array(totalVerts * 4);
  const wgtOut = new Float32Array(totalVerts * 4);
  let vCursor = 0;

  for (const { geo, owned } of prepared) {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const sIdx = geo.attributes.skinIndex;
    const sWgt = geo.attributes.skinWeight;
    for (let i = 0; i < pos.count; i++) {
      const o3 = vCursor * 3, o4 = vCursor * 4;
      posOut[o3] = pos.getX(i); posOut[o3 + 1] = pos.getY(i); posOut[o3 + 2] = pos.getZ(i);
      norOut[o3] = nor.getX(i); norOut[o3 + 1] = nor.getY(i); norOut[o3 + 2] = nor.getZ(i);
      idxOut[o4] = sIdx.getX(i); idxOut[o4 + 1] = sIdx.getY(i); idxOut[o4 + 2] = sIdx.getZ(i); idxOut[o4 + 3] = sIdx.getW(i);
      wgtOut[o4] = sWgt.getX(i); wgtOut[o4 + 1] = sWgt.getY(i); wgtOut[o4 + 2] = sWgt.getZ(i); wgtOut[o4 + 3] = sWgt.getW(i);
      vCursor++;
    }
    if (owned) geo.dispose();
  }

  const smoothNor = computeWeldedNormals(posOut, norOut);
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posOut, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(smoothNor, 3));
  merged.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idxOut, 4));
  merged.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgtOut, 4));
  merged.computeBoundingSphere();
  return merged;
}

const SHIBA_OUTLINE_SKIP = /Eye_|Muzzle_Smile|Helmet_Chinstrap|Helmet_Goggles/i;
const SCOOTER_OUTLINE_SKIP = /Box_Envelope_and_Clasp|Stand_Hinge/i;
const SCOOTER_MOVING_GROUPS = ['Cargo_Lid', 'Side_Stand', 'Wheel_R', 'Steering', 'Mudguards001', 'Wheel_F'];

export function createRenderStyle({ renderer, scene, shiba, scooter, street, country, rooms, timeOfDay }) {
  let style = 'off';
  const listeners = new Set();

  // Shared global shader uniforms toggled instantaneously (zero shader recompile on switch).
  // uStyleMode: 0 = off/c, 1 = Style A (storybook), 2 = Style B (toon)
  const sharedUniforms = {
    uStyleMode: { value: 0.0 },
    uShadowTint: { value: new THREE.Color(0x5670b2) },
    uShadowTintStr: { value: 0.36 },
    uSunRefMag: { value: 3.8 },
    uNightHeroLift: { value: 0.0 },
  };

  // Shared inverted-hull outline material (renders ONLY when style === 'b').
  const outlineMat = new THREE.ShaderMaterial({
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: THREE.BackSide,
    depthWrite: true,
    fog: true,
    toneMapped: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uOutlineWidth: { value: 0.022 },
        uOutlineColor: { value: new THREE.Color(0x26212c) },
      },
    ]),
  });

  const outlineMeshes = [];
  const outlinedNpcGroups = new WeakSet();
  const patchedMats = new WeakSet();
  const heroRoots = new Set([shiba.root, scooter.root]);

  function registerOutlineMesh(mesh) {
    mesh.name = 'style-b-outline';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = style === 'b';
    mesh.userData.isStyleOutline = true;
    outlineMeshes.push(mesh);
    return mesh;
  }

  function buildShibaOutline() {
    const skinned = [];
    shiba.root.traverse(obj => {
      if (!obj.isSkinnedMesh || obj.userData.isStyleOutline) return;
      if (obj.material?.transparent) return;
      // Check node name and parent group name against skip list (multi-prim GLTF splits into parent + child).
      const tag = `${obj.parent?.name || ''} ${obj.name || ''}`;
      if (SHIBA_OUTLINE_SKIP.test(tag)) return;
      skinned.push(obj);
    });
    if (!skinned.length) return;
    const first = skinned[0];
    const sameSkel = skinned.filter(m => m.skeleton === first.skeleton);
    const geo = buildMergedSkinnedOutlineGeo(sameSkel);
    if (!geo) return;
    const hull = new THREE.SkinnedMesh(geo, outlineMat);
    hull.bind(first.skeleton, first.bindMatrix);
    hull.frustumCulled = false;
    registerOutlineMesh(hull);
    (first.parent || shiba.root).add(hull);
  }

  function buildScooterOutlines() {
    const groups = new Map();
    const frameNode = scooter.root.getObjectByName('Frame') || scooter.root;
    groups.set(frameNode, []);
    for (const name of SCOOTER_MOVING_GROUPS) {
      const node = scooter.root.getObjectByName(name);
      if (node) groups.set(node, []);
    }

    function nearestGroup(obj) {
      let cur = obj.parent;
      while (cur) {
        if (groups.has(cur)) return cur;
        cur = cur.parent;
      }
      return frameNode;
    }

    scooter.root.traverse(obj => {
      if (!obj.isMesh || obj.userData.isStyleOutline) return;
      if (obj.material?.transparent) return;
      const tag = `${obj.parent?.name || ''} ${obj.name || ''}`;
      if (SCOOTER_OUTLINE_SKIP.test(tag)) return;
      groups.get(nearestGroup(obj)).push(obj);
    });

    for (const [grp, meshes] of groups) {
      if (!meshes.length) continue;
      const geo = buildMergedRigidOutlineGeo(meshes, grp);
      if (!geo) continue;
      const hull = new THREE.Mesh(geo, outlineMat);
      registerOutlineMesh(hull);
      grp.add(hull);
    }
  }

  // Auto-detect standalone baked animal NPCs (town.js neighbor() & city-crossing.js cityAnimal())
  // and attach 1 welded-normal inverted-hull outline + hero rim flag per NPC.
  const tmpSize = new THREE.Vector3();
  function detectAndOutlineNpcs(root) {
    if (!root) return;
    const candidates = [];
    root.traverse(obj => {
      if (!obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh || obj.userData.isStyleOutline) return;
      const parent = obj.parent;
      if (!parent || parent === root || outlinedNpcGroups.has(parent)) return;
      if (!obj.material?.vertexColors || obj.material.map) return;
      if (obj.material.userData?.isNightBuildingMat) return;
      // Standalone baked NPC groups have 1 baked mesh child (size ~0.8 x 1.45 x 0.8 m).
      if (parent.children.length !== 1) return;
      const g = obj.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      g.boundingBox.getSize(tmpSize);
      if (tmpSize.y >= 1.18 && tmpSize.y <= 1.78 && tmpSize.x >= 0.45 && tmpSize.x <= 1.25 && tmpSize.z >= 0.35 && tmpSize.z <= 1.25) {
        candidates.push({ parent, mesh: obj });
      }
    });

    for (const { parent, mesh } of candidates) {
      outlinedNpcGroups.add(parent);
      heroRoots.add(parent);
      // Give NPC its own cloned material reference if still sharing global batchPaint so uIsHero=1 only affects NPCs.
      if (!mesh.userData.npcUniqueMat) {
        mesh.material = mesh.material.clone();
        mesh.userData.npcUniqueMat = true;
      }
      const geo = buildMergedRigidOutlineGeo([mesh], parent);
      if (geo) {
        const hull = new THREE.Mesh(geo, outlineMat);
        registerOutlineMesh(hull);
        parent.add(hull);
      }
    }
  }

  function isHeroObject(obj) {
    let cur = obj;
    while (cur) {
      if (heroRoots.has(cur)) return true;
      cur = cur.parent;
    }
    return false;
  }

  function patchMaterial(mat, isHero) {
    if (!mat || patchedMats.has(mat)) return;
    const isStd = mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial;
    const isLamb = mat.isMeshLambertMaterial;
    if (!isStd && !isLamb) return;
    patchedMats.add(mat);

    const prevCompile = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
    const heroUniform = { value: isHero ? 1.0 : 0.0 };
    mat.userData.shibaStyleHero = heroUniform;

    mat.onBeforeCompile = (shader, r) => {
      if (prevCompile) prevCompile(shader, r);
      Object.assign(shader.uniforms, sharedUniforms);
      shader.uniforms.uIsHero = heroUniform;

      const stylePars = /* glsl */ `
uniform float uStyleMode;
uniform vec3 uShadowTint;
uniform float uShadowTintStr;
uniform float uSunRefMag;
uniform float uNightHeroLift;
uniform float uIsHero;
`;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\n' + stylePars,
      );

      if (isStd && shader.fragmentShader.includes('#include <roughnessmap_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n' +
          'if (uStyleMode > 0.5 && uStyleMode < 1.5) {\n' +
          '  roughnessFactor = clamp(mix(roughnessFactor, 0.94, 0.62), 0.74, 0.98);\n' +
          '}',
        );
      }

      // Style B: inject crisp 3-band stepped cel-shading wrapper around RE_Direct.
      if (isStd && shader.fragmentShader.includes('#include <lights_physical_pars_fragment>')) {
        const toonPhysical = /* glsl */ `
#include <lights_physical_pars_fragment>
void RE_Direct_ShibaStyle(
  const in IncidentLight directLight,
  const in vec3 geometryPosition,
  const in vec3 geometryNormal,
  const in vec3 geometryViewDir,
  const in vec3 geometryClearcoatNormal,
  const in PhysicalMaterial material,
  inout ReflectedLight reflectedLight
) {
  if (uStyleMode < 1.5) {
    RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    return;
  }
  float rawNL = dot(geometryNormal, directLight.direction);
  float lightMag = length(directLight.color);
  float shadowVis = clamp(lightMag / max(uSunRefMag, 0.05), 0.0, 1.0);
  vec3 unshadowedCol = lightMag > 1e-4 ? (directLight.color / max(shadowVis, 0.001)) : vec3(0.0);
  float castStep = smoothstep(0.28, 0.62, shadowVis);
  float wrappedNL = uIsHero > 0.5 ? clamp(rawNL * 0.72 + 0.24, 0.0, 1.0) : clamp(rawNL, 0.0, 1.0);
  float litMetric = wrappedNL * castStep;
  // Crisp 3-band cel ramp: Shadow (0.0) -> Mid-tone (0.46) -> Bright Key (1.08)
  float bandMid = smoothstep(0.06, 0.11, litMetric);
  float bandKey = smoothstep(0.46, 0.51, litMetric);
  float toonFactor = bandMid * 0.46 + bandKey * 0.62;
  reflectedLight.directDiffuse += (toonFactor * unshadowedCol) * BRDF_Lambert(material.diffuseColor);

  // Clean specular cel pill only on glossy surfaces (helmet, scooter tank, glass)
  vec3 halfDir = normalize(directLight.direction + geometryViewDir);
  float ndh = clamp(dot(geometryNormal, halfDir), 0.0, 1.0);
  float gloss = 1.0 - smoothstep(0.32, 0.64, material.roughness);
  float specStep = smoothstep(0.950, 0.966, ndh) * bandKey * gloss;
  reflectedLight.directSpecular += unshadowedCol * (specStep * 0.40);

  // Crisp stylized rim light on Shiba, Scooter & NPCs
  if (uIsHero > 0.5) {
    float ndv = clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0);
    float rimStep = smoothstep(0.58, 0.68, 1.0 - ndv) * smoothstep(-0.25, 0.25, rawNL);
    reflectedLight.directDiffuse += (unshadowedCol * 0.34 + material.diffuseColor * 0.20) * rimStep;
  }
}
#undef RE_Direct
#define RE_Direct RE_Direct_ShibaStyle
`;
        shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', toonPhysical);
      } else if (isLamb && shader.fragmentShader.includes('#include <lights_lambert_pars_fragment>')) {
        const toonLambert = /* glsl */ `
#include <lights_lambert_pars_fragment>
void RE_Direct_ShibaLambert(
  const in IncidentLight directLight,
  const in vec3 geometryPosition,
  const in vec3 geometryNormal,
  const in vec3 geometryViewDir,
  const in vec3 geometryClearcoatNormal,
  const in LambertMaterial material,
  inout ReflectedLight reflectedLight
) {
  if (uStyleMode < 1.5) {
    RE_Direct_Lambert(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    return;
  }
  float rawNL = dot(geometryNormal, directLight.direction);
  float lightMag = length(directLight.color);
  float shadowVis = clamp(lightMag / max(uSunRefMag, 0.05), 0.0, 1.0);
  vec3 unshadowedCol = lightMag > 1e-4 ? (directLight.color / max(shadowVis, 0.001)) : vec3(0.0);
  float litMetric = clamp(rawNL, 0.0, 1.0) * smoothstep(0.28, 0.62, shadowVis);
  float bandMid = smoothstep(0.06, 0.11, litMetric);
  float bandKey = smoothstep(0.46, 0.51, litMetric);
  float toonFactor = bandMid * 0.46 + bandKey * 0.62;
  reflectedLight.directDiffuse += (toonFactor * unshadowedCol) * BRDF_Lambert(material.diffuseColor);
}
#undef RE_Direct
#define RE_Direct RE_Direct_ShibaLambert
`;
        shader.fragmentShader = shader.fragmentShader.replace('#include <lights_lambert_pars_fragment>', toonLambert);
      }

      if (shader.fragmentShader.includes('#include <lights_fragment_end>')) {
        const styleEnd = /* glsl */ `
#include <lights_fragment_end>
if (uStyleMode > 0.5) {
  vec3 stAlb = max(diffuseColor.rgb, vec3(0.06));
  vec3 stDirectRatio = reflectedLight.directDiffuse / stAlb;
  float stLitLuma = dot(stDirectRatio, vec3(0.299, 0.587, 0.114));
  float stLitNorm = clamp(stLitLuma / max(uSunRefMag * 0.16, 0.06), 0.0, 1.0);
  vec3 stInd = reflectedLight.indirectDiffuse;
  float stIndLuma = dot(stInd, vec3(0.299, 0.587, 0.114));
  // Pure chromatic shadow direction (unit luminance) so dark night shadowTint never crushes brightness.
  vec3 stCoolDir = uShadowTint / max(dot(uShadowTint, vec3(0.299, 0.587, 0.114)), 0.001);
  // Keep hero (Shiba/Scooter/NPC) shadows warmer & slightly lifted so courier yellow never turns gray-taupe.
  float heroCoolScale = uIsHero > 0.5 ? 0.36 : 1.0;

  if (uStyleMode < 1.5) {
    // Style A (Soft Storybook): suppress harsh specular, paint soft cool blue-violet shadows.
    reflectedLight.directSpecular *= 0.22;
    reflectedLight.indirectSpecular *= 0.30;
    float stShade = 1.0 - smoothstep(0.03, 0.55, stLitNorm);
    vec3 stCoolFill = stIndLuma * mix(vec3(1.0), stCoolDir, 0.56 * heroCoolScale) * (uIsHero > 0.5 ? 1.05 : 0.96);
    reflectedLight.indirectDiffuse = mix(stInd, stCoolFill, stShade * clamp(uShadowTintStr * 1.15, 0.0, 0.72));
    if (uIsHero > 0.5) {
      float stNdv = clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0);
      float stRim = pow(1.0 - stNdv, 2.5) * 0.22;
      reflectedLight.indirectDiffuse += diffuseColor.rgb * (stRim * (0.50 + 0.50 * stLitNorm));
    }
  } else {
    // Style B (Cel Toon): crisp cool shadow fill in Band 0, clean matte indirects.
    reflectedLight.indirectSpecular *= 0.08;
    float stShade = 1.0 - smoothstep(0.03, 0.18, stLitNorm);
    vec3 stCoolFill = stIndLuma * mix(vec3(1.0), stCoolDir, 0.66 * heroCoolScale) * (uIsHero > 0.5 ? 1.06 : 0.90);
    reflectedLight.indirectDiffuse = mix(stInd, stCoolFill, stShade * clamp(uShadowTintStr * 1.25, 0.0, 0.76));
  }
}
if (uIsHero > 0.5 && uNightHeroLift > 0.005) {
  // Subtle moonlit readability lift on Shiba & Scooter at night (keeps subjects crisp across all styles).
  float hNdv = clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0);
  float hRim = pow(1.0 - hNdv, 2.2) * 0.28 + 0.10;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * (hRim * uNightHeroLift);
}
`;
        shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', styleEnd);
      }
    };
    mat.customProgramCacheKey = () => prevKey() + '|shibastyle-v2' + (isHero ? ':h' : '');
    mat.needsUpdate = true;
  }

  function scanMaterials(root) {
    if (!root) return;
    root.traverse(obj => {
      if (!obj.isMesh || !obj.material || obj.userData.isStyleOutline) return;
      const hero = isHeroObject(obj);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) patchMaterial(m, hero);
    });
  }

  let lastCountryChildren = -1;
  let scannedOnce = false;
  let heroOutlinesBuilt = false;

  function ensureHeroOutlines() {
    if (heroOutlinesBuilt) return;
    heroOutlinesBuilt = true;
    buildShibaOutline();
    buildScooterOutlines();
  }

  function ensureScanned() {
    if (!scannedOnce) {
      scannedOnce = true;
      detectAndOutlineNpcs(street.root);
      for (const r of Object.values(rooms)) detectAndOutlineNpcs(r.root);
      scanMaterials(street.root);
      scanMaterials(shiba.root);
      scanMaterials(scooter.root);
      for (const r of Object.values(rooms)) scanMaterials(r.root);
    }
    if (country.root.children.length !== lastCountryChildren) {
      lastCountryChildren = country.root.children.length;
      detectAndOutlineNpcs(country.root);
      scanMaterials(country.root);
    }
  }

  function syncOutlineVisibility() {
    const show = style === 'b';
    for (let i = 0; i < outlineMeshes.length; i++) {
      outlineMeshes[i].visible = show;
    }
  }

  // Lazy-allocated post-processing render targets (zero VRAM overhead while style === 'off').
  const PIXEL_DIVISOR = 3.5; // ~1/3.5 CSS resolution (366x229 desktop, 241x111 mobile)
  const quad = createFullscreenQuad();
  let width = 1280, height = 800;
  let hdrTarget = null;
  let pixelTarget = null;
  let bloomA = null;
  let bloomB = null;

  const extractMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: BLOOM_EXTRACT_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      tDiffuse: { value: null },
      uTexelSize: { value: new THREE.Vector2(1 / 320, 1 / 200) },
      uThreshold: { value: 0.96 },
    },
  });

  const blurMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: BLUR_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      tDiffuse: { value: null },
      uDirection: { value: new THREE.Vector2(1 / 320, 0) },
    },
  });

  const compositeMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: COMPOSITE_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
    uniforms: {
      tDiffuse: { value: null },
      tBloom: { value: null },
      uBloomStrength: { value: 0.16 },
      uLift: { value: new THREE.Vector3() },
      uGamma: { value: new THREE.Vector3(1, 1, 1) },
      uGain: { value: new THREE.Vector3(1, 1, 1) },
      uSaturation: { value: 1.08 },
      uContrast: { value: 1.04 },
      uVignette: { value: 0.14 },
      uPaperGrain: { value: 0.014 },
      uPixelMode: { value: 0.0 },
      uPixelRes: { value: new THREE.Vector2(366, 229) },
      uColorLevels: { value: 24.0 },
    },
  });

  function allocateTargets(w, h) {
    const dpr = renderer.getPixelRatio();
    const rw = Math.max(1, Math.round(w * dpr));
    const rh = Math.max(1, Math.round(h * dpr));
    const pw = Math.max(64, Math.round(w / PIXEL_DIVISOR));
    const ph = Math.max(40, Math.round(h / PIXEL_DIVISOR));
    const bw = Math.max(1, Math.round(rw / 4));
    const bh = Math.max(1, Math.round(rh / 4));

    if (hdrTarget) hdrTarget.dispose();
    if (pixelTarget) pixelTarget.dispose();
    if (bloomA) bloomA.dispose();
    if (bloomB) bloomB.dispose();

    hdrTarget = new THREE.WebGLRenderTarget(rw, rh, {
      type: THREE.HalfFloatType,
      samples: 4,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    pixelTarget = new THREE.WebGLRenderTarget(pw, ph, {
      type: THREE.HalfFloatType,
      samples: 0,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    bloomA = new THREE.WebGLRenderTarget(bw, bh, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    bloomB = new THREE.WebGLRenderTarget(bw, bh, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    extractMat.uniforms.uTexelSize.value.set(1 / bw, 1 / bh);
    compositeMat.uniforms.uPixelRes.value.set(pw, ph);
  }

  function ensureTargets() {
    if (!hdrTarget) allocateTargets(width, height);
  }

  function setStyle(next) {
    if (!STYLE_ORDER.includes(next)) return false;
    style = next;
    sharedUniforms.uStyleMode.value = style === 'a' ? 1.0 : style === 'b' ? 2.0 : 0.0;
    if (style !== 'off') {
      ensureScanned();
      if (style === 'b') ensureHeroOutlines();
    }
    syncOutlineVisibility();
    for (const fn of listeners) fn(style);
    return true;
  }

  function resize(w, h) {
    width = Math.max(1, w);
    height = Math.max(1, h);
    if (hdrTarget) allocateTargets(width, height);
  }

  function syncScene() {
    if (style !== 'off') {
      ensureScanned();
      syncOutlineVisibility();
    }
  }

  function render(targetScene, activeCamera) {
    if (style === 'off') {
      sharedUniforms.uNightHeroLift.value = 0.0;
      renderer.render(targetScene, activeCamera);
      return;
    }

    ensureScanned();
    if (style === 'b') {
      ensureHeroOutlines();
      syncOutlineVisibility();
    }
    ensureTargets();

    const cur = timeOfDay.current;
    const sunCol = timeOfDay.sun.color;
    const exactSunMag = Math.hypot(sunCol.r, sunCol.g, sunCol.b) * timeOfDay.sun.intensity;
    sharedUniforms.uShadowTint.value.copy(cur.shadowTint);
    sharedUniforms.uShadowTintStr.value = cur.shadowTintStrength;
    sharedUniforms.uSunRefMag.value = Math.max(0.05, exactSunMag);
    sharedUniforms.uNightHeroLift.value = cur.emissive * (style === 'c' ? 0.55 : 0.35);

    if (style === 'b') {
      outlineMat.uniforms.uOutlineColor.value.copy(cur.outlineColor);
      outlineMat.uniforms.uOutlineWidth.value = 0.0175;
    }

    const isPixel = style === 'c';
    const isToon = style === 'b';
    const sceneTarget = isPixel ? pixelTarget : hdrTarget;
    const useBloom = isPixel ? cur.emissive > 0.05 : (isToon ? cur.emissive > 0.05 : true);
    const bloomStr = useBloom ? cur.bloomStrength * (isPixel ? 0.72 : isToon ? 0.92 : 1.15) : 0.0;
    extractMat.uniforms.uThreshold.value = cur.bloomThreshold;

    const g = cur.grade;
    compositeMat.uniforms.uBloomStrength.value = bloomStr;
    compositeMat.uniforms.uLift.value.set(g.lift[0], g.lift[1], g.lift[2]);
    compositeMat.uniforms.uGamma.value.set(g.gamma[0], g.gamma[1], g.gamma[2]);
    compositeMat.uniforms.uGain.value.set(g.gain[0], g.gain[1], g.gain[2]);
    compositeMat.uniforms.uSaturation.value = g.saturation * (isToon ? 1.07 : isPixel ? 1.04 : 1.0);
    compositeMat.uniforms.uContrast.value = g.contrast * (isToon ? 1.05 : isPixel ? 1.03 : 1.0);
    compositeMat.uniforms.uVignette.value = isPixel ? 0.05 : isToon ? 0.07 : 0.14;
    compositeMat.uniforms.uPaperGrain.value = style === 'a' ? 0.014 : 0.0;
    compositeMat.uniforms.uPixelMode.value = isPixel ? 1.0 : 0.0;
    compositeMat.uniforms.uColorLevels.value = 24.0;

    // Accumulate HONEST total draw calls across scene + shadow map + outlines + all post passes.
    const prevAutoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    renderer.info.reset();
    try {
      renderer.setRenderTarget(sceneTarget);
      renderer.render(targetScene, activeCamera);

      if (useBloom) {
        extractMat.uniforms.tDiffuse.value = sceneTarget.texture;
        quad.draw(renderer, extractMat, bloomA);

        blurMat.uniforms.tDiffuse.value = bloomA.texture;
        blurMat.uniforms.uDirection.value.set(1.35 / bloomA.width, 0);
        quad.draw(renderer, blurMat, bloomB);

        blurMat.uniforms.tDiffuse.value = bloomB.texture;
        blurMat.uniforms.uDirection.value.set(0, 1.35 / bloomA.height);
        quad.draw(renderer, blurMat, bloomA);
      }

      compositeMat.uniforms.tDiffuse.value = sceneTarget.texture;
      compositeMat.uniforms.tBloom.value = bloomA.texture;
      quad.draw(renderer, compositeMat, null);
    } finally {
      renderer.setRenderTarget(null);
      renderer.info.autoReset = prevAutoReset;
    }
  }

  return {
    setStyle,
    getStyle: () => style,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    fogDensityFactor: () => (style === 'a' ? 0.50 : style === 'b' ? 0.46 : style === 'c' ? 0.68 : 1.0),
    usesStyledFog: () => style !== 'off',
    syncScene,
    resize,
    render,
    dispose() {
      quad.dispose();
      extractMat.dispose();
      blurMat.dispose();
      compositeMat.dispose();
      outlineMat.dispose();
      for (const m of outlineMeshes) {
        m.removeFromParent();
        m.geometry?.dispose();
      }
      hdrTarget?.dispose();
      pixelTarget?.dispose();
      bloomA?.dispose();
      bloomB?.dispose();
    },
  };
}
