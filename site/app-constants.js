import { ORG_TYPES as VOCAB_ORG_TYPES, TASK_CATEGORIES } from './pax-vocab.js?v=c02c89d8';

// 메인 목록의 분류 어휘와 검색 사전 — 필터·주소창·배지가 같은 값을 쓴다.

// 분류 어휘의 정본은 pax-vocab.js(→ scripts/pax/schema.py) — 여기서는 '전체' 선택지만 덧붙인다
export const ORG_TYPES = ['전체', ...VOCAB_ORG_TYPES];
export const SOURCES = ['전체', 'Threads', '오픈채팅'];

export const ORG_TYPE_BADGE_CLASS = {
  중앙행정기관: 'badge--org-type-중앙',
  광역지자체: 'badge--org-type-지자체',
  기초지자체: 'badge--org-type-지자체',
  지방의회: 'badge--org-type-지자체',
  공공기관: 'badge--org-type-공공기관',
  교육기관: 'badge--org-type-교육',
  '공직 개인': 'badge--org-type-개인',
  커뮤니티: 'badge--org-type-커뮤니티',
  '민간(참고)': 'badge--org-type-참고',
  '해외(참고)': 'badge--org-type-참고',
};

export { TASK_CATEGORIES };

// 검색 동의어 사전 (로드맵 1-1): 실무 어휘 ↔ 사례 표기의 간극을 메운다
export const SYNONYMS = {
  여비: ['출장', '정산', '경비', '출장비'],
  출장정산: ['여비', '출장', '정산'],
  경비정산: ['여비', '정산'],
  공문: ['기안', '공문서', '문서', 'hwp'],
  기안: ['공문', '재기안', '품의'],
  결재: ['품의', '기안'],
  한글: ['hwp', 'hwpx'],
  민원: ['신고', '상담', '콜'],
  조달: ['입찰', '계약', '나라장터'],
  회의록: ['회의', '녹취', '전사'],
  번역: ['다국어', '통역'],
  챗봇: ['상담', '어시스턴트', '비서'],
  법령: ['법률', '법제', '조례', '규정'],
  일정: ['캘린더', '스케줄'],
  지도: ['gis', '맵', '현황판'],
};

export const VIEWS = ['cards', 'list', 'tags'];
