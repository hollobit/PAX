// 3D PAX 평면 기하 — 투영, 결정적 난수, 폴리곤 판정, 건물 배치 표본.
import * as THREE from 'three';

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
/** 월드 (x, z) → [경도, 위도] */
export function unproject(x, z) {
  return [x / (KM * COS * S) + LON0, -z / (KM * S) + LAT0];
}
export const toWorld = (v, y = 0) => new THREE.Vector3(v.x, y, -v.y);
export const projectPolys = (polysLL) => polysLL.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => project(lon, lat))));

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

// ---- 폴리곤 ([[외곽, 구멍…], …], 점은 Vector2) ------------------------------------
export function ringArea(r) {
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
export function inPolys(p, polys) {
  return polys.some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h)));
}
export function polysArea(polys) {
  return polys.reduce((s, [o, ...hs]) => s + ringArea(o) - hs.reduce((t, h) => t + ringArea(h), 0), 0);
}
export function randomIn(polys, rand) {
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

/**
 * 자리 한 곳(zone)에 건물 자리를 고른다 — 서로 가장 먼 후보를 고르는 best-candidate 표본.
 * zone: {polys, center?: Vector2, radius?: number} — center가 있으면 그 둘레(기관 캠퍼스·시도청 앞)에 모은다.
 */
export function scatter(zone, ids, blocked, spacingHint) {
  const placed = [];
  const sample = (rand) => {
    if (!zone.center) return randomIn(zone.polys, rand);
    for (let t = 0; t < 40; t++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * zone.radius;
      const p = new THREE.Vector2(zone.center.x + Math.cos(a) * r, zone.center.y + Math.sin(a) * r);
      if (inPolys(p, zone.polys)) return p;
    }
    return zone.center.clone();
  };
  for (const id of ids) {
    const rand = rng(id);
    let best = null;
    let bestD = -1;
    for (let k = 0; k < 16; k++) {
      const p = sample(rand);
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
    placed.push(best || (zone.center ? zone.center.clone() : zone.polys[0][0][0].clone()));
  }
  return placed;
}

export function blobRing(center, radius, seed) {
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
