// 3D PAX 도시 입체지도 층 — 서울·부산·대구·대전·인천·세종·광양·제주와 경기 시·군 위로 가까이 다가가면 실제 건물·도로·물길·지형이 펼쳐진다
// (사용자 지시 2026-09-27: 별도 메뉴가 아니라 확대하면 그 자리에서).
//
// 자료와 그리는 코드는 독립 페이지 city3d/와 같은 것을 쓴다(city3d/js/*). 도시 자료는 도시 로컬 미터 좌표
// (원점 = 남서 모서리, x 동쪽·n 북쪽)라서, 그룹 하나의 위치·배율로 미니어처 지도의 등장방형 투영에 정확히 겹친다:
//   월드 x = x0 + x·sx,  월드 z = z0 − n·sz   (sx·sz = 경도·위도 1도의 월드 길이 ÷ 그 도시의 1도 미터)
// 높이는 실제 축척(sy = sz) — 미니어처 지형은 약 10배 과장이라, 도시 모드에서는 전국 지형을 걷어 내고 이 지형을 쓴다.
import * as THREE from 'three';
import { loadCity } from './city3d/js/load.js?v=62517a49';
import {
  makeFrame, buildTerrain, buildWater, buildGreen, buildRibbons, roadStyle, waterwayStyle, buildOutline,
  buildDistrictLines, createBuildingMesh, carveWater, paintGreen,
} from './city3d/js/layers.js?v=422c9e4c';
import { MODES, styleCityMaterials } from './city3d/js/modes.js?v=0b7e72ef';
import { flightStops } from './city3d/js/flight.js?v=21b1fb25';
import { selectBuildings, writeBuildingInstances } from './city3d/js/buildings.js?v=98d8bf23';
import { createLabelLayer } from './city3d/js/maplabels.js?v=107a28bb';
import { createLocator, seatOf } from './city3d/js/geo.js?v=00345fad';
import { createStreetLayer } from './city3d/js/street.js?v=73651cc4';
import { LAND_H, project, unproject } from './pax3d-geom.js?v=f13514eb';

const BASE = 'city3d/data';
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
/** 모바일은 표시 건물 수·지형 격자를 따로 줄인다 */
export const CITY_BUDGET = MOBILE ? { label: '모바일', buildings: 30000, terrainStep: 4 } : { label: '데스크톱', buildings: 180000, terrainStep: 3 };
// 도시 모드로 바뀌는 거리(월드 단위, 1 ≈ 43km)는 도시 크기에 비례 — 서울(약 45km)은 약 2.4, 과천 같은 작은 시는 0.5.
// 작은 시를 먼 곳에서 펼치면 화면의 점 하나만 입체가 되기 때문이다. 나갈 때는 1.2배, 미리 받기는 1.8배.
const ENTER_MAX = 2.4;
const ENTER_MIN = 0.5;
const EXIT_K = 1.2;
const PREFETCH_K = 1.8;
const LIFT = 0.0003;         // 시도 판 윗면(LAND_H) 위로 약 13m — 해수면 물·지형이 판과 겹쳐 깜빡이지 않게

function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** 단순화한 경계선에서 약 1km 안 — 다각형 사이 틈(단순화 오차)에 빠진 점을 살린다 */
function nearOutline(c, lon, lat) {
  const k = Math.cos((lat * Math.PI) / 180);
  return c.outline.some((ring) => ring.some(([x, y]) => Math.hypot((x - lon) * k, y - lat) < 0.009));
}
const MAX_LOADED = 4; // 메모리에 둘 도시 수 — 경기 시·군을 옮겨 다녀도 쌓이지 않게

export function createCityLayer({ scene, labelRoot, onLabelClick, onChange, onState, onIndex = () => {} }) {
  let index = null;
  const loaded = new Map();   // key → 도시(장면 그룹·변환·자료)
  const loading = new Map();  // key → Promise
  let active = null;
  let lastSel = null;
  let look = MODES.day; // 시간대 — 도시 재질(물·도로·야간 창문)
  const uniforms = { uNight: { value: 0 } };
  const street = createStreetLayer(uniforms); // 거리 소품 — 펼쳐진 도시 그룹 안으로 옮겨 단다(그룹 배율·위치를 그대로 받게)
  fetch(`${BASE}/cities.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null))
    .then((j) => { index = j; if (j) onIndex(); }).catch(() => { index = null; });

  const labels = createLabelLayer(labelRoot, {
    onClick: (it) => { const c = loaded.get(active); if (c) onLabelClick(c.toWorld(it.x, it.n, 0), it.k === 'district' || it.k === 'city' ? 0.2 : 0.045); },
    place: (it, lift) => { const c = loaded.get(active); const v = c.toWorld(it.x, it.n, lift); return [v.x, v.y, v.z]; },
    unit: 1, // setCity 때 도시별 배율로 바꾼다
  });

  /** 경위도가 어느 도시 경계 안인가 — 상자로 거르고 경계 다각형(cities.json outline)으로 가린다.
   *  경기 시·군·서울·인천은 상자가 겹치므로 다각형이 필요하다. 경계선 근처 틈이면 상자가 맞는 첫 도시. */
  const enterCache = new Map();
  function enterDist(key) {
    if (!enterCache.has(key)) {
      const [w, s, e, n] = index.cities[key].bbox;
      const diag = project(w, s).distanceTo(project(e, n));
      enterCache.set(key, Math.min(ENTER_MAX, Math.max(ENTER_MIN, diag * 1.8)));
    }
    return enterCache.get(key);
  }

  function cityAt(lon, lat) {
    if (!index) return null;
    let boxHit = null;
    for (const [key, c] of Object.entries(index.cities)) {
      const [w, s, e, n] = c.bbox || [];
      if (!(lon >= w && lon <= e && lat >= s && lat <= n)) continue;
      if (!c.outline) return key;
      if (c.outline.some((ring) => inRing(ring, lon, lat))) return key;
      boxHit = boxHit || key;
    }
    return boxHit && index.cities[boxHit].outline && nearOutline(index.cities[boxHit], lon, lat) ? boxHit : null;
  }

  /** 도시 로컬 미터 ↔ 미니어처 월드 */
  function makeTransform(meta, frame) {
    const f = meta.frame;
    const p0 = project(f.lon0, f.lat0);
    const sx = (project(f.lon0 + 1, f.lat0).x - p0.x) / f.m_lon;
    const sz = (project(f.lon0, f.lat0 + 1).y - p0.y) / f.m_lat;
    const x0 = p0.x;
    const z0 = -p0.y;
    const y0 = LAND_H + LIFT;
    return {
      sx, sz, sy: sz, x0, z0, y0,
      toWorld: (x, n, liftM = 0) => new THREE.Vector3(x0 + x * sx, y0 + (Math.max(frame.elev(x, n), 0) + liftM) * sz, z0 - n * sz),
      toLocal: (X, Z) => [(X - x0) / sx, (z0 - Z) / sz],
    };
  }

  function buildGroup(data, frame, xf) {
    const group = new THREE.Group();
    group.position.set(xf.x0 + (frame.W / 2) * xf.sx, xf.y0, xf.z0 - (frame.H / 2) * xf.sz);
    group.scale.set(xf.sx, xf.sy, xf.sz);
    // 물 밑 지형을 수면 아래로 깎는다 — 30m 표고가 강 가운데서 수면보다 높아 강이 땅에 덮이지 않게
    const carved = carveWater(frame, data.dem, data.water);
    const painted = paintGreen(frame, data.dem, data.green); // 큰 숲 삼각형은 지형 색으로 — 봉우리를 덮는 판 방지
    const terrain = buildTerrain(frame, data.dem, 1, CITY_BUDGET.terrainStep, carved, painted);
    group.add(terrain);
    group.add(buildOutline(frame, data.meta.outline, 1));
    group.add(buildDistrictLines(frame, data.mapinfo.districts, 1));
    group.add(buildGreen(frame, data.green, 1, painted));
    group.add(buildWater(frame, data.water, 1));
    const ww = new THREE.Mesh(buildRibbons(frame, data.waterways, 1, waterwayStyle),
      new THREE.MeshPhongMaterial({ color: '#ffffff', specular: '#cfe6ff', shininess: 60, vertexColors: true, side: THREE.DoubleSide }));
    const rd = new THREE.Mesh(buildRibbons(frame, data.roads, 1, roadStyle), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    ww.receiveShadow = true;
    rd.receiveShadow = true;
    ww.name = 'waterways';
    rd.name = 'roads';
    group.add(ww, rd);
    const bmesh = createBuildingMesh(Math.min(data.b.n, CITY_BUDGET.buildings), uniforms);
    bmesh.castShadow = true;
    group.add(bmesh);
    group.visible = false;
    styleCityMaterials(group, look);
    scene.add(group);
    return { group, bmesh, carvedCells: carved.cells };
  }

  function ensureLoaded(key) {
    if (loaded.has(key)) return Promise.resolve(loaded.get(key));
    if (loading.has(key)) return loading.get(key);
    const info = index.cities[key];
    onState({ phase: 'loading', key, name: info.name, bytes: info.packed_bytes });
    const t0 = performance.now();
    const p = loadCity(BASE, key, () => onState({ phase: 'verifying', key, name: info.name }))
      .then((data) => {
        const frame = makeFrame(data.meta, data.dem);
        const xf = makeTransform(data.meta, frame);
        const { group, bmesh, carvedCells } = buildGroup(data, frame, xf);
        const c = { key, name: info.name, data, frame, ...xf, group, bmesh, carvedCells, visible: new Uint32Array(0),
          locator: createLocator(data.mapinfo), ms: performance.now() - t0 };
        loaded.set(key, c);
        loading.delete(key);
        evict(key);
        onState({ phase: 'ready', key, name: info.name, ms: c.ms, files: data.files, bytes: data.bytes, meta: data.meta });
        return c;
      })
      .catch((err) => {
        loading.delete(key);
        onState({ phase: 'error', key, name: info.name, message: err.message });
        throw err;
      });
    loading.set(key, p);
    p.catch(() => {});
    return p;
  }

  const lastUsed = new Map();
  /** 오래 안 쓴 도시부터 장면·GPU에서 내린다(펼쳐진 도시와 방금 받은 도시는 남긴다) */
  function evict(keep) {
    lastUsed.set(keep, performance.now());
    const order = [...loaded.keys()].filter((k) => k !== keep && k !== active).sort((a, b) => (lastUsed.get(a) || 0) - (lastUsed.get(b) || 0));
    while (loaded.size > MAX_LOADED && order.length) {
      const k = order.shift();
      const c = loaded.get(k);
      scene.remove(c.group);
      c.group.remove(street.group); // 거리 소품은 도시마다 다시 다는 공용 층 — 같이 해제하지 않는다
      c.group.traverse((o) => { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose()); });
      loaded.delete(k);
    }
  }

  function setActive(key) {
    if (key) lastUsed.set(key, performance.now());
    if (key === active) return;
    if (active) loaded.get(active).group.visible = false;
    active = key;
    lastSel = null;
    if (key) {
      const c = loaded.get(key);
      c.group.visible = true;
      c.group.add(street.group);
      street.reset();
      labels.setLabels(c.data.mapinfo, c.frame, null);
      labels.setUnit(c.sz);
    } else labels.clear();
    onChange(key ? loaded.get(key) : null);
  }

  function selectVisible(c, camera, target) {
    const [tx, tn] = c.toLocal(target.x, target.z);
    const distM = camera.position.distanceTo(target) / c.sz;
    if (lastSel && Math.hypot(tx - lastSel[0], tn - lastSel[1]) < Math.max(300, distM * 0.15)) return;
    lastSel = [tx, tn];
    c.visible = selectBuildings(c.data.b, tx, tn, CITY_BUDGET.buildings, c.visible);
    writeBuildingInstances(c.bmesh, c.data.b, c.visible, c.frame, 1, true);
  }

  return {
    get active() { return active ? loaded.get(active) : null; },
    get index() { return index; },
    cityAt,
    ensureLoaded,
    /** 그 도시가 펼쳐지는 거리 — 목록을 아직 못 받았으면 null */
    enterDistance(key) { return index && index.cities[key] ? enterDist(key) : null; },
    /** 매 프레임 — 시점(목표점)이 도시 범위 안이고 충분히 가까우면 도시 모드. 자료는 PREFETCH 거리에서 미리 받는다. */
    update(camera, target, d, width, height) {
      if (!index) return;
      const [lon, lat] = unproject(target.x, target.z);
      const key = cityAt(lon, lat);
      if (key && d < enterDist(key) * PREFETCH_K && !loaded.has(key) && !loading.has(key)) ensureLoaded(key);
      if (active && (key !== active || d > enterDist(active) * EXIT_K)) setActive(null);
      if (!active && key && d < enterDist(key) && loaded.has(key)) setActive(key);
      if (!active) return;
      const c = loaded.get(active);
      selectVisible(c, camera, target);
      const [sx, sn] = c.toLocal(target.x, target.z);
      street.update(c.frame, c.data.roads, sx, sn, camera.position.distanceTo(target) / c.sz, 1);
      labels.update(camera, 1, width, height);
    },
    setLabelGroup(g, on) { labels.setGroup(g, on); },
    /** 시간대 — 이미 받은 모든 도시 재질과 야간 창문 */
    setMode(M) {
      look = M;
      uniforms.uNight.value = M.night;
      for (const c of loaded.values()) styleCityMaterials(c.group, M);
    },
    /** 랜드마크 비행 순서(OSM에서 확인된 지점만) */
    flightStops(c) { return flightStops(c.data.meta.landmarks); },
    /** 사례가 설 자리: 기관 소재지 → 시군구 청사(없으면 구 이름표 자리) → 시청 — 도시 로컬 [x, n, 이름] */
    anchorOf(c, loc, seatLL = null) {
      if (loc.inst) {
        const [x, n] = [(loc.inst.lon - c.data.meta.frame.lon0) * c.data.meta.frame.m_lon, (loc.inst.lat - c.data.meta.frame.lat0) * c.data.meta.frame.m_lat];
        return [x, n, loc.inst.name];
      }
      const seat = seatOf(c.data.mapinfo, loc.sgg ? loc.sgg.name : loc.place, loc.sgg ? c.locator : null);
      if (seat) return [seat.x, seat.n, seat.name];
      if (seatLL) {
        // 시·도청 앞(SEATS) 좌표 — 이 도시 지도 안일 때만
        const f = c.data.meta.frame;
        const x = (seatLL[0] - f.lon0) * f.m_lon;
        const n = (seatLL[1] - f.lat0) * f.m_lat;
        if (x >= 0 && n >= 0 && x <= f.width && n <= f.height) return [x, n, `${loc.place} 청사 앞`];
      }
      return null;
    },
    stats() {
      const c = active && loaded.get(active);
      return { index: Boolean(index), active, loaded: [...loaded.keys()], loading: [...loading.keys()], visible: c ? c.visible.length : 0 };
    },
  };
}
