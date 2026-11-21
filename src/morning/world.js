import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { glowMaterial, litMaterial } from '../core/materials.js';
import { createShiba, createScooter, parcel } from './rider.js';
import { createStreet, createPharmacy, createBunRoom } from './town.js';
import { $ } from './dom.js';

export async function createWorld(renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-6, 6, 3.5, -3.5, 0.1, 82);
  const chase = new THREE.PerspectiveCamera(52, 1, 0.12, 100);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  $('stage').appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xf3f8ff, 0xb2afa4, 1.65));
  const sun = new THREE.DirectionalLight(0xffe5c2, 2.42);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 11, bottom: -9, near: 0.5, far: 45 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.018;
  sun.shadow.bias = -0.00015;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  const loader = new GLTFLoader();
  const [courier, motorcycle, display] = await Promise.all([
    loader.loadAsync(new URL('../../art/morning/shiba-courier.glb', import.meta.url).href),
    loader.loadAsync(new URL('../../art/morning/monkey-delivery.glb', import.meta.url).href),
    loader.loadAsync(new URL('../../art/bun-shop/steamers.glb', import.meta.url).href),
  ]);
  display.scene.traverse(o => {
    if (!o.isMesh) return;
    o.material = litMaterial({ vertexColors: true, grid: false });
    o.castShadow = o.receiveShadow = true;
  });
  const rooms = { pharmacy: createPharmacy(), bakery: createBunRoom(display.scene.clone(true)) };
  const street = createStreet(display.scene);
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
  return { scene, camera, chase, sun, rooms, street, shiba, scooter, looseBag, marker, contact };
}
