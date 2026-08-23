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

// 중앙행정기관 목록은 ministries.js(공용)에서 로드

function renderMinistries(cases, affOfCase) {
  // 그룹 구분 없이 한 그리드에 나열 — 관측 있는 기관을 앞에, 미관측은 뒤에
  const grid = document.getElementById('ministry-grid');
  const items = MINISTRY_GROUPS.flatMap((g) => g.items);
  const counted = items.map((min) => ({
    min,
    n: cases.filter((c) => min.kw.some((k) =>
      c.org.includes(k) || (affOfCase.get(c.id) || '').includes(k))).length,
  }));
  counted.sort((a, b) => b.n - a.n);
  const total = counted.length;
  const observed = counted.filter((x) => x.n > 0).length;
  for (const { min, n } of counted) {
    const cell = el('div', 'region-cell' + (n === 0 ? ' region-cell--empty' : ''));
    cell.appendChild(el('p', 'region-cell__name', min.name));
    cell.appendChild(el('p', 'region-cell__count', n === 0 ? '관측 없음' : `${n}건`));
    if (n > 0) {
      cell.classList.add('region-cell--link');
      cell.addEventListener('click', () => {
        location.href = './?ministry=' + encodeURIComponent(min.name);
      });
      cell.title = `${min.name} 사례 보기`;
    }
    grid.appendChild(cell);
  }
  document.getElementById('ministry-note').textContent =
    `중앙행정기관·위원회 ${total}곳 중 ${observed}곳 관측 — 2026년 정부조직 개편(기재부 분리, ` +
    '국가데이터처·지식재산처 승격 등)을 반영했으며, 옛 명칭 표기 사례도 새 기관으로 합산합니다. ' +
    '회색은 사례가 없다는 뜻이 아니라 이 관측망에 아직 잡히지 않았다는 뜻입니다.';
}

async function main() {
  const [res, champRes] = await Promise.all([
    fetch('./data/cases.json', { cache: 'no-cache' }),
    fetch('./data/champions.json', { cache: 'no-cache' }).catch(() => null),
  ]);
  const cases = (await res.json()).cases;
  // 사례 id → 챔피언 소속 문자열 (부처 식별 보강 — 기관 표기에 없는 소속을 챔피언 정보로 보완)
  const affOfCase = new Map();
  if (champRes && champRes.ok) {
    try {
      const champDoc = await champRes.json();
      for (const ch of champDoc.champions) {
        const aff = (ch.affiliation && ch.affiliation.value) || '';
        if (!aff) continue;
        for (const cid of ch.cases) {
          affOfCase.set(cid, `${affOfCase.get(cid) || ''} ${aff}`);
        }
      }
    } catch { /* 소속 보강 실패는 집계 범위만 줄인다 */ }
  }

  renderMinistries(cases, affOfCase);

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
    '미상의 구성은 아래 표에서 유형별로 확인할 수 있습니다.';

  // ── 지역 미상 분해 — 지역 개념이 없는 유형과 '미확인(수집 과제)'을 구분한다 ──
  const UNKNOWN_NATURE = {
    '공직 개인': '소속 기관 미확인 — 챔피언 소속이 확인되는 대로 지역을 확정해 지도에 반영(백필)합니다. 지역 격차의 실제 수집 과제.',
    '커뮤니티': '시민·개발자 커뮤니티 산출물 — 특정 지역에 속하지 않아 지역 격차 집계 대상이 아닙니다.',
    '중앙행정기관': '전국 단위 기관 — 지역이 아닌 부처 그리드에서 관측됩니다.',
    '공공기관': '전국 사업 단위 — 본사 소재지 표기는 추후 과제입니다.',
    '민간(참고)': '참고 사례 — 지역 집계에서 제외합니다.',
    '해외(참고)': '참고 사례 — 지역 집계에서 제외합니다.',
  };
  const unkByType = new Map();
  for (const c of cases) {
    if (c.region) continue;
    unkByType.set(c.org_type, (unkByType.get(c.org_type) || 0) + 1);
  }
  const utbody = document.querySelector('#region-unknown-table tbody');
  [...unkByType.entries()].sort((a, b) => b[1] - a[1]).forEach(([type, n]) => {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', 'obs-strong', type));
    tr.appendChild(el('td', null, `${n}건`));
    tr.appendChild(el('td', null, UNKNOWN_NATURE[type] || '분류 확인 필요'));
    utbody.appendChild(tr);
  });
  const pending = unkByType.get('공직 개인') || 0;
  const note = document.getElementById('region-unknown-note');
  note.textContent = `미상 ${unknown}건 중 실제 '지역 미확인'은 공직 개인 ${pending}건입니다 — ` +
    '나머지는 전국 단위·커뮤니티·참고 사례로 지역 격차의 결측이 아닙니다. 미상 사례 전체 보기: ';
  const a = document.createElement('a');
  a.href = './?region=' + encodeURIComponent('미상');
  a.textContent = '아카이브에서 필터로 열기 →';
  note.appendChild(a);

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
