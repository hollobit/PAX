// 3D PAX 거리 산책 — 지도에서 고른 자리로 내려가 1인칭으로 걷는다 (sakura-crossing의 한국 거리판).
// 조작: 클릭하면 시점 고정(마우스로 둘러보기) · W A S D/방향키 걷기 · Shift 달리기 · E 또는 클릭으로 간판의 사례 열기
//       · Esc 시점 풀기. 터치 기기는 끌어서 둘러보고 화면 방향 단추로 걷는다. '자동 산책'은 사례 가게를 차례로 찾아간다.
import * as THREE from 'three';
import { toonGradient, skyTexture, createPostPass } from './pax3d-look.js?v=a66df86b';
import { rng } from './pax3d-geom.js?v=f13514eb';
import { loadStreetData } from './pax3d-mvt.js?v=ab8c9632';
import { buildOsmStreet } from './pax3d-street-osm.js?v=a0ce9e69';
import { buildAlleyStreet } from './pax3d-street-alley.js?v=33d6a2de';

const EYE = 1.6;
const WALK = 3.4;
const RUN = 7.5;
const BODY = 0.35;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function makeCollider(rings) {
  const cells = new Map();
  const CELL = 20;
  rings.forEach((r, idx) => {
    const xs = r.map((p) => p[0]);
    const zs = r.map((p) => p[1]);
    for (let cx = Math.floor(Math.min(...xs) / CELL); cx <= Math.floor(Math.max(...xs) / CELL); cx++) {
      for (let cz = Math.floor(Math.min(...zs) / CELL); cz <= Math.floor(Math.max(...zs) / CELL); cz++) {
        const k = `${cx},${cz}`;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(idx);
      }
    }
  });
  const inside = (x, z, r) => {
    let hit = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, zi] = r[i];
      const [xj, zj] = r[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
  };
  return (x, z) => {
    const list = cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || [];
    for (const idx of list) {
      const r = rings[idx];
      for (const [dx, dz] of [[0, 0], [BODY, 0], [-BODY, 0], [0, BODY], [0, -BODY]]) if (inside(x + dx, z + dz, r)) return true;
    }
    return false;
  };
}

/**
 * @param stage 지도 무대 요소(겹쳐 띄울 자리)
 * @param opts {target:{mode, lon, lat, label, address}, cases, focusId, colorOf, shortTitle, onPickCase, onClose}
 */
export async function openStreet(stage, opts) {
  const { target, cases, colorOf, shortTitle, onPickCase, onClose } = opts;
  const root = el('div', 'pax3d-street');
  const canvas = el('canvas');
  canvas.setAttribute('aria-label', `${target.label} 거리 1인칭 산책 화면`);
  const hud = el('div', 'pax3d-street__hud');
  const title = el('p', 'pax3d-street__title', target.label);
  const status = el('p', 'pax3d-street__status', '거리를 짓는 중…');
  hud.append(title, status);
  const tools = el('div', 'pax3d-street__tools');
  const walkBtn = el('button', 'pax3d-tool', '▶ 자동 산책');
  const backBtn = el('button', 'pax3d-tool', '↩ 지도로');
  walkBtn.type = 'button';
  backBtn.type = 'button';
  tools.append(walkBtn, backBtn);
  const hint = el('p', 'pax3d-street__hint', '');
  const help = el('p', 'pax3d-street__help', '클릭: 둘러보기 고정 · W A S D 걷기 · Shift 달리기 · E 간판 사례 열기 · Esc 풀기');
  const attrib = el('p', 'pax3d-street__attrib', '');
  const pad = el('div', 'pax3d-street__pad');
  for (const [k, label] of [['f', '▲'], ['l', '◀'], ['b', '▼'], ['r', '▶']]) {
    const b = el('button', `pax3d-street__key pax3d-street__key--${k}`, label);
    b.type = 'button';
    b.dataset.k = k;
    pad.appendChild(b);
  }
  root.append(canvas, hud, tools, hint, help, attrib, pad);
  stage.appendChild(root);

  // ---- 장면 -------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xe9efe9, 90, 420);
  const grad = toonGradient();
  // 근평면을 너무 당기면 깊이 정밀도가 떨어져 넓은 벽에 가짜 먹선 줄무늬가 생긴다
  const camera = new THREE.PerspectiveCamera(68, 1, 0.4, 700);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a9aa0, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 260 });
  // 넓은 벽에 해가 비스듬히 들면 그림자 여드름(가로 줄무늬)이 생긴다 — 법선 방향으로 넉넉히 민다
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.12;
  scene.add(sun, sun.target);
  const post = createPostPass(renderer);
  post.uniforms.tilt.value = 0; // 1인칭에서는 틸트시프트를 끈다
  post.uniforms.inkRange.value.set(0.035, 0.11); // 비스듬한 벽의 깊이 잡음은 넘기고 윤곽만

  let world;
  let fallbackNote = '';
  const common = { cases, grad, rng, colorOf, shortTitle, placeName: target.label.split(' ')[0] };
  if (target.mode === 'osm') {
    try {
      const data = await loadStreetData(target.lon, target.lat, 300);
      if (data.buildings.length < 3) throw new Error('건물 자료 부족');
      world = buildOsmStreet(data, { ...common, address: target.address });
    } catch (err) {
      fallbackNote = ` (실제 지도 자료를 받지 못해 가상의 거리로 대신합니다: ${err.message})`;
    }
  }
  if (!world) world = buildAlleyStreet(common);
  scene.add(world.group);
  attrib.textContent = world.attribution + fallbackNote;
  status.textContent = `사례 가게 ${world.shops.length}곳 · 노란 마름모가 사례 가게입니다`;
  const blocked = makeCollider(world.colliders);
  // 가게 앞 설 자리: 간판에서 바깥으로 밀어 가며 건물에 걸리지 않는 첫 자리(9m 안팎)를 고른다
  for (const s of world.shops) {
    const out = s.stand.clone().sub(s.look).setY(0).normalize();
    const side = new THREE.Vector3(-out.z, 0, out.x);
    // 정면보다 비스듬히 — 간판과 함께 길이 보이도록 옆으로 5m 비켜 선다
    search: for (const d of [9, 7, 11, 5, 13, 15, 4]) {
      for (const lateral of [5, -5, 0]) {
        const p = s.look.clone().setY(EYE).addScaledVector(out, d).addScaledVector(side, lateral);
        if (!blocked(p.x, p.z)) {
          s.stand.copy(p);
          break search;
        }
      }
    }
  }
  if (world.shops[0]) world.spawn.pos.copy(world.shops[0].stand);
  const signs = world.shops.map((s) => s.sign);

  // ---- 시점 -------------------------------------------------------------------
  const pos = world.spawn.pos.clone();
  if (window.pax3d) window.pax3dStreet = { pos, get yaw() { return yaw; } }; // ?debug로 연 지도에서만
  let yaw = 0;
  let pitch = 0;
  function lookAt(p) {
    const d = p.clone().sub(pos);
    yaw = Math.atan2(-d.x, -d.z);
    pitch = Math.atan2(d.y - 0, Math.hypot(d.x, d.z)) * 0.6;
  }
  lookAt(world.spawn.look);

  const keys = new Set();
  const onKey = (down) => (e) => {
    if (!root.isConnected) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
      if (down) { keys.add(k); stopAuto(); } else keys.delete(k);
      if (document.pointerLockElement === canvas) e.preventDefault();
    }
    if (down && k === 'e') interact();
  };
  const kd = onKey(true);
  const ku = onKey(false);
  document.addEventListener('keydown', kd);
  document.addEventListener('keyup', ku);
  const onMouse = (e) => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0022, -1.2, 1.2);
  };
  document.addEventListener('mousemove', onMouse);

  // 드래그(터치·잠금 전 마우스)로 둘러보기, 짧은 탭은 간판 고르기
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: false };
    stopAuto();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || document.pointerLockElement === canvas) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) {
      yaw -= dx * 0.004;
      pitch = THREE.MathUtils.clamp(pitch - dy * 0.004, -1.2, 1.2);
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    const tap = drag && !drag.moved;
    drag = null;
    if (!tap) return;
    if (document.pointerLockElement === canvas) {
      interact();
      return;
    }
    const hit = pickAt(e.clientX, e.clientY);
    if (hit) onPickCase(hit);
    else if (e.pointerType === 'mouse' && canvas.requestPointerLock) canvas.requestPointerLock();
  });
  pad.addEventListener('pointerdown', (e) => {
    const k = e.target.dataset.k;
    if (k) { keys.add(`pad-${k}`); stopAuto(); e.preventDefault(); }
  });
  const padUp = () => ['f', 'b', 'l', 'r'].forEach((k) => keys.delete(`pad-${k}`));
  pad.addEventListener('pointerup', padUp);
  pad.addEventListener('pointerleave', padUp);

  // ---- 간판 고르기 -------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  ray.far = 24;
  function pickAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(signs, false)[0];
    return hit ? hit.object.userData.caseId : null;
  }
  function centerTarget() {
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hit = ray.intersectObjects(signs, false)[0];
    return hit ? hit.object.userData.caseId : null;
  }
  function interact() {
    const id = centerTarget();
    if (id) onPickCase(id);
  }

  // ---- 자동 산책 — 사례 가게를 차례로 (멀면 지붕 위로 훌쩍 넘어간다) ------------------------
  let auto = null;
  function stopAuto() {
    if (!auto) return;
    auto = null;
    walkBtn.textContent = '▶ 자동 산책';
  }
  function goTo(shop, i) {
    const from = pos.clone();
    const to = shop.stand.clone();
    const dist = from.distanceTo(to);
    const dur = THREE.MathUtils.clamp(dist / 9, 1.2, 5) * 1000;
    const d = shop.look.clone().sub(to);
    auto = { i, t0: performance.now(), dur, from, to, hop: dist > 22 ? Math.min(28, dist * 0.35) : 0,
      yaw0: yaw, yaw1: Math.atan2(-d.x, -d.z), shop, arrived: false };
    walkBtn.textContent = `■ 산책 멈춤 ${i + 1}/${world.shops.length}`;
  }
  walkBtn.addEventListener('click', () => {
    if (auto) stopAuto();
    else if (world.shops.length) {
      // 이미 첫 가게 앞에 서 있으면 다음 가게부터
      const start = world.shops.length > 1 && pos.distanceTo(world.shops[0].stand) < 2 ? 1 : 0;
      goTo(world.shops[start], start);
    }
  });
  backBtn.addEventListener('click', close);

  // ---- 루프 -------------------------------------------------------------------
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const clock = new THREE.Clock();
  let hintAt = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (auto) {
      const k = Math.min(1, (performance.now() - auto.t0) / auto.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      pos.lerpVectors(auto.from, auto.to, e);
      pos.y = EYE + Math.sin(Math.PI * e) * auto.hop;
      let dy = auto.yaw1 - auto.yaw0;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw = auto.yaw0 + dy * e;
      pitch = -Math.sin(Math.PI * e) * (auto.hop ? 0.5 : 0) + 0.08 * e;
      if (k >= 1 && !auto.arrived) {
        auto.arrived = true;
        onPickCase(auto.shop.caseId);
        const next = auto.i + 1;
        const cur = auto;
        setTimeout(() => {
          if (auto !== cur) return;
          if (next < world.shops.length) goTo(world.shops[next], next);
          else stopAuto();
        }, 4500);
      }
    } else {
      const fwd = (keys.has('w') || keys.has('arrowup') || keys.has('pad-f') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') || keys.has('pad-b') ? 1 : 0);
      const side = (keys.has('d') || keys.has('pad-r') ? 1 : 0) - (keys.has('a') || keys.has('pad-l') ? 1 : 0);
      const turn = (keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0);
      yaw += turn * dt * 1.8;
      if (fwd || side) {
        const sp = (keys.has('shift') ? RUN : WALK) * dt;
        const dx = (-Math.sin(yaw) * fwd + Math.cos(yaw) * side) * sp;
        const dz = (-Math.cos(yaw) * fwd - Math.sin(yaw) * side) * sp;
        // 건물 안에서 시작했다면(자료의 겹친 윤곽 등) 빠져나오는 걸음은 막지 않는다
        const stuck = blocked(pos.x, pos.z);
        if (stuck || !blocked(pos.x + dx, pos.z)) pos.x += dx;
        if (stuck || !blocked(pos.x, pos.z + dz)) pos.z += dz;
        const r = Math.hypot(pos.x, pos.z);
        if (r > world.radius) { pos.x *= world.radius / r; pos.z *= world.radius / r; }
        pos.y = EYE + Math.abs(Math.sin(t * (keys.has('shift') ? 11 : 7.5))) * 0.05;
      } else pos.y += (EYE - pos.y) * 0.2;
    }
    camera.position.copy(pos);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    sun.position.set(pos.x - 40, 90, pos.z + 50);
    sun.target.position.set(pos.x, 0, pos.z);
    for (const s of world.shops) if (s.beacon) s.beacon.rotation.y = t * 1.4;
    if (t - hintAt > 0.15) {
      hintAt = t;
      const id = centerTarget();
      const c = id && cases.find((x) => x.id === id);
      hint.textContent = c ? `E 또는 클릭 — ${c.title}` : '';
      hint.hidden = !c;
    }
    post.render(scene, camera);
  });

  function close() {
    stopAuto();
    renderer.setAnimationLoop(null);
    ro.disconnect();
    document.removeEventListener('keydown', kd);
    document.removeEventListener('keyup', ku);
    document.removeEventListener('mousemove', onMouse);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    renderer.dispose();
    root.remove();
    onClose();
  }

  if (opts.focusId) {
    const shop = world.shops.find((s) => s.caseId === opts.focusId);
    if (shop) {
      pos.copy(shop.stand);
      lookAt(shop.look);
    }
  }
  return { close };
}
