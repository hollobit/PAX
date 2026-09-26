// 3D PAX 데이터 계층 — 사례를 여섯 축으로 묶고, 미니어처 지도 위 자리(시도·섬)를 정한다.
//
// 분류 규칙은 새로 만들지 않는다. 분야는 case-domains.js, 중앙행정기관·지역 스코프는
// ministries.js의 전역 정의를 그대로 쓴다 — 첫 화면·관측소·격차 지도와 같은 숫자가 나와야 한다.
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

// ---- 만든 사람의 소속 → 광역시도 (사용자 지시 2026-09-27) ---------------------------------
// 사례에 region이 없어도 챔피언 소속이 지역을 말해 주는 경우가 많다(성남시청, 서울특별시 광진구…).
// 확실한 표기만 읽는다: 시도명이 명시됐거나, 시·군 이름 뒤에 시/군/청/지방/지청/소방서/대학교가 붙은 경우.
// 동명 지명(고성 — 강원·경남, 광주시 — 경기·광역시)과 '중구' 같은 자치구 단독 표기는 일부러 뺐다.
const AMBIGUOUS_AFF = /전남광주통합/; // 2026-07 통합 출범 — 옛 광주·전남 중 어디로 둘지 원장이 정하지 않았다
const PROVINCE_RULES = [
  [/서울|\bseoul\b/i, '서울'], [/부산/, '부산'], [/대구/, '대구'], [/인천/, '인천'],
  [/광주광역시/, '광주'], [/대전/, '대전'], [/울산/, '울산'], [/세종특별자치시|세종시/, '세종'],
  [/경기/, '경기'], [/강원/, '강원'], [/충청북도|충북/, '충북'], [/충청남도|충남/, '충남'],
  [/전라북도|전북/, '전북'], [/전라남도|전남/, '전남'], [/경상북도|경북/, '경북'],
  [/경상남도|경남/, '경남'], [/제주/, '제주'],
];
const CITIES = {
  경기: '수원 성남 고양 용인 부천 안산 안양 남양주 화성 평택 의정부 시흥 파주 김포 광명 군포 하남 오산 이천 안성 의왕 양주 구리 포천 동두천 과천 여주 가평 양평 연천',
  강원: '춘천 원주 강릉 동해 태백 속초 삼척 홍천 횡성 영월 평창 정선 철원 화천 양구 인제 양양',
  충북: '청주 충주 제천 보은 옥천 영동 증평 진천 괴산 음성 단양',
  충남: '천안 공주 보령 아산 서산 논산 계룡 당진 금산 부여 서천 청양 홍성 예산 태안',
  전북: '전주 군산 익산 정읍 남원 김제 완주 진안 무주 장수 임실 순창 고창 부안',
  전남: '목포 여수 순천 나주 광양 담양 곡성 구례 고흥 보성 화순 장흥 강진 해남 영암 무안 함평 영광 장성 완도 진도 신안',
  경북: '포항 경주 김천 안동 구미 영주 영천 상주 문경 경산 의성 청송 영양 영덕 청도 고령 성주 칠곡 예천 봉화 울진 울릉',
  경남: '창원 진주 통영 사천 김해 밀양 거제 양산 의령 함안 창녕 남해 하동 산청 함양 거창 합천',
  대구: '군위',
  제주: '서귀포',
};
const CITY_RULES = Object.entries(CITIES).flatMap(([region, names]) =>
  names.split(' ').map((n) => [new RegExp(`${n}(시|군|청|지방|지청|소방서|대학교)`), region]));

export function regionFromAffiliation(aff) {
  if (!aff || AMBIGUOUS_AFF.test(aff)) return null;
  for (const [re, region] of PROVINCE_RULES) if (re.test(aff)) return region;
  for (const [re, region] of CITY_RULES) if (re.test(aff)) return region;
  return null;
}

/** 사례 한 건의 자리와 그 근거. 우선순위: 원장 region > 만든 사람 소속 > 스코프별 섬. */
export function placeOf(c, affs) {
  if (REGIONS.includes(c.region)) return { place: c.region, basis: 'region' };
  const votes = new Map();
  for (const a of affs || []) {
    const r = regionFromAffiliation(a);
    if (r) votes.set(r, (votes.get(r) || 0) + 1);
  }
  const ranked = [...votes].sort((a, b) => b[1] - a[1]);
  // 공동 제작자 소속이 서로 다른 시도로 갈리면 어느 한쪽에 두지 않는다
  if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
    return { place: ranked[0][0], basis: 'affiliation' };
  }
  const scope = paxRegionScope(c, (affs || []).join(' '));
  const island = ISLANDS.find((i) => i.scopes.includes(scope));
  return { place: island ? island.key : '공직 현장 섬', basis: 'island' };
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
export function buildAxes(cases, championsDoc) {
  const affMap = buildChampAffMap(championsDoc);
  const affsOf = new Map();
  for (const ch of (championsDoc && championsDoc.champions) || []) {
    const aff = ((ch.affiliation && ch.affiliation.value) || '').trim();
    if (!aff) continue;
    for (const id of ch.cases || []) affsOf.set(id, [...(affsOf.get(id) || []), aff]);
  }
  const located = new Map(cases.map((c) => [c.id, placeOf(c, affsOf.get(c.id))]));
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

  const region = valuesFrom([
    ...REGIONS.map((r) => ({ value: r, label: r, group: '광역시도' })),
    ...ISLANDS.map((i) => ({ value: i.key, label: i.key, group: '지역 밖 섬', sub: i.note })),
  ].map((d) => ({ ...d, test: (c) => places.get(c.id) === d.value })), cases);

  const orgtype = valuesFrom(ORG_TYPES.map((t) => ({
    value: t, label: t, test: (c) => c.org_type === t,
  })), cases);

  const champion = ((championsDoc && championsDoc.champions) || [])
    .map((ch) => ({
      value: ch.id,
      label: ch.name,
      sub: (ch.affiliation && ch.affiliation.value) || '',
      region: regionFromAffiliation(ch.affiliation && ch.affiliation.value),
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
