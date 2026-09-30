// 공유 뉴스 — 커뮤니티에 공유된 기사·보도자료 목록.
// 기사 자체의 정보만 담는다 — 누가 어떤 말과 함께 올렸는지는 데이터에 없다(scripts/build_news.py에서 걸러 낸다).
import { el, fetchJson } from './pax-dom.js?v=b57d2715';
import { bindSearch, createPager, matchesQuery, renderSortChips } from './pax-list.js?v=7dabbcbf';

const SORTS = [
  { key: 'recent', label: '최근 공유순' },
  { key: 'shares', label: '많이 공유된 순' },
  { key: 'published', label: '기사 발행순' },
];
const KINDS = ['전체', '기사', '보도자료', '공고·안내'];
const PAGE_SIZE = 100;

const state = { sort: 'recent', q: '', kind: '전체', page: 1, articles: [] };
const els = {
  list: document.getElementById('news-list'),
  empty: document.getElementById('empty-state'),
  count: document.getElementById('news-count'),
  search: document.getElementById('news-search'),
  meta: document.getElementById('news-meta'),
  sort: document.getElementById('news-sort'),
  kind: document.getElementById('news-kind'),
};

// 검색은 제목과 매체만 본다.
const hit = (x) => matchesQuery(state.q, [x.title, x.outlet]);
const byDate = (a, b, k) => (b[k] > a[k] ? 1 : b[k] < a[k] ? -1 : 0);

function sorted() {
  const rows = state.articles.filter((x) => (state.kind === '전체' || x.kind === state.kind) && hit(x));
  if (state.sort === 'shares') rows.sort((a, b) => (b.shares - a.shares) || byDate(a, b, 'last_shared'));
  else if (state.sort === 'published') rows.sort((a, b) => byDate(a, b, 'published'));
  else rows.sort((a, b) => byDate(a, b, 'last_shared') || (b.shares - a.shares));
  return rows;
}

function row(x) {
  const a = el('a', 'news-item');
  a.href = x.url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.appendChild(el('h2', 'news-item__title', x.title));
  const bits = [];
  // 기관 게시물은 기사와 성격이 달라 무엇인지 함께 적는다.
  if (x.kind && x.kind !== '기사') bits.push(x.kind);
  if (x.outlet) bits.push(x.outlet);
  if (x.published) bits.push(`${x.published} 보도`);
  bits.push(`${x.last_shared} 공유`);
  if (x.shares >= 2) bits.push(`재공유 ${x.shares}회`);
  a.appendChild(el('p', 'news-item__meta', bits.join(' · ')));
  return a;
}

function renderKinds() {
  // 칩 수는 검색 결과 안에서 센다 — 검색으로 3건만 남았는데 칩이 5를 가리키면 어긋나 보인다.
  const pool = state.articles.filter(hit);
  const counts = new Map();
  for (const x of pool) counts.set(x.kind, (counts.get(x.kind) || 0) + 1);
  const nodes = [el('span', 'chip-row-label', '분류')];
  for (const k of KINDS) {
    const n = k === '전체' ? pool.length : (counts.get(k) || 0);
    if (k !== '전체' && n === 0) continue;
    const btn = el('button', 'task-chip', `${k} ${n}`);
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(state.kind === k));
    btn.addEventListener('click', () => { state.kind = k; state.page = 1; render(); });
    nodes.push(btn);
  }
  els.kind.replaceChildren(...nodes);
}

function render() {
  const rows = sorted();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), pages);
  els.list.replaceChildren(...rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE).map(row));
  if (pages > 1) {
    els.list.appendChild(createPager({
      total: rows.length, page: state.page, pageSize: PAGE_SIZE,
      onGo: (n) => { state.page = n; render(); els.list.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    }));
  }
  els.empty.hidden = rows.length !== 0;
  els.count.textContent = state.q ? `검색 결과 ${rows.length}건` : '';
  els.count.hidden = !state.q;
  renderKinds();
  renderSortChips(els.sort, SORTS, state.sort, (key) => { state.sort = key; state.page = 1; render(); });
}

async function main() {
  const doc = await fetchJson('./data/news.json');
  state.articles = doc.articles || [];
  const outlets = new Set(state.articles.map((x) => x.outlet).filter(Boolean)).size;
  const repeats = state.articles.filter((x) => x.shares >= 2).length;
  const first = state.articles.reduce((m, x) => (!m || x.first_shared < m ? x.first_shared : m), '');
  els.meta.textContent = `${state.articles.length}건 · 매체 ${outlets}곳 · 두 번 이상 공유된 기사 ${repeats}건 · ${first} 이후 관측`;
  state.q = bindSearch(els.search, (q) => {
    state.q = q;
    state.page = 1; // 검색을 좁히면 보던 쪽이 사라지므로 첫 쪽으로 돌아간다
    render();
  });
  render();
}

main().catch((err) => {
  console.error('news.json 로드 실패:', err);
  document.getElementById('error-state').hidden = false;
});
