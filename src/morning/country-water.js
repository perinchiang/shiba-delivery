// Stylized cartoon morning river beneath the stone bridge (Wind Waker / ACNH clean water aesthetic).
import * as THREE from 'three';
import { centerZ } from './country-route.js';

export function createRiverWater() {
  const bridgeMidX = 922;
  const bridgeMidZ = centerZ(bridgeMidX);
  const uniforms = {
    uTime: { value: 0 },
    uFogColor: { value: new THREE.Color(0xdaf0f5) },
    uFogDensity: { value: 0.0042 },
    uBridgeZ: { value: bridgeMidZ },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vFogDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uBridgeZ;
      varying vec3 vWorld;
      varying float vFogDepth;

      float wHash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }
      float wNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x),
          mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      void main() {
        vec2 p = vWorld.xz;

        // Distance from both riverbanks (x = 894 and x = 950)
        float dLeft  = max(0.0, p.x - 894.0);
        float dRight = max(0.0, 950.0 - p.x);
        float dBank  = min(dLeft, dRight);

        // Distance from bridge piers along the stone span (894..950, every 8m, z = bridgeZ +- 3.68)
        float pierX = clamp(round((p.x - 894.0) / 8.0) * 8.0 + 894.0, 894.0, 950.0);
        float pierZ = uBridgeZ + (p.y > uBridgeZ ? 3.68 : -3.68);
        float dPier = length(vec2((p.x - pierX) * 1.05, (p.y - pierZ) * 0.9));

        float shallow = 1.0 - smoothstep(0.0, 7.5, dBank);
        float pierShallow = 1.0 - smoothstep(0.4, 2.2, dPier);

        // Clean shallow turquoise -> serene morning jade-blue depth gradient
        vec3 deepCol    = vec3(0.11, 0.39, 0.49);
        vec3 midCol     = vec3(0.16, 0.52, 0.56);
        vec3 shallowCol = vec3(0.32, 0.72, 0.69);

        float bandWave = sin(p.x * 0.22 + p.y * 0.09 - uTime * 0.9) * 0.5 + 0.5;
        vec3 water = mix(deepCol, midCol, smoothstep(0.2, 0.85, bandWave) * 0.55 + 0.25);
        water = mix(water, shallowCol, clamp(shallow * 0.85 + pierShallow * 0.5, 0.0, 1.0));

        // Stylized crisp cartoon wave arcs drifting gently downstream (+Z)
        vec2 flowA = vec2(p.x * 0.34, p.y * 0.16 - uTime * 0.48);
        vec2 flowB = vec2(p.x * 0.72 + 3.1, p.y * 0.32 - uTime * 0.78);
        float nA = wNoise(flowA);
        float nB = wNoise(flowB);
        float waveBand = smoothstep(0.68, 0.78, nA * 0.55 + nB * 0.45);
        vec3 rippleCol = vec3(0.45, 0.79, 0.80);
        water = mix(water, rippleCol, waveBand * 0.34);

        // Delicate thin cartoon crest lines (Wind Waker feel without snowy white blobs)
        float crestField = wNoise(vec2(p.x * 0.58, p.y * 0.28 - uTime * 0.86));
        float crest = smoothstep(0.73, 0.76, crestField) * (1.0 - smoothstep(0.77, 0.81, crestField));
        water = mix(water, vec3(0.84, 0.96, 0.94), crest * 0.55);

        // Animated double shoreline & pier foam bands (Wind Waker / ACNH signature)
        float wobble = (nB - 0.5) * 0.55 + sin(p.y * 0.35 - uTime * 1.4) * 0.22;
        float bankPulse = 0.24 * sin(uTime * 1.8 - dBank * 1.7 + p.y * 0.16);
        float foamEdge = 1.0 - smoothstep(0.0, 0.72, dBank + wobble * 0.55);
        float foamLine = smoothstep(0.55, 0.72, sin((dBank + wobble) * 3.8 - uTime * 2.2))
                       * (1.0 - smoothstep(0.25, 2.35, dBank));
        float pierRing = (1.0 - smoothstep(0.28, 0.85, dPier + wobble * 0.18))
                       + smoothstep(0.55, 0.78, sin(dPier * 6.5 - uTime * 2.4))
                         * (1.0 - smoothstep(0.4, 1.9, dPier)) * 0.65;

        float foam = clamp(foamEdge + foamLine * 0.65 + pierRing * 0.8 + max(0.0, bankPulse) * foamEdge, 0.0, 1.0);
        water = mix(water, vec3(0.93, 0.96, 0.91), foam * 0.86);

        // Subtle cool shadow directly beneath the bridge deck
        float underDeck = (1.0 - smoothstep(3.1, 4.4, abs(p.y - uBridgeZ)))
                        * smoothstep(893.5, 895.0, p.x) * (1.0 - smoothstep(949.0, 950.5, p.x));
        water *= 1.0 - underDeck * 0.24;

        // Crisp twinkling morning sun sparkles dancing on fine wavelets (no big blurry glare patch)
        vec3 viewDir = normalize(vWorld - cameraPosition);
        vec3 sunDir = normalize(vec3(0.92, 0.30, -0.34));
        float spA = wNoise(vec2(p.x * 1.45, p.y * 1.15 - uTime * 1.35));
        float spB = wNoise(vec2(p.x * 2.35 + 5.7, p.y * 1.85 - uTime * 1.95));
        vec3 refl = reflect(viewDir, normalize(vec3((spA - 0.5) * 0.45, 1.0, (spB - 0.5) * 0.45)));
        float glint = smoothstep(0.976, 0.994, dot(refl, sunDir)) * smoothstep(0.58, 0.78, spA * spB * 1.8) * (1.0 - underDeck);
        water += vec3(1.0, 0.92, 0.62) * glint * 0.95;

        // Match scene FogExp2 seamlessly
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
        vec3 outCol = mix(water, uFogColor, clamp(fogFactor, 0.0, 1.0));
        gl_FragColor = vec4(outCol, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const geo = new THREE.PlaneGeometry(68, 460, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(bridgeMidX, -0.86, bridgeMidZ);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  return {
    mesh,
    update(time, fogColor, fogDensity) {
      uniforms.uTime.value = time;
      if (fogColor) uniforms.uFogColor.value.copy(fogColor);
      if (fogDensity !== undefined) uniforms.uFogDensity.value = fogDensity;
    },
  };
}
