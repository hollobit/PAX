'use strict';

/**
 * AX 수준 평가 대시보드 — evaluations.json을 읽어 사다리·위젯·표를 렌더링한다.
 * 데이터 삽입은 전부 textContent/createElement (XSS 방지). 외부 라이브러리 없음.
 */

const AX_ORDER = ['AI-Ready', 'AI-Enabled', 'AI-First', 'AI-Native'];
const AX_BADGE_CLASS = {
  'AI-Ready': 'ax-ready',
  'AI-Enabled': 'ax-enabled',
  'AI-First': 'ax-first',
  'AI-Native': 'ax-native',
  'AX 단계 외': 'ax-none',
};
const AX_LADDER_DESC = {
  'AI-Ready': '데이터·권한·책임·기준선 등 AI를 쓸 준비를 갖춤',
  'AI-Enabled': 'AI가 검증 가능한 업무 결과를 만들고 사람이 확인',
  'AI-First': 'AI를 전제로 역할·경로·예외·평가를 재설계해 운영',
  'AI-Native': 'AI가 핵심 가치를 만들고 학습·복원 구조까지 결합',
};
// 순차(단일 색상 명도) 스케일 — 히트맵·막대용
const SEQ_STEPS = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)'];

const state = { cases: [], filter: '전체', sort: { key: 'no', dir: 'asc' } };

// 평가 표 컬럼 정의: [key, 라벨, 정렬값 추출 함수]
const CONF_ORDER = { 높음: 3, 중간: 2, 낮음: 1 };
const EVAL_COLUMNS = [
  ['no', 'No', (c) => c.no],
  ['title', '사례', (c) => c.title],
  ['org', '기관', (c) => c.org],
  ['ax', '종합 AX 단계', (c) => AX_LEVEL[c.ax] ?? -1],
  ['scm', 'S/C/M', (c) => `${c.s}${c.c}${/^M[1-5]$/.test(c.m) ? c.m : 'M0'}`],
  ['tool', '도구유형', (c) => c.tool_type || ''],
  ['audience', '사용자·범위', (c) => c.audience || ''],
  ['evidence', '증거', (c) => c.evidence || ''],
  ['confidence', '신뢰도', (c) => CONF_ORDER[c.confidence] || 0],
];

async function load() {
  try {
    const res = await fetch('./data/evaluations.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    state.cases = doc.cases;
    document.getElementById('stats').textContent =
      `평가 대상 ${doc.total}건 · 평가 기준일 ${doc.evaluated_at}`;
    renderAll();
  } catch (err) {
    console.error('evaluations.json 로드 실패:', err);
    document.getElementById('stats').textContent = '평가 데이터를 불러오지 못했습니다';
  }
}

function count(fn) {
  const map = new Map();
  for (const c of state.cases) {
    const key = fn(c);
    if (key == null || key === '') continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function renderAll() {
  renderKpi();
  renderLadder();
  renderDiagnosis();
  renderWidgets();
  renderFirstCandidates();
  renderFilter();
  renderTable();
}

/* ── KPI 타일 ── */
function kpiTile(value, label, sub) {
  const tile = document.createElement('div');
  tile.className = 'kpi-tile';
  const v = document.createElement('div');
  v.className = 'kpi-tile__value';
  v.textContent = value;
  const l = document.createElement('div');
  l.className = 'kpi-tile__label';
  l.textContent = label;
  tile.append(v, l);
  if (sub) {
    const s = document.createElement('div');
    s.className = 'kpi-tile__sub';
    s.textContent = sub;
    tile.appendChild(s);
  }
  return tile;
}

function renderKpi() {
  const total = state.cases.length;
  const ax = count((c) => c.ax);
  const mcp = state.cases.filter((c) => /^M[1-5]$/.test(c.m)).length;
  const c2 = state.cases.filter((c) => c.c === 'C2').length;
  const root = document.getElementById('kpi');
  root.replaceChildren(
    kpiTile(String(total), '평가 사례', '아카이브 전체'),
    kpiTile(`${ax.get('AI-Ready') || 0}건`, 'AI-Ready', pct(ax.get('AI-Ready'), total)),
    kpiTile(`${ax.get('AI-Enabled') || 0}건`, 'AI-Enabled', pct(ax.get('AI-Enabled'), total)),
    kpiTile('0건', 'AI-First · Native', '운영 증거 입증 사례 아직 없음'),
    kpiTile(`${mcp}건`, 'MCP 사례', 'M 파급력 등급 부여'),
    kpiTile(`${c2}건`, 'First 후보군', '연속 처리(C2) 도달'),
  );
}

function pct(n, total) {
  return `${(((n || 0) / total) * 100).toFixed(1)}%`;
}

/* ── AX 성숙도 사다리 ── */
function renderLadder() {
  const ax = count((c) => c.ax);
  const total = state.cases.length;
  const root = document.getElementById('ladder');
  root.replaceChildren();

  AX_ORDER.forEach((stage, i) => {
    const n = ax.get(stage) || 0;
    const step = document.createElement('div');
    step.className = `ax-step ax-step--${i + 1}` + (n === 0 ? ' ax-step--empty' : '');

    const head = document.createElement('div');
    head.className = 'ax-step__head';
    const badge = document.createElement('span');
    badge.className = `ax-badge ${AX_BADGE_CLASS[stage]}`;
    badge.textContent = stage;
    const cnt = document.createElement('span');
    cnt.className = 'ax-step__count';
    cnt.textContent = n > 0 ? `${n}건 · ${pct(n, total)}` : '0건 — 도달 사례 없음';
    head.append(badge, cnt);

    const bar = document.createElement('div');
    bar.className = 'ax-step__bar';
    const fill = document.createElement('div');
    fill.className = 'ax-step__fill';
    fill.style.width = `${Math.max((n / total) * 100, n > 0 ? 4 : 0)}%`;
    bar.appendChild(fill);

    const desc = document.createElement('p');
    desc.className = 'ax-step__desc';
    desc.textContent = AX_LADDER_DESC[stage];

    step.append(head, bar, desc);
    root.appendChild(step);
  });

  const outside = ax.get('AX 단계 외') || 0;
  if (outside > 0) {
    const note = document.createElement('p');
    note.className = 'ax-ladder__outside';
    note.textContent = `이 외 ${outside}건(${pct(outside, total)})은 참고 자료·해외 동향 등 AX 단계 판정 대상 밖입니다.`;
    root.appendChild(note);
  }
}

function renderDiagnosis() {
  const el = document.getElementById('diagnosis');
  el.replaceChildren();
  const h = document.createElement('h3');
  h.textContent = '종합 진단';
  const p1 = document.createElement('p');
  p1.textContent = '현재 아카이브는 준비 자산과 단위업무 보조 사례를 발굴·확산하는 초기 단계입니다. '
    + '10건 중 6건이 AI를 쓸 준비(Ready)를 만드는 사례이고, 3건이 실제 업무 결과(Enabled)까지 도달했습니다. '
    + '아직 역할과 흐름을 재설계해 운영 중임을 입증한 First, AI가 핵심 가치를 만드는 Native 사례는 없습니다.';
  const p2 = document.createElement('p');
  p2.textContent = '업무 범위는 단일 도구(S1)와 도구 묶음(S2)이 87%로 대부분이며 엔드투엔드 서비스(S4)는 아직 없습니다. '
    + '완결성도 기능 제공(C0)이 73%로, 접수부터 종료 확인·예외처리·평가 환류까지 닫힌 폐쇄루프(C3 이상)는 확인되지 않았습니다. '
    + '에이전트·MCP라는 이름은 많아졌지만, 이름표가 업무 폐쇄루프를 대신해 주지는 않습니다.';
  el.append(h, p1, p2);
}

/* ── 분포 위젯 (수평 막대) ── */
function barWidget(rootId, title, entries, opts = {}) {
  const root = document.getElementById(rootId);
  root.replaceChildren();
  const cap = document.createElement('figcaption');
  cap.textContent = title;
  root.appendChild(cap);
  const max = Math.max(...entries.map(([, n]) => n), 1);
  for (const [label, n, sub] of entries) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.title = `${label}: ${n}건`;
    const lab = document.createElement('span');
    lab.className = 'bar-row__label';
    lab.textContent = label;
    const track = document.createElement('span');
    track.className = 'bar-row__track';
    const fill = document.createElement('span');
    fill.className = 'bar-row__fill';
    fill.style.width = `${(n / max) * 100}%`;
    if (n === 0) fill.classList.add('bar-row__fill--zero');
    track.appendChild(fill);
    const val = document.createElement('span');
    val.className = 'bar-row__value';
    val.textContent = String(n);
    row.append(lab, track, val);
    root.appendChild(row);
    if (sub) {
      const s = document.createElement('div');
      s.className = 'bar-row__sub';
      s.textContent = sub;
      root.appendChild(s);
    }
  }
  if (opts.note) {
    const note = document.createElement('div');
    note.className = 'widget__note';
    note.textContent = opts.note;
    root.appendChild(note);
  }
}

function orderedEntries(map, order, names = {}) {
  return order.map((k) => [names[k] ? `${k} ${names[k]}` : k, map.get(k) || 0]);
}

function renderWidgets() {
  const total = state.cases.length;

  barWidget('w-ax', 'AX 단계 분포',
    [...AX_ORDER, 'AX 단계 외'].map((k) => [k, count((c) => c.ax).get(k) || 0]));

  barWidget('w-s', '업무 범위 (S)',
    orderedEntries(count((c) => c.s), ['S1', 'S2', 'S3', 'S4', 'S5'],
      { S1: '단일도구', S2: '도구묶음', S3: '워크플로', S4: '엔드투엔드', S5: '생태계' }));

  barWidget('w-c', '업무 완결성 (C)',
    orderedEntries(count((c) => c.c), ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'],
      { C0: '기능', C1: '결과', C2: '연속', C3: '폐쇄루프', C4: '예외포함', C5: '적응형' }));

  renderHeatmap();

  const mcpTotal = state.cases.filter((c) => /^M[1-5]$/.test(c.m)).length;
  barWidget('w-m', `MCP 파급력 (M) — MCP 사례 ${mcpTotal}건`,
    orderedEntries(count((c) => (/^M[1-5]$/.test(c.m) ? c.m : null)), ['M1', 'M2', 'M3', 'M4', 'M5'],
      { M1: '제한적', M2: '재사용', M3: '업무통합', M4: '생태계', M5: '핵심인프라' }),
    { note: `비-MCP 사례 ${total - mcpTotal}건은 M 등급 미적용` });

  barWidget('w-evidence', '증거 등급 (E)',
    orderedEntries(count((c) => c.evidence.slice(0, 2)), ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'],
      { E0: '게시글 주장', E1: '공개 데모', E2: '재현 가능', E3: '운영 확인', E4: '성과 지표', E5: '감사 가능' }),
    { note: 'E4 이상(정량 성과 근거)이 아직 없음 — 개선 방향 ② 참조' });

  barWidget('w-status', '도입 상태',
    [...count((c) => c.status).entries()].sort((a, b) => b[1] - a[1]));

  barWidget('w-scope', '서비스 범위',
    [...count((c) => c.scope).entries()].sort((a, b) => b[1] - a[1]));
}

/* ── S×C 히트맵 ── */
function renderHeatmap() {
  const root = document.getElementById('w-sc');
  root.replaceChildren();
  const cap = document.createElement('figcaption');
  cap.textContent = '업무 범위 × 완결성 매트릭스 — 오른쪽 아래로 갈수록 성숙';
  root.appendChild(cap);

  const sList = ['S1', 'S2', 'S3', 'S4', 'S5'];
  const cList = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'];
  const grid = new Map();
  let max = 1;
  for (const c of state.cases) {
    if (!c.s || !c.c) continue;
    const key = `${c.s}|${c.c}`;
    const n = (grid.get(key) || 0) + 1;
    grid.set(key, n);
    max = Math.max(max, n);
  }

  const table = document.createElement('table');
  table.className = 'heatmap';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.appendChild(document.createElement('th'));
  for (const cc of cList) {
    const th = document.createElement('th');
    th.textContent = cc;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const s of sList) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = s;
    tr.appendChild(th);
    for (const cc of cList) {
      const td = document.createElement('td');
      const n = grid.get(`${s}|${cc}`) || 0;
      if (n > 0) {
        const stepIdx = Math.min(Math.ceil((n / max) * SEQ_STEPS.length), SEQ_STEPS.length) - 1;
        td.style.background = SEQ_STEPS[stepIdx];
        td.textContent = String(n);
        if (stepIdx >= 3) td.classList.add('heatmap__cell--deep');
        td.title = `${s} × ${cc}: ${n}건`;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  root.appendChild(table);

  const note = document.createElement('div');
  note.className = 'widget__note';
  note.textContent = '현재 분포는 좌상단(S1~S2 × C0)에 집중 — 단일 도구의 기능 제공 단계가 주류입니다.';
  root.appendChild(note);
}

/* ── First 후보군 ── */
function renderFirstCandidates() {
  const root = document.getElementById('first-candidates');
  root.replaceChildren();
  const candidates = state.cases
    .filter((c) => c.c === 'C2')
    .sort((a, b) => (b.s > a.s ? 1 : -1));
  for (const c of candidates) {
    const item = document.createElement('a');
    item.className = 'candidate';
    item.href = c.service_url || c.post_url || '#';
    item.target = '_blank';
    item.rel = 'noopener';
    item.title = c.rationale;
    const name = document.createElement('span');
    name.textContent = c.title;
    const meta = document.createElement('span');
    meta.className = 'candidate__meta';
    meta.textContent = `${c.ax} / ${c.s} / ${c.c}${/^M[1-5]$/.test(c.m) ? ' / ' + c.m : ''}`;
    item.append(name, meta);
    root.appendChild(item);
  }
}

/* ── 사례별 표 ── */
function renderFilter() {
  const root = document.getElementById('eval-filter');
  root.replaceChildren();
  for (const label of ['전체', ...AX_ORDER.slice(0, 2), 'AX 단계 외']) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-chip';
    btn.textContent = label;
    btn.setAttribute('aria-pressed', String(state.filter === label));
    btn.addEventListener('click', () => {
      state.filter = label;
      renderFilter();
      renderTable();
    });
    root.appendChild(btn);
  }
}

// AX 단계별 레벨(1~4)과 아이콘 색 — 성숙할수록 칸이 차오른다
const AX_LEVEL = { 'AI-Ready': 1, 'AI-Enabled': 2, 'AI-First': 3, 'AI-Native': 4 };
const AX_LEVEL_COLOR = {
  'AI-Ready': '#c99a2e',   // 골드: 준비
  'AI-Enabled': '#4f7fae', // 블루: 활용
  'AI-First': '#2c6b3a',   // 그린: 재설계
  'AI-Native': '#6a3fa0',  // 퍼플: 내재화
};

// Wi-Fi 신호 스타일의 4칸 상승 막대 아이콘 (SVG)
function createAxLevelIcon(ax) {
  const level = AX_LEVEL[ax] || 0;
  const color = AX_LEVEL_COLOR[ax] || 'transparent';
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 22 16');
  svg.setAttribute('class', 'ax-level');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', level > 0 ? `AX 레벨 ${level}/4` : 'AX 단계 외');
  const heights = [5, 8, 11, 14];
  heights.forEach((h, i) => {
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(i * 5.5));
    rect.setAttribute('y', String(16 - h));
    rect.setAttribute('width', '4');
    rect.setAttribute('height', String(h));
    rect.setAttribute('rx', '1.2');
    rect.setAttribute('fill', i < level ? color : 'var(--rule)');
    if (i >= level) rect.setAttribute('opacity', level === 0 ? '0.3' : '0.55');
    svg.appendChild(rect);
  });
  if (level === 0) {
    // AX 단계 외: 사선을 그어 '판정 대상 아님'을 명확히 표시
    const slash = document.createElementNS(NS, 'line');
    slash.setAttribute('x1', '1');
    slash.setAttribute('y1', '15');
    slash.setAttribute('x2', '21');
    slash.setAttribute('y2', '1');
    slash.setAttribute('stroke', 'var(--accent)');
    slash.setAttribute('stroke-width', '2');
    slash.setAttribute('stroke-linecap', 'round');
    svg.appendChild(slash);
  }
  return svg;
}

function axBadge(ax) {
  const wrap = document.createElement('span');
  wrap.className = 'ax-badge-wrap';
  wrap.appendChild(createAxLevelIcon(ax));
  const badge = document.createElement('span');
  badge.className = `ax-badge ${AX_BADGE_CLASS[ax] || 'ax-none'}`;
  badge.textContent = ax;
  wrap.appendChild(badge);
  wrap.title = AX_LEVEL[ax] ? `성숙도 ${AX_LEVEL[ax]}단계 / 4단계` : 'AX 단계 판정 대상 외';
  return wrap;
}

function setEvalSort(key) {
  const { sort } = state;
  state.sort = sort.key === key
    ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: 'asc' };
  renderTable();
}

function sortEvalRows(rows) {
  const col = EVAL_COLUMNS.find(([key]) => key === state.sort.key) || EVAL_COLUMNS[0];
  const accessor = col[2];
  const sign = state.sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
    return sign * String(va).localeCompare(String(vb), 'ko');
  });
}

function renderTable() {
  const table = document.getElementById('eval-table');
  table.replaceChildren();
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const [key, label] of EVAL_COLUMNS) {
    const th = document.createElement('th');
    const active = state.sort.key === key;
    th.setAttribute('aria-sort', active ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sort-btn';
    btn.textContent = label + (active ? (state.sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
    btn.addEventListener('click', () => setEvalSort(key));
    th.appendChild(btn);
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const rows = sortEvalRows(state.cases.filter((c) => state.filter === '전체' || c.ax === state.filter));
  for (const c of rows) {
    const tr = document.createElement('tr');
    tr.className = 'eval-row';

    const no = document.createElement('td');
    no.textContent = String(c.no);

    const title = document.createElement('td');
    title.className = 'case-table__title';
    if (c.service_url || c.post_url) {
      const a = document.createElement('a');
      a.href = c.service_url || c.post_url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = c.title;
      title.appendChild(a);
    } else {
      title.textContent = c.title;
    }

    const org = document.createElement('td');
    org.textContent = c.org;

    const ax = document.createElement('td');
    ax.appendChild(axBadge(c.ax));
    if (c.ax_prev && c.ax_prev !== c.ax) {
      const prev = document.createElement('span');
      prev.className = 'ax-prev';
      prev.textContent = ` (기존 ${c.ax_prev})`;
      ax.appendChild(prev);
    }

    const scm = document.createElement('td');
    scm.className = 'case-table__source';
    scm.textContent = [c.s, c.c, /^M[1-5]$/.test(c.m) ? c.m : null].filter(Boolean).join(' / ');

    const tool = document.createElement('td');
    tool.textContent = c.tool_type || '';

    const audience = document.createElement('td');
    const scopeLabel = { Internal: '내부용', External: '외부용', Hybrid: '혼합' }[c.scope] || c.scope;
    audience.textContent = c.audience ? `${c.audience} · ${scopeLabel}` : scopeLabel;

    const ev = document.createElement('td');
    ev.className = 'case-table__source';
    ev.textContent = c.evidence.slice(0, 2);
    ev.title = c.evidence;

    const conf = document.createElement('td');
    conf.textContent = c.confidence;

    tr.append(no, title, org, ax, scm, tool, audience, ev, conf);
    tbody.appendChild(tr);

    // 상세(판정 근거) 행 — 클릭 시 토글
    const detail = document.createElement('tr');
    detail.className = 'eval-detail';
    detail.hidden = true;
    const td = document.createElement('td');
    td.colSpan = 9;
    const dl = document.createElement('dl');
    for (const [label, value] of [
      ['도입 상태', c.status],
      ['판정 근거', c.rationale],
      ['관문 판정', c.gate],
      ['피드백·학습', c.feedback],
      ['복원력', c.resilience],
      ['위험도 / 인간 통제', `${c.risk} / ${c.human}`],
    ]) {
      if (!value) continue;
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    }
    td.appendChild(dl);
    detail.appendChild(td);
    tbody.appendChild(detail);

    tr.addEventListener('click', (e) => {
      if (e.target.closest('a')) return; // 링크 클릭은 그대로
      detail.hidden = !detail.hidden;
    });
  }
  table.appendChild(tbody);
}

load();
