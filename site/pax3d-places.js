// 사례를 설 자리별로 묶는다 — 3D 월드가 건물·표지판을 세울 때 쓰는 순수 계산(THREE에 기대지 않는다).
import { SEATS } from './pax3d-data.js?v=ad30f399';

/** 사례 한 건이 설 자리(zone)의 열쇠 — 기관 소재지 > 시군구 > 시·도청 앞 > 섬. */
export function zoneKey(loc) {
  if (loc.inst) return `inst:${loc.inst.name}`;
  if (loc.sgg) return `sgg:${loc.place}/${loc.sgg.name}`;
  if (SEATS[loc.place]) return `seat:${loc.place}`;
  return `isl:${loc.place}`;
}

/**
 * @param cases 사례 목록
 * @param located 사례 id → 위치 판정({place, sgg, inst, basis})
 * @returns {{byPlace: Map<string, object[]>, byZone: Map<string, {loc: object, list: object[]}>}}
 */
export function groupCases(cases, located) {
  const byPlace = new Map();
  const byZone = new Map();
  for (const c of cases) {
    const loc = located.get(c.id);
    if (!byPlace.has(loc.place)) byPlace.set(loc.place, []);
    byPlace.get(loc.place).push(c);
    const k = zoneKey(loc);
    if (!byZone.has(k)) byZone.set(k, { loc, list: [] });
    byZone.get(k).list.push(c);
  }
  return { byPlace, byZone };
}
