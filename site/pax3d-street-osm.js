// 3D PAX 실제 거리 — OpenStreetMap 건물·도로·도로명·정류장·상호 위에 한국 거리 소품을 얹는다.
// 사례는 기관 주소(또는 시군구 중심)에서 가까운 실제 건물부터 한 채씩 간판을 단다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from './pax3d-look.js?v=a66df86b';
import {
  shopSign, roadNameSign, utilityPole, wires, ginkgo, streetLamp, crosswalk, busStop, waterTank, caseBeacon,
  windowedToon, BUILDING_TONES, FILLER_SHOPS,
} from './pax3d-street-props.js?v=d69f2782';

const ROAD_W = { motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 8, minor: 6, service: 4, track: 3, path: 2 };
const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service']);
const BIG = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const SHOP_POI = new Set(['shop', 'cafe', 'restaurant', 'fast_food', 'bar', 'beer', 'bakery', 'pharmacy', 'hospital', 'bank',
  'clothing_store', 'grocery', 'hairdresser', 'optician', 'laundry', 'mobile_phone', 'convenience', 'ice_cream', 'books',
  'stationery', 'hardware', 'florist', 'dentist', 'doctors', 'post', 'library', 'town_hall', 'school', 'college', 'office']);

// ---- 평면 도우미 ([x, z] 배열) --------------------------------------------------------
const area = (r) => Math.abs(r.reduce((s, [x1, z1], i) => { const [x2, z2] = r[(i + 1) % r.length]; return s + x1 * z2 - x2 * z1; }, 0)) / 2;
const centroid = (r) => r.reduce((a, [x, z]) => [a[0] + x / r.length, a[1] + z / r.length], [0, 0]);
function inRing([x, z], r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segDist([px, pz], [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

function ribbon(line, width, y) {
  const pos = [];
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (-(bz - az) / len) * (width / 2);
    const nz = ((bx - ax) / len) * (width / 2);
    pos.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz,
      ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** 선을 따라 간격마다 (위치, 방향) — 소품 배치용 */
function* along(line, step, startAt = step / 2) {
  let carry = startAt;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dir = [(bx - ax) / (len || 1), (bz - az) / (len || 1)];
    while (carry <= len) {
      yield { p: [ax + dir[0] * carry, az + dir[1] * carry], dir };
      carry += step;
    }
    carry -= len;
  }
}

function buildingGeometry(ring, h, tone) {
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  const col = new THREE.Color(tone);
  const roof = col.clone().multiplyScalar(0.82);
  const n = geo.attributes.normal;
  const colors = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) (n.getY(i) > 0.5 ? roof : col).toArray(colors, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.deleteAttribute('uv');
  return geo;
}

/** 건물 고리에서 도로 쪽을 향한 벽 — [중점, 바깥 법선, 벽 길이] */
function facade(ring, roadSegs) {
  const [cx, cz] = centroid(ring);
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 2.5) continue;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let nx = -(b[1] - a[1]) / len;
    let nz = (b[0] - a[0]) / len;
    if ((mid[0] - cx) * nx + (mid[1] - cz) * nz < 0) { nx = -nx; nz = -nz; }
    let d = Infinity;
    for (const [p, q] of roadSegs) d = Math.min(d, segDist(mid, p, q));
    const score = d - Math.min(len, 12) * 0.3;
    if (!best || score < best.score) best = { mid, n: [nx, nz], len, score };
  }
  return best;
}

/**
 * @param data loadStreetData 결과
 * @param opts {cases, grad, rng, address:{road, num}|null, colorOf(c)}
 * @returns {{group, colliders, shops, spawn, attribution}}
 */
export function buildOsmStreet(data, { cases, grad, rng, address, colorOf, shortTitle }) {
  const group = new THREE.Group();
  const rand = rng('osm-street');
  const R = 300;

  const ground = new THREE.Mesh(new THREE.CircleGeometry(R + 120, 48).rotateX(-Math.PI / 2), toon('#b9bab6', grad));
  ground.receiveShadow = true;
  group.add(ground);

  // ---- 도로 --------------------------------------------------------------------
  const asphalt = [];
  const paths = [];
  const lines = [];
  const roadSegs = [];
  for (const r of data.roads) {
    if (r.brunnel === 'tunnel' || !ROAD_W[r.cls]) continue;
    if (r.area) {
      if (r.line.length >= 4) {
        const shape = new THREE.Shape(r.line.map(([x, z]) => new THREE.Vector2(x, -z)));
        paths.push(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, 0.02, 0));
      }
      continue;
    }
    const w = ROAD_W[r.cls];
    (CAR.has(r.cls) ? asphalt : paths).push(ribbon(r.line, w, CAR.has(r.cls) ? 0.04 : 0.025));
    if (BIG.has(r.cls)) lines.push(ribbon(r.line, 0.35, 0.05));
    if (CAR.has(r.cls)) for (let i = 0; i < r.line.length - 1; i++) roadSegs.push([r.line[i], r.line[i + 1]]);
  }
  const addMerged = (geos, color) => {
    if (!geos.length) return;
    // 도로 띠(uv 없음)와 광장 면(uv 있음)을 한데 합치려면 속성을 맞춰야 한다
    const uniform = geos.map((g) => {
      const ng = g.index ? g.toNonIndexed() : g;
      if (ng.attributes.uv) ng.deleteAttribute('uv');
      return ng;
    });
    const m = new THREE.Mesh(mergeGeometries(uniform), toon(color, grad));
    m.receiveShadow = true;
    group.add(m);
  };
  addMerged(asphalt, '#6f7278');
  addMerged(paths, '#cdbfa3');
  addMerged(lines, '#e8c33a'); // 중앙선

  // ---- 건물 --------------------------------------------------------------------
  const colliders = [];
  const blds = [];
  for (const b of data.buildings) {
    if (b.h0 > 0) continue;
    const a = area(b.ring);
    if (a < 8) continue;
    const c = centroid(b.ring);
    blds.push({ ...b, a, c, d: Math.hypot(c[0], c[1]), h: Math.max(3.2, Math.min(b.h, 140)) });
  }
  blds.sort((x, y) => x.d - y.d);
  const geos = [];
  for (const b of blds) {
    geos.push(buildingGeometry(b.ring, b.h, BUILDING_TONES[Math.floor(rand() * BUILDING_TONES.length)]));
    colliders.push(b.ring);
    if (b.h <= 16 && b.a > 60 && b.a < 700 && rand() < 0.35) {
      const t = waterTank(grad);
      t.position.set(b.c[0], b.h, b.c[1]);
      group.add(t);
    }
  }
  if (geos.length) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), windowedToon(grad, { vertexColors: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const blocked = (p) => colliders.some((r) => inRing(p, r));

  // ---- 사례 가게 ---------------------------------------------------------------
  const shops = [];
  const used = new Set();
  const candidates = blds.filter((b) => b.a >= 30 && b.d < R);
  cases.forEach((c, i) => {
    const b = candidates[i];
    let spot;
    if (b) {
      used.add(b);
      const f = facade(b.ring, roadSegs);
      if (!f) return;
      spot = { mid: f.mid, n: f.n, w: Math.max(2.4, Math.min(f.len * 0.75, 7)), roof: b.h, top: b.c };
    } else {
      // 건물이 모자라면 길가 노점으로 — 가운데서 가까운 도로 위 점
      const seg = roadSegs[(i * 7) % Math.max(1, roadSegs.length)];
      if (!seg) return;
      const [p, q] = seg;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const n = [-(q[1] - p[1]) / len, (q[0] - p[0]) / len];
      const mid = [(p[0] + q[0]) / 2 + n[0] * 5, (p[1] + q[1]) / 2 + n[1] * 5];
      const stall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 1.8).translate(0, 1.1, 0), toon('#e9e2d0', grad));
      stall.position.set(mid[0], 0, mid[1]);
      stall.rotation.y = Math.atan2(n[0], n[1]);
      group.add(stall);
      // 간판은 도로 쪽 면에 — 법선은 도로를 향한다
      spot = { mid: [mid[0] - n[0] * 0.95, mid[1] - n[1] * 0.95], n: [-n[0], -n[1]], w: 2.6, roof: 2.2, top: mid };
    }
    const sign = shopSign(shortTitle(c), c.task_category || '', { bg: colorOf(c), w: spot.w, h: 1.0 });
    const y = Math.min(3.3, Math.max(1.8, spot.roof - 0.8));
    sign.position.set(spot.mid[0] + spot.n[0] * 0.08, y, spot.mid[1] + spot.n[1] * 0.08);
    sign.rotation.y = Math.atan2(spot.n[0], spot.n[1]);
    sign.userData.caseId = c.id;
    group.add(sign);
    const beacon = caseBeacon(grad);
    beacon.position.set(spot.top[0], spot.roof + 3, spot.top[1]);
    beacon.userData.spin = true;
    group.add(beacon);
    if (i === 0 && address) {
      const plate = roadNameSign(address.road, address.num ? `${address.num}` : '', grad);
      plate.position.set(spot.mid[0] + spot.n[0] * 2.2 + spot.n[1] * (spot.w / 2 + 1), 0, spot.mid[1] + spot.n[1] * 2.2 - spot.n[0] * (spot.w / 2 + 1));
      plate.rotation.y = Math.atan2(spot.n[0], spot.n[1]);
      group.add(plate);
    }
    shops.push({
      caseId: c.id, sign, beacon,
      stand: new THREE.Vector3(spot.mid[0] + spot.n[0] * 6, 1.6, spot.mid[1] + spot.n[1] * 6),
      look: new THREE.Vector3(spot.mid[0], y, spot.mid[1]),
    });
  });

  // ---- 실제 상호 간판 (OSM POI) — 사례가 아닌 건물에 ---------------------------------
  let posted = 0;
  for (const poi of data.pois) {
    if (posted >= 70 || !SHOP_POI.has(poi.cls)) continue;
    let best = null;
    for (const b of blds) {
      if (used.has(b)) continue;
      const d = Math.hypot(b.c[0] - poi.at[0], b.c[1] - poi.at[1]);
      if (d < 30 && (!best || d < best.d)) best = { b, d };
    }
    if (!best) continue;
    used.add(best.b);
    const f = facade(best.b.ring, roadSegs);
    if (!f) continue;
    const [, color] = FILLER_SHOPS[Math.floor(rand() * FILLER_SHOPS.length)];
    const sign = shopSign(poi.name.length > 16 ? `${poi.name.slice(0, 15)}…` : poi.name, '', { bg: color, w: Math.max(2, Math.min(f.len * 0.7, 6)), h: 0.8 });
    sign.position.set(f.mid[0] + f.n[0] * 0.08, Math.min(3.1, best.b.h - 0.6), f.mid[1] + f.n[1] * 0.08);
    sign.rotation.y = Math.atan2(f.n[0], f.n[1]);
    group.add(sign);
    posted++;
  }

  // ---- 정류장·도로명판 -------------------------------------------------------------
  const nearestRoad = (p) => {
    let best = null;
    for (const [a, b] of roadSegs) {
      const d = segDist(p, a, b);
      if (!best || d < best.d) best = { d, a, b };
    }
    return best;
  };
  const stops = new Set();
  for (const poi of data.pois) {
    if (poi.sub !== 'bus_stop' || stops.has(poi.name) || stops.size >= 4) continue;
    const r = nearestRoad(poi.at);
    if (!r || r.d > 25) continue;
    stops.add(poi.name);
    const s = busStop(poi.name, grad);
    s.position.set(poi.at[0], 0, poi.at[1]);
    s.rotation.y = Math.atan2(r.b[0] - r.a[0], r.b[1] - r.a[1]) + Math.PI / 2;
    group.add(s);
  }
  const signed = new Set();
  for (const nm of data.names) {
    if (signed.has(nm.name) || signed.size >= 12) continue;
    const pt = nm.line.reduce((a, p) => (Math.hypot(...p) < Math.hypot(...a) ? p : a), nm.line[0]);
    const w = ROAD_W[nm.cls] || 6;
    const k = Math.max(0, nm.line.indexOf(pt));
    const q = nm.line[Math.min(k + 1, nm.line.length - 1)];
    const p0 = nm.line[Math.max(k - 1, 0)];
    const len = Math.hypot(q[0] - p0[0], q[1] - p0[1]) || 1;
    const n = [-(q[1] - p0[1]) / len, (q[0] - p0[0]) / len];
    const at = [pt[0] + n[0] * (w / 2 + 1.4), pt[1] + n[1] * (w / 2 + 1.4)];
    if (blocked(at)) continue;
    signed.add(nm.name);
    const s = roadNameSign(nm.name, '', grad);
    s.position.set(at[0], 0, at[1]);
    s.rotation.y = Math.atan2(n[0], n[1]);
    group.add(s);
  }

  // ---- 전봇대·전선, 은행나무, 가로등, 횡단보도 --------------------------------------
  const roadsNear = data.roads.filter((r) => !r.area && CAR.has(r.cls) && r.brunnel !== 'tunnel');
  // 전봇대는 골목(소로·이면도로)에만 — 큰길은 지중화된 곳이 많고, 모든 길에 세우면 전선이 엉킨다
  const poleSpots = [];
  roadsNear.forEach((r, ri) => {
    if (BIG.has(r.cls)) return;
    const w = ROAD_W[r.cls];
    for (const { p, dir } of along(r.line, 30)) {
      const at = [p[0] - dir[1] * (w / 2 + 0.8), p[1] + dir[0] * (w / 2 + 0.8)];
      if (Math.hypot(...at) <= R * 0.8 && !blocked(at)) poleSpots.push({ ri, at, dir, d: Math.hypot(...at) });
    }
  });
  const keep = new Set([...poleSpots].sort((a, b) => a.d - b.d).slice(0, 70)); // 원본은 길 순서 그대로(전선 잇기)
  for (const r of roadsNear) {
    const w = ROAD_W[r.cls];
    let prev = null;
    for (const spot of poleSpots) {
      if (roadsNear[spot.ri] !== r) continue;
      if (!keep.has(spot)) { prev = null; continue; }
      const { at, dir } = spot;
      const pole = utilityPole(grad);
      const yaw = Math.atan2(dir[0], dir[1]);
      pole.position.set(at[0], 0, at[1]);
      pole.rotation.y = yaw; // 가로대가 도로를 가로지르도록
      group.add(pole);
      const here = new THREE.Vector3(at[0], 0, at[1]);
      if (prev && prev.distanceTo(here) < 48) group.add(wires(prev, here, yaw));
      prev = here;
    }
    if (BIG.has(r.cls)) {
      for (const { p, dir } of along(r.line, 13)) {
        for (const side of [1, -1]) {
          const at = [p[0] + side * dir[1] * (w / 2 + 1.8), p[1] - side * dir[0] * (w / 2 + 1.8)];
          if (Math.hypot(...at) > R || blocked(at)) continue;
          const t = ginkgo(grad, rand);
          t.position.set(at[0], 0, at[1]);
          group.add(t);
        }
      }
      for (const { p, dir } of along(r.line, 32, 10)) {
        const at = [p[0] + dir[1] * (w / 2 + 0.6), p[1] - dir[0] * (w / 2 + 0.6)];
        if (Math.hypot(...at) > R || blocked(at)) continue;
        const l = streetLamp(grad);
        l.position.set(at[0], 0, at[1]);
        l.rotation.y = Math.atan2(-dir[1], dir[0]);
        group.add(l);
      }
    }
  }
  // 교차점(서로 다른 차도 두 개 이상이 지나는 꼭짓점) 앞 횡단보도
  const nodes = new Map();
  roadsNear.forEach((r, ri) => r.line.forEach((p, i) => {
    const key = `${Math.round(p[0])},${Math.round(p[1])}`;
    if (!nodes.has(key)) nodes.set(key, []);
    nodes.get(key).push({ ri, i });
  }));
  let walks = 0;
  for (const hits of nodes.values()) {
    if (walks >= 18 || new Set(hits.map((h) => h.ri)).size < 2) continue;
    for (const { ri, i } of hits) {
      const r = roadsNear[ri];
      if (!BIG.has(r.cls) && r.cls !== 'minor') continue;
      const p = r.line[i];
      const q = r.line[i + 1] || r.line[i - 1];
      if (!q) continue;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 10 || Math.hypot(...p) > R) continue;
      const dir = new THREE.Vector3((q[0] - p[0]) / len, 0, (q[1] - p[1]) / len);
      group.add(crosswalk(new THREE.Vector3(p[0], 0, p[1]).addScaledVector(dir, 7), dir, ROAD_W[r.cls]));
      walks++;
    }
  }

  const first = shops[0];
  const spawn = first
    ? { pos: first.stand.clone(), look: first.look.clone() }
    : { pos: new THREE.Vector3(0, 1.6, 8), look: new THREE.Vector3(0, 1.6, 0) };
  return { group, colliders, shops, spawn, radius: R, attribution: '건물·도로·상호 © OpenStreetMap contributors · 타일 OpenFreeMap' };
}
