// 3D PAX 무대 — 렌더러·카메라·조작·빛·바다. 월드(pax3d-world.js)가 처음 한 번 만들고 그 위에 지형·건물을 올린다.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { toon, toonGradient, skyTexture } from './pax3d-look.js?v=a66df86b';

/** 전국 미니어처의 처음 시점 */
export const HOME = { target: new THREE.Vector3(0.2, 0, 0.9), pos: new THREE.Vector3(0.2, 17.5, 16) };

/**
 * @param {HTMLCanvasElement} canvas
 * @returns 무대 구성 요소 — 도시 모드가 빛·하늘을 바꿨다가 HOME_LOOK·SUN_HOME으로 되돌린다
 */
export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xe6eee8, 26, 60);
  const grad = toonGradient();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  camera.position.copy(HOME.pos);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.45;
  controls.maxDistance = 34;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.22;
  controls.screenSpacePanning = false;
  controls.autoRotateSpeed = 0.5;

  const hemi = new THREE.HemisphereLight(0xfff4e0, 0x8aa3a0, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(-7, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target); // 도시 모드에서는 그림자 상자가 시점을 따라간다(target을 장면에 넣어야 갱신된다)
  const SUN_HOME = { pos: sun.position.clone(), span: 12, near: 1, far: 40, normalBias: 0.02 };
  const SUN_DIR = sun.position.clone().normalize(); // 도시 모드 그림자 상자 방향 — 시간대가 바꾼다
  // 전국 미니어처의 모습(종이 디오라마) — 도시 모드를 벗어나면 이것으로 돌아간다
  const HOME_LOOK = { sky: scene.background, fog: scene.fog.color.clone(), hemi: [hemi.color.clone(), hemi.groundColor.clone(), hemi.intensity],
    sun: [sun.color.clone(), sun.intensity], dir: SUN_DIR.clone() };

  const sea = new THREE.Mesh(new THREE.CircleGeometry(40, 64), toon(0x8ec6cc, grad));
  sea.rotateX(-Math.PI / 2);
  sea.position.y = -0.02;
  sea.receiveShadow = true;
  scene.add(sea);

  return { renderer, scene, grad, camera, controls, hemi, sun, SUN_HOME, SUN_DIR, HOME_LOOK, sea };
}
