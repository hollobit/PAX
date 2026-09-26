// 3D PAX 위치 판정 — 기관명·만든 사람 소속에서 광역시도와 시군구를 읽는다 (사용자 지시 2026-09-27).
//
// 확실한 표기만 읽는다. 원칙:
//  · 시도명이 명시되면 그 시도(서울·경기도·충청남도…).
//  · 시군구는 행정 경계 목록(korea-sgg.json)의 이름으로 찾는다 — '광진구', '성남시청', '의성군청'.
//    시·군은 이름 뒤에 청/지방/지청/소방서/대학교/의회가 붙어도 읽는다('순천대학교', '포항지방…').
//  · 자치구처럼 같은 이름이 여러 시도에 있는 곳(중구·동구·고성군…)과 경기 광주시는
//    같은 문자열이나 사례 원장에서 시도가 확인될 때만 받아들인다.
//  · 겹치는 매치는 긴 쪽이 이긴다('부산 강서구'는 서구가 아니라 강서구). 서로 다른 곳이 남으면 판정하지 않는다.
const AMBIGUOUS_TEXT = /전남광주통합/; // 2026-07 통합 — 옛 광주·전남 중 어디인지 이름만으로 정할 수 없다
const PROVINCE_RULES = [
  [/서울|\bseoul\b/i, '서울'], [/부산/, '부산'], [/대구/, '대구'], [/인천/, '인천'],
  [/광주광역시/, '광주'], [/대전/, '대전'], [/울산/, '울산'], [/세종특별자치시|세종시/, '세종'],
  [/경기/, '경기'], [/강원/, '강원'], [/충청북도|충북/, '충북'], [/충청남도|충남/, '충남'],
  [/전라북도|전북/, '전북'], [/전라남도|전남/, '전남'], [/경상북도|경북/, '경북'],
  [/경상남도|경남/, '경남'], [/제주/, '제주'],
];
const NEEDS_REGION = new Set(['광주시']); // 경기 광주시 ↔ 광주광역시를 '광주시'로 부르는 관행
// 교육지원청은 뺐다 — '화성오산교육지원청'처럼 두 시가 붙은 공동 기관명이 한쪽으로 잘못 떨어진다
const BASE_SUFFIX = '(청|지방|지청|소방서|대학교|의회)';

export function provinceOf(text) {
  if (!text || AMBIGUOUS_TEXT.test(text)) return null;
  for (const [re, region] of PROVINCE_RULES) if (re.test(text)) return region;
  return null;
}

/**
 * @param {{name:string, region:string, center:number[]}[]} sggList
 * @returns {{locate:(texts:string[], regionHint?:string|null)=>object|null, regionOf:(text:string)=>string|null}}
 */
export function makeLocator(sggList) {
  const nameCount = new Map();
  for (const s of sggList) nameCount.set(s.name, (nameCount.get(s.name) || 0) + 1);
  const patterns = sggList.map((s) => {
    const forms = [s.name];
    const base = s.name.slice(0, -1);
    const isGu = s.name.endsWith('구');
    if (!isGu && base.length >= 2) forms.push(`${base}${BASE_SUFFIX}`);
    return {
      sgg: s,
      re: new RegExp(forms.join('|'), 'g'),
      needsRegion: isGu || nameCount.get(s.name) > 1 || NEEDS_REGION.has(s.name),
    };
  });

  function matchText(text, regionHint) {
    if (!text || AMBIGUOUS_TEXT.test(text)) return [];
    const region = provinceOf(text) || regionHint || null;
    const hits = [];
    for (const p of patterns) {
      if (p.needsRegion && p.sgg.region !== region) continue;
      if (region && p.sgg.region !== region) continue;
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(text))) hits.push({ sgg: p.sgg, start: m.index, end: m.index + m[0].length });
    }
    // 더 긴 매치 안에 들어간 짧은 매치는 버린다 (강서구 ⊃ 서구)
    return hits.filter((h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end
      && o.end - o.start > h.end - h.start));
  }

  function locate(texts, regionHint = null) {
    const found = new Map();
    for (const t of texts) {
      for (const h of matchText(t, regionHint)) found.set(`${h.sgg.region}/${h.sgg.name}`, h.sgg);
    }
    return found.size === 1 ? [...found.values()][0] : null;
  }

  function regionOf(text) {
    const p = provinceOf(text);
    if (p) return p;
    const s = locate([text]);
    return s ? s.region : null;
  }

  const byKey = new Map(sggList.map((s) => [`${s.region}/${s.name}`, s]));
  return { locate, regionOf, find: (region, name) => byKey.get(`${region}/${name}`) || null };
}

/**
 * 정부·공공기관 소재지 (사용자 지시 2026-09-27) — org-locations.json의 기관을 기관명·소속에서 찾는다.
 * 기관명 문자열에 다른 시도가 적혀 있으면(병무청 경기북부병무지청) 본부가 아니라 지청이므로 받지 않는다.
 * 여러 기관이 함께 적히면(과학기술정보통신부·NIA) 먼저 나온 기관, 같은 자리면 긴 이름이 이긴다(코레일유통 ⊃ 코레일).
 */
export function makeInstitutionFinder(orgDoc, locator) {
  const insts = ((orgDoc && orgDoc.institutions) || []).map((i) => ({
    ...i,
    sggObj: locator.find(i.region, i.sgg),
    res: i.kw.map((k) => (/^[A-Za-z]/.test(k)
      ? new RegExp(`(^|[^A-Za-z])${k}([^A-Za-z]|$)`) : new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))),
  }));
  return function institutionFor(texts) {
    for (const t of texts) {
      if (!t) continue;
      const province = provinceOf(t);
      let best = null;
      for (const inst of insts) {
        if (province && province !== inst.region) continue;
        inst.kw.forEach((k, i) => {
          const m = inst.res[i].exec(t);
          if (!m) return;
          const at = m.index + (m[1] ? m[1].length : 0);
          if (!best || at < best.at || (at === best.at && k.length > best.len)) best = { inst, at, len: k.length };
        });
      }
      if (best) return best.inst;
    }
    return null;
  };
}
