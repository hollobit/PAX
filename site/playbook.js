'use strict';

/** 자가진단 위저드 (로드맵 2-5) — C×H×P×R 좌표 판정 → 유사 사례 + 다음 관문 체크리스트 */

const QUESTIONS = [
  { key: 'c', label: '도구가 업무를 어디까지 해주나요?',
    options: [
      { text: '기능·데이터를 제공한다 (검색·조회·연결)', value: 0 },
      { text: '결과물 초안을 만들어 준다 (문서·분석·코드)', value: 1 },
      { text: '내가 검토·승인하면 업무가 완료된다', value: 2 },
      { text: '접수부터 종료 확인까지 거의 자동으로 닫힌다', value: 3 },
    ] },
  { key: 's', label: '어느 범위의 업무에 쓰이나요?',
    options: [
      { text: '한 가지 업무·작업', value: 1 },
      { text: '여러 업무를 묶은 도구 모음', value: 2 },
      { text: '부서·기관의 업무 흐름 전체', value: 3 },
    ] },
  { key: 'h', label: '사람은 어떻게 개입하나요?',
    options: [
      { text: '모든 출력을 사람이 확인·수정한다', value: 2 },
      { text: '일부는 자동 반영되고 예외만 사람이 본다', value: 1 },
      { text: '거의 개입하지 않는다', value: 0 },
    ] },
  { key: 'p', label: '도구의 권한은 어디까지인가요?',
    options: [
      { text: '조회·읽기만 한다', value: 0 },
      { text: '문서·산출물을 만든다 (업무 시스템 밖)', value: 1 },
      { text: '업무 시스템에 입력·등록까지 한다', value: 2 },
      { text: '처분·결정에 직접 관여한다', value: 3 },
    ] },
  { key: 'r', label: '모델·API 장애에 대비가 있나요?',
    options: [
      { text: '없다 — 멈추면 그날은 수동으로', value: 0 },
      { text: '수동 절차로 되돌아가는 폴백을 정해뒀다', value: 1 },
      { text: '대체 모델·로컬 모델로 전환할 수 있다', value: 2 },
    ] },
  { key: 't', label: '지금 누가 쓰고 있나요?',
    options: [
      { text: '나만 쓴다', value: 0 },
      { text: '동료·부서와 공유했다', value: 1 },
      { text: '기관 공식 절차(보안검토·품의)를 통과했다', value: 2 },
    ] },
];

const answers = {};

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function judge() {
  const { c, h, p, r, t } = answers;
  // AX 단계 근사: 관문 우선 — 높은 완결성도 통제·권한 서술 없이는 상향하지 않는다
  let stage = 'AI-Ready';
  if (c >= 1 && h >= 1) stage = 'AI-Enabled';
  if (c >= 2 && t >= 2 && h >= 1) stage = 'AI-First 후보';
  const gates = [];
  if (c < 2) gates.push('업무가 실제로 닫히는 지점(검토→완료)까지 도구를 연결해 보세요 — 완결성 C2가 다음 관문입니다.');
  if (t < 2) gates.push('부서 공유를 넘어 보안성 검토·품의를 밟아보세요 — 위의 수용 절차 4단계가 그 지도입니다. First 이상은 기관 수용 절차의 산물입니다.');
  if (h === 0 && c >= 2) gates.push('자동화 수준에 비해 인간 통제 서술이 없습니다 — 승인 게이트와 예외 처리 절차를 문서로 남기세요 (원칙 3).');
  if (p >= 2) gates.push('시스템 쓰기 권한이 있습니다 — 감사 로그와 승인 게이트, 킬스위치를 갖추고 서술하세요 (원칙 4). 관측된 사례 중 권한을 서술한 곳은 아직 없습니다. 첫 사례가 되어 주세요.');
  if (r === 0) gates.push('장애 시 수동 복귀 절차(폴백)를 한 문단이라도 정해 두세요 — 복원력은 Native 관문의 필수 조건입니다.');
  if (!gates.length) gates.push('관문 조건을 폭넓게 갖췄습니다 — 운영 성과(처리 건수·시간)를 기록해 증거 등급을 올리는 것이 다음 단계입니다.');
  return { stage, gates };
}

async function similarCases(target) {
  try {
    const [casesRes, evalRes] = await Promise.all([
      fetch('./data/cases.json', { cache: 'no-cache' }),
      fetch('./data/evals-lite.json', { cache: 'no-cache' }),
    ]);
    const cases = (await casesRes.json()).cases;
    const evals = (await evalRes.json()).cases;
    const byId = new Map(cases.map((c) => [c.id, c]));
    const cGrade = `C${Math.min(target.c, 3)}`;
    const pPrefix = `P${Math.min(target.p, 2)}`;
    return evals
      .filter((e) => e.c === cGrade || (e.p || '').startsWith(pPrefix))
      .sort((a, b) => {
        const score = (e) => (e.c === cGrade ? 2 : 0) + ((e.p || '').startsWith(pPrefix) ? 1 : 0);
        return score(b) - score(a);
      })
      .slice(0, 3)
      .map((e) => byId.get(e.id))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function renderQuestion(i) {
  const wizard = document.getElementById('wizard');
  wizard.replaceChildren();
  if (i >= QUESTIONS.length) {
    showResult();
    return;
  }
  const q = QUESTIONS[i];
  wizard.appendChild(el('p', 'wizard__progress', `${i + 1} / ${QUESTIONS.length}`));
  wizard.appendChild(el('h3', 'wizard__question', q.label));
  const list = el('div', 'wizard__options');
  for (const opt of q.options) {
    const btn = el('button', 'wizard__option', opt.text);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      answers[q.key] = opt.value;
      renderQuestion(i + 1);
    });
    list.appendChild(btn);
  }
  wizard.appendChild(list);
  if (i > 0) {
    const back = el('button', 'wizard__back', '← 이전 문항');
    back.type = 'button';
    back.addEventListener('click', () => renderQuestion(i - 1));
    wizard.appendChild(back);
  }
}

async function showResult() {
  const { stage, gates } = judge();
  const result = document.getElementById('wizard-result');
  result.hidden = false;
  result.replaceChildren();
  result.appendChild(el('h3', 'wizard-result__stage', `판정: ${stage}`));
  result.appendChild(el('p', 'wizard-result__coords',
    `좌표 — 완결성 C${answers.c} · 범위 S${answers.s} · 인간통제 H${answers.h} · 권한 P${answers.p} · 복원력 R${answers.r}`));
  const gateTitle = el('h4', null, '다음 관문 체크리스트');
  result.appendChild(gateTitle);
  const ul = document.createElement('ul');
  ul.className = 'wizard-result__gates';
  for (const g of gates) ul.appendChild(el('li', null, g));
  result.appendChild(ul);

  const sims = await similarCases(answers);
  if (sims.length) {
    result.appendChild(el('h4', null, '비슷한 좌표의 사례'));
    const simList = document.createElement('ul');
    simList.className = 'wizard-result__cases';
    for (const c of sims) {
      const li = document.createElement('li');
      const a = el('a', null, c.title);
      a.href = `./?case=${c.id}`;
      li.appendChild(a);
      simList.appendChild(li);
    }
    result.appendChild(simList);
  }

  const actions = el('div', 'wizard-result__actions');
  const printBtn = el('button', 'export-btn', '진단 결과 인쇄·PDF 저장');
  printBtn.type = 'button';
  printBtn.addEventListener('click', () => window.print());
  const retry = el('button', 'export-btn', '다시 진단하기');
  retry.type = 'button';
  retry.addEventListener('click', () => {
    result.hidden = true;
    renderQuestion(0);
  });
  actions.append(printBtn, retry);
  result.appendChild(actions);
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

renderQuestion(0);
