'use strict';

/**
 * 공공AX 챔피언 디렉토리 — champions.json + cases.json을 읽어 카드 그리드를 그린다.
 * 데이터 삽입은 전부 textContent/createElement (XSS 방지). 외부 라이브러리 없음.
 */

const AX_NAME = { 1: 'AI-Ready', 2: 'AI-Enabled', 3: 'AI-First', 4: 'AI-Native' };
const AX_BADGE = { 1: 'ax-ready', 2: 'ax-enabled', 3: 'ax-first', 4: 'ax-native' };
const AX_WEIGHT = { 0: 0, 1: 1, 2: 2, 3: 4, 4: 8 };
const PLATFORM_LABEL = { github: 'GitHub', gitlab: '공공 GitLab', threads: 'Threads' };

const COUNTER_URL = 'https://pdkpqrxcqiznsetxcvaq.supabase.co';
const COUNTER_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBka3BxcnhjcWl6bnNldHhjdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTA2MTAsImV4cCI6MjEwMTY4NjYxMH0.Rj7cnt9dHcQ7O-CuGeGwAyVxVdWFwQYuiCetOUbEHzI';

const SORTS = ['name', 'score', 'cases'];
const TIERS = ['green', 'blue', 'black'];

const state = { champions: [], cases: new Map(), bookmarks: new Map(), sort: 'name', tier: null };

/* URL ↔ 상태 동기화: ?sort=score|cases&tier=green|blue|black (기본값은 생략) */
function applyUrlToState() {
  const p = new URLSearchParams(location.search);
  const sort = p.get('sort');
  if (SORTS.includes(sort)) state.sort = sort;
  const tier = p.get('tier');
  if (TIERS.includes(tier)) state.tier = tier;
}

function syncUrl() {
  const p = new URLSearchParams();
  if (state.sort !== 'name') p.set('sort', state.sort);
  if (state.tier) p.set('tier', state.tier);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

async function load() {
  try {
    const [champRes, caseRes, counts] = await Promise.all([
      fetch('./data/champions.json', { cache: 'no-cache' }),
      fetch('./data/cases.json', { cache: 'no-cache' }),
      loadBookmarkCounts(),
    ]);
    if (!champRes.ok || !caseRes.ok) throw new Error('HTTP 오류');
    const champDoc = await champRes.json();
    const caseDoc = await caseRes.json();
    state.champions = champDoc.champions;
    state.cases = new Map(caseDoc.cases.map((c) => [c.id, c]));
    state.bookmarks = counts;
    document.getElementById('stats').textContent =
      `챔피언 ${champDoc.total}명 · 사례 ${caseDoc.cases.length}건 기준 · 미확인 ${(champDoc.unattributed || []).length}건`;
    render();
    renderUnattributed(champDoc.unattributed || []);
  } catch (err) {
    console.error('챔피언 데이터 로드 실패:', err);
    document.getElementById('error-state').hidden = false;
  }
}

async function loadBookmarkCounts() {
  try {
    const res = await fetch(`${COUNTER_URL}/rest/v1/bookmark_counts?select=case_id,count`, {
      headers: { apikey: COUNTER_KEY, Authorization: `Bearer ${COUNTER_KEY}` },
      cache: 'no-cache',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new Map((await res.json()).map((r) => [r.case_id, r.count]));
  } catch {
    return new Map();
  }
}

function bookmarkSum(champ) {
  return champ.cases.reduce((sum, id) => sum + (state.bookmarks.get(id) || 0), 0);
}

function score(champ) {
  const s = champ.stats;
  return s.case_count * 3 + AX_WEIGHT[s.top_ax] +
    Math.log10(s.stars + 1) * 2 + bookmarkSum(champ);
}

function sorted() {
  let list = [...state.champions];
  if (state.tier) {
    list = list.filter((c) => c.certification &&
      c.certification.tier.toLowerCase() === state.tier);
  }
  if (state.sort === 'score') {
    list.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, 'ko'));
  } else if (state.sort === 'cases') {
    list.sort((a, b) => b.stats.case_count - a.stats.case_count ||
      a.name.localeCompare(b.name, 'ko'));
  } else {
    list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }
  return list;
}

function setSort(key) {
  state.sort = key;
  syncSortButtons();
  syncUrl();
  render();
}

function syncSortButtons() {
  for (const [id, k] of [['sort-name', 'name'], ['sort-score', 'score'], ['sort-cases', 'cases']]) {
    document.getElementById(id).setAttribute('aria-pressed', String(k === state.sort));
  }
  for (const tier of TIERS) {
    document.getElementById(`tier-${tier}`)
      .setAttribute('aria-pressed', String(state.tier === tier));
  }
}

function setTier(tier) {
  state.tier = state.tier === tier ? null : tier; // 재클릭 시 해제
  syncSortButtons();
  syncUrl();
  render();
}

function render() {
  const root = document.getElementById('champion-list');
  root.replaceChildren();
  for (const champ of sorted()) {
    root.appendChild(card(champ));
  }
}

function card(champ) {
  const el = document.createElement('article');
  el.className = 'champ-card';
  if (champ.certification) {
    el.classList.add('champ-card--certified',
      `champ-card--cert-${champ.certification.tier.toLowerCase()}`);
  }

  const head = document.createElement('div');
  head.className = 'champ-card__head';
  const name = document.createElement('h2');
  name.className = 'champ-card__name';
  if (champ.certification) {
    const star = document.createElement('span');
    star.className = 'champ-card__cert-mark';
    star.textContent = '✦ ';
    star.setAttribute('aria-hidden', 'true');
    name.appendChild(star);
  }
  name.appendChild(document.createTextNode(champ.name));
  head.appendChild(name);
  if (champ.affiliation && champ.affiliation.value) {
    const aff = document.createElement('span');
    aff.className = 'champ-card__aff';
    aff.textContent = champ.affiliation.value;
    if (champ.affiliation.inferred) {
      const badge = document.createElement('span');
      badge.className = 'badge badge--inferred';
      badge.textContent = '추정';
      badge.title = champ.affiliation.evidence || '공개 자료 기반 추정';
      aff.appendChild(badge);
    }
    head.appendChild(aff);
  }
  el.appendChild(head);

  if (champ.certification) {
    const cert = document.createElement('p');
    cert.className = 'champ-card__cert';
    const link = document.createElement('a');
    link.href = champ.certification.source_url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = `cert-badge cert-badge--${champ.certification.tier.toLowerCase()}`;
    link.textContent = `✦ AI 챔피언 인증 ${champ.certification.tier}`;
    link.title = `${champ.certification.source_name} — ${champ.certification.listed_as}`;
    cert.appendChild(link);
    el.appendChild(cert);
  }

  const meta = document.createElement('p');
  meta.className = 'champ-card__meta';
  const bm = bookmarkSum(champ);
  const parts = [`사례 ${champ.stats.case_count}건`];
  if (champ.stats.top_ax > 0) parts.push(`최고 ${AX_NAME[champ.stats.top_ax]}`);
  if (champ.stats.stars > 0) parts.push(`반응 ${champ.stats.stars.toLocaleString()}`);
  if (bm > 0) parts.push(`북마크 ${bm}`);
  if (state.sort === 'score') parts.push(`점수 ${score(champ).toFixed(1)}`);
  meta.textContent = parts.join(' · ');
  if (champ.stats.top_ax > 0) {
    const axb = document.createElement('span');
    axb.className = `ax-badge ${AX_BADGE[champ.stats.top_ax]}`;
    axb.textContent = AX_NAME[champ.stats.top_ax];
    meta.appendChild(axb);
  }
  el.appendChild(meta);

  const accounts = document.createElement('p');
  accounts.className = 'champ-card__accounts';
  champ.accounts.forEach((a) => {
    const link = document.createElement('a');
    link.href = a.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `${PLATFORM_LABEL[a.platform] || a.platform} @${a.id}`;
    accounts.appendChild(link);
  });
  el.appendChild(accounts);

  const list = document.createElement('ul');
  list.className = 'champ-card__cases';
  const caseItem = (id) => {
    const c = state.cases.get(id);
    if (!c) return null;
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = `./?q=${encodeURIComponent(c.title)}`;
    link.textContent = c.title;
    li.appendChild(link);
    return li;
  };
  champ.cases.slice(0, 3).forEach((id) => {
    const li = caseItem(id);
    if (li) list.appendChild(li);
  });
  if (champ.cases.length > 3) {
    const li = document.createElement('li');
    li.className = 'champ-card__more';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'champ-card__more-btn';
    btn.textContent = `외 ${champ.cases.length - 3}건 모두 보기`;
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => {
      champ.cases.slice(3).forEach((id) => {
        const item = caseItem(id);
        if (item) list.insertBefore(item, li);
      });
      li.remove();
    });
    li.appendChild(btn);
    list.appendChild(li);
  }
  el.appendChild(list);
  return el;
}

function renderUnattributed(list) {
  const root = document.getElementById('unattributed-list');
  root.replaceChildren();
  for (const item of list) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = `./?q=${encodeURIComponent(item.title)}`;
    link.textContent = item.title;
    li.appendChild(link);
    const org = document.createElement('span');
    org.className = 'champ-unattributed__org';
    org.textContent = ` — ${item.org}`;
    li.appendChild(org);
    if (item.url) {
      const site = document.createElement('a');
      site.href = item.url;
      site.target = '_blank';
      site.rel = 'noopener';
      site.className = 'champ-unattributed__site';
      site.textContent = '↗';
      site.title = item.url;
      li.appendChild(site);
    }
    root.appendChild(li);
  }
}

document.getElementById('sort-name').addEventListener('click', () => setSort('name'));
document.getElementById('sort-score').addEventListener('click', () => setSort('score'));
document.getElementById('sort-cases').addEventListener('click', () => setSort('cases'));
document.getElementById('tier-green').addEventListener('click', () => setTier('green'));
document.getElementById('tier-blue').addEventListener('click', () => setTier('blue'));
document.getElementById('tier-black').addEventListener('click', () => setTier('black'));
applyUrlToState();
syncSortButtons();
load();
