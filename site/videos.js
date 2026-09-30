// 공유 동영상 — 커뮤니티에 공유된 영상 목록.
// 공유된 영상 자체의 정보만 담는다 — 누가 올렸는지, 어떤 말과 함께 올렸는지는 데이터에 없다
// (scripts/build_videos.py에서 걸러 낸다).
import { el, fetchJson } from './pax-dom.js?v=b57d2715';
import { bindSearch, matchesQuery, renderSortChips } from './pax-list.js?v=7dabbcbf';

const SORTS = [
  { key: 'recent', label: '최근 공유순' },
  { key: 'shares', label: '많이 공유된 순' },
];

const state = { sort: 'recent', q: '', videos: [] };
const els = {
  list: document.getElementById('video-list'),
  empty: document.getElementById('empty-state'),
  count: document.getElementById('video-count'),
  search: document.getElementById('video-search'),
  meta: document.getElementById('video-meta'),
  sort: document.getElementById('video-sort'),
};

// 검색은 제목과 채널만 본다 — 공유 시점·횟수는 정렬로 다루는 편이 낫다.
const hit = (v) => matchesQuery(state.q, [v.title, v.channel]);

function sorted() {
  const rows = state.videos.filter(hit);
  if (state.sort === 'shares') {
    rows.sort((a, b) => (b.shares - a.shares) || (b.last_shared > a.last_shared ? 1 : -1));
  } else {
    rows.sort((a, b) => (b.last_shared > a.last_shared ? 1 : b.last_shared < a.last_shared ? -1 : b.shares - a.shares));
  }
  return rows;
}

// 커서가 머문 카드만 미리보기를 켠다. 목록을 가로지르는 커서에 영상이 줄줄이 뜨면
// 카드 수만큼 유튜브 플레이어가 붙으므로, 잠깐 머문 뒤에야 띄우고 한 번에 하나만 남긴다.
const HOVER_DELAY = 450;
const previewOn = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let hoverTimer = null;
let playing = null;

function stopPreview() {
  clearTimeout(hoverTimer);
  if (playing) {
    playing.querySelector('.video-card__frame')?.remove();
    playing.classList.remove('is-previewing');
    playing = null;
  }
}

function startPreview(media, v) {
  stopPreview();
  const frame = el('iframe', 'video-card__frame');
  // 쿠키를 덜 남기는 도메인을 쓰고, 소리는 끈 채로만 자동재생한다(브라우저가 허용하는 유일한 형태).
  frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}`
    + '?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&loop=1'
    + `&playlist=${encodeURIComponent(v.id)}`;
  frame.title = `${v.title} 미리보기`;
  frame.setAttribute('allow', 'autoplay; encrypted-media');
  frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  frame.tabIndex = -1;
  media.appendChild(frame);
  playing = media.closest('.video-card');
  playing.classList.add('is-previewing');
}

function card(v) {
  const art = el('article', 'video-card');
  const media = el('div', 'video-card__media');
  const img = el('img', 'video-card__thumb');
  // src보다 먼저 정해야 지연 로딩이 실제로 걸린다.
  img.loading = 'lazy';
  img.decoding = 'async';
  img.width = 320;
  img.height = 180;
  img.alt = '';
  img.src = v.thumb;
  media.appendChild(img);

  // 재생 중에도 클릭은 유튜브로 가야 하므로, 링크를 미리보기 위에 덮어 둔다.
  const cover = el('a', 'video-card__hit');
  cover.href = v.url;
  cover.target = '_blank';
  cover.rel = 'noopener';
  cover.setAttribute('aria-label', `${v.title} — 유튜브에서 열기`);
  media.appendChild(cover);
  art.appendChild(media);

  if (previewOn) {
    media.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => startPreview(media, v), HOVER_DELAY);
    });
    media.addEventListener('mouseleave', stopPreview);
  }

  const body = el('div', 'video-card__body');
  const h = el('h2', 'video-card__title');
  const link = el('a', null, v.title);
  link.href = v.url;
  link.target = '_blank';
  link.rel = 'noopener';
  h.appendChild(link);
  body.appendChild(h);
  if (v.channel) body.appendChild(el('p', 'video-card__channel', v.channel));
  const bits = [`${v.last_shared} 공유`];
  if (v.shares >= 2) bits.push(`재공유 ${v.shares}회`);
  body.appendChild(el('p', 'video-card__meta', bits.join(' · ')));
  art.appendChild(body);
  return art;
}

function render() {
  stopPreview(); // 다시 그리면 재생 중이던 카드가 사라지므로 타이머·상태를 먼저 끊는다
  const rows = sorted();
  els.list.replaceChildren(...rows.map(card));
  els.empty.hidden = rows.length !== 0;
  els.count.textContent = state.q ? `검색 결과 ${rows.length}편` : '';
  els.count.hidden = !state.q;
  renderSortChips(els.sort, SORTS, state.sort, (key) => { state.sort = key; render(); });
}

async function main() {
  const doc = await fetchJson('./data/videos.json');
  state.videos = doc.videos || [];
  const repeats = state.videos.filter((v) => v.shares >= 2).length;
  const first = state.videos.reduce((m, v) => (!m || v.first_shared < m ? v.first_shared : m), '');
  els.meta.textContent = `${state.videos.length}편 · 두 번 이상 공유된 영상 ${repeats}편 · ${first} 이후 관측`;
  state.q = bindSearch(els.search, (q) => { state.q = q; render(); });
  render();
}

main().catch((err) => {
  console.error('videos.json 로드 실패:', err);
  document.getElementById('error-state').hidden = false;
});
