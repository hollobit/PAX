'use strict';

// 사례 분야(도메인) 분류 — 업무(기능) 축과 독립한 두 번째 축이다.
//
// task_category는 단일값이라 분야를 담을 수 없고(예: 소방 민원 답변기는 '민원'이면서 '소방·재난'),
// 한 사례가 여러 분야에 걸치는 일이 흔해 별도 축으로 두고 키워드로 판정한다.
// 원장에 필드를 더하지 않으므로 스키마·병합 경로는 그대로다 — 이 파일의 키워드만 고치면 갱신된다.
//
// 첫 화면의 분야 칩과 관측소 현황판의 분야 패널이 **이 파일 하나**를 함께 쓴다.
// 정의를 양쪽에 복사해 두면 언젠가 어긋나고, 같은 화면에서 다른 숫자가 나온다.
const CASE_DOMAINS = [
  { name: '국방·병무', keywords: ['병무', '국방', '병역', '예비군', '장병', '방위사업'] },
  { name: '교육·학교', keywords: ['학교', '교육청', '교육지원청', '교사', '학생', '급식', '유치원', '교원', '학사', '교무', '교육부', '대학교'] },
  { name: '개인정보', keywords: ['개인정보', '가명정보', '비식별', '프라이버시', '마스킹', '정보주체'] },
  { name: '보안', keywords: ['보안', '취약점', '침해사고', '암호화', '랜섬', 'SBOM'] },
  { name: '소방·재난', keywords: ['소방', '재난', '119', '대피', '산불', '침수', '지진', '구조요청'] },
  { name: '의료·복지', keywords: ['의료', '보건소', '보건의료', '복지', '병원', '돌봄', '기초생활', '장애인', '의약품', '요양', '건강보험', '질병관리', '식약처'] },
  { name: '특허', keywords: ['특허', '상표', '지식재산', '디자인권', '저작권', '실용신안', 'KIPRIS'] },
  { name: '제도', keywords: ['법령', '조례', '규정', '규칙', '지침', '제도', '입법', '규제'] },
];

const CASE_DOMAIN_NAMES = CASE_DOMAINS.map((d) => d.name);

// 판정 대상에 **기관명과 만든 사람의 소속**을 함께 넣는다(사용자 지시 2026-09-11).
// 도구 설명에 분야가 드러나지 않아도 소속이 분야를 말해 주는 사례가 많다 —
// 교육청 실무자가 만든 범용 문서 도구는 설명만 보면 어디에도 안 걸리지만 교육 현장의 도구다.
function caseDomainText(c, aff) {
  return `${c.title} ${(c.tags || []).join(' ')} ${c.summary} ${c.org || ''} ${aff || ''}`;
}

function matchesCaseDomain(c, name, aff) {
  const d = CASE_DOMAINS.find((x) => x.name === name);
  if (!d) return true;
  const text = caseDomainText(c, aff);
  return d.keywords.some((k) => text.includes(k));
}

// 어느 분야에도 걸리지 않는 사례 — 비율을 정직하게 적으려면 이 수를 함께 밝혀야 한다.
function caseDomainCount(c, aff) {
  const text = caseDomainText(c, aff);
  return CASE_DOMAINS.filter((d) => d.keywords.some((k) => text.includes(k))).length;
}

// 사례 id → 만든 사람들의 소속 문자열. 첫 화면과 관측소가 같은 방식으로 엮어야
// 두 화면의 분야 숫자가 같아진다.
function buildChampAffMap(championsDoc) {
  const m = new Map();
  for (const ch of (championsDoc && championsDoc.champions) || []) {
    // champions.json의 affiliation은 {value, inferred, evidence} 꼴이다.
    const aff = ((ch.affiliation && ch.affiliation.value) || '').trim();
    if (!aff) continue;
    for (const id of ch.cases || []) {
      m.set(id, `${m.get(id) || ''} ${aff}`);
    }
  }
  return m;
}
