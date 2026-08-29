'use strict';

/** 섹션 딥링크 — id 있는 section의 첫 제목에 앵커 링크(#)를 붙인다.
 *  URL 해시로 진입하면 해당 섹션으로 스크롤한다(스크롤 여백은 CSS scroll-margin-top). */
document.addEventListener('DOMContentLoaded', () => {
  for (const sec of document.querySelectorAll('section[id]')) {
    const h = sec.querySelector('h1, h2, h3');
    if (!h || h.querySelector('.anchor-link')) continue;
    const a = document.createElement('a');
    a.className = 'anchor-link';
    a.href = `#${sec.id}`;
    a.textContent = '#';
    a.title = '이 섹션의 주소 — 링크로 공유할 수 있습니다';
    a.setAttribute('aria-label', `${h.textContent.trim()} 섹션 링크`);
    h.appendChild(a);
  }
  // 동적 렌더 페이지에서 해시 진입 시 — 렌더로 레이아웃이 밀리므로 여러 번 재스크롤
  if (location.hash) {
    const scrollToHash = () => {
      let target;
      try { target = document.querySelector(location.hash); } catch { return; }
      if (target) target.scrollIntoView({ block: 'start' });
    };
    for (const delay of [400, 1200, 2500]) setTimeout(scrollToHash, delay);
  }
});
