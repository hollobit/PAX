// 메인 목록 상태 ↔ 주소창 쿼리. 공유 링크로 같은 화면을 복원하려고 모든 설정을 쿼리로 표현한다:
// q, type, src, tag, bm, task, domain, ni, region, ministry, view, sort("key.dir"), case, page.
// 주소창 값이 localStorage 기본값보다 우선한다. 두 함수 모두 state를 바꾸지 않는다.
import { ORG_TYPES, SOURCES, TASK_CATEGORIES, VIEWS } from './app-constants.js?v=c793f71d';

/**
 * 쿼리 문자열을 읽어 state에 덮어쓸 부분(filter·sort·view·page·focusCaseId)을 새 객체로 돌려준다.
 * 목록에 없는 값은 기본값으로 떨어뜨린다 — 손으로 고친 주소가 화면을 깨뜨리지 않게.
 * @param {string} search location.search
 * @param {{filter: object, sort: {key: string, dir: string}, view: string}} state 현재 상태(기본값 출처)
 * @param {{sortKeys: string[], domainNames: string[], ministries: Map<string, unknown>}} vocab
 */
export function readUrlState(search, state, { sortKeys, domainNames, ministries }) {
  const p = new URLSearchParams(search);
  const orgType = p.get('type');
  const source = p.get('src');
  const view = p.get('view');
  let sort = state.sort;
  const sortParam = p.get('sort');
  if (sortParam) {
    const [key, dir] = sortParam.split('.');
    if (sortKeys.includes(key) && (dir === 'asc' || dir === 'desc')) sort = { key, dir };
  }
  const page = Number.parseInt(p.get('page') || '1', 10);
  return {
    filter: {
      ...state.filter,
      q: p.get('q') || '',
      orgType: ORG_TYPES.includes(orgType) ? orgType : '전체',
      source: SOURCES.includes(source) ? source : '전체',
      tag: p.get('tag') || null,
      bookmarkedOnly: p.get('bm') === '1',
      taskCat: TASK_CATEGORIES.includes(p.get('task')) ? p.get('task') : '전체',
      domain: domainNames.includes(p.get('domain')) ? p.get('domain') : '전체',
      noInstallOnly: p.get('ni') === '1',
      region: p.get('region') || null,
      ministry: ministries.has(p.get('ministry')) ? p.get('ministry') : null,
    },
    focusCaseId: p.get('case') || null,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    view: VIEWS.includes(view) ? view : state.view,
    sort,
  };
}

/** 기본값과 다른 설정만 담은 쿼리 문자열(앞의 '?' 없음). */
export function buildUrlQuery(state) {
  const p = new URLSearchParams();
  const f = state.filter;
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.orgType !== '전체') p.set('type', f.orgType);
  if (f.source !== '전체') p.set('src', f.source);
  if (f.tag) p.set('tag', f.tag);
  if (f.bookmarkedOnly) p.set('bm', '1');
  if (f.taskCat !== '전체') p.set('task', f.taskCat);
  if (f.domain !== '전체') p.set('domain', f.domain);
  if (f.noInstallOnly) p.set('ni', '1');
  if (f.region) p.set('region', f.region);
  if (f.ministry) p.set('ministry', f.ministry);
  if (state.view !== 'cards') p.set('view', state.view);
  if (state.sort.key !== 'popularity' || state.sort.dir !== 'desc') {
    p.set('sort', `${state.sort.key}.${state.sort.dir}`);
  }
  if (state.focusCaseId) p.set('case', state.focusCaseId);
  if (state.page > 1) p.set('page', String(state.page));
  return p.toString();
}
