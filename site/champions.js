'use strict';

import { el, fetchJson } from './pax-dom.js?v=b57d2715';
import { loadBookmarkCounts } from './pax-bookmarks.js?v=c1fdc503';

/**
 * 공공AX 챔피언 디렉토리 — champions.json + cases-lite.json을 읽어 카드 그리드를 그린다.
 * 데이터 삽입은 전부 textContent/createElement (XSS 방지). 외부 라이브러리 없음.
 */

const AX_NAME = { 1: 'AI-Ready', 2: 'AI-Enabled', 3: 'AI-First', 4: 'AI-Native' };
const AX_BADGE = { 1: 'ax-ready', 2: 'ax-enabled', 3: 'ax-first', 4: 'ax-native' };
const AX_WEIGHT = { 0: 0, 1: 1, 2: 2, 3: 4, 4: 8 };
const PLATFORM_LABEL = { github: 'GitHub', gitlab: '공공 GitLab', threads: 'Threads' };


const SORTS = ['name', 'score', 'cases'];
const TIERS = ['green', 'blue', 'black'];
/* 소속 분류 — scripts/pax/affiliation.py CATEGORIES와 같은 순서 */
const CATEGORIES = ['중앙행정기관', '광역지자체', '기초지자체', '공공기관', '교육기관', '공직(소속 미상)', '민간·커뮤니티'];

const state = { champions: [], cases: new Map(), bookmarks: new Map(), sort: 'name', tier: null, cat: null };

/* URL ↔ 상태 동기화: ?sort=score|cases&tier=green|blue|black&cat=<소속 분류> (기본값은 생략) */
function applyUrlToState() {
  const p = new URLSearchParams(location.search);
  const sort = p.get('sort');
  if (SORTS.includes(sort)) state.sort = sort;
  const tier = p.get('tier');
  if (TIERS.includes(tier)) state.tier = tier;
  const cat = p.get('cat');
  if (CATEGORIES.includes(cat)) state.cat = cat;
}

function syncUrl() {
  const p = new URLSearchParams();
  if (state.sort !== 'name') p.set('sort', state.sort);
  if (state.tier) p.set('tier', state.tier);
  if (state.cat) p.set('cat', state.cat);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

async function load() {
  try {
    const [champDoc, caseDoc, counts] = await Promise.all([
      fetchJson('./data/champions.json'),
      fetchJson('./data/cases-lite.json'),
      loadBookmarkCounts(), // 누적 북마크 수 — 공용 모듈(pax-bookmarks.js)이 키와 주소를 갖고 있다
    ]);
    state.champions = champDoc.champions;
    state.cases = new Map(caseDoc.cases.map((c) => [c.id, c]));
    state.bookmarks = counts;
    document.getElementById('stats').textContent =
      `챔피언 ${champDoc.total}명 · 사례 ${caseDoc.cases.length}건 기준 · 미확인 ${(champDoc.unattributed || []).length}건`;
    renderCategoryFilter();
    render();
    renderUnattributed(champDoc.unattributed || []);
    if (location.hash.startsWith('#champ-')) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) {
        target.classList.add('champ-card--focused');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  } catch (err) {
    console.error('챔피언 데이터 로드 실패:', err);
    document.getElementById('error-state').hidden = false;
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
  if (state.cat) list = list.filter((c) => c.category === state.cat);
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

/** 소속 분류 칩 — 분류마다 인원 수, 다시 누르면 해제(인증 필터와 함께 걸린다) */
function renderCategoryFilter() {
  const root = document.getElementById('cat-filter');
  const label = root.querySelector('.champ-toolbar__label');
  root.replaceChildren(label);
  const counts = new Map();
  for (const c of state.champions) counts.set(c.category, (counts.get(c.category) || 0) + 1);
  for (const cat of CATEGORIES) {
    const n = counts.get(cat) || 0;
    if (!n) continue;
    const btn = el('button', null, cat);
    btn.type = 'button';
    btn.dataset.cat = cat;
    btn.setAttribute('aria-pressed', String(state.cat === cat));
    btn.appendChild(el('span', 'champ-toolbar__count', String(n)));
    btn.addEventListener('click', () => setCategory(cat));
    root.appendChild(btn);
  }
}

function setCategory(cat) {
  state.cat = state.cat === cat ? null : cat;
  for (const btn of document.querySelectorAll('#cat-filter button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.cat === state.cat));
  }
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
  const article = el('article', 'champ-card');
  article.id = `champ-${champ.id}`;
  const cert = champ.certification;
  if (cert) article.classList.add('champ-card--certified', `champ-card--cert-${cert.tier.toLowerCase()}`);
  article.appendChild(cardHead(champ));
  if (cert) article.appendChild(certLine(cert));
  article.append(cardMeta(champ), cardAccounts(champ), cardCases(champ));
  return article;
}

/** 이름(인증이면 ✦)과 소속(추정이면 배지) */
function cardHead(champ) {
  const head = el('div', 'champ-card__head');
  const name = el('h2', 'champ-card__name');
  if (champ.certification) {
    const star = el('span', 'champ-card__cert-mark', '✦ ');
    star.setAttribute('aria-hidden', 'true');
    name.appendChild(star);
  }
  name.appendChild(document.createTextNode(champ.name));
  head.appendChild(name);
  const aff = champ.affiliation;
  if (aff && aff.value) {
    const span = el('span', 'champ-card__aff', aff.value);
    if (aff.inferred) {
      const badge = el('span', 'badge badge--inferred', '추정');
      badge.title = aff.evidence || '공개 자료 기반 추정';
      span.appendChild(badge);
    }
    head.appendChild(span);
  }
  if (champ.category) head.appendChild(categoryTag(champ));
  return head;
}

/** 소속 분류 태그 — 누르면 그 분류만 본다. 사례 기준 분류는 점선 테두리 */
function categoryTag(champ) {
  const byCases = champ.category_basis === 'cases';
  const tag = el('button', `champ-card__cat${byCases ? ' champ-card__cat--cases' : ''}`,
    byCases ? `${champ.category} · 사례 기준` : champ.category);
  tag.type = 'button';
  tag.title = byCases ? '공개 프로필에 소속이 없어 등재 사례의 기관 분류로 정함' : '공개 프로필 소속 기준';
  tag.addEventListener('click', () => setCategory(champ.category));
  return tag;
}

function certLine(cert) {
  const p = el('p', 'champ-card__cert');
  const link = el('a', `cert-badge cert-badge--${cert.tier.toLowerCase()}`, `✦ AI 챔피언 인증 ${cert.tier}`);
  link.href = cert.source_url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.title = `${cert.source_name} — ${cert.listed_as}`;
  p.appendChild(link);
  return p;
}

/** 사례 수·최고 AX 단계·반응·북마크(점수순이면 점수) */
function cardMeta(champ) {
  const { case_count: count, top_ax: topAx, stars } = champ.stats;
  const bm = bookmarkSum(champ);
  const parts = [`사례 ${count}건`];
  if (topAx > 0) parts.push(`최고 ${AX_NAME[topAx]}`);
  if (stars > 0) parts.push(`반응 ${stars.toLocaleString('ko-KR')}`);
  if (bm > 0) parts.push(`북마크 ${bm}`);
  if (state.sort === 'score') parts.push(`점수 ${score(champ).toFixed(1)}`);
  const meta = el('p', 'champ-card__meta', parts.join(' · '));
  if (topAx > 0) meta.appendChild(el('span', `ax-badge ${AX_BADGE[topAx]}`, AX_NAME[topAx]));
  return meta;
}

function cardAccounts(champ) {
  const accounts = el('p', 'champ-card__accounts');
  for (const a of champ.accounts) {
    const link = el('a', null, `${PLATFORM_LABEL[a.platform] || a.platform} @${a.id}`);
    link.href = a.url;
    link.target = '_blank';
    link.rel = 'noopener';
    accounts.appendChild(link);
  }
  return accounts;
}

/** 사례 목록 — 셋까지 보이고 나머지는 '모두 보기'로 펼친다 */
function cardCases(champ) {
  const list = el('ul', 'champ-card__cases');
  const caseItem = (id) => {
    const c = state.cases.get(id);
    if (!c) return null;
    const li = el('li');
    const link = el('a', null, c.title);
    link.href = `./?case=${encodeURIComponent(id)}`;
    li.appendChild(link);
    return li;
  };
  for (const id of champ.cases.slice(0, 3)) {
    const li = caseItem(id);
    if (li) list.appendChild(li);
  }
  if (champ.cases.length > 3) {
    const more = el('li', 'champ-card__more');
    const btn = el('button', 'champ-card__more-btn', `외 ${champ.cases.length - 3}건 모두 보기`);
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => {
      for (const id of champ.cases.slice(3)) {
        const item = caseItem(id);
        if (item) list.insertBefore(item, more);
      }
      more.remove();
    });
    more.appendChild(btn);
    list.appendChild(more);
  }
  return list;
}

function renderUnattributed(list) {
  const root = document.getElementById('unattributed-list');
  root.replaceChildren();
  for (const item of list) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = `./?case=${encodeURIComponent(item.id)}`;
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
