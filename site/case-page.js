'use strict';

import { fetchJsonOr } from './pax-dom.js?v=b57d2715';
import { loadBookmarks, loadBookmarkCounts, toggleBookmark, onBookmarksChanged } from './pax-bookmarks.js?v=c1fdc503';
import { NEW_WINDOW_DAYS, isNewCase, popularIds } from './pax-popular.js?v=709e6cf6';

/**
 * 사례 상세 페이지(case/<id>.html)의 실시간 영역 — 인기·신규 배지, 북마크 버튼, 누적 북마크 수.
 * 정적 HTML은 그대로 읽히고, 이 스크립트가 실패해도 본문에는 영향이 없다.
 * 인기 판정은 메인 목록과 같은 규칙(pax-popular.js)을 경량 순위 파일(case-rank.json)로 계산한다.
 */

const slot = document.getElementById('case-live');
const caseId = slot?.dataset.caseId;
const state = { bookmarks: loadBookmarks(), counts: new Map(), popular: false, rank: null };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function countOf() {
  return state.counts.get(caseId) || 0;
}

function popularBadge() {
  const badge = el('span', 'popular-badge', '🔥 인기');
  const parts = [];
  if (countOf() > 0) parts.push(`북마크 ${countOf()}회`);
  if (state.rank?.popularity) parts.push(`커뮤니티 반응 ${state.rank.popularity}`);
  badge.title = parts.join(' · ') || '인기 사례';
  return badge;
}

function bookmarkButton() {
  const on = state.bookmarks.has(caseId);
  const btn = el('button', 'bookmark-btn case-page__bookmark', on ? '★ 북마크됨' : '☆ 북마크');
  btn.type = 'button';
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? '북마크 해제 — 아카이브의 북마크만 보기에서 빠집니다' : '북마크 추가 — 아카이브에서 북마크만 모아 볼 수 있습니다';
  btn.addEventListener('click', onToggle);
  return btn;
}

function render() {
  const items = [];
  if (state.popular) items.push(popularBadge());
  if (state.rank && isNewCase(state.rank)) {
    const badge = el('span', 'new-badge', '✨ 신규');
    badge.title = `최근 ${NEW_WINDOW_DAYS}일 내 추가된 사례`;
    items.push(badge);
  }
  items.push(bookmarkButton());
  const n = countOf();
  const count = el('span', 'case-page__bookmark-count', n > 0 ? `누적 북마크 ${n.toLocaleString('ko-KR')}회` : '아직 북마크 없음');
  count.title = '모든 방문자가 이 사례를 북마크한 횟수';
  items.push(count);
  slot.replaceChildren(...items);
}

function onToggle() {
  // 저장·서버 카운터 전송은 공용 모듈이, 화면의 누적 수는 낙관적으로 갱신한다(메인 목록과 같은 방식)
  state.bookmarks = toggleBookmark(state.bookmarks, caseId);
  const delta = state.bookmarks.has(caseId) ? 1 : -1;
  const counts = new Map(state.counts);
  counts.set(caseId, Math.max(countOf() + delta, 0));
  state.counts = counts;
  render();
}

async function init() {
  if (!slot || !caseId) return;
  // 수집일만으로 신규 배지는 바로 그릴 수 있다 — 순위 파일·카운터는 늦게 와도 된다
  state.rank = { id: caseId, collected_at: slot.dataset.collectedAt };
  render();
  const [rankDoc, counts] = await Promise.all([
    fetchJsonOr('../data/case-rank.json', { cases: [] }),
    loadBookmarkCounts(),
  ]);
  state.counts = counts;
  state.rank = rankDoc.cases.find((c) => c.id === caseId) || state.rank;
  state.popular = popularIds(rankDoc.cases, counts).has(caseId);
  render();
  onBookmarksChanged((next) => {
    state.bookmarks = next;
    render();
  });
}

init();
