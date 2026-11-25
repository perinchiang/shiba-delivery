// Render-style pipeline (Style A: Soft Storybook; 'off' kept as Debug comparison).
// Preserves authored PBR roughness & metallic/ceramic specular on Pure-Blender assets
// marked `material.userData.preservePbr = true` while giving the whole world cohesive
// cool storybook shadows, subtle bloom, warm LGG color grade, and night hero rim fill.
import * as THREE from 'three';

export const STYLE_ORDER = Object.freeze(['off', 'a']);

export const STYLE_LABELS = Object.freeze({
  off: '原版(off)',
  a: 'A 柔和绘本',
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

void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  if (uBloomStrength > 0.001) {
    col += texture2D(tBloom, vUv).rgb * uBloomStrength;
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

  if (uPaperGrain > 0.001) {
    float lumaSrgb = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
    float n = (hash21(floor(gl_FragCoord.xy * 0.5)) - 0.5) * uPaperGrain * smoothstep(0.08, 0.45, lumaSrgb);
    gl_FragColor.rgb = clamp(gl_FragColor.rgb + n, 0.0, 1.0);
  }
}
`;

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

export function createRenderStyle({ renderer, shiba, scooter, coastalTown, timeOfDay }) {
  let style = 'a';
  const listeners = new Set();

  const sharedUniforms = {
    uStyleMode: { value: 1.0 },
    uShadowTint: { value: new THREE.Color(0x6280ad) },
    uShadowTintStr: { value: 0.22 },
    uSunRefMag: { value: 3.8 },
    uNightHeroLift: { value: 0.0 },
  };

  const patchedMats = new WeakSet();
  const heroRoots = new Set([shiba.root, scooter.root]);

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
    // Cycles-lightmapped hero buildings already carry authentic GI + AgX contrast — leave untouched!
    if (mat.userData?.cyclesBaked) return;
    const isStd = mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial;
    const isLamb = mat.isMeshLambertMaterial;
    if (!isStd && !isLamb) return;
    patchedMats.add(mat);

    const preservePbr = Boolean(mat.userData?.preservePbr);
    const prevCompile = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
    const heroUniform = { value: isHero ? 1.0 : 0.0 };
    const pbrUniform = { value: preservePbr ? 1.0 : 0.0 };

    mat.onBeforeCompile = (shader, r) => {
      if (prevCompile) prevCompile(shader, r);
      Object.assign(shader.uniforms, sharedUniforms);
      shader.uniforms.uIsHero = heroUniform;
      shader.uniforms.uPreservePbr = pbrUniform;

      const stylePars = /* glsl */ `
uniform float uStyleMode;
uniform vec3 uShadowTint;
uniform float uShadowTintStr;
uniform float uSunRefMag;
uniform float uNightHeroLift;
uniform float uIsHero;
uniform float uPreservePbr;
`;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\n' + stylePars,
      );

      if (isStd && !preservePbr && shader.fragmentShader.includes('#include <roughnessmap_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n' +
          'if (uStyleMode > 0.5) {\n' +
          '  roughnessFactor = clamp(mix(roughnessFactor, 0.94, 0.62), 0.74, 0.98);\n' +
          '}',
        );
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
  vec3 stCoolDir = uShadowTint / max(dot(uShadowTint, vec3(0.299, 0.587, 0.114)), 0.001);
  float heroCoolScale = uIsHero > 0.5 ? 0.30 : (uPreservePbr > 0.5 ? 0.68 : 1.0);

  // Preserve rich PBR metallic/ceramic sheen on Pure-Blender assets; keep terrain softly matte.
  float dirSpecMul = uPreservePbr > 0.5 ? 0.78 : 0.22;
  float indSpecMul = uPreservePbr > 0.5 ? 0.82 : 0.30;
  reflectedLight.directSpecular *= dirSpecMul;
  reflectedLight.indirectSpecular *= indSpecMul;

  float stShade = 1.0 - smoothstep(0.02, 0.36, stLitNorm);
  vec3 stCoolFill = stIndLuma * mix(vec3(1.0), stCoolDir, 0.50 * heroCoolScale) * (uIsHero > 0.5 ? 1.05 : 0.98);
  reflectedLight.indirectDiffuse = mix(stInd, stCoolFill, stShade * clamp(uShadowTintStr * 1.05, 0.0, 0.60));
  if (uIsHero > 0.5) {
    float stNdv = clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0);
    float stRim = pow(1.0 - stNdv, 2.5) * 0.22;
    reflectedLight.indirectDiffuse += diffuseColor.rgb * (stRim * (0.50 + 0.50 * stLitNorm));
  }
}
if (uIsHero > 0.5 && uNightHeroLift > 0.005) {
  float hNdv = clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0);
  float hTop = clamp(geometryNormal.y * 0.5 + 0.5, 0.0, 1.0);
  float hRim = pow(1.0 - hNdv, 2.6) * 0.55;
  vec3 hMoonTint = vec3(0.84, 0.92, 1.06);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * hMoonTint * ((0.06 + 0.14 * hTop + hRim) * uNightHeroLift);
}
`;
        shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', styleEnd);
      }
    };
    mat.customProgramCacheKey = () => prevKey() + '|shibastyle-v4' + (isHero ? ':h' : '') + (preservePbr ? ':p' : '');
    mat.needsUpdate = true;
  }

  function scanMaterials(root) {
    if (!root) return;
    root.traverse(obj => {
      if (!obj.isMesh || !obj.material) return;
      const hero = isHeroObject(obj);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) patchMaterial(m, hero);
    });
  }

  let scannedOnce = false;
  function ensureScanned() {
    if (scannedOnce) return;
    scannedOnce = true;
    scanMaterials(shiba.root);
    scanMaterials(scooter.root);
    scanMaterials(coastalTown.root);
  }

  const quad = createFullscreenQuad();
  let width = 1280, height = 800;
  let hdrTarget = null;
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
      uSaturation: { value: 1.07 },
      uContrast: { value: 1.03 },
      uVignette: { value: 0.12 },
      uPaperGrain: { value: 0.012 },
    },
  });

  function allocateTargets(w, h) {
    const dpr = renderer.getPixelRatio();
    const rw = Math.max(1, Math.round(w * dpr));
    const rh = Math.max(1, Math.round(h * dpr));
    const bw = Math.max(1, Math.round(rw / 4));
    const bh = Math.max(1, Math.round(rh / 4));

    if (hdrTarget) hdrTarget.dispose();
    if (bloomA) bloomA.dispose();
    if (bloomB) bloomB.dispose();

    hdrTarget = new THREE.WebGLRenderTarget(rw, rh, {
      type: THREE.HalfFloatType,
      samples: 4,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
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
  }

  function setStyle(next) {
    if (!STYLE_ORDER.includes(next)) return false;
    style = next;
    sharedUniforms.uStyleMode.value = style === 'a' ? 1.0 : 0.0;
    if (style !== 'off') ensureScanned();
    for (const fn of listeners) fn(style);
    return true;
  }

  function resize(w, h) {
    width = Math.max(1, w);
    height = Math.max(1, h);
    if (hdrTarget) allocateTargets(width, height);
  }

  function render(targetScene, activeCamera) {
    if (style === 'off') {
      sharedUniforms.uNightHeroLift.value = 0.0;
      renderer.render(targetScene, activeCamera);
      return;
    }

    ensureScanned();
    if (!hdrTarget) allocateTargets(width, height);

    const cur = timeOfDay.current;
    const sunCol = timeOfDay.sun.color;
    const exactSunMag = Math.hypot(sunCol.r, sunCol.g, sunCol.b) * timeOfDay.sun.intensity;
    sharedUniforms.uShadowTint.value.copy(cur.shadowTint);
    sharedUniforms.uShadowTintStr.value = cur.shadowTintStrength;
    sharedUniforms.uSunRefMag.value = Math.max(0.05, exactSunMag);
    const duskFill = THREE.MathUtils.smoothstep(cur.emissive, 0.12, 0.45) * 0.08;
    const nightFill = THREE.MathUtils.smoothstep(cur.emissive, 0.35, 0.98) * 0.18;
    sharedUniforms.uNightHeroLift.value = duskFill + nightFill;

    extractMat.uniforms.uThreshold.value = cur.bloomThreshold;
    const g = cur.grade;
    compositeMat.uniforms.uBloomStrength.value = cur.bloomStrength * 1.12;
    compositeMat.uniforms.uLift.value.set(g.lift[0], g.lift[1], g.lift[2]);
    compositeMat.uniforms.uGamma.value.set(g.gamma[0], g.gamma[1], g.gamma[2]);
    compositeMat.uniforms.uGain.value.set(g.gain[0], g.gain[1], g.gain[2]);
    compositeMat.uniforms.uSaturation.value = g.saturation;
    compositeMat.uniforms.uContrast.value = g.contrast;
    compositeMat.uniforms.uVignette.value = 0.12;
    compositeMat.uniforms.uPaperGrain.value = 0.012;

    const prevAutoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    renderer.info.reset();
    try {
      renderer.setRenderTarget(hdrTarget);
      renderer.render(targetScene, activeCamera);

      extractMat.uniforms.tDiffuse.value = hdrTarget.texture;
      quad.draw(renderer, extractMat, bloomA);

      blurMat.uniforms.tDiffuse.value = bloomA.texture;
      blurMat.uniforms.uDirection.value.set(1.35 / bloomA.width, 0);
      quad.draw(renderer, blurMat, bloomB);

      blurMat.uniforms.tDiffuse.value = bloomB.texture;
      blurMat.uniforms.uDirection.value.set(0, 1.35 / bloomA.height);
      quad.draw(renderer, blurMat, bloomA);

      compositeMat.uniforms.tDiffuse.value = hdrTarget.texture;
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
    fogDensityFactor: () => (style === 'a' ? 0.50 : 1.0),
    usesStyledFog: () => style === 'a',
    resize,
    render,
    dispose() {
      quad.dispose();
      extractMat.dispose();
      blurMat.dispose();
      compositeMat.dispose();
      hdrTarget?.dispose();
      bloomA?.dispose();
      bloomB?.dispose();
    },
  };
}
