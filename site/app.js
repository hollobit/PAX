'use strict';

/**
 * 공공AX 사례 아카이브 — 클라이언트 로직
 * 상태는 하나의 불변 filter 객체로 관리한다 (state.filter는 항상 새 객체로 교체).
 * 데이터 삽입은 전부 textContent / createElement 를 사용하며 innerHTML에
 * 사례 데이터를 문자열로 연결하는 코드는 두지 않는다 (XSS 방지).
 */

import { loadBookmarks, loadBookmarkCounts, toggleBookmark as storeToggleBookmark, onBookmarksChanged } from './pax-bookmarks.js?v=c1fdc503';
import { createExportToolbar } from './app-export.js?v=fb98639b';
import { ORG_TYPES, SOURCES, TASK_CATEGORIES, SYNONYMS, VIEWS } from './app-constants.js?v=c793f71d';
import { readUrlState, buildUrlQuery } from './app-url.js?v=57ff3f9e';
import { createCaseCard, createCaseTable, siteHostname } from './app-cards.js?v=afa344be';

// 분야(도메인) 분류는 site/case-domains.js가 정본이다 — 관측소 현황판과 같은 정의를 쓴다.
const DOMAIN_NAMES = CASE_DOMAIN_NAMES;
const matchesDomain = matchesCaseDomain;

/* ── 북마크 ── 내 북마크 저장과 전체 누적 카운터는 pax-bookmarks.js(3D PAX와 공용)가 맡는다. */
// 인기 항목 수: 북마크 횟수 상위 N개
const POPULAR_TOP_N = 20;

function bookmarkCount(c) {
  return state.bookmarkCounts.get(c.id) || 0;
}

// 목록형 정렬 가능 컬럼: key → (사례 → 정렬용 문자열)
const SORT_ACCESSORS = {
  title: (c) => c.title,
  org: (c) => c.org,
  org_type: (c) => c.org_type,
  source: (c) => (c.source === 'threads' ? 'Threads' : '오픈채팅'),
  site: (c) => siteHostname(c) || '￿', // 사이트 없는 행은 항상 뒤로
  date: (c) => c.date + c.collected_at,
};

// 신규: 최근 3일 이내에 수집된 사례
const NEW_WINDOW_DAYS = 3;

function isNewCase(c) {
  const collected = new Date(`${c.collected_at}T00:00:00`);
  const ageDays = (Date.now() - collected.getTime()) / 86400000;
  return ageDays >= 0 && ageDays <= NEW_WINDOW_DAYS;
}

// 인기 지표 비교: 누적 북마크 수 → SNS 반응(popularity) → 최신 게시일순
function comparePopularityMetrics(a, b) {
  const bmDiff = bookmarkCount(b) - bookmarkCount(a);
  if (bmDiff !== 0) return bmDiff;
  const diff = (b.popularity || 0) - (a.popularity || 0);
  if (diff !== 0) return diff;
  return (b.date + b.collected_at).localeCompare(a.date + a.collected_at);
}

// 기본 정렬: 인기(상위 N) → 신규(최근 수집) → 나머지 최신 게시일순.
// 인기 구간 안에서는 지표순, 신규 구간 안에서는 수집일·게시일 최신순.
function comparePopularFirst(a, b) {
  const popDiff = Number(isPopularCase(b)) - Number(isPopularCase(a));
  if (popDiff !== 0) return popDiff;
  if (isPopularCase(a)) return comparePopularityMetrics(a, b);
  const newDiff = Number(isNewCase(b)) - Number(isNewCase(a));
  if (newDiff !== 0) return newDiff;
  if (isNewCase(a)) {
    const collectedDiff = b.collected_at.localeCompare(a.collected_at);
    if (collectedDiff !== 0) return collectedDiff;
  }
  return (b.date + b.collected_at).localeCompare(a.date + a.collected_at);
}

// 인기 집합: 누적 북마크 순 상위 20개. 북마크된 사례를 횟수순으로 먼저 채우고,
// 20개가 안 되는 동안은 SNS 반응 지표 보유 사례로 나머지를 채운다.
function computePopularSet() {
  const ranked = [...state.cases]
    .filter((c) => bookmarkCount(c) > 0 || c.popularity)
    .sort(comparePopularityMetrics)
    .slice(0, POPULAR_TOP_N);
  return new Set(ranked.map((c) => c.id));
}

function isPopularCase(c) {
  return state.popularSet.has(c.id);
}

// 사례 대상 URL의 호스트명 (유니코드 도메인 보존을 위해 문자열로 추출)
const state = {
  cases: [],
  filter: { q: '', orgType: '전체', source: '전체', tag: null, bookmarkedOnly: false, taskCat: '전체', domain: '전체', noInstallOnly: false, region: null, ministry: null },
  page: 1,
  view: loadSavedView(), // 'cards' | 'list'
  sort: { key: 'popularity', dir: 'desc' }, // 기본: 인기 우선, 이후 최신순
  bookmarks: loadBookmarks(), // Set<caseId> — localStorage에 보존
  bookmarkCounts: new Map(), // 전체 사용자 누적 북마크 수 (Supabase)
  champTerms: new Map(), // 사례 id → 챔피언 이름·소속·계정 검색어
  champOfCase: new Map(), // 사례 id → [{id, name}] (카드 '만든 사람' 표시용, 로드맵 1-8)
  champAffOfCase: new Map(), // 사례 id → 챔피언 소속 문자열 (부처 필터 매칭용 — 격차 지도와 동일 기준)
  evalById: new Map(), // 사례 id → 4축 평가 (카드 배지·CSV 결합용, 로드맵 1-3)
  popularSet: new Set(), // 인기 항목 id (북마크순 상위 N)
  focusCaseId: null, // ?case=<id> 딥링크 대상 — 첫 렌더 후 스크롤·강조
  status: 'loading', // 'loading' | 'loaded' | 'error'
};

function toggleBookmark(id) {
  // 저장·서버 카운터 전송은 공용 모듈이, 화면용 누적 수는 여기서 낙관적으로 갱신한다
  const next = storeToggleBookmark(state.bookmarks, id);
  state.bookmarks = next;
  const delta = next.has(id) ? 1 : -1;
  const counts = new Map(state.bookmarkCounts);
  counts.set(id, Math.max((counts.get(id) || 0) + delta, 0));
  state.bookmarkCounts = counts;
  syncBookmarkFilterButton();
  // '북마크만 보기' 중에는 목록 자체가 달라지므로 전체 렌더링이 필요하지만,
  // 평소에는 화면 깜빡임 없이 해당 사례의 별표 버튼만 제자리에서 갱신한다.
  if (state.filter.bookmarkedOnly) {
    render();
    return;
  }
  const bookmarked = next.has(id);
  document.querySelectorAll(`.bookmark-btn[data-case-id="${CSS.escape(id)}"]`)
    .forEach((btn) => {
      btn.textContent = bookmarked ? '★' : '☆';
      btn.setAttribute('aria-pressed', String(bookmarked));
      btn.setAttribute('aria-label', bookmarked ? '북마크 해제' : '북마크 추가');
      btn.title = bookmarked ? '북마크 해제' : '북마크 추가';
    });
}

function loadSavedView() {
  try {
    const saved = localStorage.getItem('pax-view');
    return VIEWS.includes(saved) ? saved : 'cards';
  } catch {
    return 'cards';
  }
}

/* ── URL ↔ 상태 동기화 ── 읽기·쓰기 규칙은 app-url.js의 순수 함수가 맡는다. */
function applyUrlToState() {
  Object.assign(state, readUrlState(location.search, state, {
    sortKeys: [...Object.keys(SORT_ACCESSORS), 'popularity'],
    domainNames: DOMAIN_NAMES,
    ministries: typeof MINISTRY_BY_NAME !== 'undefined' ? MINISTRY_BY_NAME : new Map(),
  }));
}

function syncUrl() {
  const qs = buildUrlQuery(state);
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

const els = {
  stats: document.getElementById('stats'),
  search: document.getElementById('search'),
  orgTypeFilter: document.getElementById('org-type-filter'),
  taskChips: document.getElementById('task-chips'),
  noInstallFilter: document.getElementById('no-install-filter'),
  sourceFilter: document.getElementById('source-filter'),
  viewTags: document.getElementById('view-tags'),
  activeTag: document.getElementById('active-tag'),
  caseList: document.getElementById('case-list'),
  viewCards: document.getElementById('view-cards'),
  viewList: document.getElementById('view-list'),
  bookmarkFilter: document.getElementById('bookmark-filter'),
  domainChips: document.getElementById('domain-chips'),
  emptyState: document.getElementById('empty-state'),
  errorState: document.getElementById('error-state'),
};

async function load() {
  try {
    // 점진 렌더: cases.json 도착 즉시 첫 화면을 그린다. 북마크 카운트(외부 API)·
    // 챔피언·평가 데이터는 배경에서 받아 도착 후 한 번에 제자리 보강한다 —
    // 외부 서비스 지연이 첫 화면을 붙잡지 않게 하는 구조.
    // no-cache: 항상 서버와 재검증(ETag) — 새 사례·태그가 배포 즉시 반영되도록
    const enhancements = Promise.allSettled([
      loadBookmarkCounts(),
      fetch('./data/champions.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)),
      fetch('./data/evals-lite.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)),
    ]);
    const res = await fetch('./data/cases.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    state.cases = [...doc.cases];
    // 첫 렌더의 인기 집합은 SNS 반응(popularity) 기준 — 북마크 수는 도착 후 반영
    state.popularSet = computePopularSet();
    state.cases.sort(comparePopularFirst);
    state.status = 'loaded';
    renderStats(doc.updated_at, state.cases.length);
    render();
    applyEnhancements(enhancements);
  } catch (err) {
    console.error('cases.json 로드 실패:', err);
    state.status = 'error';
    els.errorState.hidden = false;
  }
}

async function applyEnhancements(pending) {
  const [countsRes, champRes, evalRes] = await pending;
  let changed = false;
  if (countsRes.status === 'fulfilled' && countsRes.value.size) {
    state.bookmarkCounts = countsRes.value;
    changed = true;
  }
  // 4축 평가 결합 (로드맵 1-3) — 경량본(evals-lite) 사용, 실패해도 배지·CSV 열만 빠진다
  if (evalRes.status === 'fulfilled' && evalRes.value) {
    try {
      state.evalById = new Map(evalRes.value.cases.map((e) => [e.id, e]));
      changed = true;
    } catch (err) {
      console.error('평가 데이터 결합 실패:', err);
    }
  }
  // 챔피언 이름·소속·계정 검색어와 '만든 사람' 링크 — 실패해도 검색 범위만 줄어든다
  if (champRes.status === 'fulfilled' && champRes.value) {
    try {
      for (const ch of champRes.value.champions) {
        const terms = [ch.name, ch.affiliation && ch.affiliation.value,
          ...ch.accounts.map((a) => a.id)].filter(Boolean).join(' ').toLowerCase();
        const aff = (ch.affiliation && ch.affiliation.value) || '';
        for (const caseId of ch.cases) {
          state.champTerms.set(caseId, `${state.champTerms.get(caseId) || ''} ${terms}`);
          const owners = state.champOfCase.get(caseId) || [];
          owners.push({ id: ch.id, name: ch.name });
          state.champOfCase.set(caseId, owners);
          if (aff) {
            state.champAffOfCase.set(caseId, `${state.champAffOfCase.get(caseId) || ''} ${aff}`);
          }
        }
      }
      changed = true;
    } catch (err) {
      console.error('챔피언 검색어 구성 실패:', err);
    }
  }
  if (!changed || state.status !== 'loaded') return;
  // 북마크 순위가 도착했으므로 인기 집합·정렬을 갱신하고 한 번만 다시 그린다
  state.popularSet = computePopularSet();
  state.cases.sort(comparePopularFirst);
  render();
}

function renderStats(updatedAt, count) {
  // updated_at 예: "2026-08-07T09:13:43+09:00" → "2026-08-07 09:13"
  const label = typeof updatedAt === 'string' && updatedAt.length >= 16
    ? `${updatedAt.slice(0, 10)} ${updatedAt.slice(11, 16)}`
    : '알 수 없음';
  const kakaoN = state.cases.filter((c) => c.source === 'kakao').length;
  const threadsN = state.cases.filter((c) => c.source === 'threads').length;
  els.stats.textContent = `전체 ${count}건 (오픈채팅 ${kakaoN} · Threads ${threadsN}) · 최근 갱신 ${label}`;
}

function buildFilterOptions() {
  fillSelect(els.orgTypeFilter, ORG_TYPES);
  fillSelect(els.sourceFilter, SOURCES);

  els.noInstallFilter.addEventListener('click', () => {
    state.filter = { ...state.filter, noInstallOnly: !state.filter.noInstallOnly };
    els.noInstallFilter.setAttribute('aria-pressed', String(state.filter.noInstallOnly));
    render();
  });
  els.orgTypeFilter.addEventListener('change', () => {
    state.filter = { ...state.filter, orgType: els.orgTypeFilter.value };
    render();
  });
  els.sourceFilter.addEventListener('change', () => {
    state.filter = { ...state.filter, source: els.sourceFilter.value };
    render();
  });
  els.search.addEventListener('input', () => {
    state.filter = { ...state.filter, q: els.search.value };
    render();
  });
  els.viewCards.addEventListener('click', () => setView('cards'));
  els.viewList.addEventListener('click', () => setView('list'));
  els.viewTags.addEventListener('click', () => setView('tags'));
  syncViewButtons();

  els.bookmarkFilter.addEventListener('click', () => {
    state.filter = { ...state.filter, bookmarkedOnly: !state.filter.bookmarkedOnly };
    syncBookmarkFilterButton();
    render();
  });
  syncBookmarkFilterButton();
}

function syncBookmarkFilterButton() {
  const count = state.bookmarks.size;
  els.bookmarkFilter.setAttribute('aria-pressed', String(state.filter.bookmarkedOnly));
  els.bookmarkFilter.textContent = count > 0 ? `★ 북마크만 보기 (${count})` : '★ 북마크만 보기';
}

function setView(view) {
  state.view = view;
  try {
    localStorage.setItem('pax-view', view);
  } catch {
    // 저장 실패(사생활 보호 모드 등)는 무시 — 세션 내 전환은 동작한다
  }
  syncViewButtons();
  render();
}

function syncViewButtons() {
  els.viewCards.setAttribute('aria-pressed', String(state.view === 'cards'));
  els.viewList.setAttribute('aria-pressed', String(state.view === 'list'));
  els.viewTags.setAttribute('aria-pressed', String(state.view === 'tags'));
}

function setSort(key) {
  const dir = state.sort.key === key && state.sort.dir === 'asc' ? 'desc' : 'asc';
  // 날짜는 첫 클릭에 최신순(내림차순)이 자연스럽다
  const firstDir = key === 'date' ? 'desc' : 'asc';
  state.sort = state.sort.key === key
    ? { key, dir }
    : { key, dir: firstDir };
  render();
}

function sortForList(results) {
  if (state.sort.key === 'popularity') {
    const sign = state.sort.dir === 'desc' ? 1 : -1;
    return [...results].sort((a, b) => sign * comparePopularFirst(a, b));
  }
  const accessor = SORT_ACCESSORS[state.sort.key] || SORT_ACCESSORS.date;
  const sign = state.sort.dir === 'asc' ? 1 : -1;
  return [...results].sort((a, b) => sign * accessor(a).localeCompare(accessor(b), 'ko'));
}

// 전체 태그를 빈도순(동률이면 가나다순)으로 집계한다 — "태그" 보기의 데이터.
function tagCounts() {
  const counts = new Map();
  for (const c of state.cases) {
    for (const tag of c.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
}

// "태그" 보기의 태그 패널: 전체 태그 버튼 + 선택 시 아래에 해당 사례 카드 표시.
function createTagPanel() {
  const panel = document.createElement('div');
  panel.className = 'tag-view-panel';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', '태그 필터');

  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'tag-chip tag-chip--all';
  all.setAttribute('aria-pressed', String(!state.filter.tag));
  all.textContent = '전체';
  all.addEventListener('click', () => {
    if (state.filter.tag) setTag(state.filter.tag); // 현재 태그 해제
  });
  panel.appendChild(all);

  for (const [tag, count] of tagCounts()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-chip';
    btn.setAttribute('aria-pressed', String(state.filter.tag === tag));
    btn.textContent = `#${tag} (${count})`;
    btn.addEventListener('click', () => setTag(tag));
    panel.appendChild(btn);
  }
  return panel;
}

function fillSelect(select, values) {
  select.replaceChildren();
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}

function expandQuery(q) {
  // 동의어 확장 (로드맵 1-1): 검색어가 사전에 있으면 동의어 중 하나만 맞아도 매칭
  const terms = [q];
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    if (q.includes(key.toLowerCase())) terms.push(...syns.map((s) => s.toLowerCase()));
  }
  return terms;
}

function matches(c, f) {
  if (f.bookmarkedOnly && !state.bookmarks.has(c.id)) return false;
  if (f.orgType !== '전체' && c.org_type !== f.orgType) return false;
  if (f.source !== '전체' && c.source !== (f.source === 'Threads' ? 'threads' : 'kakao')) return false;
  if (f.tag && !c.tags.includes(f.tag)) return false;
  if (f.taskCat !== '전체' && c.task_category !== f.taskCat) return false;
  if (f.domain !== '전체' && !matchesDomain(c, f.domain, state.champAffOfCase.get(c.id) || '')) return false;
  if (f.noInstallOnly && c.runtime_env !== '브라우저만') return false;
  if (f.region) {
    if (f.region === '미상') {
      const scope = paxRegionScope(c, state.champAffOfCase.get(c.id) || '');
      if (scope !== 'unknown') return false;
    } else if (c.region !== f.region) return false;
  }
  if (f.ministry) {
    const kws = MINISTRY_BY_NAME.get(f.ministry) || [];
    const aff = state.champAffOfCase.get(c.id) || '';
    if (!kws.some((k) => c.org.includes(k) || aff.includes(k))) return false;
  }
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  const haystack = [c.title, c.summary, c.org, ...c.tags].join(' ').toLowerCase()
    + (state.champTerms.get(c.id) || '');
  return expandQuery(q).some((term) => haystack.includes(term));
}

function setTag(tag) {
  const nextTag = state.filter.tag === tag ? null : tag;
  state.filter = { ...state.filter, tag: nextTag };
  render();
}

// ── 쪽 나누기 ── 사례가 늘면서 카드 보기가 매 렌더마다 수백 장을 DOM으로 만들어
// 첫 화면과 필터 반응이 느려졌다. 결과를 100건씩 끊어 그린다.
const PAGE_SIZE = 100;

// 필터·정렬·보기가 바뀌면 1쪽으로 돌아가야 한다. 필터를 건드리는 곳이 여러 군데라
// 호출부마다 초기화를 넣으면 언젠가 빠뜨리므로, 렌더 한 곳에서 서명 변화로 판정한다.
let lastPageKey = null;

function pageKeyOf() {
  const f = state.filter;
  return JSON.stringify([f.q, f.orgType, f.source, f.tag, f.bookmarkedOnly, f.taskCat,
    f.domain, f.noInstallOnly, f.region, f.ministry, state.view, state.sort.key, state.sort.dir]);
}

function resolvePage(total, results) {
  const key = pageKeyOf();
  // 첫 렌더(lastPageKey === null)는 URL로 들어온 page를 살린다.
  if (lastPageKey !== null && key !== lastPageKey) state.page = 1;
  lastPageKey = key;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 깊은 링크로 들어온 사례가 다른 쪽에 있으면 그 쪽으로 옮겨 준다 — 아니면 스크롤할 대상이 없다.
  if (state.focusCaseId && results) {
    const idx = results.findIndex((c) => c.id === state.focusCaseId);
    if (idx >= 0) state.page = Math.floor(idx / PAGE_SIZE) + 1;
  }
  state.page = Math.min(Math.max(1, state.page), pages);
  // render()가 맨 앞에서 URL을 쓰는데 쪽은 여기서 확정된다 — 다시 맞춰야 주소가 화면과 어긋나지 않는다.
  syncUrl();
  return { pages, start: (state.page - 1) * PAGE_SIZE };
}

function createPager(total, pages) {
  const nav = document.createElement('nav');
  nav.className = 'pager';
  nav.setAttribute('aria-label', '쪽 이동');
  const from = (state.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(state.page * PAGE_SIZE, total);
  const range = document.createElement('span');
  range.className = 'pager__range';
  range.textContent = `${from}–${to} / ${total}건`;
  nav.appendChild(range);

  const go = (n, label, opts = {}) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pager__btn';
    btn.textContent = label;
    if (opts.current) btn.setAttribute('aria-current', 'page');
    if (opts.disabled) btn.disabled = true;
    else {
      btn.addEventListener('click', () => {
        state.page = n;
        render();
        // 쪽을 넘기면 목록 위로 — 넘긴 자리에서 이어 읽게 한다.
        els.caseList.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    nav.appendChild(btn);
  };

  go(state.page - 1, '‹ 이전', { disabled: state.page === 1 });
  // 쪽 수가 많아도 버튼은 현재 쪽 둘레만 — 나머지는 생략 표시로 줄인다.
  const win = [];
  for (let n = 1; n <= pages; n += 1) {
    if (n === 1 || n === pages || Math.abs(n - state.page) <= 1) win.push(n);
  }
  let prev = 0;
  for (const n of win) {
    if (n - prev > 1) {
      const gap = document.createElement('span');
      gap.className = 'pager__gap';
      gap.textContent = '…';
      nav.appendChild(gap);
    }
    go(n, String(n), { current: n === state.page });
    prev = n;
  }
  go(state.page + 1, '다음 ›', { disabled: state.page === pages });
  return nav;
}

function focusDeepLinkedCase() {
  if (!state.focusCaseId) return;
  const el = document.querySelector(`[data-case-id="${CSS.escape(state.focusCaseId)}"]`);
  if (!el) return;
  el.classList.add('case-card--focused');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  state.focusCaseId = null; // 1회만 — 이후 필터 조작을 방해하지 않는다
}

function renderTaskChips() {
  if (!els.taskChips) return;
  els.taskChips.replaceChildren();
  const label = document.createElement('span');
  label.className = 'chip-row-label';
  label.textContent = '업무';
  els.taskChips.appendChild(label);
  for (const cat of ['전체', ...TASK_CATEGORIES]) {
    const n = cat === '전체'
      ? state.cases.length
      : state.cases.filter((c) => c.task_category === cat).length;
    if (cat !== '전체' && n === 0) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'task-chip';
    btn.textContent = `${cat} ${n}`;
    btn.setAttribute('aria-pressed', String(state.filter.taskCat === cat));
    btn.addEventListener('click', () => {
      state.filter = { ...state.filter, taskCat: cat };
      render();
    });
    els.taskChips.appendChild(btn);
  }
}

// 분야 칩 — 업무 칩과 같은 모양이되 독립 축이다. 두 줄이 나란히 서므로
// 각 줄 앞에 무슨 축인지 이름을 붙인다(이름이 없으면 한 줄로 읽힌다).
function renderDomainChips() {
  if (!els.domainChips) return;
  els.domainChips.replaceChildren();
  const label = document.createElement('span');
  label.className = 'chip-row-label';
  label.textContent = '분야';
  els.domainChips.appendChild(label);
  for (const name of ['전체', ...DOMAIN_NAMES]) {
    const n = name === '전체'
      ? state.cases.length
      : state.cases.filter((c) => matchesDomain(c, name, state.champAffOfCase.get(c.id) || '')).length;
    if (name !== '전체' && n === 0) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'task-chip';
    btn.textContent = `${name} ${n}`;
    btn.setAttribute('aria-pressed', String(state.filter.domain === name));
    btn.addEventListener('click', () => {
      state.filter = { ...state.filter, domain: name };
      render();
    });
    els.domainChips.appendChild(btn);
  }
}

function render() {
  syncUrl();
  renderTaskChips();
  renderDomainChips();
  renderRegionFilter();
  if (els.noInstallFilter) {
    els.noInstallFilter.setAttribute('aria-pressed', String(state.filter.noInstallOnly));
  }
  state.popularSet = computePopularSet();
  // fetch가 실패한 뒤에는 필터 변경 이벤트가 와도 렌더링을 건너뛴다 — 그렇지
  // 않으면 빈 결과(cases=[])가 empty-state를 열어 error-state와 동시에 표시된다.
  if (state.status !== 'loaded') return;

  const results = state.cases.filter((c) => matches(c, state.filter));

  renderActiveTag();

  els.caseList.replaceChildren();
  els.emptyState.hidden = results.length !== 0;
  els.caseList.classList.toggle('case-list--table', state.view !== 'cards');

  if (state.view === 'list') {
    if (results.length > 0) {
      const sorted = sortForList(results);
      const { pages, start } = resolvePage(sorted.length, sorted);
      // 내려받기는 보이는 쪽이 아니라 걸러진 전체를 담는다 — 쪽 나누기는 표시 방식일 뿐이다.
      els.caseList.appendChild(createExportToolbar(sorted, state.evalById));
      els.caseList.appendChild(createCaseTable(sorted.slice(start, start + PAGE_SIZE), cardCtx()));
      if (pages > 1) els.caseList.appendChild(createPager(sorted.length, pages));
    }
    return;
  }

  if (state.view === 'tags') {
    // 태그 보기: 전체 태그 패널 + 선택된 태그의 사례 카드
    els.caseList.appendChild(createTagPanel());
    els.emptyState.hidden = true;
    if (state.filter.tag) {
      const grid = document.createElement('div');
      grid.className = 'case-list tag-view-results';
      results.forEach((c, i) => {
        const card = createCaseCard(c, cardCtx());
        card.style.setProperty('--i', String(i));
        grid.appendChild(card);
      });
      els.caseList.appendChild(grid);
      els.emptyState.hidden = results.length !== 0;
    } else {
      const hint = document.createElement('p');
      hint.className = 'tag-view-hint';
      hint.textContent = '태그를 선택하면 해당 사례가 아래에 표시됩니다.';
      els.caseList.appendChild(hint);
    }
    return;
  }

  const { pages, start } = resolvePage(results.length, results);
  results.slice(start, start + PAGE_SIZE).forEach((c, i) => {
    const card = createCaseCard(c, cardCtx());
    card.style.setProperty('--i', String(i));
    els.caseList.appendChild(card);
  });
  if (pages > 1) els.caseList.appendChild(createPager(results.length, pages));
  focusDeepLinkedCase();
}

function createPopularBadge(c) {
  const badge = document.createElement('span');
  badge.className = 'popular-badge';
  badge.textContent = '🔥 인기';
  const parts = [];
  const bm = bookmarkCount(c);
  if (bm > 0) parts.push(`북마크 ${bm}회`);
  if (c.popularity) parts.push(`커뮤니티 반응 ${c.popularity}`);
  badge.title = parts.join(' · ') || '인기 사례';
  return badge;
}

function createNewBadge() {
  const badge = document.createElement('span');
  badge.className = 'new-badge';
  badge.textContent = '✨ 신규';
  badge.title = `최근 ${NEW_WINDOW_DAYS}일 내 추가된 사례`;
  return badge;
}

// 카드·목록 표(app-cards.js)가 읽는 상태와 콜백 — 렌더할 때마다 현재 값으로 만든다.
function cardCtx() {
  return {
    evalById: state.evalById,
    champOfCase: state.champOfCase,
    sort: state.sort,
    activeTag: state.filter.tag,
    isNew: isNewCase,
    isPopular: isPopularCase,
    popularBadge: createPopularBadge,
    newBadge: createNewBadge,
    bookmarkButton: createBookmarkButton,
    onSort: setSort,
    onTag: setTag,
  };
}

function createBookmarkButton(c) {
  const bookmarked = state.bookmarks.has(c.id);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bookmark-btn';
  btn.dataset.caseId = c.id;
  btn.textContent = bookmarked ? '★' : '☆';
  btn.setAttribute('aria-pressed', String(bookmarked));
  btn.setAttribute('aria-label', bookmarked ? '북마크 해제' : '북마크 추가');
  btn.title = bookmarked ? '북마크 해제' : '북마크 추가';
  btn.addEventListener('click', () => toggleBookmark(c.id));
  return btn;
}

function renderRegionFilter() {
  // region/ministry 필터가 URL로 들어온 경우 상단에 표시하고 해제할 수 있게 한다 (격차 지도 연결용)
  let bar = document.getElementById('region-filter-bar');
  if (!state.filter.region && !state.filter.ministry) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'region-filter-bar';
    bar.className = 'active-tag';
    els.caseList.parentNode.insertBefore(bar, els.caseList);
  }
  bar.hidden = false;
  bar.replaceChildren();
  const span = document.createElement('span');
  span.textContent = state.filter.ministry
    ? `기관 필터: ${state.filter.ministry} (기관 표기·챔피언 소속 기준)`
    : (state.filter.region === '미상'
      ? '지역 필터: 미확인 — 소속·지역 증거가 없는 사례 (중앙부처·공공기관·커뮤니티는 전국 단위로 분류되어 제외)'
      : `지역 필터: ${state.filter.region} (지역 확정 분류 기준)`);
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'export-btn';
  clear.textContent = '해제';
  clear.addEventListener('click', () => {
    state.filter = { ...state.filter, region: null, ministry: null };
    render();
  });
  bar.append(span, ' ', clear);
}

function renderActiveTag() {
  const tag = state.filter.tag;
  els.activeTag.replaceChildren();

  if (!tag) {
    els.activeTag.hidden = true;
    return;
  }
  els.activeTag.hidden = false;

  const pill = document.createElement('span');
  pill.className = 'active-tag-pill';

  const label = document.createElement('span');
  label.append('태그 필터: ');
  const strong = document.createElement('strong');
  strong.textContent = tag;
  label.appendChild(strong);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'active-tag-clear';
  clear.textContent = '해제 ✕';
  clear.addEventListener('click', () => setTag(tag));

  pill.appendChild(label);
  pill.appendChild(clear);
  els.activeTag.appendChild(pill);
}

// 검색/필터 컨트롤은 정적 상수(ORG_TYPES, SOURCES)에만 의존하므로 fetch 성공 여부와
// 무관하게 항상 초기화한다 — fetch가 실패해도 컨트롤 바가 죽은 채로 남지 않도록.
applyUrlToState();
buildFilterOptions();
// URL에서 복원한 설정을 컨트롤에 반영
els.search.value = state.filter.q;
els.orgTypeFilter.value = state.filter.orgType;
els.sourceFilter.value = state.filter.source;
syncViewButtons();
syncBookmarkFilterButton();
// 3D PAX 등 다른 탭에서 바꾼 북마크를 따라간다
onBookmarksChanged((next) => {
  state.bookmarks = next;
  syncBookmarkFilterButton();
  render();
});
load();
