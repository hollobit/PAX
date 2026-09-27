// 3D PAX 도시 입체지도 층 — 서울·부산·대구·대전·세종·광양 위로 가까이 다가가면 실제 건물·도로·물길·지형이 펼쳐진다
// (사용자 지시 2026-09-27: 별도 메뉴가 아니라 확대하면 그 자리에서).
//
// 자료와 그리는 코드는 독립 페이지 city3d/와 같은 것을 쓴다(city3d/js/*). 도시 자료는 도시 로컬 미터 좌표
// (원점 = 남서 모서리, x 동쪽·n 북쪽)라서, 그룹 하나의 위치·배율로 미니어처 지도의 등장방형 투영에 정확히 겹친다:
//   월드 x = x0 + x·sx,  월드 z = z0 − n·sz   (sx·sz = 경도·위도 1도의 월드 길이 ÷ 그 도시의 1도 미터)
// 높이는 실제 축척(sy = sz) — 미니어처 지형은 약 10배 과장이라, 도시 모드에서는 전국 지형을 걷어 내고 이 지형을 쓴다.
import * as THREE from 'three';
import { loadCity } from './city3d/js/load.js';
import {
  makeFrame, buildTerrain, buildWater, buildGreen, buildRibbons, roadStyle, waterwayStyle, buildOutline,
  buildDistrictLines, createBuildingMesh,
} from './city3d/js/layers.js';
import { selectBuildings, writeBuildingInstances } from './city3d/js/buildings.js';
import { createLabelLayer } from './city3d/js/maplabels.js';
import { createLocator, seatOf } from './city3d/js/geo.js';
import { LAND_H, project, unproject } from './pax3d-geom.js?v=f13514eb';

const BASE = 'city3d/data';
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
/** 모바일은 표시 건물 수·지형 격자를 따로 줄인다 */
export const CITY_BUDGET = MOBILE ? { label: '모바일', buildings: 30000, terrainStep: 4 } : { label: '데스크톱', buildings: 180000, terrainStep: 3 };
export const ENTER = 2.4;    // 이보다 가까우면(월드 단위, 1 ≈ 43km) 도시 모드
const EXIT = 2.9;            // 이보다 멀어지면 전국 지도로 (되돌이 떨림 방지 간격)
const PREFETCH = 4.4;        // 이보다 가까워지면 도시 자료를 미리 받기 시작
const LIFT = 0.0003;         // 시도 판 윗면(LAND_H) 위로 약 13m — 해수면 물·지형이 판과 겹쳐 깜빡이지 않게

export function createCityLayer({ scene, labelRoot, onLabelClick, onChange, onState }) {
  let index = null;
  const loaded = new Map();   // key → 도시(장면 그룹·변환·자료)
  const loading = new Map();  // key → Promise
  let active = null;
  let lastSel = null;
  const uniforms = { uNight: { value: 0 } };
  fetch(`${BASE}/cities.json`).then((r) => (r.ok ? r.json() : null)).then((j) => { index = j; }).catch(() => { index = null; });

  const labels = createLabelLayer(labelRoot, {
    onClick: (it) => { const c = loaded.get(active); if (c) onLabelClick(c.toWorld(it.x, it.n, 0), it.k === 'district' || it.k === 'city' ? 0.2 : 0.045); },
    place: (it, lift) => { const c = loaded.get(active); const v = c.toWorld(it.x, it.n, lift); return [v.x, v.y, v.z]; },
    unit: 1, // setCity 때 도시별 배율로 바꾼다
  });

  function cityAt(lon, lat) {
    if (!index) return null;
    for (const [key, c] of Object.entries(index.cities)) {
      const [w, s, e, n] = c.bbox || [];
      if (lon >= w && lon <= e && lat >= s && lat <= n) return key;
    }
    return null;
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
    const terrain = buildTerrain(frame, data.dem, 1, CITY_BUDGET.terrainStep);
    group.add(terrain);
    group.add(buildOutline(frame, data.meta.outline, 1));
    group.add(buildDistrictLines(frame, data.mapinfo.districts, 1));
    group.add(buildGreen(frame, data.green, 1));
    group.add(buildWater(frame, data.water, 1));
    const ww = new THREE.Mesh(buildRibbons(frame, data.waterways, 1, waterwayStyle),
      new THREE.MeshPhongMaterial({ color: '#ffffff', specular: '#cfe6ff', shininess: 60, vertexColors: true, side: THREE.DoubleSide }));
    const rd = new THREE.Mesh(buildRibbons(frame, data.roads, 1, roadStyle), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    ww.receiveShadow = true;
    rd.receiveShadow = true;
    group.add(ww, rd);
    const bmesh = createBuildingMesh(Math.min(data.b.n, CITY_BUDGET.buildings), uniforms);
    bmesh.castShadow = true;
    group.add(bmesh);
    group.visible = false;
    scene.add(group);
    return { group, bmesh };
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
        const { group, bmesh } = buildGroup(data, frame, xf);
        const c = { key, name: info.name, data, frame, ...xf, group, bmesh, visible: new Uint32Array(0),
          locator: createLocator(data.mapinfo), ms: performance.now() - t0 };
        loaded.set(key, c);
        loading.delete(key);
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

  function setActive(key) {
    if (key === active) return;
    if (active) loaded.get(active).group.visible = false;
    active = key;
    lastSel = null;
    if (key) {
      const c = loaded.get(key);
      c.group.visible = true;
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
    /** 매 프레임 — 시점(목표점)이 도시 범위 안이고 충분히 가까우면 도시 모드. 자료는 PREFETCH 거리에서 미리 받는다. */
    update(camera, target, d, width, height) {
      if (!index) return;
      const [lon, lat] = unproject(target.x, target.z);
      const key = cityAt(lon, lat);
      if (key && d < PREFETCH && !loaded.has(key) && !loading.has(key)) ensureLoaded(key);
      if (active && (key !== active || d > EXIT)) setActive(null);
      if (!active && key && d < ENTER && loaded.has(key)) setActive(key);
      if (!active) return;
      const c = loaded.get(active);
      selectVisible(c, camera, target);
      labels.update(camera, 1, width, height);
    },
    setLabelGroup(g, on) { labels.setGroup(g, on); },
    /** 사례가 설 자리: 기관 소재지 → 시군구 청사(없으면 구 이름표 자리) → 시청 — 도시 로컬 [x, n, 이름] */
    anchorOf(c, loc) {
      if (loc.inst) {
        const [x, n] = [(loc.inst.lon - c.data.meta.frame.lon0) * c.data.meta.frame.m_lon, (loc.inst.lat - c.data.meta.frame.lat0) * c.data.meta.frame.m_lat];
        return [x, n, loc.inst.name];
      }
      const seat = seatOf(c.data.mapinfo, loc.sgg ? loc.sgg.name : loc.place, loc.sgg ? c.locator : null);
      if (seat) return [seat.x, seat.n, seat.name];
      return null;
    },
    stats() {
      const c = active && loaded.get(active);
      return { index: Boolean(index), active, loaded: [...loaded.keys()], loading: [...loading.keys()], visible: c ? c.visible.length : 0 };
    },
  };
}
