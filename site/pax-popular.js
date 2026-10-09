// 인기·신규 판정 — 메인 목록(app.js)과 사례 상세 페이지(case-page.js)가 같은 규칙을 쓴다.
// 인기: 누적 북마크 수 → SNS 반응(popularity) → 최신 게시일 순으로 줄 세운 상위 N개.
// 신규: 수집일이 최근 N일 이내.

export const POPULAR_TOP_N = 20;
export const NEW_WINDOW_DAYS = 3;

/** @param {{collected_at: string}} c @param {number} [now] */
export function isNewCase(c, now = Date.now()) {
  const collected = new Date(`${c.collected_at}T00:00:00`);
  const ageDays = (now - collected.getTime()) / 86400000;
  return ageDays >= 0 && ageDays <= NEW_WINDOW_DAYS;
}

/** 인기 지표 비교 함수 — counts: Map<case id, 누적 북마크 수> */
export function comparePopularity(counts) {
  const bm = (c) => counts.get(c.id) || 0;
  return (a, b) => {
    const bmDiff = bm(b) - bm(a);
    if (bmDiff !== 0) return bmDiff;
    const diff = (b.popularity || 0) - (a.popularity || 0);
    if (diff !== 0) return diff;
    return (b.date + b.collected_at).localeCompare(a.date + a.collected_at);
  };
}

/** 인기 사례 id 집합 — 북마크된 사례를 횟수순으로 먼저 채우고, 모자라면 SNS 반응 보유 사례로 채운다 */
export function popularIds(cases, counts) {
  const ranked = cases
    .filter((c) => (counts.get(c.id) || 0) > 0 || c.popularity)
    .sort(comparePopularity(counts))
    .slice(0, POPULAR_TOP_N);
  return new Set(ranked.map((c) => c.id));
}
