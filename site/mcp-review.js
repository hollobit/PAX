'use strict';

/** MCP 검증 매트릭스 — site/data/mcp-review.json 렌더 (스펙 2026-08-28). */

const AXIS_ORDER = ['permission_surface', 'secrets', 'supply_chain',
  'injection', 'data_flow', 'hygiene'];

// 판정 배지: 색에만 의존하지 않도록 텍스트를 항상 함께 쓴다
const VERDICT_CLASS = {
  '통과': 'mcp-badge--pass',
  '주의': 'mcp-badge--warn',
  '심각(비공개 처리 중)': 'mcp-badge--critical',
  '미검증': 'mcp-badge--unknown',
  '해당 없음': 'mcp-badge--na',
};

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function badge(verdict, note) {
  const span = el('span', `mcp-badge ${VERDICT_CLASS[verdict] || ''}`,
    verdict === '심각(비공개 처리 중)' ? '심각·처리 중' : verdict);
  if (note) span.title = note;
  return span;
}

async function main() {
  const res = await fetch('./data/mcp-review.json', { cache: 'no-cache' });
  const doc = await res.json();

  const summary = document.getElementById('mcp-summary');
  const counts = doc.summary.counts || {};
  const cards = [
    ['검증 대상', `${doc.summary.total}건`],
    ['양호', `${counts['양호'] || 0}건`],
    ['주의', `${counts['주의'] || 0}건`],
    ['최다 주의 축', axisLabel(doc.summary.top_warn_axis) || '없음'],
  ];
  for (const [label, value] of cards) {
    const card = el('div', 'obs-card');
    card.appendChild(el('p', 'obs-card__value', value));
    card.appendChild(el('p', 'obs-card__label', label));
    summary.appendChild(card);
  }

  const tbody = document.querySelector('#mcp-matrix tbody');
  for (const r of doc.reviews) {
    const tr = document.createElement('tr');
    const titleCell = el('td', 'obs-strong');
    const a = el('a', null, r.title || r.case_id);
    a.href = `case/${encodeURIComponent(r.case_id)}.html`;
    titleCell.appendChild(a);
    tr.appendChild(titleCell);
    for (const axis of AXIS_ORDER) {
      const td = document.createElement('td');
      const ax = r.axes[axis];
      td.appendChild(ax ? badge(ax.verdict, ax.note) : badge('미검증', ''));
      tr.appendChild(td);
    }
    const dyn = document.createElement('td');
    if (r.dynamic && r.dynamic.done) dyn.appendChild(badge('통과', r.dynamic.note));
    else dyn.appendChild(el('span', 'mcp-badge mcp-badge--na', r.dynamic ? '실패' : '선별 외'));
    tr.appendChild(dyn);
    const overall = document.createElement('td');
    overall.appendChild(badge(r.overall === '부분 검증' ? '미검증' : r.overall, ''));
    if (r.overall === '부분 검증') overall.lastChild.textContent = '부분 검증';
    tr.appendChild(overall);
    tbody.appendChild(tr);
  }
  document.getElementById('mcp-meta').textContent =
    `기준일 ${doc.generated_at} — 배지에 마우스를 올리면 판정 사유가 보입니다. ` +
    '자동 검사 축은 매주 월요일 재검(CVE)됩니다.';
}

function axisLabel(key) {
  return ({ permission_surface: '권한 표면', secrets: '시크릿', supply_chain: '공급망',
    injection: '입력 검증', data_flow: '데이터 흐름', hygiene: '운영 위생' })[key] || key;
}

main().catch((err) => {
  console.error('MCP 검증 로드 실패:', err);
  document.getElementById('mcp-summary').textContent =
    '검증 데이터를 불러오지 못했습니다 — 아직 첫 검증이 발행되지 않았을 수 있습니다.';
});
