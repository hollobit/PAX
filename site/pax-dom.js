// 페이지들이 함께 쓰는 DOM·자료 도우미. 사례 데이터는 textContent로만 넣는다(innerHTML에 잇지 않는다).

/** 요소 하나 — el('p', 'cls', '글'). text가 null이면 비운다. */
export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * 사이트 자료(JSON)를 받는다. no-cache는 매번 ETag로 재검증한다 — 바뀌지 않았으면 본문 없는 304로 끝나고,
 * 수집 회차가 끝난 직후에는 새 값이 바로 보인다. 응답이 성공이 아니면 예외를 던진다(404 본문을 JSON으로
 * 읽다가 엉뚱한 곳에서 터지지 않게).
 * @param {string} path
 */
export async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json();
}

/** 없어도 페이지가 떠야 하는 부가 자료 — 실패하면 fallback을 돌려주고 콘솔에 남긴다. */
export async function fetchJsonOr(path, fallback = null) {
  try {
    return await fetchJson(path);
  } catch (err) {
    console.warn(`${path} 없이 계속:`, err.message);
    return fallback;
  }
}

/** 한국 시간 기준 오늘 'YYYY-MM-DD' — toISOString()은 UTC라 한국 00~09시에 전날이 된다. */
export function todayKst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
