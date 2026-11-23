import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { glowMaterial, litMaterial } from '../core/materials.js';
import { setMaxAnisotropy } from '../core/textures.js';
import { createShiba, createScooter, parcel } from './rider.js';
import { createStreet, createPharmacy, createBunRoom } from './town.js';
import { centerZ, roadHeight, halfWidth, roadYaw } from './country-route.js';
import { createCountryside } from './countryside.js';
import { createCoastalSample } from './coastal-sample.js';
import { createTimeOfDay } from './time-of-day.js';
import { createRenderStyle, registerRendererControls } from './render-style.js';
import { $ } from './dom.js';

export async function createWorld(renderer, onProgress) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-6, 6, 3.5, -3.5, 0.1, 82);
  const chase = new THREE.PerspectiveCamera(52, 1, 0.12, 100);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
  $('stage').appendChild(renderer.domElement);

  const loader = new GLTFLoader();
  const assetUrls = [
    new URL('../../art/morning/shiba-courier.glb', import.meta.url).href,
    new URL('../../art/morning/monkey-delivery.glb', import.meta.url).href,
    new URL('../../art/bun-shop/steamers.glb', import.meta.url).href,
    new URL('../../art/countryside/bridge-buffalo.glb', import.meta.url).href,
    new URL('../../art/countryside/countryside-kit.glb', import.meta.url).href,
    new URL('../../art/town/hillside-village.glb', import.meta.url).href,
  ];
  const progress = new Array(assetUrls.length).fill(0);
  const reportDownload = () => {
    const avg = progress.reduce((sum, p) => sum + p, 0) / progress.length;
    onProgress?.(0.08 + avg * 0.77, `正在下载 3D 资源 (${Math.round(avg * 100)}%)…`);
  };
  reportDownload();
  const [courier, motorcycle, display, bridgeBuffalo, countryKitGltf, hillsideVillageGltf] = await Promise.all(
    assetUrls.map((url, idx) =>
      loader.loadAsync(url, event => {
        if (event.lengthComputable && event.total > 0) {
          progress[idx] = Math.min(1, event.loaded / event.total);
          reportDownload();
        }
      }).then(gltf => {
        progress[idx] = 1;
        reportDownload();
        return gltf;
      }),
    ),
  );
  onProgress?.(0.90, '正在拼装街区与光影…');
  const countryKit = {};
  countryKitGltf.scene.traverse(o => {
    if (!o.isMesh || !o.name) return;
    if (o.material.map) {
      o.material = litMaterial({ map: o.material.map, vertexColors: true, grid: false, roughness: .94 });
      countryKit[o.name] = o;
    } else {
      countryKit[o.name] = o.geometry;
    }
  });
  display.scene.traverse(o => {
    if (!o.isMesh) return;
    o.material = litMaterial({ vertexColors: true, grid: false });
    o.castShadow = o.receiveShadow = true;
  });
  const rooms = { pharmacy: createPharmacy(), bakery: createBunRoom(display.scene.clone(true)) };
  const street = createStreet(display.scene, countryKit.Tree_Round);
  const country = createCountryside(countryKit);
  const coastalSample = createCoastalSample(hillsideVillageGltf);
  country.root.add(coastalSample.root);
  bridgeBuffalo.scene.traverse(node => {
    if (node.isMesh) node.castShadow = node.receiveShadow = true;
  });
  const bridgeEntry = 894.5;
  for (const side of [-1, 1]) {
    const carving = bridgeBuffalo.scene.clone();
    carving.position.set(bridgeEntry, roadHeight(bridgeEntry),
      centerZ(bridgeEntry) + side * (halfWidth(bridgeEntry) + .69));
    carving.rotation.y = roadYaw(bridgeEntry) + Math.PI - side * .18;
    country.root.add(carving);
  }
  scene.add(country.root);
  const shiba = createShiba(courier), scooter = createScooter(motorcycle);
  scene.add(street.root, ...Object.values(rooms).map(room => room.root), shiba.root, scooter.root);
  const looseBag = parcel(scene, 0, 0, 0);
  for (const bag of [looseBag, ...Object.values(rooms).map(room => room.bag)]) bag.scale.copy(shiba.root.scale);
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.49, 0.54, 48),
    glowMaterial({ color: 0xffdf8a, intensity: 1, transparent: true, opacity: 0.86, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  scene.add(marker);
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const ctx = shadowCanvas.getContext('2d');
  const shade = ctx.createRadialGradient(32, 32, 3, 32, 32, 31);
  shade.addColorStop(0, 'rgba(70,54,39,.34)');
  shade.addColorStop(1, 'rgba(70,54,39,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 64, 64);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  shadowTexture.colorSpace = THREE.SRGBColorSpace;
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    glowMaterial({ map: shadowTexture, intensity: 1, transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  scene.add(contact);
  const timeOfDay = createTimeOfDay({ scene, renderer, country, street, scooter, rooms });
  const renderStyle = createRenderStyle({ renderer, scene, shiba, scooter, street, country, rooms, timeOfDay });
  registerRendererControls(renderer, { timeOfDay, renderStyle });
  return {
    scene, country, coastalSample, camera, chase,
    sun: timeOfDay.sun, hemi: timeOfDay.hemi, timeOfDay, renderStyle,
    rooms, street, shiba, scooter, looseBag, marker, contact,
  };
}
