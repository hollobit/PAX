// 사례 북마크 — 메인 목록(app.js)과 같은 저장소를 쓴다.
// 내 북마크는 localStorage 'pax-bookmarks'(사례 id 배열)에 두고, 전체 누적 수는 Supabase
// bookmark_toggle RPC(+1/-1만 허용, RLS로 직접 쓰기 차단)로 보낸다. anon 키는 공개용 키다.

const STORAGE_KEY = 'pax-bookmarks';
const COUNTER_URL = 'https://pdkpqrxcqiznsetxcvaq.supabase.co';
const COUNTER_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBka3BxcnhjcWl6bnNldHhjdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTA2MTAsImV4cCI6MjEwMTY4NjYxMH0.Rj7cnt9dHcQ7O-CuGeGwAyVxVdWFwQYuiCetOUbEHzI';

/** 저장된 북마크 id 집합. 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 빈 집합. */
export function loadBookmarks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function sendDelta(caseId, delta) {
  // 실패해도 화면 동작에는 영향 없음 (fire-and-forget)
  fetch(`${COUNTER_URL}/rest/v1/rpc/bookmark_toggle`, {
    method: 'POST',
    headers: { apikey: COUNTER_KEY, Authorization: `Bearer ${COUNTER_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_case_id: caseId, p_delta: delta }),
  }).catch((err) => console.error('북마크 카운터 전송 실패:', err));
}

/** id의 북마크를 뒤집은 새 집합을 돌려주고 저장·카운터 반영까지 한다. 원래 집합은 건드리지 않는다. */
export function toggleBookmark(current, id) {
  const next = new Set(current);
  const delta = next.has(id) ? -1 : 1;
  if (delta > 0) next.add(id);
  else next.delete(id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  } catch (err) {
    console.error('북마크 저장 실패:', err);
  }
  sendDelta(id, delta);
  return next;
}

/** 다른 탭(메인 목록 등)에서 북마크가 바뀌면 새 집합으로 알려 준다. */
export function onBookmarksChanged(callback) {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) callback(loadBookmarks());
  });
}
