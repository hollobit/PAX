// 지도 이름표 — OSM 이름(구·동네·역·길·강·산·관공서…)을 3D 장면의 실제 위치 위에 띄운다.
// DOM 이름표를 재사용 풀로 두고, 카메라가 움직일 때만 다시 투영한다. 겹치면 우선순위가 높은 것만 남긴다.
import * as THREE from 'three';

/** 종류별 표시 규칙 — far: 카메라에서 이만큼(m) 안에 있을 때만, group: 켜고 끄는 묶음 */
export const LABEL_KINDS = {
  focus: { far: Infinity, group: null, cls: 'lb--focus', icon: '📍' }, // 바깥(3D PAX)에서 넘겨받은 지점 — 늘 보인다
  district: { far: 90000, group: 'admin', cls: 'lb--district' },
  city: { far: 90000, group: 'admin', cls: 'lb--district' },
  airport: { far: 60000, group: 'transit', cls: 'lb--transit', icon: '✈' },
  station: { far: 7000, group: 'transit', cls: 'lb--transit', icon: '●' },
  peak: { far: 16000, group: 'nature', cls: 'lb--peak', icon: '▲' },
  water: { far: 14000, group: 'nature', cls: 'lb--water' },
  road: { far: 5000, group: 'road', cls: 'lb--road' },
  quarter: { far: 6500, group: 'quarter', cls: 'lb--quarter' },
  gov: { far: 3200, group: 'poi', cls: 'lb--poi', icon: '◆' },
  landmark: { far: 3600, group: 'poi', cls: 'lb--poi', icon: '★' },
  hospital: { far: 2800, group: 'poi', cls: 'lb--poi', icon: '✚' },
  school: { far: 3200, group: 'poi', cls: 'lb--poi', icon: '■' },
};
export const LABEL_GROUPS = {
  admin: '구·군', quarter: '동네', transit: '역·공항', road: '도로', nature: '산·물', poi: '관공서·병원·학교·명소',
};
const PRIORITY = { focus: -1, district: 0, city: 1, airport: 2, peak: 3, station: 3, water: 4, gov: 5, landmark: 5, road: 6, quarter: 6, hospital: 7, school: 7 };
const MAX_SHOWN = 160;

/**
 * @param root 이름표 DOM 부모
 * @param opts.onClick 이름표를 눌렀을 때(item: {k, name, x, n})
 * @param opts.place (item, liftM, vscale) → [X, Y, Z] 월드 좌표. 기본은 이 페이지 장면(도시 로컬 m, X = x − W/2 …).
 *        3D PAX처럼 다른 좌표계에 얹을 때 바꾼다.
 * @param opts.unit 월드 단위/미터 — 종류별 표시 거리(far, m)를 월드 거리로 바꿀 때 쓴다
 */
export function createLabelLayer(root, { onClick, place = null, unit = 1 }) {
  let items = [];
  let pool = [];
  const on = Object.fromEntries(Object.keys(LABEL_GROUPS).map((g) => [g, true]));
  const v = new THREE.Vector3();
  let lastKey = '';

  function setLabels(mapinfo, frame, focus) {
    root.replaceChildren();
    pool = [];
    const rows = [
      ...(focus ? [{ k: 'focus', name: focus.label, x: focus.x, n: focus.n }] : []),
      ...mapinfo.districts.map((d) => ({ k: 'district', name: d.name, x: d.x, n: d.n })),
      // 구가 없는 도시(세종·광양)는 시 이름이 구 자리를 대신하므로 중복을 뺀다
      ...mapinfo.labels.filter((l) => !(l.k === 'city' && mapinfo.districts.length > 1)),
    ];
    items = rows.map((r) => ({
      ...r, X: frame.X(r.x), Z: frame.Z(r.n), ground: Math.max(frame.elev(r.x, r.n), 0), pri: PRIORITY[r.k] ?? 9,
    })).sort((a, b) => a.pri - b.pri);
    if (!place) place = (it, lift, vscale) => [it.X, it.ground * vscale + lift, it.Z];
    lastKey = '';
  }

  function node(i) {
    if (!pool[i]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lb';
      b.addEventListener('click', () => b._item && onClick(b._item));
      root.append(b);
      pool[i] = b;
    }
    return pool[i];
  }

  /** 매 프레임 호출 — 카메라 행렬이 그대로면 아무것도 하지 않는다 */
  function update(camera, vscale, width, height) {
    const key = camera.matrixWorld.elements.map((e) => e.toPrecision(7)).join() + vscale + width + height + JSON.stringify(on);
    if (key === lastKey) return;
    lastKey = key;
    const taken = []; // 화면에 놓인 이름표 상자
    let shown = 0;
    const cam = camera.position;
    for (const it of items) {
      if (shown >= MAX_SHOWN) break;
      const K = LABEL_KINDS[it.k];
      if (!K || (K.group && !on[K.group])) continue;
      const [X, Y, Z] = place(it, it.k === 'focus' ? 140 : it.k === 'peak' ? 20 : it.k === 'district' ? 60 : 25, vscale);
      const d = Math.hypot(X - cam.x, Y - cam.y, Z - cam.z) / unit;
      if (d > K.far) continue;
      v.set(X, Y, Z).project(camera);
      if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) continue;
      const sx = (v.x * 0.5 + 0.5) * width;
      const sy = (-v.y * 0.5 + 0.5) * height;
      const text = it.k === 'peak' && it.ele ? `${it.name} ${it.ele}m` : it.name;
      const w = text.length * (it.k === 'district' ? 15 : 12) + 22;
      const h = it.k === 'district' ? 26 : 20;
      const box = [sx - w / 2, sy - h, sx + w / 2, sy];
      if (taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) continue;
      taken.push(box);
      const b = node(shown++);
      if (b._item !== it) {
        b._item = it;
        b.className = `lb ${K.cls}`;
        b.textContent = K.icon ? `${K.icon} ${text}` : text;
        b.title = `${text} — 누르면 이곳으로 이동`;
      }
      b.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      b.hidden = false;
    }
    for (let i = shown; i < pool.length; i++) { pool[i].hidden = true; pool[i]._item = null; }
  }

  return {
    setLabels,
    setUnit(u) { unit = u; lastKey = ''; },
    clear() { items = []; lastKey = ''; for (const b of pool) { b.hidden = true; b._item = null; } },
    update,
    setGroup(g, value) { on[g] = value; },
    groups: on,
  };
}
