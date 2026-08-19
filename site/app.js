'use strict';

/**
 * 공공AX 사례 아카이브 — 클라이언트 로직
 * 상태는 하나의 불변 filter 객체로 관리한다 (state.filter는 항상 새 객체로 교체).
 * 데이터 삽입은 전부 textContent / createElement 를 사용하며 innerHTML에
 * 사례 데이터를 문자열로 연결하는 코드는 두지 않는다 (XSS 방지).
 */

const ORG_TYPES = ['전체', '중앙행정기관', '광역지자체', '기초지자체', '지방의회',
  '공공기관', '교육기관', '공직 개인', '커뮤니티', '민간(참고)', '해외(참고)'];
const SOURCES = ['전체', 'Threads', '오픈채팅'];

const ORG_TYPE_BADGE_CLASS = {
  중앙행정기관: 'badge--org-type-중앙',
  광역지자체: 'badge--org-type-지자체',
  기초지자체: 'badge--org-type-지자체',
  지방의회: 'badge--org-type-지자체',
  공공기관: 'badge--org-type-공공기관',
  교육기관: 'badge--org-type-교육',
  '공직 개인': 'badge--org-type-개인',
  커뮤니티: 'badge--org-type-커뮤니티',
  '민간(참고)': 'badge--org-type-참고',
  '해외(참고)': 'badge--org-type-참고',
};

const TASK_CATEGORIES = ['인사·복무', '회계·정산', '계약·조달', '민원', '문서·기안',
  '감사·법무', '시설·안전', '데이터·통계', '기획·정책', '공통·범용'];

// 검색 동의어 사전 (로드맵 1-1): 실무 어휘 ↔ 사례 표기의 간극을 메운다
const SYNONYMS = {
  여비: ['출장', '정산', '경비', '출장비'],
  출장정산: ['여비', '출장', '정산'],
  경비정산: ['여비', '정산'],
  공문: ['기안', '공문서', '문서', 'hwp'],
  기안: ['공문', '재기안', '품의'],
  결재: ['품의', '기안'],
  한글: ['hwp', 'hwpx'],
  민원: ['신고', '상담', '콜'],
  조달: ['입찰', '계약', '나라장터'],
  회의록: ['회의', '녹취', '전사'],
  번역: ['다국어', '통역'],
  챗봇: ['상담', '어시스턴트', '비서'],
  법령: ['법률', '법제', '조례', '규정'],
  일정: ['캘린더', '스케줄'],
  지도: ['gis', '맵', '현황판'],
};

const VIEWS = ['cards', 'list', 'tags'];

/* ── 누적 북마크 카운터 (Supabase) ─────────────────────────
 * anon 키는 클라이언트 공개용으로 설계된 키다. 쓰기는 서버의
 * bookmark_toggle RPC(+1/-1만 허용, RLS로 직접 쓰기 차단)로만 가능.
 */
const COUNTER_URL = 'https://pdkpqrxcqiznsetxcvaq.supabase.co';
const COUNTER_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBka3BxcnhjcWl6bnNldHhjdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTA2MTAsImV4cCI6MjEwMTY4NjYxMH0.Rj7cnt9dHcQ7O-CuGeGwAyVxVdWFwQYuiCetOUbEHzI';
const COUNTER_HEADERS = {
  apikey: COUNTER_KEY,
  Authorization: `Bearer ${COUNTER_KEY}`,
  'Content-Type': 'application/json',
};
// 인기 항목 수: 북마크 횟수 상위 N개
const POPULAR_TOP_N = 20;

async function loadBookmarkCounts() {
  try {
    const res = await fetch(`${COUNTER_URL}/rest/v1/bookmark_counts?select=case_id,count`, {
      headers: COUNTER_HEADERS,
      cache: 'no-cache',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    return new Map(rows.map((r) => [r.case_id, r.count]));
  } catch (err) {
    console.error('북마크 카운터 로드 실패 (SNS 지표로 대체):', err);
    return new Map();
  }
}

function sendBookmarkDelta(caseId, delta) {
  // 실패해도 UI 동작에는 영향 없음 (fire-and-forget)
  fetch(`${COUNTER_URL}/rest/v1/rpc/bookmark_toggle`, {
    method: 'POST',
    headers: COUNTER_HEADERS,
    body: JSON.stringify({ p_case_id: caseId, p_delta: delta }),
  }).catch((err) => console.error('북마크 카운터 전송 실패:', err));
}

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
function siteHostname(c) {
  const url = caseTargetUrl(c);
  if (!url) return null;
  return url.replace(/^https:\/\//, '').split('/')[0].replace(/^www\./, '');
}

const state = {
  cases: [],
  filter: { q: '', orgType: '전체', source: '전체', tag: null, bookmarkedOnly: false, taskCat: '전체', noInstallOnly: false },
  view: loadSavedView(), // 'cards' | 'list'
  sort: { key: 'popularity', dir: 'desc' }, // 기본: 인기 우선, 이후 최신순
  bookmarks: loadBookmarks(), // Set<caseId> — localStorage에 보존
  bookmarkCounts: new Map(), // 전체 사용자 누적 북마크 수 (Supabase)
  champTerms: new Map(), // 사례 id → 챔피언 이름·소속·계정 검색어
  champOfCase: new Map(), // 사례 id → [{id, name}] (카드 '만든 사람' 표시용, 로드맵 1-8)
  evalById: new Map(), // 사례 id → 4축 평가 (카드 배지·CSV 결합용, 로드맵 1-3)
  popularSet: new Set(), // 인기 항목 id (북마크순 상위 N)
  focusCaseId: null, // ?case=<id> 딥링크 대상 — 첫 렌더 후 스크롤·강조
  status: 'loading', // 'loading' | 'loaded' | 'error'
};

function loadBookmarks() {
  try {
    const saved = JSON.parse(localStorage.getItem('pax-bookmarks') || '[]');
    return new Set(Array.isArray(saved) ? saved.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function toggleBookmark(id) {
  const next = new Set(state.bookmarks);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  state.bookmarks = next;
  try {
    localStorage.setItem('pax-bookmarks', JSON.stringify([...next]));
  } catch {
    // 저장 실패(사생활 보호 모드 등)는 무시 — 세션 내에서는 동작한다
  }
  // 전체 사용자 누적 카운터에 반영 (낙관적 로컬 갱신 + 서버 전송)
  const delta = next.has(id) ? 1 : -1;
  const counts = new Map(state.bookmarkCounts);
  counts.set(id, Math.max((counts.get(id) || 0) + delta, 0));
  state.bookmarkCounts = counts;
  sendBookmarkDelta(id, delta);
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

/* ── URL ↔ 상태 동기화 ─────────────────────────────────────
 * 모든 설정을 URL 쿼리로 표현한다: q, type, src, tag, view, sort, bm
 * URL에 있는 값이 localStorage 기본값보다 우선한다 (공유 링크 복원용).
 */
function applyUrlToState() {
  const p = new URLSearchParams(location.search);
  const orgType = p.get('type');
  const source = p.get('src');
  const view = p.get('view');
  const sortParam = p.get('sort'); // "key.dir"
  let sort = state.sort;
  if (sortParam) {
    const [key, dir] = sortParam.split('.');
    if ((SORT_ACCESSORS[key] || key === 'popularity') && (dir === 'asc' || dir === 'desc')) {
      sort = { key, dir };
    }
  }
  state.filter = {
    ...state.filter,
    q: p.get('q') || '',
    orgType: ORG_TYPES.includes(orgType) ? orgType : '전체',
    source: SOURCES.includes(source) ? source : '전체',
    tag: p.get('tag') || null,
    bookmarkedOnly: p.get('bm') === '1',
    taskCat: TASK_CATEGORIES.includes(p.get('task')) ? p.get('task') : '전체',
    noInstallOnly: p.get('ni') === '1',
  };
  state.focusCaseId = p.get('case') || null;
  if (VIEWS.includes(view)) state.view = view;
  state.sort = sort;
}

function syncUrl() {
  const p = new URLSearchParams();
  const f = state.filter;
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.orgType !== '전체') p.set('type', f.orgType);
  if (f.source !== '전체') p.set('src', f.source);
  if (f.tag) p.set('tag', f.tag);
  if (f.bookmarkedOnly) p.set('bm', '1');
  if (f.taskCat !== '전체') p.set('task', f.taskCat);
  if (f.noInstallOnly) p.set('ni', '1');
  if (state.view !== 'cards') p.set('view', state.view);
  if (state.sort.key !== 'popularity' || state.sort.dir !== 'desc') {
    p.set('sort', `${state.sort.key}.${state.sort.dir}`);
  }
  if (state.focusCaseId) p.set('case', state.focusCaseId);
  const qs = p.toString();
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
  emptyState: document.getElementById('empty-state'),
  errorState: document.getElementById('error-state'),
};

async function load() {
  try {
    // no-cache: 항상 서버와 재검증(ETag) — 새 사례·태그가 배포 즉시 반영되도록
    const [res, counts, champRes, evalRes] = await Promise.all([
      fetch('./data/cases.json', { cache: 'no-cache' }),
      loadBookmarkCounts(),
      fetch('./data/champions.json', { cache: 'no-cache' }).catch(() => null),
      fetch('./data/evaluations.json', { cache: 'no-cache' }).catch(() => null),
    ]);
    // 4축 평가 결합 (로드맵 1-3) — 실패해도 배지·CSV 열만 빠질 뿐 치명적이지 않다
    if (evalRes && evalRes.ok) {
      try {
        const evalDoc = await evalRes.json();
        state.evalById = new Map(evalDoc.cases.map((e) => [e.id, e]));
      } catch (err) {
        console.error('평가 데이터 결합 실패:', err);
      }
    }
    // 챔피언 이름·소속·계정으로도 사례를 검색할 수 있게 사례별 검색어를 만든다.
    // 챔피언 데이터 로드 실패는 검색 범위만 줄어들 뿐 치명적이지 않다.
    if (champRes && champRes.ok) {
      try {
        const champDoc = await champRes.json();
        for (const ch of champDoc.champions) {
          const terms = [ch.name, ch.affiliation && ch.affiliation.value,
            ...ch.accounts.map((a) => a.id)].filter(Boolean).join(' ').toLowerCase();
          for (const caseId of ch.cases) {
            state.champTerms.set(caseId, `${state.champTerms.get(caseId) || ''} ${terms}`);
            const owners = state.champOfCase.get(caseId) || [];
            owners.push({ id: ch.id, name: ch.name });
            state.champOfCase.set(caseId, owners);
          }
        }
      } catch (err) {
        console.error('챔피언 검색어 구성 실패:', err);
      }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    state.bookmarkCounts = counts;
    state.cases = [...doc.cases];
    // 인기 집합을 먼저 계산해야 기본 정렬(인기 → 신규 → 최신)이 올바르게 동작한다
    state.popularSet = computePopularSet();
    state.cases.sort(comparePopularFirst);
    state.status = 'loaded';
    renderStats(doc.updated_at, state.cases.length);
    render();
  } catch (err) {
    console.error('cases.json 로드 실패:', err);
    state.status = 'error';
    els.errorState.hidden = false;
  }
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
  if (f.noInstallOnly && c.runtime_env !== '브라우저만') return false;
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

function render() {
  syncUrl();
  renderTaskChips();
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
      els.caseList.appendChild(createExportToolbar(sorted));
      els.caseList.appendChild(createCaseTable(sorted));
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
        const card = createCaseCard(c);
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

  results.forEach((c, i) => {
    const card = createCaseCard(c);
    card.style.setProperty('--i', String(i));
    els.caseList.appendChild(card);
  });
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

/* ── 목록 내보내기 (CSV / PDF) ───────────────────────────── */

function createExportToolbar(results) {
  const bar = document.createElement('div');
  bar.className = 'export-toolbar';

  const label = document.createElement('span');
  label.className = 'export-toolbar__label';
  label.textContent = `${results.length}건 내보내기`;

  const csvBtn = document.createElement('button');
  csvBtn.type = 'button';
  csvBtn.className = 'export-btn';
  csvBtn.textContent = 'CSV 다운로드';
  csvBtn.addEventListener('click', () => exportCsv(results));

  const pdfBtn = document.createElement('button');
  pdfBtn.type = 'button';
  pdfBtn.className = 'export-btn';
  pdfBtn.textContent = 'PDF 저장';
  pdfBtn.title = '인쇄 대화상자에서 PDF로 저장을 선택하세요';
  pdfBtn.addEventListener('click', () => exportPdf(results));

  bar.append(label, csvBtn, pdfBtn);
  return bar;
}

function csvEscape(value) {
  let s = String(value == null ? '' : value);
  // CSV 수식 주입 방어: 수식으로 해석될 수 있는 선행 문자를 중화한다
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(results) {
  const header = ['제목', '기관', '기관유형', '구분', '지역', '업무분류', '태그', '요약',
    'AX단계', '업무범위', '완결성', '위험도', '인간통제', '증거등급',
    '사례URL', '출처', '원문/공유링크', '게시일', '수집일', '라이선스'];
  const rows = results.map((c) => {
    const ev = state.evalById.get(c.id) || {};
    return [
      c.title, c.org, c.org_type, c.case_class || '', c.region || '미상',
      c.task_category || '', c.tags.join(' '), c.summary,
      ev.ax || '', ev.s || '', ev.c || '', ev.risk || '', ev.human || '', ev.evidence || '',
      caseTargetUrl(c) || '', c.source === 'threads' ? 'Threads' : '오픈채팅',
      c.link || '', c.date, c.collected_at, c.license || '미확인',
    ].map(csvEscape).join(',');
  });
  // BOM: Excel에서 한글이 깨지지 않도록
  const csv = '﻿' + [header.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `공공AX-사례목록-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function exportPdf(results) {
  // 인쇄 전용 영역을 만들어 브라우저 인쇄(PDF로 저장)를 연다 — 외부 라이브러리 없이
  // 한글 PDF를 만들 수 있는 유일한 자체 완결 방식.
  const old = document.getElementById('print-area');
  if (old) old.remove();

  const area = document.createElement('div');
  area.id = 'print-area';

  const h1 = document.createElement('h1');
  h1.textContent = '모두의 공공AX 사례 아카이브';
  const meta = document.createElement('p');
  meta.textContent = `${new Date().toISOString().slice(0, 10)} 기준 · ${results.length}건 · hollobit.github.io/PAX`;
  area.append(h1, meta);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const label of ['제목', '기관', '유형', '태그', '출처', '날짜']) {
    const th = document.createElement('th');
    th.textContent = label;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const c of results) {
    const tr = document.createElement('tr');
    const cells = [c.title, c.org, c.org_type, c.tags.map((t) => `#${t}`).join(' '),
      c.source === 'threads' ? 'Threads' : '오픈채팅', c.date];
    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    const summaryTr = document.createElement('tr');
    summaryTr.className = 'print-summary';
    const td = document.createElement('td');
    td.colSpan = 6;
    const url = caseTargetUrl(c);
    td.textContent = c.summary + (url ? ` (${url})` : '');
    summaryTr.appendChild(td);
    tbody.appendChild(summaryTr);
  }
  table.appendChild(tbody);
  area.appendChild(table);
  document.body.appendChild(area);

  document.body.classList.add('printing-list');
  const cleanup = () => {
    document.body.classList.remove('printing-list');
    area.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

const LIST_COLUMNS = [
  { key: 'bookmark', label: '★', sortable: false },
  { key: 'title', label: '제목', sortable: true },
  { key: 'summary', label: '요약', sortable: false },
  { key: 'org', label: '기관', sortable: true },
  { key: 'org_type', label: '유형', sortable: true },
  { key: 'tags', label: '태그', sortable: false },
  { key: 'site', label: '사이트', sortable: true },
  { key: 'source', label: '출처', sortable: true },
  { key: 'date', label: '날짜', sortable: true },
];

function createCaseTable(results) {
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';

  const table = document.createElement('table');
  table.className = 'case-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const col of LIST_COLUMNS) {
    const th = document.createElement('th');
    th.scope = 'col';
    if (!col.sortable) {
      th.textContent = col.label;
    } else {
      const isActive = state.sort.key === col.key;
      th.setAttribute('aria-sort',
        isActive ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sort-btn';
      btn.textContent = col.label + (isActive ? (state.sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
      btn.addEventListener('click', () => setSort(col.key));
      th.appendChild(btn);
    }
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const c of results) {
    tbody.appendChild(createCaseRow(c));
  }
  table.appendChild(tbody);

  wrap.appendChild(table);
  return wrap;
}

function createCaseRow(c) {
  const tr = document.createElement('tr');

  const bookmarkTd = document.createElement('td');
  bookmarkTd.className = 'case-table__bookmark';
  bookmarkTd.appendChild(createBookmarkButton(c));

  const titleTd = document.createElement('td');
  titleTd.className = 'case-table__title';
  if (isPopularCase(c)) {
    titleTd.appendChild(createPopularBadge(c));
    titleTd.append(' ');
  } else if (isNewCase(c)) {
    titleTd.appendChild(createNewBadge());
    titleTd.append(' ');
  }
  const targetUrl = caseTargetUrl(c);
  if (targetUrl) {
    const a = document.createElement('a');
    a.href = targetUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = c.summary;
    a.textContent = c.title;
    titleTd.appendChild(a);
  } else {
    const span = document.createElement('span');
    span.title = c.summary;
    span.textContent = c.title;
    titleTd.appendChild(span);
  }

  const summaryTd = document.createElement('td');
  summaryTd.className = 'case-table__summary';
  summaryTd.textContent = c.summary;

  const orgTd = document.createElement('td');
  orgTd.textContent = c.org;

  const typeTd = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `badge ${ORG_TYPE_BADGE_CLASS[c.org_type] || 'badge--org-type-기타'}`;
  badge.textContent = c.org_type;
  typeTd.appendChild(badge);

  const tagsTd = document.createElement('td');
  tagsTd.className = 'case-table__tags';
  for (const tag of c.tags) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-chip tag-chip--small';
    btn.textContent = `#${tag}`;
    btn.setAttribute('aria-pressed', String(state.filter.tag === tag));
    btn.addEventListener('click', () => setTag(tag));
    tagsTd.appendChild(btn);
  }

  const siteTd = document.createElement('td');
  siteTd.className = 'case-table__site';
  const host = siteHostname(c);
  if (host && targetUrl) {
    const siteLink = document.createElement('a');
    siteLink.href = targetUrl;
    siteLink.target = '_blank';
    siteLink.rel = 'noopener';
    siteLink.title = targetUrl;
    siteLink.textContent = `${host} ↗`;
    siteTd.appendChild(siteLink);
  } else {
    siteTd.textContent = '—';
  }

  const sourceTd = document.createElement('td');
  sourceTd.className = 'case-table__source';
  const sourceLabel = document.createElement('span');
  sourceLabel.textContent = c.source === 'threads' ? 'Threads' : '오픈채팅';
  sourceTd.appendChild(sourceLabel);
  if (c.link) {
    sourceTd.append(' ');
    sourceTd.appendChild(createSourceLink(c.link, '↗'));
  }

  const dateTd = document.createElement('td');
  dateTd.className = 'case-table__date';
  dateTd.textContent = c.date;

  tr.append(bookmarkTd, titleTd, summaryTd, orgTd, typeTd, tagsTd, siteTd, sourceTd, dateTd);
  return tr;
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

function createCaseCard(c) {
  const article = document.createElement('article');
  article.className = 'case-card';
  article.dataset.caseId = c.id;

  const meta = document.createElement('div');
  meta.className = 'case-card__meta';

  const badge = document.createElement('span');
  badge.className = `badge ${ORG_TYPE_BADGE_CLASS[c.org_type] || 'badge--org-type-기타'}`;
  badge.textContent = c.org_type;

  const org = document.createElement('span');
  org.className = 'case-card__org';
  org.textContent = c.org;

  meta.appendChild(badge);
  meta.appendChild(org);
  if (isPopularCase(c)) {
    meta.appendChild(createPopularBadge(c));
  } else if (isNewCase(c)) {
    meta.appendChild(createNewBadge());
  }
  meta.appendChild(createBookmarkButton(c));

  const title = document.createElement('h3');
  title.className = 'case-card__title';
  title.textContent = c.title;

  // 환경·평가·상태 배지 줄 (로드맵 1-2·1-3·1-6) — 파생된 값만 표시, 미확인은 생략
  const badges = document.createElement('div');
  badges.className = 'case-card__badges';
  const addBadge = (text, cls, tip) => {
    const b = document.createElement('span');
    b.className = `mini-badge ${cls || ''}`;
    b.textContent = text;
    if (tip) b.title = tip;
    badges.appendChild(b);
  };
  if (c.runtime_env) addBadge(c.runtime_env, 'mini-badge--env', '실행환경');
  if (c.network_req) addBadge(c.network_req, 'mini-badge--net', '망 요건');
  if (c.cost_req) addBadge(c.cost_req, 'mini-badge--cost', '비용·권한');
  const ev = state.evalById.get(c.id);
  if (ev && ev.ax) addBadge(ev.ax.replace('AI-', ''), 'mini-badge--ax', `AX 단계: ${ev.ax}`);
  if (ev && ev.evidence) addBadge(ev.evidence.split(' ')[0], 'mini-badge--evidence', `증거 등급: ${ev.evidence}`);
  if (c.link_ok === false) {
    addBadge('링크 확인 안 됨', 'mini-badge--dead', `마지막 점검(${c.health_checked || ''})에서 대상 URL이 응답하지 않았습니다`);
  } else if (c.maintenance === '정체' || c.maintenance === '방치') {
    addBadge(`유지보수 ${c.maintenance}`, 'mini-badge--stale', '저장소 최근 활동 기준 (60일·180일 경계)');
  }

  // 사례 대상 URL이 있으면 썸네일과 함께 요약도 병기한다 (로드맵 1-4 — 툴팁 의존 해소).
  // 썸네일 이미지(site/thumbs/<id>.png)가 없으면 onerror로 설명문에 폴백.
  const targetUrl = caseTargetUrl(c);
  let summary;
  let clampSummary = null;
  if (targetUrl) {
    summary = createThumbElement(c, targetUrl);
    clampSummary = document.createElement('p');
    clampSummary.className = 'case-card__summary case-card__summary--clamp';
    clampSummary.textContent = c.summary;
  } else {
    summary = document.createElement('p');
    summary.className = 'case-card__summary';
    summary.textContent = c.summary;
  }

  // 만든 사람 (로드맵 1-8): 챔피언 디렉토리와 양방향 연결
  let makerLine = null;
  const owners = state.champOfCase.get(c.id) || [];
  if (owners.length) {
    makerLine = document.createElement('p');
    makerLine.className = 'case-card__maker';
    makerLine.append('만든 사람: ');
    owners.slice(0, 3).forEach((o, i) => {
      if (i > 0) makerLine.append(' · ');
      const a = document.createElement('a');
      a.href = `champions.html#champ-${encodeURIComponent(o.id)}`;
      a.textContent = o.name;
      makerLine.appendChild(a);
    });
  }

  const tags = document.createElement('div');
  tags.className = 'case-card__tags';
  for (const tag of c.tags) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-chip';
    btn.textContent = `#${tag}`;
    btn.setAttribute('aria-pressed', String(state.filter.tag === tag));
    btn.addEventListener('click', () => setTag(tag));
    tags.appendChild(btn);
  }

  const footer = document.createElement('div');
  footer.className = 'case-card__footer';

  const date = document.createElement('span');
  date.className = 'case-card__date';
  date.textContent = c.date;
  footer.appendChild(date);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'copy-link-btn';
  copyBtn.textContent = '🔗';
  copyBtn.title = '이 사례의 고정 링크 복사';
  copyBtn.setAttribute('aria-label', '사례 링크 복사');
  copyBtn.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?case=${c.id}`;
    try {
      await navigator.clipboard.writeText(url);
      copyBtn.textContent = '✓';
      setTimeout(() => { copyBtn.textContent = '🔗'; }, 1200);
    } catch {
      window.prompt('아래 링크를 복사하세요', url);
    }
  });
  footer.appendChild(copyBtn);

  // 저장소에서 확인된 라이선스만 표시한다 (미확인 사례는 배지 없음 — 미확인 원칙)
  if (c.license) {
    const lic = document.createElement('span');
    const none = c.license === '명시 없음';
    lic.className = 'license-badge' + (none ? ' license-badge--none' : '');
    lic.textContent = none ? '라이선스 없음' : c.license;
    lic.title = none
      ? '저장소에 라이선스 파일이 없어 재사용 조건이 명시되지 않았습니다'
      : `오픈소스 라이선스 ${c.license} — 저장소에서 확인됨 (${c.license_checked || ''})`;
    footer.appendChild(lic);
  }

  footer.appendChild(createSourceElement(c));

  article.appendChild(meta);
  article.appendChild(title);
  if (badges.childElementCount) article.appendChild(badges);
  article.appendChild(summary);
  if (clampSummary) article.appendChild(clampSummary);
  if (makerLine) article.appendChild(makerLine);
  article.appendChild(tags);
  article.appendChild(footer);

  return article;
}

function caseTargetUrl(c) {
  if (typeof c.case_url === 'string' && c.case_url.startsWith('https://')) {
    return c.case_url;
  }
  if (c.source === 'kakao' && typeof c.link === 'string' && c.link.startsWith('https://')) {
    return c.link;
  }
  return null;
}

function createThumbElement(c, targetUrl) {
  const anchor = document.createElement('a');
  anchor.className = 'case-card__thumb';
  anchor.href = targetUrl;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  anchor.title = c.summary;

  const img = document.createElement('img');
  img.src = `thumbs/${encodeURIComponent(c.id)}.jpg`;
  img.alt = `사례 미리보기: ${c.title}`;
  img.loading = 'lazy';
  img.decoding = 'async';
  // 표시 크기를 미리 알려 레이아웃 시프트(CLS)를 방지 (CSS aspect-ratio 16/10과 일치)
  img.width = 640;
  img.height = 400;
  img.addEventListener('error', () => {
    // 썸네일이 없으면 설명문으로 폴백 (링크는 유지)
    const fallback = document.createElement('p');
    fallback.className = 'case-card__summary';
    fallback.textContent = c.summary;
    anchor.replaceWith(fallback);
  });

  const host = document.createElement('span');
  host.className = 'case-card__thumb-host';
  try {
    host.textContent = `${new URL(targetUrl).hostname} ↗`;
  } catch {
    host.textContent = '바로가기 ↗';
  }

  anchor.appendChild(img);
  anchor.appendChild(host);
  return anchor;
}

function createSourceElement(c) {
  if (c.source === 'threads' && c.link) {
    return createSourceLink(c.link, '원문 보기 ↗');
  }
  const badge = document.createElement('span');
  badge.className = 'case-card__source-badge';
  badge.textContent = c.source === 'threads' ? '출처: Threads' : '출처: 오픈채팅';
  if (c.source === 'kakao' && c.link) {
    // 오픈채팅 원문은 비공개지만, 메시지에서 공유된 공개 서비스/저장소 링크는 제공한다.
    const frag = document.createDocumentFragment();
    frag.appendChild(badge);
    frag.appendChild(createSourceLink(c.link, '공유 링크 ↗'));
    return frag;
  }
  return badge;
}

function createSourceLink(href, label) {
  const link = document.createElement('a');
  link.className = 'case-card__source-link';
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = label;
  return link;
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
load();
