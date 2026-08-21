'use strict';

/** 격차 지도 — 지역·기관유형 관측 현황판과 레거시 연동 수요 보드 (로드맵 2-4) */

const REGIONS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

// 코퍼스에서 반복 관측된 레거시 시스템 연동 수요 (2부 7.3 근거)
const LEGACY_DEMANDS = [
  { system: '새올행정시스템', area: '지방행정 전반',
    demand: 'API 부재로 지방 실무 도구 대부분이 화면 밖에서 겉돎 — 화면 파싱의 기관 승인 논쟁까지 관측' },
  { system: 'e호조(이호조)', area: '지방재정',
    demand: '여비계산기가 이호조 미연동이라 반쪽 — 계산 결과를 손으로 다시 입력하는 이중 작업' },
  { system: '인사랑', area: '인사·복무',
    demand: '여비업무통합도우미가 최종 목표를 "인사랑 화면 통합"으로 명시 — 시제품으로 검증 후 통합 요청 경로 부재' },
  { system: '에듀파인', area: '교육재정',
    demand: '학교 행정 도구의 재정 연계 불가 — 교육청 단위 성공 사례가 학교로 확산되지 못하는 병목의 하나' },
  { system: '온나라 문서', area: '문서·기안',
    demand: '문서 검색·재기안 도구들이 비공식 우회로 동작 — 공식 API 개방 시 최다 수혜 영역' },
  { system: '국외 API 차단(행정망)', area: '공통',
    demand: 'GitHub·주요 배포 플랫폼 차단으로 exe 위장 우회가 관행화 — 보안 리스크가 오히려 증가하는 역설' },
];

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

async function main() {
  const res = await fetch('./data/cases.json', { cache: 'no-cache' });
  const cases = (await res.json()).cases;

  // ── 지역 그리드 ──
  const counts = new Map(REGIONS.map((r) => [r, 0]));
  let unknown = 0;
  for (const c of cases) {
    if (c.region && counts.has(c.region)) counts.set(c.region, counts.get(c.region) + 1);
    else unknown += 1;
  }
  const grid = document.getElementById('region-grid');
  for (const r of REGIONS) {
    const n = counts.get(r);
    const cell = el('div', 'region-cell' + (n === 0 ? ' region-cell--empty' : ''));
    cell.appendChild(el('p', 'region-cell__name', r));
    cell.appendChild(el('p', 'region-cell__count', n === 0 ? '관측 없음' : `${n}건`));
    if (n > 0) {
      cell.classList.add('region-cell--link');
      cell.addEventListener('click', () => {
        location.href = './?region=' + encodeURIComponent(r);
      });
      cell.title = `${r} 지역 사례 보기 (확정 분류 기준)`;
    }
    grid.appendChild(cell);
  }
  const observed = REGIONS.filter((r) => counts.get(r) > 0).length;
  document.getElementById('region-note').textContent =
    `17개 광역시도 중 ${observed}곳 관측 · 지역 미상 ${unknown}건 — ` +
    '미상이 대부분인 것 자체가 현재 관측망의 한계이자 다음 수집 과제입니다.';

  // ── 기관유형 표 ──
  const typeCounts = new Map();
  for (const c of cases) {
    typeCounts.set(c.org_type, (typeCounts.get(c.org_type) || 0) + 1);
  }
  const tbody = document.querySelector('#orgtype-table tbody');
  [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([type, n]) => {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', null, type));
    tr.appendChild(el('td', null, `${n}건`));
    tr.appendChild(el('td', null, `${Math.round((n / cases.length) * 1000) / 10}%`));
    tbody.appendChild(tr);
  });

  // ── 레거시 수요 보드 ──
  const ltbody = document.querySelector('#legacy-table tbody');
  for (const item of LEGACY_DEMANDS) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', 'obs-strong', item.system));
    tr.appendChild(el('td', null, item.area));
    tr.appendChild(el('td', null, item.demand));
    ltbody.appendChild(tr);
  }
}

main().catch((err) => {
  console.error('격차 지도 로드 실패:', err);
  document.getElementById('region-grid').textContent = '데이터를 불러오지 못했습니다';
});
