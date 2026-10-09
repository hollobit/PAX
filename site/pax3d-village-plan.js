// 3D PAX 섬 마을 설계 — 사례 내용으로 건물 종류를 정하고, 광장·순환 도로·방사 도로를 깔아 길가에 세운다.
// three에 기대지 않는 순수 계산이라 node로 검증한다(tests/test_pax3d_village.py). 좌표는 평면 (x=동, y=북).

/** 건물 종류 — 섬 위에서는 '무엇을 만든 사례인가'를 모양으로 보여 준다(섬 자체가 만든 주체를 말한다). */
export const VILLAGE_KINDS = {
  library: '도서관 — 법령·규정·감사',
  observatory: '천문대 — 데이터·통계·지도',
  workshop: '공방 — MCP·에이전트·개발 도구',
  school: '학교 — 교육·학습',
  hall: '청사 — 기관 공식·정책',
  office: '사무소 — 문서·회계·인사·계약',
  shop: '가게 — 민원·생활 서비스',
  house: '집 — 그 밖의 도구',
};
const KIND_ORDER = Object.keys(VILLAGE_KINDS);
const AGENCY = new Set(['중앙행정기관', '광역지자체', '기초지자체', '지방의회', '공공기관']);
const OFFICE_TASKS = new Set(['문서·기안', '회계·정산', '인사·복무', '계약·조달']);

/** 위에서부터 먼저 맞는 규칙 — 법령 MCP는 공방이 아니라 도서관이다(내용이 도구 형태보다 먼저). */
const RULES = [
  ['school', (c, t) => c.org_type === '교육기관' || /학교|학생|교사|교육청|수업|학습|급식/.test(t)],
  ['library', (c, t) => c.task_category === '감사·법무' || /법령|판례|조례|자치법규|법률|규정|감사/.test(t)],
  ['observatory', (c, t) => c.task_category === '데이터·통계' || /지도|GIS|통계|시각화|대시보드|3D|은하|관측/.test(t)],
  ['workshop', (c, t) => /MCP|CLI|에이전트|스킬|플러그인|확장 프로그램|SDK|자동화|개발 도구|코딩/i.test(t)],
  ['office', (c) => OFFICE_TASKS.has(c.task_category)],
  ['shop', (c) => c.task_category === '민원' || c.task_category === '시설·안전'],
  ['hall', (c) => AGENCY.has(c.org_type) || c.task_category === '기획·정책'],
];

export function villageKind(c) {
  const text = `${c.title || ''} ${(c.tags || []).join(' ')}`;
  for (const [kind, test] of RULES) if (test(c, text)) return kind;
  return 'house';
}

// ---- 결정적 난수 ----------------------------------------------------------------------
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const TAU = Math.PI * 2;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1e-12)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/** 앞면(지역 +z)이 평면 방향 (fx, fy)를 보게 하는 Y축 회전 — 월드는 (x, -y)로 놓인다 */
const facing = (fx, fy) => Math.atan2(fx, -fy);

/** 원 위의 점들을 섬 안에 든 연속 구간으로 잘라 길 조각 목록으로 */
function clipLoop(points, inside) {
  const pieces = [];
  let cur = [];
  const ok = points.map(inside);
  const start = ok.indexOf(false);
  const order = start < 0 ? [...points.keys(), 0] : [...points.keys()].map((i) => (i + start) % points.length);
  for (const i of order) {
    if (ok[i]) cur.push(points[i]);
    else if (cur.length) {
      if (cur.length > 1) pieces.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) pieces.push(cur);
  return pieces;
}

/**
 * @param {{center:{x,y}, radius:number, inside:(p)=>boolean, items:{id,kind}[], size:number, seed:string}} o
 * @returns {{slots: Map<string,{x,y,rot}>, roads: {x,y}[][], plaza:{x,y,r}, gate:{x,y,rot}, walkways:{x,y}[][]}}
 */
export function planVillage({ center, radius, inside, items, size, seed }) {
  const hw = size * 0.28; // 길 반폭
  const off = hw + size * 0.62; // 길 중심에서 건물 중심까지
  const plazaR = Math.max(size * 2.4, radius * 0.09);
  const gap = 2 * hw + size * 2.6; // 순환 도로 사이 — 등을 맞댄 두 줄 건물이 겹치지 않게
  const base = (hash(seed) % 6283) / 1000;
  const at = (r, a) => ({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });
  const roomy = (p, out) => inside(p) && inside({ x: p.x + out.x * size * 0.6, y: p.y + out.y * size * 0.6 });

  // 방사 도로: 광장에서 바닷가까지(사례가 적으면 넷, 많으면 여섯)
  const spokesN = items.length > 60 ? 6 : items.length > 20 ? 5 : 4;
  const spokes = [];
  for (let k = 0; k < spokesN; k++) {
    const a = base + (TAU * k) / spokesN;
    const line = [at(plazaR, a)];
    for (let r = plazaR + size; r < radius * 1.3; r += size) {
      const p = at(r, a);
      if (!inside(p)) break;
      line.push(p);
    }
    if (line.length > 1) spokes.push({ a, line });
  }
  const spokeSegs = spokes.map((s) => [s.line[0], s.line[s.line.length - 1]]);
  const nearSpoke = (p, m) => spokeSegs.some(([a, b]) => segDist(p, a, b) < m);

  // 순환 도로를 바깥으로 늘려 가며 길가 자리를 모은다 — 사례 수를 다 받을 만큼
  const rings = [];
  const slots = [];
  const tooClose = (p) => slots.some((q) => dist(p, q) < size * 1.12);
  const addRow = (rowR, ringR, outward) => {
    if (rowR <= plazaR + size * 0.9) return;
    const step = (size * 1.3) / rowR;
    for (let a = base + step / 2; a < base + TAU; a += step) {
      const p = at(rowR, a);
      const out = { x: Math.cos(a), y: Math.sin(a) };
      if (!roomy(p, out) || nearSpoke(p, hw + size * 0.72) || tooClose(p)) continue;
      const dir = outward ? out : { x: -out.x, y: -out.y }; // 앞면은 길 쪽
      slots.push({ x: p.x, y: p.y, rot: facing(-dir.x, -dir.y), r: rowR, a: ((a - base) % TAU + TAU) % TAU });
    }
  };
  for (let ringR = plazaR + off + size * 1.6; ringR < radius * 0.97; ringR += gap) {
    rings.push(ringR);
    addRow(ringR - off, ringR, false); // 안쪽 줄은 바깥(길)을 본다
    addRow(ringR + off, ringR, true);
    if (slots.length >= items.length * 1.25) break;
  }
  const nearRing = (p, m) => rings.some((r) => Math.abs(dist(p, center) - r) < m);
  // 방사 도로 양옆 — 순환 도로 사이 빈자리
  for (const { a, line } of spokes) {
    const n = { x: -Math.sin(a), y: Math.cos(a) };
    for (const p0 of line) {
      for (const side of [1, -1]) {
        const p = { x: p0.x + n.x * off * side, y: p0.y + n.y * off * side };
        if (!inside(p) || nearRing(p, hw + size * 0.72) || dist(p, center) < plazaR + size || tooClose(p)) continue;
        if (nearSpoke(p, off * 0.9)) continue;
        const ang = Math.atan2(p.y - center.y, p.x - center.x);
        slots.push({ x: p.x, y: p.y, rot: facing(-n.x * side, -n.y * side), r: dist(p, center), a: ((ang - base) % TAU + TAU) % TAU });
      }
    }
  }

  // 광장에 가까운 자리부터 채우고, 고른 자리를 각도순으로 돌며 같은 종류를 이어 붙인다 → 종류별 동네
  const chosen = slots.slice().sort((p, q) => p.r - q.r).slice(0, items.length).sort((p, q) => p.a - q.a);
  const ordered = items.map((it, i) => ({ it, i }))
    .sort((p, q) => KIND_ORDER.indexOf(p.it.kind) - KIND_ORDER.indexOf(q.it.kind) || p.i - q.i);
  const out = new Map();
  ordered.forEach(({ it }, i) => {
    const s = chosen[i];
    if (s) out.set(it.id, { x: s.x, y: s.y, rot: s.rot });
  });
  // 자리가 모자라면(아주 작은 섬) 남은 사례는 빈 땅에 — 길과 다른 건물을 피해서
  const rest = items.filter((it) => !out.has(it.id));
  const taken = [...out.values()];
  const roadsFlat = () => rings.length || spokes.length;
  for (const it of rest) {
    let h = hash(`${seed}-${it.id}`);
    const next = () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296);
    let best = null;
    let bestD = -1;
    for (let t = 0; t < 60; t++) {
      const p = at(Math.sqrt(next()) * radius, next() * TAU);
      if (!inside(p) || (roadsFlat() && (nearRing(p, hw + size * 0.5) || nearSpoke(p, hw + size * 0.5)))) continue;
      const d = Math.min(...taken.map((q) => dist(p, q)), Infinity);
      if (d > bestD) { best = p; bestD = d; }
    }
    const p = best || at(plazaR * 0.5, next() * TAU);
    const slot = { x: p.x, y: p.y, rot: next() * TAU };
    out.set(it.id, slot);
    taken.push(slot);
  }

  const roads = [];
  for (const r of rings) {
    const n = Math.max(24, Math.round((TAU * r) / (size * 0.8)));
    const pts = Array.from({ length: n }, (_, i) => at(r, base + (TAU * i) / n));
    roads.push(...clipLoop(pts, inside));
  }
  roads.push(...spokes.map((s) => s.line));
  const gateSpoke = spokes[0];
  const end = gateSpoke ? gateSpoke.line[gateSpoke.line.length - 1] : at(radius * 0.9, base);
  const gate = { x: end.x, y: end.y, rot: facing(Math.cos(base), Math.sin(base)) };
  return { slots: out, roads, plaza: { x: center.x, y: center.y, r: plazaR }, gate, halfWidth: hw };
}
