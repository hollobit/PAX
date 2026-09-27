// 장면·조명·시간대·렌더 예산·건물 표시 선택·고르기.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import {
  makeFrame, buildTerrain, buildWater, buildGreen, buildRibbons, roadStyle, waterwayStyle, buildOutline,
  createBuildingMesh, buildDistrictLines, carveWater,
} from './layers.js';
import { selectBuildings, writeBuildingInstances } from './buildings.js';
import { MODES, skyTexture, sunDirection, styleCityMaterials } from './modes.js';
import { createLandmarkFlight, flightStops } from './flight.js';

const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;

/** 기기별 렌더 예산 — 모바일은 픽셀 비율·그림자 해상도·표시 건물 수·지형 해상도를 따로 줄인다 */
export const BUDGET = MOBILE
  ? { label: '모바일', dpr: 1, shadow: 1024, buildings: 40000, terrainStep: 4, antialias: false }
  : { label: '데스크톱', dpr: Math.min(devicePixelRatio || 1, 2), shadow: 4096, buildings: 220000, terrainStep: 2, antialias: true };

export { MODES };

export function createWorld(canvas, { onPick, onStats, onFrame, onTour = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: BUDGET.antialias, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(BUDGET.dpr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 5, 200000);
  const controls = new MapControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.35;
  controls.minDistance = 120;
  controls.maxDistance = 90000;
  controls.screenSpacePanning = false;

  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(BUDGET.shadow, BUDGET.shadow);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 1.5;
  scene.add(hemi, sun, sun.target);
  const uniforms = { uNight: { value: 0 } };

  const group = new THREE.Group();
  scene.add(group);
  let city = null;
  let mode = 'day';
  let vscale = 1;
  let markEstimated = true;
  let focus = null; // 바깥에서 넘겨받은 지점 {x, n} — 주황 기둥으로 세운다

  // ---- 건물 표시 예산 --------------------------------------------------------------
  let bmesh = null;
  let visible = new Uint32Array(0);
  let lastSel = null;

  /** 시점 둘레에서 예산만큼 고른다(buildings.js) — 시점이 조금 움직였을 때는 다시 고르지 않는다 */
  function selectVisible(force) {
    if (!city) return;
    const [tx, tn] = city.frame.local(controls.target.x, controls.target.z);
    const dist = camera.position.distanceTo(controls.target);
    if (!force && lastSel && Math.hypot(tx - lastSel[0], tn - lastSel[1]) < Math.max(300, dist * 0.15)) return;
    lastSel = [tx, tn];
    visible = selectBuildings(city.b, tx, tn, BUDGET.buildings, visible);
    writeInstances();
  }

  function writeInstances() {
    writeBuildingInstances(bmesh, city.b, visible, city.frame, vscale, markEstimated);
    onStats({ visible: visible.length, total: city.b.n });
  }

  // ---- 도시 장면 짓기 --------------------------------------------------------------------
  function clearGroup() {
    for (const o of [...group.children]) {
      group.remove(o);
      o.geometry?.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose());
    }
  }

  function buildScene() {
    clearGroup();
    const { frame, dem, water, green, roads, waterways } = city;
    group.add(buildTerrain(frame, dem, vscale, BUDGET.terrainStep, city.carved));
    group.add(buildOutline(frame, city.meta.outline, vscale));
    if (city.mapinfo) group.add(buildDistrictLines(frame, city.mapinfo.districts, vscale));
    group.add(buildGreen(frame, green, vscale));
    group.add(buildWater(frame, water, vscale));
    const ww = new THREE.Mesh(buildRibbons(frame, waterways, vscale, waterwayStyle), new THREE.MeshPhongMaterial({ color: '#ffffff', specular: '#cfe6ff', shininess: 60, vertexColors: true, side: THREE.DoubleSide }));
    ww.receiveShadow = true;
    ww.name = 'waterways';
    group.add(ww);
    // 띠는 진행 방향에 따라 앞뒤가 뒤집힐 수 있어 양면으로 그린다
    const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const rd = new THREE.Mesh(buildRibbons(frame, roads, vscale, roadStyle), roadMat);
    rd.receiveShadow = true;
    rd.name = 'roads';
    group.add(rd);
    addFocusBeam();
    bmesh = createBuildingMesh(Math.min(city.b.n, BUDGET.buildings), uniforms);
    group.add(bmesh);
    applyMode();
    selectVisible(true);
  }

  /** 넘겨받은 지점에 130m 주황 기둥 — 지형 배율이 바뀌면 buildScene이 다시 세운다 */
  function addFocusBeam() {
    const old = group.getObjectByName('focus');
    if (old) { group.remove(old); old.geometry.dispose(); old.material.dispose(); }
    if (!focus || !city) return;
      const y = Math.max(city.frame.elev(focus.x, focus.n), 0) * vscale;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 130, 12), new THREE.MeshBasicMaterial({ color: '#ff8a1f', transparent: true, opacity: 0.85 }));
      beam.position.set(city.frame.X(focus.x), y + 65, city.frame.Z(focus.n));
      beam.name = 'focus';
      group.add(beam);
  }

  function applyMode() {
    const M = MODES[mode];
    scene.background = skyTexture(M);
    scene.fog = new THREE.Fog(M.fog, 6000, 70000);
    hemi.color.set(M.hemi[0]);
    hemi.groundColor.set(M.hemi[1]);
    hemi.intensity = M.hemi[2];
    sun.color.set(M.sun);
    sun.intensity = M.sunI;
    uniforms.uNight.value = M.night;
    styleCityMaterials(group, M);
  }

  function placeSun() {
    const M = MODES[mode];
    const d = camera.position.distanceTo(controls.target);
    const span = THREE.MathUtils.clamp(d * 1.1, 600, 16000);
    const dir = sunDirection(M);
    sun.position.copy(controls.target).addScaledVector(dir, span * 2);
    sun.target.position.copy(controls.target);
    const cam = sun.shadow.camera;
    cam.left = -span;
    cam.right = span;
    cam.top = span;
    cam.bottom = -span;
    cam.near = 10;
    cam.far = span * 5;
    cam.updateProjectionMatrix();
  }

  // ---- 고르기 ------------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; tour.stop(); });
  canvas.addEventListener('wheel', () => tour.stop(), { passive: true });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !bmesh) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObject(bmesh, false)[0];
    onPick(hit ? visible[hit.instanceId] : null, e);
  });

  // ---- 루프·FPS(실측) -----------------------------------------------------------------
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  let frames = 0;
  let t0 = performance.now();
  let flight = null;
  // 랜드마크 비행 — 지도를 만지면 멈춘다
  const tour = createLandmarkFlight({
    camera, controls, unit: 1,
    toWorld: (x, n, lift) => new THREE.Vector3(city.frame.X(x), Math.max(city.frame.elev(x, n), 0) * vscale + lift, city.frame.Z(n)),
    onStop: (i, stop, total) => onTour({ phase: 'stop', i, name: stop.name, total }),
    onEnd: (finished) => onTour({ phase: 'end', finished }),
  });
  renderer.setAnimationLoop(() => {
    if (tour.update()) flight = null;
    else if (flight) {
      const k = Math.min(1, (performance.now() - flight.t0) / 1400);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      controls.target.lerpVectors(flight.fromT, flight.toT, e);
      camera.position.lerpVectors(flight.fromP, flight.toP, e);
      if (k >= 1) flight = null;
    }
    controls.update();
    placeSun();
    selectVisible(false);
    renderer.render(scene, camera);
    if (city && onFrame) onFrame(api);
    frames++;
    const now = performance.now();
    if (now - t0 >= 1000) {
      onStats({ fps: (frames * 1000) / (now - t0), calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
      frames = 0;
      t0 = now;
    }
  });

  function flyTo(X, Z, dist = 2600, polar = 0.9) {
    const y = city ? Math.max(city.frame.elev(...city.frame.local(X, Z)), 0) * vscale : 0;
    const target = new THREE.Vector3(X, y, Z);
    const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z) || 0.6;
    const pos = target.clone().add(new THREE.Vector3(Math.sin(az) * Math.sin(polar), Math.cos(polar), Math.cos(az) * Math.sin(polar)).multiplyScalar(dist));
    flight = { t0: performance.now(), fromT: controls.target.clone(), toT: target, fromP: camera.position.clone(), toP: pos };
  }

  // ---- 3D ↔ 지도 좌표 ---------------------------------------------------------------------
  const ndc = new THREE.Vector2();
  /** 화면 점 → 지면 로컬 좌표. 광선을 따라 걸으며 지형 표고 아래로 내려가는 첫 지점을 이분법으로 좁힌다. */
  function groundFromNdc(nx, ny, maxDist = 80000) {
    ndc.set(nx, ny);
    ray.setFromCamera(ndc, camera);
    const { origin, direction } = ray.ray;
    const f = city.frame;
    const below = (t) => {
      const X = origin.x + direction.x * t;
      const Z = origin.z + direction.z * t;
      const [x, n] = f.local(X, Z);
      return origin.y + direction.y * t <= Math.max(f.elev(x, n), 0) * vscale;
    };
    let prev = 0;
    let t = 0;
    const step = Math.max(10, camera.position.distanceTo(controls.target) / 150);
    while (t < maxDist) {
      t += step * (1 + t / 4000);
      if (below(t)) {
        let lo = prev;
        let hi = t;
        for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; if (below(mid)) hi = mid; else lo = mid; }
        const [x, n] = f.local(origin.x + direction.x * hi, origin.z + direction.z * hi);
        return { x, n, elev: f.elev(x, n) };
      }
      prev = t;
    }
    return null;
  }
  /** 화면 네 모서리가 닿는 땅(하늘을 보는 모서리는 시선 방향으로 멀리 둔 점) — 2D 지도의 시야 사각형 */
  function footprint() {
    const f = city.frame;
    const out = [];
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ndc.set(nx, ny);
      ray.setFromCamera(ndc, camera);
      const { origin, direction } = ray.ray;
      const h = origin.y - controls.target.y;
      const limit = Math.max(4000, camera.position.distanceTo(controls.target) * 6);
      let t = direction.y < -1e-4 ? h / -direction.y : limit;
      t = Math.min(t, limit);
      out.push(f.local(origin.x + direction.x * t, origin.z + direction.z * t));
    }
    return out;
  }

  const api = {
    get camera() { return camera; },
    get vscale() { return vscale; },
    get size() { return [canvas.clientWidth, canvas.clientHeight]; },
    get frame() { return city?.frame; },
    footprint,
    view() { return { cam: city.frame.local(camera.position.x, camera.position.z), target: city.frame.local(controls.target.x, controls.target.z) }; },
    pickGround(clientX, clientY) {
      if (!city) return null;
      const r = canvas.getBoundingClientRect();
      return groundFromNdc(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    },
    /** 2D 지도에서 옮기기 — 같은 거리·각도를 유지한 채 목표점만 이동(instant면 바로, 아니면 비행) */
    jumpToLocal(x, n, instant) {
      if (!city) return;
      if (!instant) { flyTo(city.frame.X(x), city.frame.Z(n), camera.position.distanceTo(controls.target)); return; }
      flight = null;
      const y = Math.max(city.frame.elev(x, n), 0) * vscale;
      const d = new THREE.Vector3(city.frame.X(x), y, city.frame.Z(n)).sub(controls.target);
      controls.target.add(d);
      camera.position.add(d);
    },
    budget: BUDGET,
    setCity(c) {
      tour.stop();
      city = { ...c, frame: makeFrame(c.meta, c.dem) };
      city.carved = carveWater(city.frame, c.dem, c.water); // 물 밑 지형을 수면 아래로(강이 땅에 덮이지 않게)
      lastSel = null;
      visible = new Uint32Array(0);
      buildScene();
      const span = Math.max(city.frame.W, city.frame.H);
      controls.target.set(0, 0, 0);
      camera.position.set(span * 0.25, span * 0.55, span * 0.6);
      controls.update();
    },
    setMode(m) { mode = m; applyMode(); },
    /** 랜드마크 비행 시작 — OSM에서 확인된 바로 가기 지점을 가까운 순으로 */
    startTour() { return city ? tour.start(flightStops(city.meta.landmarks)) : false; },
    stopTour() { tour.stop(); },
    get touring() { return tour.active; },
    get carvedCells() { return city ? city.carved.cells : 0; },
    setFocus(f) { focus = f; addFocusBeam(); },
    setVScale(v) { vscale = v; buildScene(); },
    setMarkEstimated(on) { markEstimated = on; if (city) writeInstances(); },
    flyToLocal(x, n, dist) { flyTo(city.frame.X(x), city.frame.Z(n), dist); },
    groundAt(x, n) { return city ? city.frame.elev(x, n) : 0; },
    /** 렌더 시간 실측: 매 프레임 뒤 픽셀 1개를 읽어(readPixels) GPU 완료를 강제로 기다린 평균(ms). 화면 표시(합성) 시간은 빠진다. */
    benchmark(n = 30) {
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      renderer.render(scene, camera);
      sync();
      const times = [];
      for (let i = 0; i < n; i++) {
        const t = performance.now();
        controls.update();
        renderer.render(scene, camera);
        sync();
        times.push(performance.now() - t);
      }
      times.sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / n;
      return { meanMs: +mean.toFixed(2), medianMs: +times[n >> 1].toFixed(2), p90Ms: +times[Math.floor(n * 0.9)].toFixed(2), frames: n,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, size: [renderer.domElement.width, renderer.domElement.height] };
    },
    flyToWorld(X, Z, dist, polar) { flyTo(X, Z, dist, polar); },
    setModeNow(m) { mode = m; applyMode(); },
  };
  return api;
}
