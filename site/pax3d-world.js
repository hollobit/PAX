// 3D PAX 미니어처 세계 — 시도 지형·시군구 경계·실제 지도 타일, 사례 건물, 카메라와 선택.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { toon, toonGradient, skyTexture, signSprite, createPostPass } from './pax3d-look.js?v=a66df86b';
import { ISLANDS, SEATS, TASK_COLORS, FALLBACK_COLOR, shapeOf } from './pax3d-data.js?v=a28d94ec';
import { buildingGeometries, mountains, trees, clouds, pin, dokdo } from './pax3d-props.js?v=83d5cb9b';
import {
  LAND_H, project, unproject, toWorld, projectPolys, rng, inPolys, polysArea, randomIn, scatter, blobRing,
} from './pax3d-geom.js?v=f13514eb';
import { createTileLayer, markLandStencil } from './pax3d-tiles.js?v=4ac31ec5';

// 간판 자리 — 무게중심은 경기(서울 구멍 포함)처럼 엉뚱한 곳에 떨어져 손으로 정했다.
const LABEL_AT = {
  서울: [126.99, 37.57], 인천: [126.52, 37.47], 경기: [127.42, 37.1], 강원: [128.3, 37.72],
  충북: [127.78, 36.82], 충남: [126.82, 36.48], 세종: [127.27, 36.58], 대전: [127.42, 36.33],
  전북: [127.1, 35.72], 광주: [126.86, 35.16], 전남: [126.95, 34.82], 경북: [128.75, 36.38],
  대구: [128.6, 35.87], 울산: [129.26, 35.56], 부산: [129.06, 35.16], 경남: [128.22, 35.3],
  제주: [126.55, 33.38],
};


const REGION_TINTS = ['#b9d49a', '#c6d9a1', '#aecf95', '#cfdca9', '#bcd7a6', '#c3d39a'];
const UNOBSERVED = '#cfc9b8';

function landMesh(polys, capColor, sideColor, grad, place, stencil) {
  const shapes = polys.map(([outer, ...holes]) => {
    const s = new THREE.Shape(outer);
    s.holes = holes.map((h) => new THREE.Path(h));
    return s;
  });
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: LAND_H, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  const cap = toon(capColor, grad);
  if (stencil) markLandStencil(cap);
  const mesh = new THREE.Mesh(geo, [cap, toon(sideColor, grad)]);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.userData.place = place;
  return mesh;
}

function outline(polysList, y, color, opacity, hAt = () => 0) {
  const pts = [];
  for (const polys of polysList) {
    for (const poly of polys) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          // 실제 지형 위에 선을 얹는다 — 꼭짓점마다 그 자리 높이
          pts.push(a.x, y + hAt(a.x, -a.y), -a.y, b.x, y + hAt(b.x, -b.y), -b.y);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

/** 화면 크기가 일정한 작은 간판 — 확대해도 부풀지 않는다(시군구·기관). h는 화면 높이 대비 비율. */
function screenSign(lines, h, opts) {
  const sign = signSprite(lines, opts);
  const aspect = sign.scale.x / sign.scale.y;
  sign.material.sizeAttenuation = false;
  sign.scale.set(aspect * h, h, 1);
  return sign;
}

/** 사례 한 건이 설 자리(zone)의 열쇠 — 기관 소재지 > 시군구 > 시·도청 앞 > 섬. */
function zoneKey(loc) {
  if (loc.inst) return `inst:${loc.inst.name}`;
  if (loc.sgg) return `sgg:${loc.place}/${loc.sgg.name}`;
  if (SEATS[loc.place]) return `seat:${loc.place}`;
  return `isl:${loc.place}`;
}

/**
 * @param canvas 그릴 캔버스
 * @param opts {geo, sggDoc, cases, located, onHover, onPickCase, onPickPlace, onTiles}
 */
export function createWorld(canvas, { geo, sggDoc, cases, located, terrain, onHover, onPickCase, onPickPlace, onTiles }) {
  // 실제 지형(수치표고)이 있으면 모든 것이 그 높이 위에 선다 — 없으면 평평한 판
  const hAt = (x, z) => (terrain ? terrain.heightAt(x, z) : 0);
  const onGround = (v, lift = 0) => toWorld(v, LAND_H + lift + hAt(v.x, -v.y));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xe6eee8, 26, 60);
  const grad = toonGradient();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  const HOME = { target: new THREE.Vector3(0.2, 0, 0.9), pos: new THREE.Vector3(0.2, 17.5, 16) };
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

  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8aa3a0, 1.4));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(-7, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const sea = new THREE.Mesh(new THREE.CircleGeometry(40, 64), toon(0x8ec6cc, grad));
  sea.rotateX(-Math.PI / 2);
  sea.position.y = -0.02;
  sea.receiveShadow = true;
  scene.add(sea);

  // ---- 자리별 사례 --------------------------------------------------------------
  const byPlace = new Map();
  const byZone = new Map();
  for (const c of cases) {
    const loc = located.get(c.id);
    if (!byPlace.has(loc.place)) byPlace.set(loc.place, []);
    byPlace.get(loc.place).push(c);
    const k = zoneKey(loc);
    if (!byZone.has(k)) byZone.set(k, { loc, list: [] });
    byZone.get(k).list.push(c);
  }

  // ---- 시도 지형 (윗면이 스텐실 1 — 실제 지도 타일은 여기에만 깔린다) ----------------
  const regionPolys = new Map();
  const tints = {};
  const pickables = [];
  const labels = [];
  let tint = 0;
  for (const [name, polysLL] of Object.entries(geo.regions)) {
    const polys = projectPolys(polysLL);
    regionPolys.set(name, polys);
    const n = (byPlace.get(name) || []).length;
    tints[name] = n ? REGION_TINTS[tint++ % REGION_TINTS.length] : UNOBSERVED;
    const mesh = landMesh(polys, tints[name], '#d9c9a3', grad, name, true);
    scene.add(mesh);
    pickables.push(mesh);
    const [lon, lat] = LABEL_AT[name];
    const sign = signSprite([name, n ? `사례 ${n}` : '관측 없음'], { scale: 0.4, dim: !n });
    sign.position.copy(onGround(project(lon, lat), 0.28));
    sign.userData = { kind: 'region', key: name };
    scene.add(sign);
    labels.push(sign);
  }
  if (terrain) {
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, vertexColors: true });
    markLandStencil(mat); // 실제 지도 타일은 이 지형 위에 깔린다
    const land = terrain.buildMesh(tints, LAND_H, mat);
    scene.add(land);
    pickables.push(land);
  }
  const regionLines = outline([...regionPolys.values()], LAND_H + 0.012, 0x3a3226, 0.55, hAt);
  scene.add(regionLines);

  // ---- 시군구 경계 (확대할수록 진해진다) ---------------------------------------------
  const sggPolys = new Map(); // 'region/name' → polys
  const sggByRegion = new Map();
  for (const s of (sggDoc && sggDoc.sgg) || []) {
    const polys = projectPolys(s.polys);
    const key = `${s.region}/${s.name}`;
    sggPolys.set(key, polys);
    if (!sggByRegion.has(s.region)) sggByRegion.set(s.region, []);
    sggByRegion.get(s.region).push({ key, polys, center: project(...s.center) });
  }
  const sggLines = outline([...sggPolys.values()], LAND_H + 0.011, 0x5b4f3c, 0, hAt);
  scene.add(sggLines);

  // ---- 지역 밖 섬 ---------------------------------------------------------------
  const islandPolys = new Map();
  for (const isl of ISLANDS) {
    const n = (byPlace.get(isl.key) || []).length;
    if (!n) continue;
    const center = project(isl.lon, isl.lat);
    const radius = 0.34 + 0.085 * Math.sqrt(n);
    const polys = [[blobRing(center, radius, isl.key)]];
    islandPolys.set(isl.key, [[blobRing(center, radius * 0.86, isl.key)]]);
    const mesh = landMesh(polys, '#cfdcb4', '#e8d9ae', grad, isl.key, false);
    const beach = landMesh([[blobRing(center, radius * 1.08, `${isl.key}-beach`)]], '#eadfbe', '#eadfbe', grad, isl.key, false);
    beach.scale.y = 0.35;
    scene.add(beach, mesh, outline([polys], LAND_H + 0.003, 0x3a3226, 0.5));
    pickables.push(mesh, beach);
    const sign = signSprite([isl.key, `사례 ${n}`], { scale: 0.56, accent: '#234a72' });
    sign.position.copy(toWorld(new THREE.Vector2(center.x, center.y + radius * 0.2), LAND_H + 0.55));
    sign.userData = { kind: 'region', key: isl.key };
    scene.add(sign);
    labels.push(sign);
  }
  scene.add(dokdo(project(131.865, 37.242), grad, LAND_H));

  // 실제 지형이 있으면 원뿔 산은 세우지 않는다 — 산은 이제 수치표고가 말한다
  const { group: peaks, blocked } = terrain ? { group: null, blocked: [] } : mountains({ project, grad, landH: LAND_H });
  if (peaks) scene.add(peaks);

  // ---- 사례 건물 -----------------------------------------------------------------
  const geos = buildingGeometries();
  const entries = [];
  for (const [key, { loc, list }] of byZone) {
    const n = list.length;
    let zone;
    let f;
    if (key.startsWith('inst:')) {
      zone = { polys: regionPolys.get(loc.place), center: project(loc.inst.lon, loc.inst.lat), radius: 0.02 + 0.014 * Math.sqrt(n) };
      f = 0.42;
    } else if (key.startsWith('sgg:')) {
      zone = { polys: sggPolys.get(`${loc.place}/${loc.sgg.name}`) || regionPolys.get(loc.place) };
      f = THREE.MathUtils.clamp(Math.sqrt(polysArea(zone.polys) / (n * 0.02)), 0.3, 1);
    } else if (key.startsWith('seat:')) {
      zone = { polys: regionPolys.get(loc.place), center: project(...SEATS[loc.place]), radius: 0.05 + 0.026 * Math.sqrt(n) };
      f = 0.55;
    } else {
      zone = { polys: islandPolys.get(loc.place) };
      if (!zone.polys) continue;
      f = THREE.MathUtils.clamp(Math.sqrt(polysArea(zone.polys) / (n * 0.02)), 0.42, 1);
    }
    if (!zone.polys) continue;
    const near = blocked.filter((b) => inPolys(b.p, zone.polys));
    const pts = scatter(zone, list.map((c) => c.id), near, 0.09 * f);
    list.forEach((c, i) => {
      const r = rng(`${c.id}-h`);
      entries.push({
        c,
        loc,
        pos: onGround(pts[i]),
        s: 0.075 * f,
        h: 0.85 + r() * 0.45 + (c.org_type === '중앙행정기관' ? 0.5 : 0),
        rot: r() * Math.PI * 2,
        color: new THREE.Color(TASK_COLORS[c.task_category] || FALLBACK_COLOR),
      });
    });
  }
  // 기관 간판 — 같은 주소(정부대전청사 등)에 든 기관은 한 간판으로 묶는다
  const sites = new Map();
  for (const [key, { loc, list }] of byZone) {
    if (!key.startsWith('inst:')) continue;
    const at = `${loc.inst.lon.toFixed(3)},${loc.inst.lat.toFixed(3)}`;
    if (!sites.has(at)) sites.set(at, { inst: loc.inst, names: [], n: 0 });
    const site = sites.get(at);
    site.names.push(loc.inst.name);
    site.n += list.length;
  }
  for (const { inst, names, n } of sites.values()) {
    const title = names.length > 2 ? `${names.slice(0, 2).join('·')} 외 ${names.length - 2}` : names.join('·');
    const sign = screenSign([title, `사례 ${n}`], 0.042, { accent: '#234a72' });
    sign.position.copy(onGround(project(inst.lon, inst.lat), 0.1));
    sign.userData = { kind: 'inst', keys: names.map((nm) => `inst:${nm}`) };
    scene.add(sign);
    labels.push(sign);
  }
  // 시군구 간판: 그 시군구에 선 사례(기관 소재지 포함) 수
  const sggCounts = new Map();
  for (const e of entries) if (e.loc.sgg) sggCounts.set(`${e.loc.place}/${e.loc.sgg.name}`, (sggCounts.get(`${e.loc.place}/${e.loc.sgg.name}`) || 0) + 1);
  for (const [key, n] of sggCounts) {
    const [region, name] = key.split('/');
    const s = (sggByRegion.get(region) || []).find((x) => x.key === key);
    if (!s) continue;
    const sign = screenSign([name, `사례 ${n}`], 0.046);
    sign.position.copy(onGround(s.center, 0.12));
    sign.userData = { kind: 'sgg', key };
    scene.add(sign);
    labels.push(sign);
  }

  const meshes = {};
  const byId = new Map();
  for (const shape of Object.keys(geos)) {
    const list = entries.filter((e) => shapeOf(e.c) === shape);
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geos[shape],
      new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, vertexColors: true }), list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.entries = list;
    list.forEach((e, i) => {
      e.mesh = mesh;
      e.idx = i;
      byId.set(e.c.id, e);
    });
    meshes[shape] = mesh;
    scene.add(mesh);
    pickables.push(mesh);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const grey = new THREE.Color('#bdb6a6');
  function applyInstance(e, mode) {
    const k = mode === 'on' ? 1.35 : mode === 'off' ? 0.55 : 1;
    q.setFromAxisAngle(up, e.rot);
    m4.compose(e.pos, q, new THREE.Vector3(e.s, e.s * e.h * k, e.s));
    e.mesh.setMatrixAt(e.idx, m4);
    e.mesh.setColorAt(e.idx, mode === 'off' ? e.color.clone().lerp(grey, 0.75) : e.color);
  }
  function refresh() {
    for (const mesh of Object.values(meshes)) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
  entries.forEach((e) => applyInstance(e, 'normal'));
  refresh();

  const treeMesh = trees({
    placePolys: regionPolys, grad, landH: LAND_H, rng, randomIn, heightAt: hAt,
    avoid: [...blocked, ...entries.map((e) => ({ p: new THREE.Vector2(e.pos.x, -e.pos.z), r: e.s * 0.9 + 0.03 }))],
  });
  scene.add(treeMesh);

  // 검색·선택된 사례 위에 뜨는 노란 표지 — 전국 화면에서도 어디 있는지 보이게 (사용자 지시 2026-09-27)
  const BEACON_MAX = 240;
  const beacons = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshToonMaterial({ color: 0xf4d35e, gradientMap: grad, emissive: 0x6b4d00 }), BEACON_MAX);
  beacons.count = 0;
  beacons.renderOrder = 5;
  beacons.frustumCulled = false; // 행렬을 매 프레임 바꾸므로 경계구를 믿지 않는다
  scene.add(beacons);
  let beaconList = [];
  function layBeacons(d, t) {
    const k = THREE.MathUtils.clamp(d * 0.011, 0.012, 0.2);
    beaconList.forEach((e, i) => {
      const top = e.pos.y + e.s * e.h * 1.35 * 2 + k * 1.6 + Math.sin(t * 2.5 + i) * k * 0.3;
      q.setFromAxisAngle(up, t * 1.2 + i);
      m4.compose(new THREE.Vector3(e.pos.x, top, e.pos.z), q, new THREE.Vector3(k * 0.7, k, k * 0.7));
      beacons.setMatrixAt(i, m4);
    });
    beacons.instanceMatrix.needsUpdate = true;
  }

  const marker = pin(grad);
  marker.visible = false;
  scene.add(marker);
  const cloudGroup = clouds(grad, rng);
  scene.add(cloudGroup);

  // 실제 지도가 깔리면 나무는 걷는다 — 지도 글자를 가리지 않게(산은 이정표로 남긴다)
  const tiles = createTileLayer({
    scene, project, unproject, y: LAND_H + (terrain ? 0.02 : 0.012), heightAt: hAt, landMask: terrain ? terrain.landMask() : null,
    onActive: (on) => { treeMesh.visible = !on; if (onTiles) onTiles(on); },
  });
  const post = createPostPass(renderer);

  // ---- 카메라 이동 ----------------------------------------------------------------
  let flight = null;
  function flyTo(target, dist) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    const polar = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1));
    if (polar > 1.0 || polar < 0.35) {
      const az = Math.atan2(dir.x, dir.z);
      dir.set(Math.sin(az) * Math.sin(0.72), Math.cos(0.72), Math.cos(az) * Math.sin(0.72));
    }
    flight = {
      t0: performance.now(),
      fromT: controls.target.clone(),
      fromP: camera.position.clone(),
      toT: target.clone(),
      toP: target.clone().add(dir.multiplyScalar(dist)),
    };
  }
  function flyToPoints(points) {
    if (!points.length) return;
    const box = new THREE.Box3().setFromPoints(points);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    flyTo(center, THREE.MathUtils.clamp(Math.max(size.x, size.z) * 1.9 + 1.2, 1.4, 30));
  }

  // ---- 선택·강조 -----------------------------------------------------------------
  let highlighted = null;
  function labelHasHit(sign, ids) {
    const { kind, key } = sign.userData;
    return entries.some((e) => ids.has(e.c.id) && (
      (kind === 'region' && e.loc.place === key)
      || (kind === 'sgg' && e.loc.sgg && `${e.loc.place}/${e.loc.sgg.name}` === key)
      || (kind === 'inst' && e.loc.inst && sign.userData.keys.includes(`inst:${e.loc.inst.name}`))));
  }
  function setHighlight(ids) {
    highlighted = ids;
    for (const e of entries) applyInstance(e, !ids ? 'normal' : ids.has(e.c.id) ? 'on' : 'off');
    refresh();
    for (const sign of labels) sign.userData.base = !ids || labelHasHit(sign, ids) ? 1 : 0.3;
    beaconList = ids ? entries.filter((e) => ids.has(e.c.id)).slice(0, BEACON_MAX) : [];
    beacons.count = beaconList.length;
  }
  function focusCase(id, { fly = true } = {}) {
    const e = byId.get(id);
    if (!e) {
      marker.visible = false;
      return;
    }
    const k = highlighted && !highlighted.has(id) ? 0.55 : highlighted ? 1.35 : 1;
    marker.scale.setScalar(Math.max(0.3, e.s / 0.075) * 0.7);
    marker.position.set(e.pos.x, e.pos.y + e.s * e.h * k * 2.1 + 0.04, e.pos.z);
    marker.userData.baseY = marker.position.y;
    marker.visible = true;
    if (fly) flyTo(e.pos, 1.6);
  }

  // ---- 포인터 -----------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function sggAt(region, p) {
    const hit = (sggByRegion.get(region) || []).find((s) => inPolys(p, s.polys));
    return hit ? hit.key : null;
  }
  function pick(ev) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (!hit) return null;
    if (hit.object.isInstancedMesh) return { caseId: hit.object.userData.entries[hit.instanceId].c.id };
    const place = hit.object.userData.terrain ? terrain.regionAt(hit.point.x, hit.point.z) : hit.object.userData.place;
    if (!place) return null;
    // 가까이 들어와 있으면 시도가 아니라 그 자리의 시군구를 고른다
    if (camera.position.distanceTo(controls.target) < 5.5) {
      const key = sggAt(place, new THREE.Vector2(hit.point.x, -hit.point.z));
      if (key) return { place: key };
    }
    return { place };
  }
  let down = null;
  let hoverQueued = null;
  let userInteract = () => {};
  canvas.addEventListener('pointerdown', (ev) => {
    down = { x: ev.clientX, y: ev.clientY };
    flight = null;
    userInteract();
  });
  canvas.addEventListener('wheel', () => userInteract(), { passive: true });
  canvas.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
    const hit = pick(ev);
    if (hit && hit.caseId) onPickCase(hit.caseId);
    else if (hit && hit.place) onPickPlace(hit.place);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse' || ev.buttons) return;
    hoverQueued = ev;
  });
  canvas.addEventListener('pointerleave', () => { hoverQueued = null; onHover(null); });

  // ---- 크기·루프 -------------------------------------------------------------------
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const clock = new THREE.Clock();
  function frame() {
    const t = clock.getElapsedTime();
    if (flight) {
      const k = Math.min(1, (performance.now() - flight.t0) / 1100);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      controls.target.lerpVectors(flight.fromT, flight.toT, e);
      camera.position.lerpVectors(flight.fromP, flight.toP, e);
      if (k >= 1) flight = null;
    }
    controls.update();
    const d = camera.position.distanceTo(controls.target);
    // 시군구 선이 진해지는 만큼 시도 선은 옅어진다 — 두 선은 따로 단순화돼 겹치면 이중선이 된다
    const near = 1 - THREE.MathUtils.smoothstep(d, 4.5, 8);
    sggLines.material.opacity = 0.6 * near;
    regionLines.material.opacity = 0.55 * (1 - near * 0.85);
    // 간판: 시도는 멀리서, 시군구는 중간에서, 기관은 가까이에서
    for (const sign of labels) {
      const ds = camera.position.distanceTo(sign.position);
      const { kind } = sign.userData;
      const vis = kind === 'region' ? THREE.MathUtils.smoothstep(ds, 2.2, 5.5)
        : kind === 'sgg' ? (1 - THREE.MathUtils.smoothstep(ds, 4.5, 7)) * THREE.MathUtils.smoothstep(ds, 0.5, 1.1)
          : 1 - THREE.MathUtils.smoothstep(ds, 1.6, 2.6);
      sign.material.opacity = (sign.userData.base ?? 1) * vis;
      sign.visible = sign.material.opacity > 0.02;
    }
    tiles.update(camera, controls.target);
    cloudGroup.visible = d > 3;
    cloudGroup.children.forEach((cl, i) => {
      cl.position.x = ((cl.userData.x0 + t * cl.userData.v + 24) % 48) - 24;
      cl.position.y = cl.userData.y0 + Math.sin(t * 0.3 + i) * 0.05;
    });
    if (beaconList.length) layBeacons(d, t);
    if (marker.visible) {
      marker.position.y = marker.userData.baseY + Math.sin(t * 3) * 0.03;
      marker.rotation.y = t * 1.5;
    }
    if (hoverQueued) {
      const ev = hoverQueued;
      hoverQueued = null;
      const hit = pick(ev);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      onHover(hit && hit.caseId ? hit.caseId : null, ev.clientX, ev.clientY);
    }
    post.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);

  return {
    setHighlight,
    focusCase,
    clearFocus() { marker.visible = false; },
    flyToIds(ids) {
      flyToPoints([...ids].map((id) => byId.get(id)).filter(Boolean).map((e) => e.pos));
    },
    flyToPlace(place) {
      const inPlace = entries.filter((e) => (place.includes('/')
        ? e.loc.sgg && `${e.loc.place}/${e.loc.sgg.name}` === place : e.loc.place === place));
      if (inPlace.length) flyToPoints(inPlace.map((e) => e.pos));
      else {
        const sign = labels.find((s) => s.userData.key === place);
        if (sign) flyTo(sign.position.clone().setY(0), 4);
      }
    },
    flyHome() { flyTo(HOME.target, HOME.pos.distanceTo(HOME.target)); },
    setInk(on) { post.uniforms.inkOn.value = on ? 1 : 0; },
    setTiles(on) { tiles.setEnabled(on); },
    debug: () => ({ tiles: tiles.stats(), d: camera.position.distanceTo(controls.target), target: controls.target.toArray() }),
    setAutoRotate(on) { controls.autoRotate = on; },
    onUserInteract(fn) { userInteract = fn; },
    /** 거리 산책 중에는 지도 렌더링을 멈춰 GPU를 양보한다 */
    setPaused(on) { renderer.setAnimationLoop(on ? null : frame); },
    get flying() { return Boolean(flight); },
  };
}
