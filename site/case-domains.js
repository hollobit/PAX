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
  { name: '국방·병무', keywords: ['병무', '국방', '병역', '예비군', '장병'] },
  { name: '교육·학교', keywords: ['학교', '교육청', '교육지원청', '교사', '학생', '급식', '유치원', '교원', '학사', '교무'] },
  { name: '개인정보', keywords: ['개인정보', '가명정보', '비식별', '프라이버시', '마스킹', '정보주체'] },
  { name: '보안', keywords: ['보안', '취약점', '침해사고', '암호화', '랜섬', 'SBOM'] },
  { name: '소방·재난', keywords: ['소방', '재난', '119', '대피', '산불', '침수', '지진', '구조요청'] },
  { name: '의료·복지', keywords: ['의료', '보건소', '보건의료', '복지', '병원', '돌봄', '기초생활', '장애인', '의약품', '요양', '건강보험'] },
  { name: '특허', keywords: ['특허', '상표', '지식재산', '디자인권', '저작권', '실용신안', 'KIPRIS'] },
  { name: '제도', keywords: ['법령', '조례', '규정', '규칙', '지침', '제도', '입법', '규제'] },
];

const CASE_DOMAIN_NAMES = CASE_DOMAINS.map((d) => d.name);

function caseDomainText(c) {
  return `${c.title} ${(c.tags || []).join(' ')} ${c.summary}`;
}

function matchesCaseDomain(c, name) {
  const d = CASE_DOMAINS.find((x) => x.name === name);
  if (!d) return true;
  const text = caseDomainText(c);
  return d.keywords.some((k) => text.includes(k));
}

// 어느 분야에도 걸리지 않는 사례 — 비율을 정직하게 적으려면 이 수를 함께 밝혀야 한다.
function caseDomainCount(c) {
  const text = caseDomainText(c);
  return CASE_DOMAINS.filter((d) => d.keywords.some((k) => text.includes(k))).length;
}
