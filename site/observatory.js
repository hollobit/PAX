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
