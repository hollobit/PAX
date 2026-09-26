// 3D PAX 데이터 계층 — 사례를 여섯 축으로 묶고, 미니어처 지도 위 자리(시도·섬)를 정한다.
//
// 분류 규칙은 새로 만들지 않는다. 분야는 case-domains.js, 중앙행정기관·지역 스코프는
// ministries.js의 전역 정의를 그대로 쓴다 — 첫 화면·관측소·격차 지도와 같은 숫자가 나와야 한다.
import { makeLocator, makeInstitutionFinder } from './pax3d-locate.js?v=87e6e994';

/* global CASE_DOMAIN_NAMES, matchesCaseDomain, buildChampAffMap, MINISTRY_GROUPS, paxRegionScope */

export const TASKS = ['데이터·통계', '문서·기안', '공통·범용', '감사·법무', '시설·안전',
  '기획·정책', '인사·복무', '민원', '회계·정산', '계약·조달'];

// 업무 유형 = 건물 색. 미니어처 도료처럼 채도를 한 단계 눌렀다.
export const TASK_COLORS = {
  '데이터·통계': '#4f86c6', '문서·기안': '#e3a93f', '공통·범용': '#98a676',
  '감사·법무': '#8c5a9e', '시설·안전': '#e0703a', '기획·정책': '#3f9c8f',
  '인사·복무': '#d9738b', '민원': '#c9473f', '회계·정산': '#6f8f3a', '계약·조달': '#8a7560',
};
export const FALLBACK_COLOR = '#b9ae9a';

export const REGIONS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

export const ORG_TYPES = ['중앙행정기관', '광역지자체', '기초지자체', '지방의회', '공공기관',
  '교육기관', '공직 개인', '커뮤니티', '민간(참고)', '해외(참고)'];

// 지역이 없는 사례(전체의 3/4)를 아무 시도에나 꽂지 않는다 — 왜 거기 있는지 이름으로 밝힌 섬에 둔다.
// 좌표는 바다 위 빈자리(경도·위도)이고, 섬 크기는 사례 수로 정한다.
export const ISLANDS = [
  { key: '정부·공공기관 섬', lon: 125.35, lat: 36.55, scopes: ['central', 'public'],
    note: '중앙행정기관·공공기관 — 전국 단위라 특정 시도에 두지 않았습니다' },
  { key: '공직 현장 섬', lon: 130.55, lat: 36.2, scopes: ['unknown'],
    note: '공직 실무자가 만들었지만 지역이 확인되지 않은 사례' },
  { key: '커뮤니티 섬', lon: 128.7, lat: 33.85, scopes: ['community'],
    note: '공직 커뮤니티·시민 개발자가 함께 만든 산출물' },
  { key: '참고 섬', lon: 125.25, lat: 34.35, scopes: ['reference'],
    note: '민간·해외 참고 사례' },
];
// 시군구를 모르는 시도 사례는 시·도청 앞에 모은다 — 확대했을 때 엉뚱한 동네에 서 있지 않도록.
export const SEATS = {
  서울: [126.978, 37.566], 부산: [129.075, 35.18], 대구: [128.601, 35.871], 인천: [126.705, 37.456],
  광주: [126.852, 35.16], 대전: [127.385, 36.35], 울산: [129.311, 35.539], 세종: [127.289, 36.48],
  경기: [127.009, 37.275], 강원: [127.73, 37.885], 충북: [127.491, 36.635], 충남: [126.673, 36.659],
  전북: [127.108, 35.82], 전남: [126.463, 34.816], 경북: [128.505, 36.576], 경남: [128.692, 35.238],
  제주: [126.498, 33.489],
};

export const ISLAND_KEYS = ISLANDS.map((i) => i.key);

// 건물 모양 = 누가 만들었나. 색(업무)과 독립한 두 번째 시각 축.
export const SHAPES = {
  house: '공직 개인 — 뾰족지붕 집',
  pavilion: '커뮤니티 — 둥근 정자',
  tower: '기관 — 청사',
  shop: '참고(민간·해외) — 상점',
};

export function shapeOf(c) {
  if (c.org_type === '공직 개인') return 'house';
  if (c.org_type === '커뮤니티') return 'pavilion';
  if (c.org_type === '민간(참고)' || c.org_type === '해외(참고)') return 'shop';
  return 'tower';
}

// ---- 자리 판정 (사용자 지시 2026-09-27: 챔피언 소속 기관명도 지도와 연결) ---------------------
/**
 * 사례 한 건의 자리와 근거. 우선순위: 원장 region > 만든 사람 소속 > 스코프별 섬.
 * 시군구는 기관명·소속에서 확실히 읽힐 때만 붙인다(pax3d-locate.js).
 * @returns {{place:string, sgg:object|null, basis:'region'|'affiliation'|'island'}}
 */
export function placeOf(c, affs, locator, institutionFor) {
  const texts = [c.org || '', ...(affs || [])];
  const inst = institutionFor(texts);
  if (REGIONS.includes(c.region)) {
    if (inst && inst.region === c.region) return { place: c.region, sgg: inst.sggObj, inst, basis: 'institution' };
    return { place: c.region, sgg: locator.locate(texts, c.region), basis: 'region' };
  }
  // 기관 소재지가 확인되면 섬이 아니라 그 주소에 선다(정부·공공기관 — 사용자 지시 2026-09-27)
  if (inst) return { place: inst.region, sgg: inst.sggObj, inst, basis: 'institution' };
  const votes = new Map();
  for (const a of affs || []) {
    const r = locator.regionOf(a);
    if (r) votes.set(r, (votes.get(r) || 0) + 1);
  }
  const ranked = [...votes].sort((a, b) => b[1] - a[1]);
  // 공동 제작자 소속이 서로 다른 시도로 갈리면 어느 한쪽에 두지 않는다
  if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
    const region = ranked[0][0];
    return { place: region, sgg: locator.locate(affs, region), basis: 'affiliation' };
  }
  const scope = paxRegionScope(c, (affs || []).join(' '));
  const island = ISLANDS.find((i) => i.scopes.includes(scope));
  return { place: island ? island.key : '공직 현장 섬', sgg: null, basis: 'island' };
}

export function placeText(loc) {
  if (!loc) return '';
  if (loc.basis === 'institution') return `${loc.place} ${loc.sgg ? loc.sgg.name : ''} · ${loc.inst.name} 소재지`;
  const where = loc.sgg ? `${loc.place} ${loc.sgg.name}` : loc.basis === 'island' ? loc.place : `${loc.place} (시군구 미상)`;
  return loc.basis === 'affiliation' ? `${where} · 만든 사람 소속 기준` : where;
}

// 운영 사이트가 저장소보다 먼저 — app.js caseTargetUrl·scripts/pax/urls.py와 같은 규칙.
const REPO_HOST = /^https?:\/\/(www\.)?(github\.com|gitlab\.com|gitlab\.aigov\.go\.kr|bitbucket\.org|gitee\.com|sourceforge\.net)\//i;
const POST_HOST = /^https?:\/\/([\w.-]+\.)?(threads\.com|threads\.net|twitter\.com|x\.com|facebook\.com|instagram\.com|brunch\.co\.kr|blog\.naver\.com)\//i;

export function caseTargetUrl(c) {
  const urls = ['case_url', 'link', 'mirror_url']
    .map((k) => c[k])
    .filter((u) => typeof u === 'string' && u.startsWith('https://'));
  if (!urls.length) return null;
  const live = urls.find((u) => !REPO_HOST.test(u) && !POST_HOST.test(u));
  return live || urls.find((u) => REPO_HOST.test(u)) || null;
}

function ministryMatcher(kws, affMap) {
  return (c) => kws.some((k) => (c.org || '').includes(k) || (affMap.get(c.id) || '').includes(k));
}

function valuesFrom(defs, cases) {
  return defs
    .map((d) => ({ ...d, ids: new Set(cases.filter(d.test).map((c) => c.id)) }))
    .filter((d) => d.ids.size > 0);
}

/**
 * 여섯 축을 만든다. 각 값은 {value, label, sub?, group?, ids:Set, href?}.
 * 한 사례가 여러 값에 걸칠 수 있다(분야·중앙행정기관·챔피언) — 그래서 ids는 집합이다.
 */
export function buildAxes(cases, championsDoc, sggDoc, orgDoc) {
  const locator = makeLocator((sggDoc && sggDoc.sgg) || []);
  const institutionFor = makeInstitutionFinder(orgDoc, locator);
  const affMap = buildChampAffMap(championsDoc);
  const affsOf = new Map();
  for (const ch of (championsDoc && championsDoc.champions) || []) {
    const aff = ((ch.affiliation && ch.affiliation.value) || '').trim();
    if (!aff) continue;
    for (const id of ch.cases || []) affsOf.set(id, [...(affsOf.get(id) || []), aff]);
  }
  const located = new Map(cases.map((c) => [c.id, placeOf(c, affsOf.get(c.id), locator, institutionFor)]));
  const places = new Map([...located].map(([id, v]) => [id, v.place]));

  const task = valuesFrom(TASKS.map((t) => ({
    value: t, label: t, color: TASK_COLORS[t], test: (c) => c.task_category === t,
  })), cases);

  const domain = valuesFrom(CASE_DOMAIN_NAMES.map((n) => ({
    value: n, label: n, test: (c) => matchesCaseDomain(c, n, affMap.get(c.id)),
  })), cases);

  const ministry = valuesFrom(MINISTRY_GROUPS.flatMap((g) => g.items).map((m) => ({
    value: m.name, label: m.name, test: ministryMatcher(m.kw, affMap),
  })), cases).sort((a, b) => b.ids.size - a.ids.size);

  // 시군구 값은 그 시도를 고르면 칩으로 펼쳐진다(parent). value는 '시도/시군구'.
  const sggValues = [];
  for (const r of REGIONS) {
    const names = new Map();
    for (const [, loc] of located) if (loc.place === r && loc.sgg) names.set(loc.sgg.name, loc.sgg);
    for (const [name, sgg] of [...names].sort((a, b) => a[0].localeCompare(b[0], 'ko'))) {
      sggValues.push({ value: `${r}/${name}`, label: name, group: `${r} 시군구`, parent: r, sgg,
        test: (c) => { const l = located.get(c.id); return l.place === r && l.sgg && l.sgg.name === name; } });
    }
  }
  const region = valuesFrom([
    ...REGIONS.map((r) => ({ value: r, label: r, group: '광역시도' })),
    ...ISLANDS.map((i) => ({ value: i.key, label: i.key, group: '지역 밖 섬', sub: i.note })),
  ].map((d) => ({ ...d, test: (c) => places.get(c.id) === d.value })).concat(sggValues), cases);

  const orgtype = valuesFrom(ORG_TYPES.map((t) => ({
    value: t, label: t, test: (c) => c.org_type === t,
  })), cases);

  const champion = ((championsDoc && championsDoc.champions) || [])
    .map((ch) => ({
      value: ch.id,
      label: ch.name,
      sub: (ch.affiliation && ch.affiliation.value) || '',
      region: champRegion(locator, ch.affiliation && ch.affiliation.value),
      tier: ch.certification ? ch.certification.tier : null,
      ids: new Set(ch.cases || []),
      href: `champions.html#champ-${encodeURIComponent(ch.id)}`,
    }))
    .filter((v) => v.ids.size > 0)
    .sort((a, b) => b.ids.size - a.ids.size || a.label.localeCompare(b.label, 'ko'));

  return {
    affMap,
    affsOf,
    places,
    located,
    locator,
    axes: [
      { key: 'task', label: '업무 유형', values: task },
      { key: 'domain', label: '분야', values: domain },
      { key: 'ministry', label: '중앙행정기관', values: ministry },
      { key: 'region', label: '광역시도', values: region },
      { key: 'orgtype', label: '기관 유형', values: orgtype },
      { key: 'champion', label: '챔피언', values: champion, searchable: true },
    ],
  };
}

function champRegion(locator, aff) {
  if (!aff) return null;
  const sgg = locator.locate([aff]);
  return sgg ? `${sgg.region} ${sgg.name}` : locator.regionOf(aff);
}
