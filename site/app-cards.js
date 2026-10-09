// 사례 카드·목록 표 — 메인 목록(app.js)이 상태와 콜백을 ctx로 넘겨 부른다.
// ctx: { evalById, champOfCase, sort, activeTag, isNew(c), isPopular(c), popularBadge(c), newBadge(),
//        bookmarkButton(c), onSort(key), onTag(tag) }
// 사례 데이터는 전부 textContent·createElement로 넣는다 — innerHTML에 문자열로 잇지 않는다(XSS 방지).
import { el } from './pax-dom.js?v=b57d2715';
import { caseTargetUrl } from './pax-urls.js?v=1e5e0b4f';
import { ORG_TYPE_BADGE_CLASS } from './app-constants.js?v=60a81688';

export function siteHostname(c) {
  const url = caseTargetUrl(c);
  if (!url) return null;
  return url.replace(/^https:\/\//, '').split('/')[0].replace(/^www\./, '');
}

// 썸네일: WebP(약 1/4 크기)를 먼저 쓰고, WebP를 못 읽는 브라우저는 JPEG로 받는다.
// pax.thumbs가 JPEG마다 WebP를 만들어 두므로 두 파일은 항상 짝으로 있다.
function thumbPicture(c, img) {
  const v = c.thumb_v ? `?v=${c.thumb_v}` : '';
  const base = `thumbs/${encodeURIComponent(c.id)}`;
  const picture = document.createElement('picture');
  const source = document.createElement('source');
  source.type = 'image/webp';
  source.srcset = `${base}.webp${v}`;
  img.src = `${base}.jpg${v}`;
  picture.append(source, img);
  return picture;
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

export function createCaseTable(results, ctx) {
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
      const isActive = ctx.sort.key === col.key;
      th.setAttribute('aria-sort',
        isActive ? (ctx.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sort-btn';
      btn.textContent = col.label + (isActive ? (ctx.sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
      btn.addEventListener('click', () => ctx.onSort(col.key));
      th.appendChild(btn);
    }
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const c of results) {
    tbody.appendChild(createCaseRow(c, ctx));
  }
  table.appendChild(tbody);

  wrap.appendChild(table);
  return wrap;
}

function createCaseRow(c, ctx) {
  const tr = el('tr');
  const targetUrl = caseTargetUrl(c);
  const bookmarkTd = el('td', 'case-table__bookmark');
  bookmarkTd.appendChild(ctx.bookmarkButton(c));
  const typeTd = el('td');
  typeTd.appendChild(el('span', `badge ${ORG_TYPE_BADGE_CLASS[c.org_type] || 'badge--org-type-기타'}`, c.org_type));
  tr.append(bookmarkTd, rowTitleCell(c, ctx, targetUrl), el('td', 'case-table__summary', c.summary),
    el('td', null, c.org), typeTd, rowTagsCell(c, ctx), rowSiteCell(c, targetUrl), rowSourceCell(c),
    el('td', 'case-table__date', c.date));
  return tr;
}

/** 제목 칸 — 인기/신규 배지와 대표 주소 링크(없으면 글자만) */
function rowTitleCell(c, ctx, targetUrl) {
  const td = el('td', 'case-table__title');
  if (ctx.isPopular(c)) td.append(ctx.popularBadge(c), ' ');
  else if (ctx.isNew(c)) td.append(ctx.newBadge(), ' ');
  const label = el(targetUrl ? 'a' : 'span', null, c.title);
  label.title = c.summary;
  if (targetUrl) {
    label.href = targetUrl;
    label.target = '_blank';
    label.rel = 'noopener';
  }
  td.appendChild(label);
  return td;
}

function rowTagsCell(c, ctx) {
  const td = el('td', 'case-table__tags');
  for (const tag of c.tags) {
    const btn = el('button', 'tag-chip tag-chip--small', `#${tag}`);
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(ctx.activeTag === tag));
    btn.addEventListener('click', () => ctx.onTag(tag));
    td.appendChild(btn);
  }
  return td;
}

function rowSiteCell(c, targetUrl) {
  const td = el('td', 'case-table__site');
  const host = siteHostname(c);
  if (!(host && targetUrl)) {
    td.textContent = '—';
    return td;
  }
  const a = el('a', null, `${host} ↗`);
  a.href = targetUrl;
  a.target = '_blank';
  a.rel = 'noopener';
  a.title = targetUrl;
  td.appendChild(a);
  return td;
}

function rowSourceCell(c) {
  const td = el('td', 'case-table__source');
  td.appendChild(el('span', null, c.source === 'threads' ? 'Threads' : '오픈채팅'));
  if (c.link) td.append(' ', createSourceLink(c.link, '↗'));
  return td;
}

export function createCaseCard(c, ctx) {
  const article = el('article', 'case-card');
  article.dataset.caseId = c.id;
  const [summary, clampSummary] = cardSummary(c);
  const badges = cardBadges(c, ctx);
  const makerLine = cardMaker(c, ctx);
  article.append(cardMeta(c, ctx), el('h3', 'case-card__title', c.title));
  if (badges.childElementCount) article.appendChild(badges);
  article.appendChild(summary);
  if (clampSummary) article.appendChild(clampSummary);
  if (makerLine) article.appendChild(makerLine);
  article.append(cardTags(c, ctx), cardFooter(c));
  return article;
}

/** 기관 유형 배지·기관명·인기/신규·북마크 */
function cardMeta(c, ctx) {
  const meta = el('div', 'case-card__meta');
  meta.append(el('span', `badge ${ORG_TYPE_BADGE_CLASS[c.org_type] || 'badge--org-type-기타'}`, c.org_type),
    el('span', 'case-card__org', c.org));
  if (ctx.isPopular(c)) meta.appendChild(ctx.popularBadge(c));
  else if (ctx.isNew(c)) meta.appendChild(ctx.newBadge());
  meta.appendChild(ctx.bookmarkButton(c));
  return meta;
}

/** 환경·평가·상태 배지 줄 (로드맵 1-2·1-3·1-6) — 파생된 값만 표시, 미확인은 생략 */
function cardBadges(c, ctx) {
  const badges = el('div', 'case-card__badges');
  const addBadge = (text, cls, tip) => {
    const b = el('span', `mini-badge ${cls || ''}`, text);
    if (tip) b.title = tip;
    badges.appendChild(b);
  };
  if (c.runtime_env) addBadge(c.runtime_env, 'mini-badge--env', '실행환경');
  if (c.network_req) addBadge(c.network_req, 'mini-badge--net', '망 요건');
  if (c.cost_req) addBadge(c.cost_req, 'mini-badge--cost', '비용·권한');
  const ev = ctx.evalById.get(c.id);
  if (ev && ev.ax) addBadge(ev.ax.replace('AI-', ''), 'mini-badge--ax', `AX 단계: ${ev.ax}`);
  if (ev && ev.evidence) addBadge(ev.evidence.split(' ')[0], 'mini-badge--evidence', `증거 등급: ${ev.evidence}`);
  if (c.link_ok === false) {
    addBadge('링크 확인 안 됨', 'mini-badge--dead', `마지막 점검(${c.health_checked || ''})에서 대상 URL이 응답하지 않았습니다`);
  } else if (c.maintenance === '정체' || c.maintenance === '방치') {
    addBadge(`유지보수 ${c.maintenance}`, 'mini-badge--stale', '저장소 최근 활동 기준 (60일·180일 경계)');
  }
  return badges;
}

/**
 * 사례 대상 URL이 있으면 썸네일과 함께 요약도 병기한다 (로드맵 1-4 — 툴팁 의존 해소).
 * 썸네일이 없으면 onerror로 설명문에 폴백. [요약(또는 썸네일), 줄여 보이는 요약 | null]
 */
function cardSummary(c) {
  const targetUrl = caseTargetUrl(c);
  if (!targetUrl) return [el('p', 'case-card__summary', c.summary), null];
  return [createThumbElement(c, targetUrl), el('p', 'case-card__summary case-card__summary--clamp', c.summary)];
}

/** 만든 사람 (로드맵 1-8): 챔피언 디렉토리와 양방향 연결 */
function cardMaker(c, ctx) {
  const owners = ctx.champOfCase.get(c.id) || [];
  if (!owners.length) return null;
  const line = el('p', 'case-card__maker');
  line.append('만든 사람: ');
  owners.slice(0, 3).forEach((o, i) => {
    if (i > 0) line.append(' · ');
    const a = el('a', null, o.name);
    a.href = `champions.html#champ-${encodeURIComponent(o.id)}`;
    line.appendChild(a);
  });
  return line;
}

function cardTags(c, ctx) {
  const tags = el('div', 'case-card__tags');
  for (const tag of c.tags) {
    const btn = el('button', 'tag-chip', `#${tag}`);
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(ctx.activeTag === tag));
    btn.addEventListener('click', () => ctx.onTag(tag));
    tags.appendChild(btn);
  }
  return tags;
}

/** 게시일·고정링크·라이선스·출처 */
function cardFooter(c) {
  const footer = el('div', 'case-card__footer');
  footer.append(el('span', 'case-card__date', c.date), permalinkLink(c));
  const lic = licenseBadge(c);
  if (lic) footer.appendChild(lic);
  footer.appendChild(createSourceElement(c));
  return footer;
}

/** 사례 상세 페이지(고정링크)를 새 창으로 연다 */
function permalinkLink(c) {
  const link = el('a', 'permalink-link', '🔗');
  link.href = `case/${encodeURIComponent(c.id)}.html`;
  link.target = '_blank';
  link.rel = 'noopener';
  link.title = '고정링크 바로가기 (새 창)';
  link.setAttribute('aria-label', '고정링크 바로가기 — 새 창에서 열림');
  return link;
}

/** 저장소에서 확인된 라이선스만 표시한다 (미확인 사례는 배지 없음 — 미확인 원칙) */
function licenseBadge(c) {
  if (!c.license) return null;
  const none = c.license === '명시 없음';
  const lic = el('span', 'license-badge' + (none ? ' license-badge--none' : ''), none ? '라이선스 없음' : c.license);
  lic.title = none
    ? '저장소에 라이선스 파일이 없어 재사용 조건이 명시되지 않았습니다'
    : `오픈소스 라이선스 ${c.license} — 저장소에서 확인됨 (${c.license_checked || ''})`;
  return lic;
}

// 운영 사이트가 있으면 저장소보다 먼저 보여 준다(사용자 지시 2026-09-11).
function createThumbElement(c, targetUrl) {
  const anchor = document.createElement('a');
  anchor.className = 'case-card__thumb';
  anchor.href = targetUrl;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  anchor.title = c.summary;

  const img = document.createElement('img');
  // src보다 먼저 정해야 한다 — src를 대입하는 순간 로딩 방식이 확정되므로,
  // 뒤늦게 lazy를 붙이면 무시되고 화면 밖 썸네일까지 전부 즉시 내려받는다.
  img.loading = 'lazy';
  img.decoding = 'async';
  // 표시 크기를 미리 알려 레이아웃 시프트(CLS)를 방지 (CSS aspect-ratio 16/10과 일치)
  img.width = 640;
  img.height = 400;
  img.alt = `사례 미리보기: ${c.title}`;
  const picture = thumbPicture(c, img);
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

  anchor.appendChild(picture);
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
