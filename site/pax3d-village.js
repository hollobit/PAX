// 3D PAX 섬 마을 — 길가에 선 사례 건물(종류별 모양)과 길·광장·마을 문·가로등·나무·걷는 사람.
// 배치 계산은 pax3d-village-plan.js(순수 모듈)가 하고, 여기서는 그것을 도형으로 세운다.
// 건물 벽·문·창은 정점색으로 구워 두고 지붕만 인스턴스 색(업무 유형)을 받는다 — aTint 정점 속성이 그 구분이다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, signSprite } from './pax3d-look.js?v=a66df86b';

export const VILLAGE_SIZE = 0.06; // 건물 한 채의 크기(월드 단위) — 길 폭·간격이 이것에 비례한다
/** 종류별 지붕 꼭대기 높이(도형 단위) — 이름 간판을 그 위에 띄운다 */
export const KIND_TOP = { house: 0.84, office: 1.06, hall: 1.4, library: 1.09, observatory: 1.05, workshop: 0.78, school: 1.37, shop: 0.71 };
const LABEL_NEAR = 1.3; // 카메라가 이만큼 가까운 건물에만 이름 간판
const LABEL_MAX = 30;

const WALL = '#f2e8d2';
const WALL2 = '#e7dac0';
const TRIM = '#d6c8ad';
const STONE = '#e6dfd2';
const WIN = '#3f6f6a';
const DOOR = '#7a5a3c';
const DARK = '#5a5248';
const PAPER = '#fbf7ec';

/** 도형 하나에 색과 aTint(1이면 인스턴스 색을 받는 지붕)를 붙여 합칠 수 있게 맞춘다 */
function part(geo, color, tint = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const c = new THREE.Color(tint ? '#ffffff' : color);
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(n).fill(tint), 1));
  return g;
}
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** 박공(삼각 기둥) — 삼각형 면이 앞(+z)을 본다 */
function gable(w, h, d, y = 0, z = 0) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, y, z - d / 2);
}
/** 앞면 창 격자 */
function windows(cols, rows, w, y0, dy, z, size = 0.1) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = cols === 1 ? 0 : -w / 2 + (w * c) / (cols - 1);
      out.push(part(box(size, size, 0.02, x, y0 + r * dy, z), WIN));
    }
  }
  return out;
}

function kindGeometries() {
  const G = THREE;
  return {
    house: [
      part(box(0.7, 0.5, 0.6, 0, 0.25, 0), WALL),
      part(gable(0.84, 0.32, 0.72, 0.5), '', 1),
      part(box(0.14, 0.24, 0.02, 0, 0.12, 0.31), DOOR),
      ...windows(2, 1, 0.38, 0.3, 0, 0.31),
      part(box(0.08, 0.22, 0.08, 0.2, 0.72, -0.12), TRIM),
    ],
    office: [
      part(box(0.85, 0.8, 0.7, 0, 0.4, 0), WALL2),
      part(box(0.93, 0.06, 0.78, 0, 0.83, 0), '', 1),
      part(gable(0.9, 0.2, 0.74, 0.86), '', 1),
      part(box(0.16, 0.26, 0.02, 0, 0.13, 0.36), DOOR),
      ...windows(3, 2, 0.5, 0.4, 0.24, 0.36),
    ],
    hall: [
      part(box(1.0, 1.15, 0.8, 0, 0.575, 0), WALL),
      part(box(1.06, 0.07, 0.86, 0, 1.18, 0), TRIM),
      part(box(0.42, 0.18, 0.32, 0, 1.3, -0.1), WALL2),
      part(box(0.46, 0.13, 0.02, 0, 1.0, 0.41), PAPER),
      part(box(0.44, 0.04, 0.2, 0, 0.34, 0.5), '', 1),
      part(box(0.2, 0.3, 0.02, 0, 0.15, 0.41), DOOR),
      ...windows(4, 3, 0.7, 0.3, 0.26, 0.41).filter((_, i) => i !== 1 && i !== 2),
      part(new G.CylinderGeometry(0.012, 0.012, 0.9, 6).translate(0.62, 0.45, 0.42), DARK),
      part(box(0.16, 0.1, 0.01, 0.7, 0.84, 0.42), '', 1),
    ],
    library: [
      part(box(1.0, 0.08, 0.95, 0, 0.04, 0), STONE),
      part(box(0.9, 0.08, 0.85, 0, 0.12, 0), STONE),
      part(box(0.8, 0.62, 0.55, 0, 0.47, -0.1), STONE),
      ...[-0.33, -0.11, 0.11, 0.33].map((x) => part(new G.CylinderGeometry(0.045, 0.05, 0.62, 10).translate(x, 0.47, 0.3), '#f6f1e6')),
      part(box(0.92, 0.07, 0.82, 0, 0.815, 0), TRIM),
      part(gable(0.96, 0.24, 0.84, 0.85), '', 1),
      part(box(0.18, 0.3, 0.02, 0, 0.31, 0.18), DOOR),
    ],
    observatory: [
      part(new G.CylinderGeometry(0.38, 0.42, 0.62, 14).translate(0, 0.31, 0), WALL),
      part(new G.CylinderGeometry(0.4, 0.4, 0.05, 14).translate(0, 0.64, 0), TRIM),
      part(new G.SphereGeometry(0.39, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.66, 0), '', 1),
      part(box(0.07, 0.3, 0.06, 0, 0.84, 0.31).rotateX(-0.35), DARK),
      part(box(0.16, 0.26, 0.02, 0, 0.13, 0.41), DOOR),
    ],
    workshop: [
      part(box(1.0, 0.5, 0.7, 0, 0.25, 0), WALL2),
      ...[-0.25, 0.25].map((x) => {
        const s = new THREE.Shape([new THREE.Vector2(-0.25, 0), new THREE.Vector2(0.25, 0), new THREE.Vector2(0.25, 0.26)]);
        return part(new THREE.ExtrudeGeometry(s, { depth: 0.72, bevelEnabled: false }).translate(x, 0.5, -0.36), '', 1);
      }),
      part(new G.CylinderGeometry(0.05, 0.06, 0.45, 8).translate(0.36, 0.72, -0.2), DARK),
      part(box(0.32, 0.3, 0.02, -0.18, 0.15, 0.36), DOOR),
      ...windows(2, 1, 0.24, 0.3, 0, 0.36).map((g) => g.translate(0.3, 0, 0)),
    ],
    school: [
      part(box(1.3, 0.6, 0.55, 0, 0.3, 0), WALL),
      part(box(1.36, 0.06, 0.61, 0, 0.63, 0), '', 1),
      part(box(0.3, 0.5, 0.3, 0, 0.88, 0), WALL2),
      part(new G.ConeGeometry(0.27, 0.24, 4).rotateY(Math.PI / 4).translate(0, 1.25, 0), '', 1),
      part(new G.CylinderGeometry(0.08, 0.08, 0.02, 16).rotateX(Math.PI / 2).translate(0, 0.95, 0.16), PAPER),
      part(box(0.2, 0.28, 0.02, 0, 0.14, 0.285), DOOR),
      ...windows(6, 1, 1.1, 0.38, 0, 0.285).filter((_, i) => i !== 2 && i !== 3),
    ],
    shop: [
      part(box(0.75, 0.5, 0.6, 0, 0.25, 0), WALL),
      part(box(0.82, 0.06, 0.66, 0, 0.53, 0), TRIM),
      part(box(0.8, 0.035, 0.26, 0, 0.43, 0.4).rotateX(0.3), '', 1),
      part(box(0.5, 0.22, 0.02, -0.08, 0.2, 0.31), WIN),
      part(box(0.12, 0.26, 0.02, 0.26, 0.13, 0.31), DOOR),
      part(box(0.52, 0.13, 0.02, 0, 0.64, 0.3), PAPER),
    ],
  };
}

/** 마을 건물 도형 — 키는 'v:<종류>' (사례 건물 InstancedMesh가 모양별로 하나씩 만든다) */
export function villageGeometries() {
  return Object.fromEntries(Object.entries(kindGeometries()).map(([k, parts]) => [`v:${k}`, mergeGeometries(parts)]));
}

/** 정점색 × (지붕만) 인스턴스 색 — 벽은 크림색 그대로, 지붕이 업무 색을 띤다 */
export function villageMaterial(grad) {
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, vertexColors: true });
  // onBeforeCompile 시점의 셰이더는 #include가 아직 펼쳐지기 전이라 color_vertex 조각을 통째로 바꾼다
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTint;')
      .replace('#include <color_vertex>', [
        '#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )',
        '  vColor = vec3( 1.0 );',
        '#endif',
        '#ifdef USE_COLOR',
        '  vColor *= color;',
        '#endif',
        '#ifdef USE_INSTANCING_COLOR',
        '  vColor.xyz *= mix( vec3( 1.0 ), instanceColor.xyz, aTint );',
        '#endif',
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'pax3d-village';
  return mat;
}

// ---- 길·광장·문·가로등·나무·사람 -----------------------------------------------------------
function ribbon(line, hw, y) {
  const pos = [];
  const L = line.length;
  const side = (i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(L - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  };
  for (let i = 0; i < L - 1; i++) {
    const [p, q] = [line[i], line[i + 1]];
    const [n1, n2] = [side(i), side(i + 1)];
    const v = (o, n, k) => [o.x + n.x * hw * k, y, -(o.y + n.y * hw * k)];
    pos.push(...v(p, n1, 1), ...v(p, n1, -1), ...v(q, n2, 1), ...v(q, n2, 1), ...v(p, n1, -1), ...v(q, n2, -1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function instanced(parts, count, grad) {
  const mesh = new THREE.InstancedMesh(mergeGeometries(parts), villageMaterial(grad), count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 길 위를 걷는 사람 — 폴리라인을 따라 왕복한다 */
function walkers(plan, rand, size, y, grad) {
  const roads = plan.roads.filter((r) => r.length > 2).map((r) => {
    const acc = [0];
    for (let i = 1; i < r.length; i++) acc.push(acc[i - 1] + Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y));
    return { r, acc, len: acc[acc.length - 1] };
  });
  const total = roads.reduce((s, x) => s + x.len, 0);
  const count = Math.min(140, Math.round(total / (size * 3.2)));
  const k = size * 0.85;
  const mesh = instanced([
    part(new THREE.CylinderGeometry(0.05, 0.06, 0.17, 8).translate(0, 0.14, 0), '', 1),
    part(new THREE.SphereGeometry(0.055, 10, 8).translate(0, 0.29, 0), '#f1d3b5'),
    part(new THREE.SphereGeometry(0.058, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.3, -0.006), '#3b2f27'),
    part(box(0.09, 0.07, 0.05, 0, 0.035, 0), DARK),
  ], Math.max(count, 1), grad);
  mesh.castShadow = false;
  const shirts = ['#d98b4a', '#6f9bc4', '#7fae7a', '#c96f6f', '#d9b54a', '#9a86c4'].map((c) => new THREE.Color(c));
  const people = [];
  for (let i = 0; i < count && roads.length; i++) {
    let pick = rand() * total;
    let road = roads[0];
    for (const x of roads) { if (pick <= x.len) { road = x; break; } pick -= x.len; }
    people.push({ road, u: rand() * road.len, v: (0.35 + rand() * 0.45) * size, dir: rand() < 0.5 ? 1 : -1, lane: (rand() - 0.5) * plan.halfWidth * 1.2 });
    mesh.setColorAt(i, shirts[i % shirts.length]);
  }
  mesh.count = people.length;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3(k, k, k);
  let last = 0;
  function update(t) {
    const dt = Math.min(0.1, t - last);
    last = t;
    people.forEach((p, i) => {
      p.u += p.v * dt * p.dir;
      if (p.u < 0 || p.u > p.road.len) { p.dir *= -1; p.u = Math.max(0, Math.min(p.road.len, p.u)); }
      const { r, acc } = p.road;
      let j = 1;
      while (j < acc.length - 1 && acc[j] < p.u) j++;
      const a = r[j - 1];
      const b = r[j];
      const f = (p.u - acc[j - 1]) / ((acc[j] - acc[j - 1]) || 1);
      const dx = (b.x - a.x) * p.dir;
      const dy = (b.y - a.y) * p.dir;
      const len = Math.hypot(dx, dy) || 1;
      const x = a.x + (b.x - a.x) * f + (-dy / len) * p.lane;
      const yy = a.y + (b.y - a.y) * f + (dx / len) * p.lane;
      q.setFromAxisAngle(up, Math.atan2(dx, -dy));
      const bob = Math.abs(Math.sin(t * 9 + i)) * k * 0.04;
      m4.compose(new THREE.Vector3(x, y + bob, -yy), q, scale);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, update };
}

/** 빈 땅에 나무 — 길·건물·광장을 피한다 */
function treeSpots(plan, inside, center, radius, rand, size) {
  const spots = [];
  const busy = [...plan.slots.values()];
  const segs = plan.roads.flatMap((r) => r.slice(1).map((p, i) => [r[i], p]));
  const segDist = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1e-12)));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  const want = Math.min(900, Math.round((radius * radius) / (size * size) * 0.7));
  for (let t = 0; t < want * 6 && spots.length < want; t++) {
    const a = rand() * Math.PI * 2;
    const p = { x: center.x + Math.cos(a) * Math.sqrt(rand()) * radius * 1.05, y: center.y + Math.sin(a) * Math.sqrt(rand()) * radius * 1.05 };
    if (!inside(p) || Math.hypot(p.x - center.x, p.y - center.y) < plan.plaza.r + size) continue;
    if (busy.some((b) => Math.hypot(p.x - b.x, p.y - b.y) < size * 0.85)) continue;
    if (segs.some(([s0, s1]) => segDist(p, s0, s1) < plan.halfWidth + size * 0.25)) continue;
    if (spots.some((s) => Math.hypot(p.x - s.x, p.y - s.y) < size * 0.45)) continue;
    spots.push({ x: p.x, y: p.y, s: 0.75 + rand() * 0.6 });
  }
  return spots;
}

/**
 * 섬 하나의 마을 장식.
 * @param o {plan, inside, center:{x,y}, radius, name, grad, y(지면 높이), rand}
 * @returns {{group: THREE.Group, update(t:number, d:number): void}}
 */
export function villageDecor({ plan, inside, center, radius, name, grad, y, rand }) {
  const size = VILLAGE_SIZE;
  const group = new THREE.Group();
  const roadMat = toon('#f3e4c0', grad);
  for (const line of plan.roads) {
    const m = new THREE.Mesh(ribbon(line, plan.halfWidth, y + 0.0015), roadMat);
    m.receiveShadow = true;
    group.add(m);
  }
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(plan.plaza.r, 28).rotateX(-Math.PI / 2), toon('#efdcb4', grad));
  plaza.position.set(plan.plaza.x, y + 0.002, -plan.plaza.y);
  plaza.receiveShadow = true;
  group.add(plaza);
  // 광장 분수와 둘레 가로등
  const fountain = instanced([
    part(new THREE.CylinderGeometry(0.5, 0.55, 0.12, 20).translate(0, 0.06, 0), STONE),
    part(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 20).translate(0, 0.12, 0), '#8cc3cf'),
    part(new THREE.CylinderGeometry(0.07, 0.09, 0.35, 10).translate(0, 0.25, 0), STONE),
  ], 1, grad);
  fountain.setMatrixAt(0, new THREE.Matrix4().makeScale(size * 1.4, size * 1.4, size * 1.4).setPosition(plan.plaza.x, y, -plan.plaza.y));
  group.add(fountain);
  const lampN = 8;
  const lamps = instanced([
    part(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 6).translate(0, 0.35, 0), DARK),
    part(new THREE.SphereGeometry(0.06, 10, 8).translate(0, 0.72, 0), '#fff1c2'),
  ], lampN, grad);
  for (let i = 0; i < lampN; i++) {
    const a = (Math.PI * 2 * (i + 0.5)) / lampN;
    lamps.setMatrixAt(i, new THREE.Matrix4().makeScale(size, size, size)
      .setPosition(plan.plaza.x + Math.cos(a) * plan.plaza.r * 0.92, y, -(plan.plaza.y + Math.sin(a) * plan.plaza.r * 0.92)));
  }
  group.add(lamps);
  // 마을 문 — 바닷가 쪽 방사 도로 끝
  const gateK = size * 1.6;
  const gate = instanced([
    part(box(0.07, 0.62, 0.07, -0.33, 0.31, 0), '#c97a5d'),
    part(box(0.07, 0.62, 0.07, 0.33, 0.31, 0), '#c97a5d'),
    part(box(0.86, 0.08, 0.1, 0, 0.62, 0), '#c97a5d'),
    part(box(0.74, 0.05, 0.07, 0, 0.5, 0), '#b8694d'),
  ], 1, grad);
  gate.setMatrixAt(0, new THREE.Matrix4().compose(
    new THREE.Vector3(plan.gate.x, y, -plan.gate.y),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), plan.gate.rot),
    new THREE.Vector3(gateK, gateK, gateK)));
  group.add(gate);
  // 문 위 들보에 거는 마을 이름 — 문 폭만 하게(크게 띄우면 가까이서 화면을 덮는다)
  const sign = signSprite([name.replace(/섬$/, '마을')], { scale: size * 0.4, accent: '#2b6a4b' });
  sign.position.set(plan.gate.x, y + gateK * 0.66, -plan.gate.y);
  group.add(sign);
  // 나무 — 줄기는 갈색, 수관만 인스턴스 색
  const spots = treeSpots(plan, inside, center, radius, rand, size);
  const tree = instanced([
    part(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 6).translate(0, 0.11, 0), DOOR),
    part(new THREE.IcosahedronGeometry(0.2, 0).translate(0, 0.36, 0), '', 1),
  ], Math.max(spots.length, 1), grad);
  const greens = ['#5f8f55', '#739f5b', '#4f7f52', '#86ad62'].map((c) => new THREE.Color(c));
  spots.forEach((s, i) => {
    const k = size * s.s;
    tree.setMatrixAt(i, new THREE.Matrix4().makeScale(k, k * (0.9 + rand() * 0.3), k).setPosition(s.x, y, -s.y));
    tree.setColorAt(i, greens[i % greens.length]);
  });
  tree.count = spots.length;
  group.add(tree);
  const folk = walkers(plan, rand, size, y + 0.002, grad);
  group.add(folk.mesh);
  const labels = nameSigns(group);
  return {
    group,
    /** 이름 간판을 달 건물들 — {id, pos(Vector3, 지붕 위), title, accent} */
    setLabels(list) { labels.set(list); },
    update(t, d, cam) {
      // 사람은 가까이서만 보이고 움직인다 — 멀리서는 점보다 작다
      folk.mesh.visible = d < 4.5;
      if (folk.mesh.visible) folk.update(t);
      sign.visible = d < 6;
      labels.update(cam, d);
    },
  };
}

const shortTitle = (t) => {
  const head = String(t || '').split(/\s+[—–-]\s+/)[0].trim();
  return head.length > 16 ? `${head.slice(0, 15)}…` : head;
};

/** 가까운 건물에만 이름 간판 — 캔버스 텍스처라 미리 다 만들지 않고 다가가면 만들고 멀어지면 버린다 */
function nameSigns(group) {
  let items = [];
  const live = new Map();
  const drop = (id) => {
    const s = live.get(id);
    group.remove(s);
    s.material.map.dispose();
    s.material.dispose();
    live.delete(id);
  };
  return {
    set(list) { items = list; },
    update(cam, d) {
      const near = d > 2.5 ? [] : items
        .map((it) => [it, cam.distanceTo(it.pos)])
        .filter(([, ds]) => ds < LABEL_NEAR)
        .sort((a, b) => a[1] - b[1])
        .slice(0, LABEL_MAX);
      const keep = new Set(near.map(([it]) => it.id));
      for (const id of [...live.keys()]) if (!keep.has(id)) drop(id);
      for (const [it] of near) {
        if (live.has(it.id)) continue;
        const s = signSprite([shortTitle(it.title)], { scale: VILLAGE_SIZE * 0.42, accent: it.accent });
        s.position.copy(it.pos);
        group.add(s);
        live.set(it.id, s);
      }
    },
  };
}
