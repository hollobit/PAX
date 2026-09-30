// 목록 페이지가 함께 쓰는 조각 — 검색어 일치, 정렬 칩, 검색창·주소 동기화, 쪽 이동.
// 뉴스·영상·평가표·메인 목록이 각자 복사해 두던 것을 한 벌로 모았다.
import { el } from './pax-dom.js?v=b57d2715';

/** 띄어 쓴 낱말이 모두 들어 있어야 걸린다(좁혀 가며 찾기). q는 소문자로 다듬은 검색어. */
export function matchesQuery(q, fields) {
  if (!q) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/**
 * 정렬 칩을 container에 다시 그린다.
 * @param {HTMLElement} container
 * @param {{key: string, label: string}[]} sorts
 * @param {string} current
 * @param {(key: string) => void} onPick
 */
export function renderSortChips(container, sorts, current, onPick) {
  container.replaceChildren(...sorts.map((s) => {
    const btn = el('button', 'task-chip', s.label);
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(current === s.key));
    btn.addEventListener('click', () => onPick(s.key));
    return btn;
  }));
}

/**
 * 검색창을 주소(?q=)와 맞춘다 — 공유한 링크로 같은 결과가 열리게. 처음 검색어를 돌려준다.
 * 입력이 잠시 멈춘 뒤에 onChange를 부른다(타자마다 목록 전체를 다시 그리지 않게).
 */
export function bindSearch(input, onChange, { delay = 120 } = {}) {
  const initial = new URLSearchParams(location.search).get('q') || '';
  if (initial) input.value = initial;
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const raw = input.value.trim();
      const u = new URLSearchParams(location.search);
      if (raw) u.set('q', raw); else u.delete('q');
      const qs = u.toString();
      history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
      onChange(raw.toLowerCase());
    }, delay);
  });
  return initial.trim().toLowerCase();
}

/**
 * 쪽 이동 막대. compact면 처음·끝·현재 둘레만 두고 나머지는 생략(…)으로 줄인다(쪽이 많은 메인 목록).
 * @param {{total: number, page: number, pageSize: number, onGo: (n: number) => void,
 *          label?: string, compact?: boolean}} o
 */
export function createPager({ total, page, pageSize, onGo, label = '쪽 이동', compact = false }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const nav = el('nav', 'pager');
  nav.setAttribute('aria-label', label);
  const from = total ? (page - 1) * pageSize + 1 : 0;
  nav.appendChild(el('span', 'pager__range', `${from}–${Math.min(page * pageSize, total)} / ${total}건`));
  const go = (n, text, { current = false, disabled = false } = {}) => {
    const btn = el('button', 'pager__btn', text);
    btn.type = 'button';
    if (current) btn.setAttribute('aria-current', 'page');
    if (disabled) btn.disabled = true;
    else btn.addEventListener('click', () => onGo(n));
    nav.appendChild(btn);
  };
  go(page - 1, '‹ 이전', { disabled: page === 1 });
  let prev = 0;
  for (let n = 1; n <= pages; n += 1) {
    if (compact && !(n === 1 || n === pages || Math.abs(n - page) <= 1)) continue;
    if (n - prev > 1) nav.appendChild(el('span', 'pager__gap', '…'));
    go(n, String(n), { current: n === page });
    prev = n;
  }
  go(page + 1, '다음 ›', { disabled: page === pages });
  nav.hidden = pages <= 1;
  return nav;
}
