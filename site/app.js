'use strict';

/**
 * 공공AX 사례 아카이브 — 클라이언트 로직
 * 상태는 하나의 불변 filter 객체로 관리한다 (state.filter는 항상 새 객체로 교체).
 * 데이터 삽입은 전부 textContent / createElement 를 사용하며 innerHTML에
 * 사례 데이터를 문자열로 연결하는 코드는 두지 않는다 (XSS 방지).
 */

const ORG_TYPES = ['전체', '중앙부처', '지자체', '공공기관', '교육', '기타'];
const SOURCES = ['전체', 'Threads', '오픈채팅'];

const ORG_TYPE_BADGE_CLASS = {
  중앙부처: 'badge--org-type-중앙부처',
  지자체: 'badge--org-type-지자체',
  공공기관: 'badge--org-type-공공기관',
  교육: 'badge--org-type-교육',
  기타: 'badge--org-type-기타',
};

const state = { cases: [], filter: { q: '', orgType: '전체', source: '전체', tag: null } };

const els = {
  stats: document.getElementById('stats'),
  search: document.getElementById('search'),
  orgTypeFilter: document.getElementById('org-type-filter'),
  sourceFilter: document.getElementById('source-filter'),
  activeTag: document.getElementById('active-tag'),
  caseList: document.getElementById('case-list'),
  emptyState: document.getElementById('empty-state'),
  errorState: document.getElementById('error-state'),
};

async function load() {
  try {
    const res = await fetch('./data/cases.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    state.cases = [...doc.cases].sort((a, b) =>
      (b.date + b.collected_at).localeCompare(a.date + a.collected_at));
    renderStats(doc.updated_at, state.cases.length);
    buildFilterOptions();
    render();
  } catch (err) {
    console.error('cases.json 로드 실패:', err);
    els.errorState.hidden = false;
  }
}

function renderStats(updatedAt, count) {
  const dateLabel = typeof updatedAt === 'string' && updatedAt.length >= 10
    ? updatedAt.slice(0, 10)
    : '알 수 없음';
  els.stats.textContent = `전체 ${count}건 · 최근 갱신 ${dateLabel}`;
}

function buildFilterOptions() {
  fillSelect(els.orgTypeFilter, ORG_TYPES);
  fillSelect(els.sourceFilter, SOURCES);

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

function matches(c, f) {
  if (f.orgType !== '전체' && c.org_type !== f.orgType) return false;
  if (f.source !== '전체' && c.source !== (f.source === 'Threads' ? 'threads' : 'kakao')) return false;
  if (f.tag && !c.tags.includes(f.tag)) return false;
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  return [c.title, c.summary, c.org, ...c.tags].join(' ').toLowerCase().includes(q);
}

function setTag(tag) {
  const nextTag = state.filter.tag === tag ? null : tag;
  state.filter = { ...state.filter, tag: nextTag };
  render();
}

function render() {
  const results = state.cases.filter((c) => matches(c, state.filter));

  renderActiveTag();

  els.caseList.replaceChildren();
  els.emptyState.hidden = results.length !== 0;

  results.forEach((c, i) => {
    const card = createCaseCard(c);
    card.style.setProperty('--i', String(i));
    els.caseList.appendChild(card);
  });
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

  const title = document.createElement('h3');
  title.className = 'case-card__title';
  title.textContent = c.title;

  const summary = document.createElement('p');
  summary.className = 'case-card__summary';
  summary.textContent = c.summary;

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

  footer.appendChild(createSourceElement(c));

  article.appendChild(meta);
  article.appendChild(title);
  article.appendChild(summary);
  article.appendChild(tags);
  article.appendChild(footer);

  return article;
}

function createSourceElement(c) {
  if (c.source === 'threads' && c.link) {
    const link = document.createElement('a');
    link.className = 'case-card__source-link';
    link.href = c.link;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = '원문 보기 ↗';
    return link;
  }
  const badge = document.createElement('span');
  badge.className = 'case-card__source-badge';
  badge.textContent = c.source === 'threads' ? '출처: Threads' : '출처: 오픈채팅';
  return badge;
}

load();
