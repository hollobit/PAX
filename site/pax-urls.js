// 사례의 대표 주소 — 사람이 사례를 알아보는 것은 돌아가는 화면이지 코드 목록이 아니므로
// 운영 사이트를 저장소보다 먼저 고른다. scripts/pax/urls.py와 같은 규칙이다 —
// 한쪽만 고치면 썸네일과 링크가 서로 다른 곳을 가리킨다.
export const REPO_HOST = /^https?:\/\/(www\.)?(github\.com|gitlab\.com|gitlab\.aigov\.go\.kr|bitbucket\.org|gitee\.com|sourceforge\.net)\//i;
export const POST_HOST = /^https?:\/\/([\w.-]+\.)?(threads\.com|threads\.net|twitter\.com|x\.com|facebook\.com|instagram\.com|brunch\.co\.kr|blog\.naver\.com)\//i;

export function caseTargetUrl(c) {
  const urls = ['case_url', 'link', 'mirror_url']
    .map((k) => c[k])
    .filter((u) => typeof u === 'string' && u.startsWith('https://'));
  if (!urls.length) return null;
  // github.io·vercel.app 같은 배포 주소는 호스팅이 깃허브여도 서비스로 본다.
  const live = urls.find((u) => !REPO_HOST.test(u) && !POST_HOST.test(u));
  return live || urls.find((u) => REPO_HOST.test(u)) || null;
}
