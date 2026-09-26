// 3D PAX 미니어처 세계 — 시도 지형, 지역 밖 섬, 사례 건물, 카메라와 선택.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { toon, toonGradient, skyTexture, signSprite, createPostPass } from './pax3d-look.js?v=af667c9a';
import { ISLANDS, TASK_COLORS, FALLBACK_COLOR, shapeOf } from './pax3d-data.js?v=7715f3cd';
import { buildingGeometries, mountains, trees, clouds, pin, dokdo } from './pax3d-props.js?v=122a3045';

// 등장방형 투영 — 위도 36도 기준 코사인 보정. 1 단위 ≈ 43km.
const LON0 = 127.7;
const LAT0 = 35.95;
const KM = 111.32;
const S = 0.023;
const COS = Math.cos((LAT0 * Math.PI) / 180);
export const LAND_H = 0.22;

export function project(lon, lat) {
  return new THREE.Vector2((lon - LON0) * KM * COS * S, (lat - LAT0) * KM * S); // (동, 북)
}
const toWorld = (v, y = 0) => new THREE.Vector3(v.x, y, -v.y);

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

// ---- 결정적 난수: 같은 사례는 언제나 같은 자리에 선다 -------------------------------
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed) {
  let a = typeof seed === 'string' ? hash(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 평면 도형 ----------------------------------------------------------------
function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].y - r[i].x * r[j].y;
  return Math.abs(a) / 2;
}
function inRing(p, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i].y > p.y) !== (r[j].y > p.y)
        && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
  }
  return inside;
}
function inPolys(p, polys) {
  return polys.some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h)));
}
function polysArea(polys) {
  return polys.reduce((s, [o, ...hs]) => s + ringArea(o) - hs.reduce((t, h) => t + ringArea(h), 0), 0);
}
function randomIn(polys, rand) {
  const areas = polys.map(([o]) => ringArea(o));
  const total = areas.reduce((a, b) => a + b, 0);
  let pick = rand() * total;
  let k = 0;
  while (k < polys.length - 1 && pick > areas[k]) pick -= areas[k++];
  const outer = polys[k][0];
  const xs = outer.map((v) => v.x);
  const ys = outer.map((v) => v.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let t = 0; t < 80; t++) {
    const p = new THREE.Vector2(x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0));
    if (inPolys(p, polys)) return p;
  }
  return null;
}

/** 서로 가장 먼 후보를 고르는 표본(best-candidate) — 건물이 한데 뭉치지 않게. */
export function scatter(polys, ids, blocked, spacingHint) {
  const placed = [];
  for (const id of ids) {
    const rand = rng(id);
    let best = null;
    let bestD = -1;
    for (let k = 0; k < 16; k++) {
      const p = randomIn(polys, rand);
      if (!p) continue;
      let d = Infinity;
      for (const q of placed) d = Math.min(d, p.distanceTo(q));
      for (const b of blocked) d = Math.min(d, p.distanceTo(b.p) - b.r);
      if (d > bestD) {
        best = p;
        bestD = d;
      }
      if (bestD > spacingHint * 3) break;
    }
    placed.push(best || polys[0][0][0].clone());
  }
  return placed;
}

function blobRing(center, radius, seed) {
  const rand = rng(seed);
  const [a, b, c] = [rand() * 6, rand() * 6, rand() * 6];
  const pts = [];
  for (let i = 0; i < 44; i++) {
    const t = (i / 44) * Math.PI * 2;
    const r = radius * (1 + 0.11 * Math.sin(3 * t + a) + 0.07 * Math.sin(5 * t + b) + 0.04 * Math.sin(7 * t + c));
    pts.push(new THREE.Vector2(center.x + Math.cos(t) * r, center.y + Math.sin(t) * r));
  }
  return pts;
}

function landMesh(polys, capColor, sideColor, grad, place) {
  const shapes = polys.map(([outer, ...holes]) => {
    const s = new THREE.Shape(outer);
    s.holes = holes.map((h) => new THREE.Path(h));
    return s;
  });
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: LAND_H, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, [toon(capColor, grad), toon(sideColor, grad)]);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.userData.place = place;
  return mesh;
}

function borderLines(polys) {
  const pts = [];
  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        pts.push(a.x, LAND_H + 0.003, -a.y, b.x, LAND_H + 0.003, -b.y);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0x3a3226, transparent: true, opacity: 0.5,
  }));
}

/**
 * @param canvas 그릴 캔버스
 * @param opts {geo, cases, places, onHover(id|null, x, y), onPickCase(id), onPickPlace(key)}
 */
export function createWorld(canvas, { geo, cases, places, onHover, onPickCase, onPickPlace }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xe6eee8, 26, 60);
  const grad = toonGradient();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const HOME = { target: new THREE.Vector3(0.2, 0, 0.9), pos: new THREE.Vector3(0.2, 17.5, 16) };
  camera.position.copy(HOME.pos);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.2;
  controls.maxDistance = 34;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.22;
  controls.screenSpacePanning = false;

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

  // ---- 자리(시도·섬)별 폴리곤과 사례 수 ------------------------------------------
  const byPlace = new Map();
  for (const c of cases) {
    const k = places.get(c.id);
    if (!byPlace.has(k)) byPlace.set(k, []);
    byPlace.get(k).push(c);
  }
  const placePolys = new Map();
  const pickables = [];
  const labels = new Map();
  let tint = 0;
  for (const [name, polysLL] of Object.entries(geo.regions)) {
    const polys = polysLL.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => project(lon, lat))));
    placePolys.set(name, polys);
    const n = (byPlace.get(name) || []).length;
    const mesh = landMesh(polys, n ? REGION_TINTS[tint++ % REGION_TINTS.length] : UNOBSERVED, '#d9c9a3', grad, name);
    scene.add(mesh, borderLines(polys));
    pickables.push(mesh);
    const [lon, lat] = LABEL_AT[name];
    const sign = signSprite([name, n ? `사례 ${n}` : '관측 없음'], { scale: 0.4, dim: !n });
    sign.position.copy(toWorld(project(lon, lat), LAND_H + 0.28));
    scene.add(sign);
    labels.set(name, sign);
  }
  for (const isl of ISLANDS) {
    const n = (byPlace.get(isl.key) || []).length;
    if (!n) continue;
    const center = project(isl.lon, isl.lat);
    const radius = 0.34 + 0.085 * Math.sqrt(n);
    const ring = blobRing(center, radius, isl.key);
    const polys = [[ring]];
    placePolys.set(isl.key, [[blobRing(center, radius * 0.86, isl.key)]]);
    const mesh = landMesh(polys, '#cfdcb4', '#e8d9ae', grad, isl.key);
    const beach = landMesh([[blobRing(center, radius * 1.08, `${isl.key}-beach`)]], '#eadfbe', '#eadfbe', grad, isl.key);
    beach.scale.y = 0.35;
    scene.add(beach, mesh, borderLines(polys));
    pickables.push(mesh, beach);
    const sign = signSprite([isl.key, `사례 ${n}`], { scale: 0.56, accent: '#234a72' });
    sign.position.copy(toWorld(new THREE.Vector2(center.x, center.y + radius * 0.2), LAND_H + 0.55));
    scene.add(sign);
    labels.set(isl.key, sign);
  }
  scene.add(dokdo(project(131.865, 37.242), grad, LAND_H));

  // ---- 산 (건물은 산을 피해 선다) -----------------------------------------------------
  const { group: peaks, blocked } = mountains({ project, grad, landH: LAND_H });
  scene.add(peaks);

  // ---- 사례 건물 -----------------------------------------------------------------
  const geos = buildingGeometries();
  const entries = []; // {c, shape, idx, pos(Vector3), s, h, color}
  for (const [place, list] of byPlace) {
    const polys = placePolys.get(place);
    if (!polys) continue;
    const area = polysArea(polys);
    const f = THREE.MathUtils.clamp(Math.sqrt(area / (list.length * 0.02)), 0.42, 1);
    const ids = list.map((c) => c.id);
    const pts = scatter(polys, ids, blocked.filter((b) => inPolys(b.p, polys)), 0.09 * f);
    list.forEach((c, i) => {
      const r = rng(`${c.id}-h`);
      entries.push({
        c,
        place,
        pos: toWorld(pts[i], LAND_H),
        s: 0.075 * f,
        h: 0.85 + r() * 0.45 + (c.org_type === '중앙행정기관' ? 0.5 : 0),
        rot: r() * Math.PI * 2,
        color: new THREE.Color(TASK_COLORS[c.task_category] || FALLBACK_COLOR),
      });
    });
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

  // 나무는 건물과 산이 자리 잡은 뒤에 빈 땅에 심는다.
  scene.add(trees({
    placePolys, grad, landH: LAND_H, rng, randomIn,
    avoid: [...blocked, ...entries.map((e) => ({ p: new THREE.Vector2(e.pos.x, -e.pos.z), r: e.s * 0.9 + 0.03 }))],
  }));

  const marker = pin(grad);
  marker.visible = false;
  scene.add(marker);
  const cloudGroup = clouds(grad, rng);
  scene.add(cloudGroup);

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
    flyTo(center, THREE.MathUtils.clamp(Math.max(size.x, size.z) * 1.9 + 2.2, 2.4, 30));
  }

  // ---- 선택·강조 -----------------------------------------------------------------
  let highlighted = null;
  function setHighlight(ids) {
    highlighted = ids;
    for (const e of entries) applyInstance(e, !ids ? 'normal' : ids.has(e.c.id) ? 'on' : 'off');
    refresh();
    for (const [place, sign] of labels) {
      const hit = !ids || (byPlace.get(place) || []).some((c) => ids.has(c.id));
      sign.userData.baseOpacity = hit ? 1 : 0.35;
    }
  }
  function focusCase(id, { fly = true } = {}) {
    const e = byId.get(id);
    if (!e) {
      marker.visible = false;
      return;
    }
    const k = highlighted && !highlighted.has(id) ? 0.55 : highlighted ? 1.35 : 1;
    marker.scale.setScalar(Math.max(0.35, e.s / 0.075) * 0.7);
    marker.position.set(e.pos.x, e.pos.y + e.s * e.h * k * 2.1 + 0.04, e.pos.z);
    marker.userData.baseY = marker.position.y;
    marker.visible = true;
    if (fly) flyTo(e.pos, 2.8);
  }
  function clearFocus() {
    marker.visible = false;
  }

  // ---- 포인터 -----------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(ev) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (!hit) return null;
    if (hit.object.isInstancedMesh) return { caseId: hit.object.userData.entries[hit.instanceId].c.id };
    return { place: hit.object.userData.place };
  }
  let down = null;
  let hoverQueued = null;
  canvas.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY }; flight = null; });
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
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    if (flight) {
      const k = Math.min(1, (performance.now() - flight.t0) / 900);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      controls.target.lerpVectors(flight.fromT, flight.toT, e);
      camera.position.lerpVectors(flight.fromP, flight.toP, e);
      if (k >= 1) flight = null;
    }
    controls.update();
    // 초점 띠를 화면 가운데에 — 확대할수록 흐림 띠를 좁게 느끼도록 거리로 살짝 조정
    post.uniforms.focusY.value = 0.5;
    cloudGroup.children.forEach((cl, i) => {
      cl.position.x = ((cl.userData.x0 + t * cl.userData.v + 24) % 48) - 24;
      cl.position.y = cl.userData.y0 + Math.sin(t * 0.3 + i) * 0.05;
    });
    // 가까이 가면 간판을 걷어 건물이 보이게 — 간판은 멀리서 길을 찾는 용도다
    for (const sign of labels.values()) {
      const d = camera.position.distanceTo(sign.position);
      const near = THREE.MathUtils.smoothstep(d, 2.2, 5.5);
      sign.material.opacity = (sign.userData.baseOpacity ?? 1) * near;
      sign.visible = near > 0.02;
    }
    if (marker.visible) {
      marker.position.y = marker.userData.baseY + Math.sin(t * 3) * 0.04;
      marker.rotation.y = t * 1.5;
    }
    if (hoverQueued) {
      const ev = hoverQueued;
      hoverQueued = null;
      const hit = pick(ev);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      onHover(hit && hit.caseId ? hit.caseId : null, ev.clientX, ev.clientY, hit && hit.place);
    }
    post.render(scene, camera);
  });

  return {
    setHighlight,
    focusCase,
    clearFocus,
    flyToIds(ids) {
      flyToPoints([...ids].map((id) => byId.get(id)).filter(Boolean).map((e) => e.pos));
    },
    flyToPlace(place) {
      const list = byPlace.get(place) || [];
      if (list.length) this.flyToIds(new Set(list.map((c) => c.id)));
      else if (labels.has(place)) flyTo(labels.get(place).position.clone().setY(0), 4);
    },
    flyHome() {
      flyTo(HOME.target, HOME.pos.distanceTo(HOME.target));
    },
    setInk(on) {
      post.uniforms.inkOn.value = on ? 1 : 0;
    },
  };
}

