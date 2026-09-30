// 사례 카드·목록 표 — 메인 목록(app.js)이 상태와 콜백을 ctx로 넘겨 부른다.
// ctx: { evalById, champOfCase, sort, activeTag, isNew(c), isPopular(c), popularBadge(c), newBadge(),
//        bookmarkButton(c), onSort(key), onTag(tag) }
// 사례 데이터는 전부 textContent·createElement로 넣는다 — innerHTML에 문자열로 잇지 않는다(XSS 방지).
import { caseTargetUrl } from './pax-urls.js?v=1e5e0b4f';
import { ORG_TYPE_BADGE_CLASS } from './app-constants.js?v=c793f71d';

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
  const tr = document.createElement('tr');

  const bookmarkTd = document.createElement('td');
  bookmarkTd.className = 'case-table__bookmark';
  bookmarkTd.appendChild(ctx.bookmarkButton(c));

  const titleTd = document.createElement('td');
  titleTd.className = 'case-table__title';
  if (ctx.isPopular(c)) {
    titleTd.appendChild(ctx.popularBadge(c));
    titleTd.append(' ');
  } else if (ctx.isNew(c)) {
    titleTd.appendChild(ctx.newBadge());
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
    btn.setAttribute('aria-pressed', String(ctx.activeTag === tag));
    btn.addEventListener('click', () => ctx.onTag(tag));
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

export function createCaseCard(c, ctx) {
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
  if (ctx.isPopular(c)) {
    meta.appendChild(ctx.popularBadge(c));
  } else if (ctx.isNew(c)) {
    meta.appendChild(ctx.newBadge());
  }
  meta.appendChild(ctx.bookmarkButton(c));

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
  const ev = ctx.evalById.get(c.id);
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
  const owners = ctx.champOfCase.get(c.id) || [];
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
    btn.setAttribute('aria-pressed', String(ctx.activeTag === tag));
    btn.addEventListener('click', () => ctx.onTag(tag));
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
    const url = `${location.origin}${location.pathname.replace(/index\.html$/, '')}case/${c.id}.html`;
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
