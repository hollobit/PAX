// 목록 내보내기(CSV / PDF) — 메인 목록(app.js)이 지금 보이는 결과를 넘겨 부른다.
import { todayKst } from './pax-dom.js?v=b57d2715';
import { caseTargetUrl } from './pax-urls.js?v=1e5e0b4f';

export function createExportToolbar(results, evalById) {
  const bar = document.createElement('div');
  bar.className = 'export-toolbar';

  const label = document.createElement('span');
  label.className = 'export-toolbar__label';
  label.textContent = `${results.length}건 내보내기`;

  const csvBtn = document.createElement('button');
  csvBtn.type = 'button';
  csvBtn.className = 'export-btn';
  csvBtn.textContent = 'CSV 다운로드';
  csvBtn.addEventListener('click', () => exportCsv(results, evalById));

  const pdfBtn = document.createElement('button');
  pdfBtn.type = 'button';
  pdfBtn.className = 'export-btn';
  pdfBtn.textContent = 'PDF 저장';
  pdfBtn.title = '인쇄 대화상자에서 PDF로 저장을 선택하세요';
  pdfBtn.addEventListener('click', () => exportPdf(results));

  bar.append(label, csvBtn, pdfBtn);
  return bar;
}

function csvEscape(value) {
  let s = String(value == null ? '' : value);
  // CSV 수식 주입 방어: 수식으로 해석될 수 있는 선행 문자를 중화한다
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(results, evalById) {
  const header = ['제목', '기관', '기관유형', '구분', '지역', '업무분류', '태그', '요약',
    'AX단계', '업무범위', '완결성', '위험도', '인간통제', '증거등급',
    '사례URL', '출처', '원문/공유링크', '게시일', '수집일', '라이선스'];
  const rows = results.map((c) => {
    const ev = evalById.get(c.id) || {};
    return [
      c.title, c.org, c.org_type, c.case_class || '', c.region || '미상',
      c.task_category || '', c.tags.join(' '), c.summary,
      ev.ax || '', ev.s || '', ev.c || '', ev.risk || '', ev.human || '', ev.evidence || '',
      caseTargetUrl(c) || '', c.source === 'threads' ? 'Threads' : '오픈채팅',
      c.link || '', c.date, c.collected_at, c.license || '미확인',
    ].map(csvEscape).join(',');
  });
  // BOM: Excel에서 한글이 깨지지 않도록
  const csv = '﻿' + [header.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `공공AX-사례목록-${todayKst()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function exportPdf(results) {
  // 인쇄 전용 영역을 만들어 브라우저 인쇄(PDF로 저장)를 연다 — 외부 라이브러리 없이
  // 한글 PDF를 만들 수 있는 유일한 자체 완결 방식.
  const old = document.getElementById('print-area');
  if (old) old.remove();

  const area = document.createElement('div');
  area.id = 'print-area';

  const h1 = document.createElement('h1');
  h1.textContent = '모두의 공공AX 사례 아카이브';
  const meta = document.createElement('p');
  meta.textContent = `${todayKst()} 기준 · ${results.length}건 · hollobit.github.io/PAX`;
  area.append(h1, meta);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const label of ['제목', '기관', '유형', '태그', '출처', '날짜']) {
    const th = document.createElement('th');
    th.textContent = label;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const c of results) {
    const tr = document.createElement('tr');
    const cells = [c.title, c.org, c.org_type, c.tags.map((t) => `#${t}`).join(' '),
      c.source === 'threads' ? 'Threads' : '오픈채팅', c.date];
    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    const summaryTr = document.createElement('tr');
    summaryTr.className = 'print-summary';
    const td = document.createElement('td');
    td.colSpan = 6;
    const url = caseTargetUrl(c);
    td.textContent = c.summary + (url ? ` (${url})` : '');
    summaryTr.appendChild(td);
    tbody.appendChild(summaryTr);
  }
  table.appendChild(tbody);
  area.appendChild(table);
  document.body.appendChild(area);

  document.body.classList.add('printing-list');
  const cleanup = () => {
    document.body.classList.remove('printing-list');
    area.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

