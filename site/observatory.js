'use strict';

/**
 * 관측소 — 공공 AX 지수 · 데이터 AI 접근성 매트릭스 · 공공 깃랩 브릿지
 * index.json(빌드 산출)과 cases.json을 읽어 렌더링한다.
 * app.js와 같은 원칙: textContent/createElement만 사용 (XSS 방지).
 */

// 고가치 공공데이터 도메인 — 국가중점데이터·커뮤니티 수요 관측 기반의 큐레이션 목록.
// keywords는 사례 제목·태그와의 매칭에 쓴다.
const DATA_DOMAINS = [
  { name: '법령·판례', keywords: ['법령', '법률', '판례', '법제'] },
  { name: '부동산 실거래가', keywords: ['실거래', '부동산'] },
  { name: '조달·나라장터', keywords: ['조달', '나라장터', '입찰'] },
  { name: '기업공시(DART)', keywords: ['dart', '공시'] },
  { name: '건축물대장·건축', keywords: ['건축'] },
  { name: '대기·환경', keywords: ['대기', '환경', '미세먼지'] },
  { name: '교통·도시데이터', keywords: ['교통', '주차', '도시데이터', '혼잡'] },
  { name: '국가통계(KOSIS)', keywords: ['통계포털', 'kosis', '국가통계'] },
  { name: '보건의료(심평원)', keywords: ['심평원', '의료 데이터', '공공 의료'] },
  { name: '의약품(식약처)', keywords: ['의약품', '식약처', 'dur'] },
  { name: '식품영양', keywords: ['식품영양'] },
  { name: '기상·재난', keywords: ['기상', '날씨', '재난'] },
  { name: '국회·의안', keywords: ['국회', '법안', '회의록'] },
  { name: '예산·재정', keywords: ['예산', '세출', '재정'] },
  { name: 'R&D·지원사업', keywords: ['r&d', '지원사업', '연구개발'] },
  { name: '교육과정', keywords: ['교육과정'] },
  { name: '복지·안전망', keywords: ['복지'] },
  { name: '특허·지식재산', keywords: ['특허'] },
  { name: '관세·무역', keywords: ['관세', '무역', '수출입'] },
  { name: '인구·행정구역', keywords: ['인구', '주민등록'] },
];

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function pct(v) {
  return v == null ? '—' : `${Math.round(v * 1000) / 10}%`;
}

function indexCard(label, value, note) {
  const card = el('div', 'obs-card');
  card.appendChild(el('p', 'obs-card__label', label));
  card.appendChild(el('p', 'obs-card__value', value));
  if (note) card.appendChild(el('p', 'obs-card__note', note));
  return card;
}

async function main() {
  const [idxRes, casesRes] = await Promise.all([
    fetch('./data/index.json', { cache: 'no-cache' }),
    fetch('./data/cases.json', { cache: 'no-cache' }),
  ]);
  const idx = await idxRes.json();
  const cases = (await casesRes.json()).cases;

  document.getElementById('obs-quarter').textContent =
    `${idx.quarter} · ${idx.generated_at} 기준`;

  // ── 지수 카드 ──
  const cards = document.getElementById('index-cards');
  const ax = idx.ax_distribution;
  cards.appendChild(indexCard('관측 사례', `${idx.total_cases}건`,
    `MCP ${idx.mcp_cases}건 포함`));
  cards.appendChild(indexCard('챔피언', `${idx.total_champions}명`,
    `인증 연동 ${idx.certified_champions}명 · 귀속 미확인 사례 ${idx.unattributed_cases}건`));
  cards.appendChild(indexCard('AX 단계 분포',
    `Ready ${ax['AI-Ready'] || 0} · Enabled ${ax['AI-Enabled'] || 0} · First ${ax['AI-First'] || 0}`,
    'AI-Native 0 — 재설계 단계 공백'));
  cards.appendChild(indexCard('업무 완결성 평균', `C ${idx.c_axis_mean}`,
    'C0(기능)~C5(학습) 척도 평균'));
  cards.appendChild(indexCard('국산 모델 채택률', pct(idx.domestic_model_rate),
    `모델 확인 ${idx.model_known}건 기준 · 로컬 실행 ${pct(idx.local_model_rate)}`));
  cards.appendChild(indexCard('라이선스 명시율', pct(idx.license_stated_rate),
    `저장소 확인 ${idx.license_tagged}건 기준`));
  cards.appendChild(indexCard('권한(P축) 분포',
    Object.entries(idx.p_distribution).map(([k, v]) => `${k} ${v}`).join(' · '),
    '공개 서술 기반 잠정 판정'));
  cards.appendChild(indexCard('승인 게이트 미확인', pct(idx.unknown_rates.approval_gate),
    'Agentic 전환의 최대 공백 — 서술 관행 자체'));
  const funnel = idx.transition_funnel;
  cards.appendChild(indexCard('전이 퍼널',
    `기관 공식 ${funnel['기관 공식'] || 0} · 타기관 재사용 ${funnel['타 기관 재사용'] || 0} · 범정부 ${funnel['범정부 탑재'] || 0}`,
    `미확인 ${funnel['미확인'] || 0}건 — 다음 관측 과제`));

  // ── 커뮤니티 활력 ──
  try {
    const comRes = await fetch('./data/community.json', { cache: 'no-cache' });
    if (comRes.ok) {
      const com = await comRes.json();
      const cc = document.getElementById('community-cards');
      cc.appendChild(indexCard('오픈톡 가입자', `${(com.members.latest || 0).toLocaleString()}명`,
        com.members.first && com.members.latest !== com.members.first
          ? `${com.members.first_date} ${com.members.first.toLocaleString()}명 이후 ${com.members.latest - com.members.first >= 0 ? '+' : ''}${(com.members.latest - com.members.first).toLocaleString()}`
          : `${com.members.latest_date} 기준 — 변화 추적 시작`));
      cc.appendChild(indexCard('대화 (오늘)', `${com.kakao.today.toLocaleString()}건`, null));
      cc.appendChild(indexCard('대화 (7일)', `${com.kakao.week.toLocaleString()}건`,
        `일평균 ${Math.round(com.kakao.week / 7).toLocaleString()}건`));
      cc.appendChild(indexCard('대화 (30일)', `${com.kakao.month.toLocaleString()}건`, null));
      cc.appendChild(indexCard('대화 (관측 전체)', `${com.kakao.total.toLocaleString()}건`,
        `${com.kakao.observed_days}일 관측 누적`));
      cc.appendChild(indexCard('Threads 관측 게시물', `${com.threads.observed_total || 0}건`,
        '태그 검색 관측 누적'));
      const chart = document.getElementById('kakao-chart');
      const max = Math.max(...com.kakao_recent.map(([, n]) => n), 1);
      for (const [date, n] of com.kakao_recent) {
        const bar = el('div', 'mini-chart__bar');
        const fill = el('div', 'mini-chart__fill');
        fill.style.height = `${Math.round((n / max) * 100)}%`;
        const yoil = ['일', '월', '화', '수', '목', '금', '토'][new Date(`${date}T00:00:00+09:00`).getDay()];
        bar.title = `${date} (${yoil}): ${n}건`;
        bar.appendChild(fill);
        const label = el('span', 'mini-chart__label', date.slice(8));
        label.appendChild(document.createElement('br'));
        label.append(`(${yoil})`);
        if (yoil === '토' || yoil === '일') label.classList.add('mini-chart__label--weekend');
        bar.appendChild(label);
        chart.appendChild(bar);
      }
    }
  } catch (err) {
    console.error('커뮤니티 지표 로드 실패:', err);
  }

  // ── 데이터 매트릭스 ──
  const mcpCases = cases.filter((c) =>
    c.title.includes('MCP') || c.tags.includes('MCP'));
  const tbody = document.querySelector('#data-matrix tbody');
  for (const domain of DATA_DOMAINS) {
    const hits = mcpCases.filter((c) => {
      const text = (c.title + ' ' + c.summary + ' ' + c.tags.join(' ')).toLowerCase();
      return domain.keywords.some((k) => text.includes(k));
    });
    const tr = document.createElement('tr');
    tr.appendChild(el('td', null, domain.name));
    const covered = el('td', hits.length ? 'obs-covered' : 'obs-uncovered',
      hits.length ? `관측 ${hits.length}건` : '미관측');
    tr.appendChild(covered);
    const caseTd = document.createElement('td');
    hits.slice(0, 2).forEach((c, i) => {
      if (i > 0) caseTd.append(' · ');
      const a = el('a', null, c.title.slice(0, 30) + (c.title.length > 30 ? '…' : ''));
      a.href = `./?case=${c.id}`;
      caseTd.appendChild(a);
    });
    if (!hits.length) caseTd.textContent = '—';
    tr.appendChild(caseTd);
    tbody.appendChild(tr);
  }

  // ── MCP 현황과 이슈 ──
  const m = idx.mcp_stats;
  const mcpCards = document.getElementById('mcp-cards');
  mcpCards.appendChild(indexCard('MCP 사례', `${m.total}건`,
    `아카이브 전체의 ${Math.round((m.total / idx.total_cases) * 100)}%`));
  mcpCards.appendChild(indexCard('공급 vs 소비',
    `Server ${m.roles['Server'] || 0} : Client ${m.roles['Client/Host'] || 0}`,
    '배관은 깔렸는데 물이 흐른 사례는 드물다'));
  mcpCards.appendChild(indexCard('공식 제공', `${m.official}건`,
    `비공식(커뮤니티·개인) ${m.unofficial}건 — 공식화 경로가 다음 과제`));
  mcpCards.appendChild(indexCard('완결성', `C0 ${m.c_grades['C0'] || 0}건`,
    `C2 이상 ${(m.c_grades['C2'] || 0) + (m.c_grades['C3'] || 0)}건 — 기능 제공 단계에 집중`));
  mcpCards.appendChild(indexCard('유지보수', `활발 ${m.maintenance['활발'] || 0}`,
    `정체 ${m.maintenance['정체'] || 0} · 방치 ${m.maintenance['방치'] || 0} — 3분의 1이 손을 떠났다`));
  const issues = document.getElementById('mcp-issues');
  const issue = (strong, rest) => {
    const li = document.createElement('li');
    const b = el('strong', null, strong);
    li.appendChild(b);
    li.append(' ' + rest);
    issues.appendChild(li);
  };
  issue(`공급-소비 비대칭 (${m.roles['Server'] || 0}:${m.roles['Client/Host'] || 0}).`,
    '서버는 폭증했지만 이를 실제 업무에서 소비하는 클라이언트·호스트 사례는 한 자릿수 — 만드는 사람과 쓰는 사람이 아직 연결되지 않았습니다.');
  issue(`완결성 정체 (C0 ${m.c_grades['C0'] || 0}건).`,
    '거의 전부가 "데이터를 연결해 준다"(기능 제공)에 머물고, 업무가 닫히는 폐쇄루프는 1건 — 다음 단계는 서버가 아니라 업무 결합입니다.');
  issue(`공식 제공 희소 (${m.official}건).`,
    '커뮤니티가 먼저 만들고 기관이 따라오는 구조 — 비공식 MCP의 공식화 경로(인지→공동 유지보수→공식)가 제도 공백입니다.');
  issue('권한·감사 서술 부재 (승인 게이트 미확인 100%).',
    '어떤 MCP가 무엇을 읽고 쓸 수 있는지 서술하는 관행 자체가 없습니다 — 에이전트 확산의 최대 리스크.');
  issue(`유지보수 개인 의존 (정체·방치 ${(m.maintenance['정체'] || 0) + (m.maintenance['방치'] || 0)}건).`,
    'MCP 3건 중 1건은 최근 활동이 멈췄습니다 — 데이터 스키마가 바뀌면 조용히 깨지는 도구들입니다.');

  // ── 저장소 지표 (플랫폼 분리) ──
  const renderPlatform = (key) => {
    const s = idx.repo_stats[key];
    const cards = document.getElementById(`repo-cards-${key}`);
    const label = key === 'gitlab' ? '공공 깃랩' : 'GitHub';
    cards.appendChild(indexCard('저장소', `${s.count}건`,
      `스타 실측 ${s.starred}건 — 표의 ★는 ${label} 자체 스타`));
    cards.appendChild(indexCard('스타 합계', `${s.stars_sum.toLocaleString()}★`,
      `${label} 저장소 ${s.starred}건의 합 (미러 사례는 플랫폼별 각각 집계)`));
    cards.appendChild(indexCard('유지보수 활발', `${s.maintenance['활발'] || 0}건`,
      '최근 60일 내 활동'));
    cards.appendChild(indexCard('정체·방치',
      `${(s.maintenance['정체'] || 0) + (s.maintenance['방치'] || 0)}건`,
      key === 'gitlab' ? '개설 초기라 전원 활발 — 다음 분기부터 관측 의미' : '카드 배지로 도입 전 확인 가능'));
    const body = document.querySelector(`#star-table-${key} tbody`);
    for (const r of s.top) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      const a = el('a', null, r.title.length > 38 ? r.title.slice(0, 38) + '…' : r.title);
      a.href = `./?case=${r.id}`;
      td.appendChild(a);
      tr.appendChild(td);
      const devTd = document.createElement('td');
      const devLink = el('a', null, r.developer || '미상');
      devLink.href = `./?q=${encodeURIComponent((r.developer || '').split(' · ')[0])}`;
      if (r.developer && r.developer !== '미상') devTd.appendChild(devLink);
      else devTd.textContent = '미상';
      tr.appendChild(devTd);
      tr.appendChild(el('td', 'obs-strong', String(r.stars)));
      tr.appendChild(el('td', null, r.maintenance || '—'));
      tr.appendChild(el('td', null, r.license || '미확인'));
      body.appendChild(tr);
    }
    if (!s.top.length) {
      const tr = document.createElement('tr');
      const td = el('td', null, `${label} 스타 데이터 없음`);
      td.colSpan = 5;
      tr.appendChild(td);
      body.appendChild(tr);
    }
  };
  renderPlatform('github');
  renderPlatform('gitlab');

  // ── 라이선스 현황 ──
  const licCards = document.getElementById('license-cards');
  licCards.appendChild(indexCard('저장소 확인', `${idx.license_tagged}건`,
    `전체 ${idx.total_cases}건 중 저장소 기반 사례`));
  licCards.appendChild(indexCard('라이선스 명시율', pct(idx.license_stated_rate),
    '명시 없음 = 재사용 조건 불명'));
  const bySrc = idx.license_by_source;
  licCards.appendChild(indexCard('플랫폼별 명시율',
    `GitHub ${Math.round((bySrc.github.stated / bySrc.github.total) * 100)}% · 깃랩 ${Math.round((bySrc.gitlab.stated / bySrc.gitlab.total) * 100)}%`,
    `Pages 역매핑 ${Math.round((bySrc['github-pages'].stated / bySrc['github-pages'].total) * 100)}% — 내부망산 도구일수록 라이선스 관행이 약하다`));
  const LICENSE_MEANING = {
    'MIT': '자유 재사용 — 출처 표시만',
    'Apache-2.0': '자유 재사용 + 특허 조항',
    'ISC': 'MIT와 사실상 동일',
    'AGPL-3.0': '강한 카피레프트 — 서비스 제공 시 소스 공개 의무',
    'Other': '커스텀 조항 — 개별 확인 필요',
    '기타(비표준)': '커스텀 조항 — 개별 확인 필요',
    '명시 없음': '재사용 조건 불명 — 법적으로 이용 범위가 정해지지 않음',
  };
  const licBody = document.querySelector('#license-table tbody');
  for (const [name, n] of Object.entries(idx.license_distribution)) {
    const mx = idx.license_matrix[name] || { github: 0, gitlab: 0 };
    const tr = document.createElement('tr');
    tr.appendChild(el('td', name === '명시 없음' ? null : 'obs-strong', name));
    tr.appendChild(el('td', null, `${mx.github}건`));
    tr.appendChild(el('td', null, `${mx.gitlab}건`));
    tr.appendChild(el('td', 'obs-strong', `${n}건`));
    tr.appendChild(el('td', null, LICENSE_MEANING[name] || '개별 확인 필요'));
    licBody.appendChild(tr);
  }

  // ── 깃랩 브릿지 ──
  const bridge = document.getElementById('bridge-cards');
  bridge.appendChild(indexCard('공공 깃랩 사례', `${idx.gitlab_cases}건`, null));
  bridge.appendChild(indexCard('GitHub 미러 쌍', `${idx.gitlab_mirror_pairs}쌍`, null));
  bridge.appendChild(indexCard('외부 공개율', pct(idx.gitlab_open_rate),
    '내부망산 도구가 외부 생태계에 공개되는 비율'));
  const mtbody = document.querySelector('#mirror-table tbody');
  for (const m of idx.mirror_pair_cases) {
    const tr = document.createElement('tr');
    const titleTd = document.createElement('td');
    const a = el('a', null, m.title);
    a.href = `./?case=${m.id}`;
    titleTd.appendChild(a);
    tr.appendChild(titleTd);
    for (const url of [m.github, m.gitlab]) {
      const td = document.createElement('td');
      const link = el('a', null, url.replace('https://', '').slice(0, 40));
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      td.appendChild(link);
      tr.appendChild(td);
    }
    mtbody.appendChild(tr);
  }
}

main().catch((err) => {
  console.error('관측소 로드 실패:', err);
  document.getElementById('index-cards').textContent = '데이터를 불러오지 못했습니다';
});
