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

// 중앙행정기관 전체 목록 — 2026년 정부조직 개편 반영
// (기재부→재정경제부+기획예산처 분리, 산업통상부·기후에너지환경부·성평등가족부 개칭,
//  통계청→국가데이터처·특허청→지식재산처 승격, 검찰청은 2026-10 공소청 개편 예정)
// kw에는 옛 명칭도 포함 — 개편 전 표기의 사례를 놓치지 않는다.
const MINISTRY_GROUPS = [
  { group: '부 (19부)', items: [
    { name: '재정경제부', kw: ['재정경제부', '재경부', '기획재정부', '기재부'] },
    { name: '교육부', kw: ['교육부'] },
    { name: '과학기술정보통신부', kw: ['과학기술정보통신부', '과기정통부', '과학기술혁신본부'] },
    { name: '외교부', kw: ['외교부'] },
    { name: '통일부', kw: ['통일부'] },
    { name: '법무부', kw: ['법무부'] },
    { name: '국방부', kw: ['국방부'] },
    { name: '행정안전부', kw: ['행정안전부', '행안부', 'AI 정부 실험실', 'AI정부실험실', 'AI실험실'] },
    { name: '국가보훈부', kw: ['보훈부'] },
    { name: '문화체육관광부', kw: ['문화체육관광부', '문체부'] },
    { name: '농림축산식품부', kw: ['농림축산식품부', '농식품부'] },
    { name: '산업통상부', kw: ['산업통상부', '산업통상자원부', '산업부'] },
    { name: '보건복지부', kw: ['보건복지부', '복지부'] },
    { name: '기후에너지환경부', kw: ['기후에너지환경부', '환경부'] },
    { name: '고용노동부', kw: ['고용노동부', '노동부'] },
    { name: '성평등가족부', kw: ['성평등가족부', '여성가족부'] },
    { name: '국토교통부', kw: ['국토교통부', '국토부'] },
    { name: '해양수산부', kw: ['해양수산부', '해수부'] },
    { name: '중소벤처기업부', kw: ['중소벤처기업부', '중기부'] },
  ] },
  { group: '대통령·국무총리 소속', items: [
    { name: '국무조정실·총리비서실', kw: ['국무조정실', '국무총리'] },
    { name: '기획예산처', kw: ['기획예산처'] },
    { name: '법제처', kw: ['법제처'] },
    { name: '인사혁신처', kw: ['인사혁신처'] },
    { name: '식품의약품안전처', kw: ['식약처', '식품의약품안전처'] },
    { name: '국가데이터처', kw: ['국가데이터처', '통계청'] },
    { name: '지식재산처', kw: ['지식재산처', '특허청'] },
    { name: '국가정보원', kw: ['국가정보원', '국정원'] },
  ] },
  { group: '장관급 위원회', items: [
    { name: '공정거래위원회', kw: ['공정거래위원회', '공정위'] },
    { name: '금융위원회', kw: ['금융위원회', '금융위'] },
    { name: '국민권익위원회', kw: ['권익위'] },
    { name: '방송미디어통신위원회', kw: ['방송미디어통신위원회', '방송통신위원회', '방통위'] },
    { name: '개인정보보호위원회', kw: ['개인정보보호위원회', '개인정보위'] },
    { name: '원자력안전위원회', kw: ['원자력안전위원회'] },
  ] },
  { group: '청', items: [
    { name: '국세청', kw: ['국세청'] },
    { name: '관세청', kw: ['관세청'] },
    { name: '조달청', kw: ['조달청'] },
    { name: '병무청', kw: ['병무청'] },
    { name: '방위사업청', kw: ['방위사업청'] },
    { name: '경찰청', kw: ['경찰청'] },
    { name: '소방청', kw: ['소방청', '소방 119'] },
    { name: '국가유산청', kw: ['국가유산청', '문화재청'] },
    { name: '농촌진흥청', kw: ['농촌진흥청'] },
    { name: '산림청', kw: ['산림청'] },
    { name: '질병관리청', kw: ['질병관리청'] },
    { name: '기상청', kw: ['기상청'] },
    { name: '재외동포청', kw: ['재외동포청'] },
    { name: '행정중심복합도시건설청', kw: ['행정중심복합도시건설청', '행복청'] },
    { name: '새만금개발청', kw: ['새만금개발청'] },
    { name: '우주항공청', kw: ['우주항공청'] },
    { name: '검찰청 (2026.10 공소청 개편 예정)', kw: ['검찰청', '공소청'] },
  ] },
];

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
