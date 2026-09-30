// 변경 기록 — site/data/changelog.json(최신 날짜가 먼저)을 날짜별 목록으로 그린다.
import { el, fetchJson } from './pax-dom.js?v=b57d2715';

function entryNode(entry) {
  const article = el('article', 'changelog__entry');
  article.appendChild(el('h2', 'changelog__date', entry.date));
  const list = el('ul', 'changelog__items');
  list.append(...entry.items.map((item) => el('li', null, item)));
  article.appendChild(list);
  return article;
}

async function main() {
  const doc = await fetchJson('./data/changelog.json');
  document.getElementById('changelog').append(...doc.entries.map(entryNode));
}

main().catch((err) => {
  console.error('changelog.json 로드 실패:', err);
  document.getElementById('error-state').hidden = false;
});
