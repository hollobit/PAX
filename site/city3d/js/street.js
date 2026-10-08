// 거리 소품 — 가로등·가로수·차량을 OSM 도로선을 따라 절차적으로 놓는다(자료를 더 받지 않는다).
// 가까이 확대했을 때(SHOW_DIST 안)만, 시점 둘레 RADIUS 안에서만 만든다 — 도시 전체에 깔면 수백만 개가 된다.
// 독립 페이지(world.js)와 3D PAX(pax3d-city.js)가 같은 모듈을 쓴다. 좌표는 도시 로컬 미터(frame.X/Z/elev).
// 밤(uNight)에는 등·전조등·후미등이 켜지고 가로등 아래 바닥에 빛 웅덩이가 생긴다.
import * as THREE from 'three';
import { ROAD_STYLE } from './layers.js?v=422c9e4c';

const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
export const STREET = {
  SHOW_DIST: 1800,               // 카메라 거리(m)가 이보다 멀면 숨긴다
  RADIUS: MOBILE ? 380 : 700,    // 시점 둘레 배치 반경(m)
  REBUILD: 120,                  // 시점이 이만큼 움직이면 다시 놓는다
  CELL: 500,                     // 도로 색인 칸(m)
  MAX: MOBILE ? { light: 500, tree: 1200, car: 400 } : { light: 1800, tree: 5000, car: 1600 },
};
const LIGHT_CLASSES = new Set([1, 2, 3, 4, 5]);
const TREE_CLASSES = new Set([3, 4, 5, 6]);
const CAR_PER_100M = { 1: 7, 2: 6, 3: 5, 4: 3.5, 5: 2, 6: 0.6 }; // 도심 낮 교통 정도(양방향 합)
const LIGHT_EVERY = 30;
const TREE_EVERY = 11;
const CAR_SPEED = { 1: 22, 2: 16, 3: 12, 4: 10, 5: 8, 6: 6 }; // m/s
const CAR_COLORS = ['#f2f2f2', '#1d1f22', '#8c939b', '#c9ccd1', '#2b3f66', '#7a1f24', '#e8e2d3', '#3c4a3a'];
const TREE_GREENS = ['#4f7f3c', '#5d8c45', '#3f6f36', '#6a9150', '#557b40'];

/** 결정적 난수(위치 기반) — 시점을 옮겨도 같은 자리에는 같은 나무·차 색이 온다 */
function rnd(a, b, c = 0) {
  const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** 도로선을 CELL 칸으로 색인 — 도시마다 한 번(같은 roads 배열이면 다시 쓰지 않는다) */
const gridCache = new WeakMap();
function roadGrid(roads) {
  let g = gridCache.get(roads);
  if (g) return g;
  g = new Map();
  roads.forEach((l, li) => {
    if (l.cls > 7 || l.flags & 1) return; // 철도·다리 제외
    const seen = new Set();
    for (let k = 0; k < l.pts.length; k += 2) {
      const key = `${Math.floor(l.pts[k] / STREET.CELL)},${Math.floor(l.pts[k + 1] / STREET.CELL)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(li);
    }
  });
  gridCache.set(roads, g);
  return g;
}

function linesNear(roads, x, n, r) {
  const g = roadGrid(roads);
  const out = new Set();
  const c0 = Math.floor((x - r) / STREET.CELL);
  const c1 = Math.floor((x + r) / STREET.CELL);
  const r0 = Math.floor((n - r) / STREET.CELL);
  const r1 = Math.floor((n + r) / STREET.CELL);
  for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) for (const li of g.get(`${i},${j}`) || []) out.add(li);
  return [...out].map((li) => roads[li]);
}

/** 선을 따라 every 간격으로 (x, n, 진행 방향 단위벡터) — 반경 밖 점은 버린다 */
function samplesAlong(pts, every, cx, cn, r, phase) {
  const out = [];
  let carry = phase * every;
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const ax = pts[k], an = pts[k + 1], bx = pts[k + 2], bn = pts[k + 3];
    const len = Math.hypot(bx - ax, bn - an);
    if (len < 0.5) continue;
    const ux = (bx - ax) / len, un = (bn - an) / len;
    let s = carry;
    for (; s < len; s += every) {
      const x = ax + ux * s, n = an + un * s;
      if ((x - cx) ** 2 + (n - cn) ** 2 <= r * r) out.push([x, n, ux, un]);
    }
    carry = s - len; // 다음 구간 첫 표본까지 남은 거리
  }
  return out;
}

/** 반경 안 도로 면(선분 + 반폭) 격자 — 소품이 다른 도로(중앙분리 쌍방향 도로의 맞은편 차로 등) 위에 서지 않게 */
function roadSurface(lines) {
  const C = 30;
  const grid = new Map();
  for (const l of lines) {
    const st = ROAD_STYLE[l.cls];
    if (!st || l.cls > 7) continue;
    const half = st.w / 2;
    for (let k = 0; k + 3 < l.pts.length; k += 2) {
      const seg = [l.pts[k], l.pts[k + 1], l.pts[k + 2], l.pts[k + 3], half];
      const x0 = Math.floor((Math.min(seg[0], seg[2]) - half) / C), x1 = Math.floor((Math.max(seg[0], seg[2]) + half) / C);
      const n0 = Math.floor((Math.min(seg[1], seg[3]) - half) / C), n1 = Math.floor((Math.max(seg[1], seg[3]) + half) / C);
      for (let i = x0; i <= x1; i++) for (let j = n0; j <= n1; j++) {
        const key = i * 100003 + j;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(seg);
      }
    }
  }
  return (x, n, margin) => {
    for (const [ax, an, bx, bn, half] of grid.get(Math.floor(x / C) * 100003 + Math.floor(n / C)) || []) {
      const dx = bx - ax, dn = bn - an;
      const L2 = dx * dx + dn * dn || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (n - an) * dn) / L2));
      if (Math.hypot(x - ax - dx * t, n - an - dn * t) < half + margin) return true;
    }
    return false;
  };
}

function lampTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,224,170,0.9)');
  grad.addColorStop(0.45, 'rgba(255,205,140,0.35)');
  grad.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function instanced(geo, mat, n, name) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.count = 0;
  m.frustumCulled = false;
  m.name = name;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}

/**
 * @param {{uNight: {value: number}}} uniforms 건물과 같은 밤 세기
 * @returns {{group: THREE.Group, update: Function, counts: Function}}
 */
export function createStreetLayer(uniforms) {
  const { MAX } = STREET;
  const group = new THREE.Group();
  group.name = 'street';
  group.visible = false;

  const poleMat = new THREE.MeshLambertMaterial({ color: '#5b6068' });
  const lampMat = new THREE.MeshLambertMaterial({ color: '#d9dde2', emissive: '#ffd9a0', emissiveIntensity: 0 });
  const poolMat = new THREE.MeshBasicMaterial({ map: lampTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#6b5843' });
  const crownMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const carMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const headMat = new THREE.MeshBasicMaterial({ color: '#fff6dc', transparent: true, opacity: 0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, opacity: 0 });

  const poles = instanced(new THREE.CylinderGeometry(0.11, 0.14, 8, 6).translate(0, 4, 0), poleMat, MAX.light, 'street-poles');
  const lamps = instanced(new THREE.BoxGeometry(1.6, 0.25, 0.5).translate(0.6, 8, 0), lampMat, MAX.light, 'street-lamps');
  const pools = instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, MAX.light, 'street-pools');
  const trunks = instanced(new THREE.CylinderGeometry(0.16, 0.22, 3, 5).translate(0, 1.5, 0), trunkMat, MAX.tree, 'street-trunks');
  const crowns = instanced(new THREE.IcosahedronGeometry(1, 0).scale(1, 1.15, 1).translate(0, 4.3, 0), crownMat, MAX.tree, 'street-crowns');
  const cars = instanced(new THREE.BoxGeometry(4.4, 1.5, 1.85).translate(0, 0.75, 0), carMat, MAX.car, 'street-cars');
  const heads = instanced(new THREE.BoxGeometry(0.15, 0.25, 1.5).translate(2.25, 0.75, 0), headMat, MAX.car, 'street-heads');
  const tails = instanced(new THREE.BoxGeometry(0.15, 0.25, 1.5).translate(-2.25, 0.8, 0), tailMat, MAX.car, 'street-tails');
  crowns.castShadow = true;
  cars.castShadow = true;
  poles.castShadow = true;
  group.add(poles, lamps, pools, trunks, crowns, cars, heads, tails);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();

  let last = null;          // 마지막으로 놓은 중심 [x, n, frame, vscale]
  let traffic = [];         // [{path: [[x, n, s누적]…], len, s, v, lane, cls}]
  let lastT = performance.now();

  function ground(frame, x, n, cls, vscale) {
    return Math.max(frame.elev(x, n), 0) * vscale + (ROAD_STYLE[cls]?.lift ?? 0.5);
  }

  function place(frame, roads, cx, cn, vscale) {
    const R = STREET.RADIUS;
    let nl = 0, nt = 0;
    traffic = [];
    const near = linesNear(roads, cx, cn, R);
    const onRoad = roadSurface(near);
    for (const l of near) {
      const st = ROAD_STYLE[l.cls];
      if (!st) continue;
      const half = st.w / 2;
      // 가로등 — 양쪽, 반 칸 엇갈림
      if (LIGHT_CLASSES.has(l.cls)) {
        for (const side of [-1, 1]) {
          for (const [x, n, ux, un] of samplesAlong(l.pts, LIGHT_EVERY, cx, cn, R, side > 0 ? 0 : 0.5)) {
            if (nl >= MAX.light) break;
            const px = x - un * (half + 1.2) * side, pn = n + ux * (half + 1.2) * side;
            if (onRoad(px, pn, 0.3)) continue;
            const y = ground(frame, px, pn, l.cls, vscale) - 0.3;
            const yaw = Math.atan2(-side * ux, side * un); // 등 팔(+x)이 도로 쪽을 보게 — 회전 규칙은 건물과 같다(atan2(북, 동))
            q.setFromAxisAngle(up, yaw);
            m4.compose(pos.set(frame.X(px), y, frame.Z(pn)), q, scl.set(1, 1, 1));
            poles.setMatrixAt(nl, m4);
            lamps.setMatrixAt(nl, m4);
            const rx = x - un * (half - 0.6) * side, rn = n + ux * (half - 0.6) * side;
            m4.compose(pos.set(frame.X(rx), ground(frame, rx, rn, l.cls, vscale) + 0.35, frame.Z(rn)), q.identity(), scl.set(16, 1, 16));
            pools.setMatrixAt(nl, m4);
            nl++;
          }
        }
      }
      // 가로수 — 보도 바깥쪽, 4그루 중 1그루쯤은 비운다(교차로·건물 입구)
      if (TREE_CLASSES.has(l.cls)) {
        for (const side of [-1, 1]) {
          for (const [x, n, ux, un] of samplesAlong(l.pts, TREE_EVERY, cx, cn, R, side > 0 ? 0.25 : 0.75)) {
            if (nt >= MAX.tree) break;
            if (rnd(x, n, 1) < 0.25) continue;
            const off = half + (l.cls >= 6 ? 2.2 : 3.4);
            const px = x - un * off * side, pn = n + ux * off * side;
            if (onRoad(px, pn, 1.2)) continue;
            const y = ground(frame, px, pn, l.cls, vscale) - 0.4;
            const s = 0.75 + rnd(x, n, 2) * 0.6;
            q.setFromAxisAngle(up, rnd(x, n, 3) * Math.PI * 2);
            m4.compose(pos.set(frame.X(px), y, frame.Z(pn)), q, scl.set(s, s, s));
            trunks.setMatrixAt(nt, m4);
            m4.compose(pos.set(frame.X(px), y, frame.Z(pn)), q, scl.set(s * 2.1, s * 1.9, s * 2.1));
            crowns.setMatrixAt(nt, m4);
            crowns.setColorAt(nt, col.set(TREE_GREENS[Math.floor(rnd(x, n, 4) * TREE_GREENS.length)]));
            nt++;
          }
        }
      }
      // 차량 — 반경 안 구간을 한 경로로 이어 양방향 차로에 나눠 싣는다
      const dens = CAR_PER_100M[l.cls];
      if (dens) {
        const path = [];
        let acc = 0;
        for (let k = 0; k < l.pts.length; k += 2) {
          const x = l.pts[k], n = l.pts[k + 1];
          if ((x - cx) ** 2 + (n - cn) ** 2 > R * R) { if (path.length > 1) break; path.length = 0; acc = 0; continue; }
          if (path.length) acc += Math.hypot(x - path[path.length - 1][0], n - path[path.length - 1][1]);
          path.push([x, n, acc]);
        }
        if (path.length > 1 && acc > 20) {
          const count = Math.floor((acc / 100) * dens + rnd(l.pts[0], l.pts[1], 5));
          for (let i = 0; i < count && traffic.length < MAX.car; i++) {
            const dir = i % 2 ? 1 : -1;
            traffic.push({ path, len: acc, s: rnd(l.pts[0], i, 6) * acc, v: CAR_SPEED[l.cls] * (0.7 + rnd(i, l.pts[1], 7) * 0.5) * dir,
              lane: -Math.min(half * 0.5, 3.4) * dir, // 우측통행 — 진행 방향 오른쪽 차로
              cls: l.cls, color: CAR_COLORS[Math.floor(rnd(i, l.pts[0], 8) * CAR_COLORS.length)] });
          }
        }
      }
    }
    poles.count = lamps.count = pools.count = nl;
    trunks.count = crowns.count = nt;
    for (const m of [poles, lamps, pools, trunks, crowns]) m.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    traffic.forEach((c, i) => cars.setColorAt(i, col.set(c.color)));
    cars.count = heads.count = tails.count = traffic.length;
    if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
  }

  function moveCars(frame, vscale, dt) {
    for (let i = 0; i < traffic.length; i++) {
      const c = traffic[i];
      c.s = ((c.s + c.v * dt) % c.len + c.len) % c.len;
      const p = c.path;
      let k = 1;
      while (k < p.length - 1 && p[k][2] < c.s) k++;
      const a = p[k - 1], b = p[k];
      const segLen = b[2] - a[2] || 1;
      const t = (c.s - a[2]) / segLen;
      const ux = (b[0] - a[0]) / segLen, un = (b[1] - a[1]) / segLen;
      const x = a[0] + (b[0] - a[0]) * t - un * c.lane;
      const n = a[1] + (b[1] - a[1]) * t + ux * c.lane;
      const fwd = c.v >= 0 ? 1 : -1;
      q.setFromAxisAngle(up, Math.atan2(un * fwd, ux * fwd));
      m4.compose(pos.set(frame.X(x), ground(frame, x, n, c.cls, vscale) + 0.05, frame.Z(n)), q, scl.set(1, 1, 1));
      cars.setMatrixAt(i, m4);
      heads.setMatrixAt(i, m4);
      tails.setMatrixAt(i, m4);
    }
    for (const m of [cars, heads, tails]) m.instanceMatrix.needsUpdate = true;
  }

  return {
    group,
    /**
     * 매 프레임. frame·roads가 없거나 멀면 숨긴다.
     * @param frame 도시 좌표 함수(X·Z·elev) @param roads decodeLines 결과 @param cx,cn 시점 목표(로컬 m) @param distM 카메라 거리(m)
     */
    update(frame, roads, cx, cn, distM, vscale = 1) {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;
      const show = Boolean(frame && roads) && distM < STREET.SHOW_DIST;
      group.visible = show;
      if (!show) return;
      if (!last || last[2] !== frame || last[3] !== vscale || Math.hypot(cx - last[0], cn - last[1]) > STREET.REBUILD) {
        place(frame, roads, cx, cn, vscale);
        last = [cx, cn, frame, vscale];
      }
      moveCars(frame, vscale, dt);
      const night = uniforms.uNight.value;
      lampMat.emissiveIntensity = night * 1.6;
      poolMat.opacity = night * 0.55;
      headMat.opacity = Math.min(1, night * 1.2);
      tailMat.opacity = Math.min(1, night * 1.2);
    },
    /** 측정용 — 지금 놓인 개수 */
    counts() { return { lights: poles.count, trees: trunks.count, cars: cars.count, visible: group.visible }; },
    reset() { last = null; },
  };
}
