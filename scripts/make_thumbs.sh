#!/bin/bash
# 사례 대상 URL의 썸네일(site/thumbs/<id>.png)을 headless 브라우저로 생성한다.
# 대상: case_url이 있는 사례 + link가 서비스 URL인 kakao 사례. 이미 있는 썸네일은 건너뜀.
# 사용법: repo 루트에서 bash scripts/make_thumbs.sh
set -u

B="$HOME/.claude/skills/gstack/browse/dist/browse"
if [ ! -x "$B" ]; then
  echo "오류: headless 브라우저(browse)가 없습니다: $B" >&2
  exit 1
fi

ROOT="$(pwd)"
mkdir -p "$ROOT/site/thumbs"

TARGETS=$(python3 - <<'PY'
import json
doc = json.load(open('data/cases.json'))
for c in doc['cases']:
    url = c.get('case_url')
    if not url and c['source'] == 'kakao':
        url = c.get('link')
    if url and url.startswith('https://'):
        print(f"{c['id']}\t{url}")
PY
)

"$B" viewport 1200x750 >/dev/null

made=0; skipped=0; failed=0
while IFS=$'\t' read -r cid url; do
  [ -z "$cid" ] && continue
  out="$ROOT/site/thumbs/${cid}.png"
  if [ -s "$out" ]; then
    skipped=$((skipped+1)); continue
  fi
  echo "→ $cid  $url"
  if "$B" goto "$url" >/dev/null 2>&1; then
    sleep 2
    if "$B" screenshot --viewport "$out" >/dev/null 2>&1 && [ -s "$out" ]; then
      made=$((made+1)); continue
    fi
  fi
  echo "  실패: $url" >&2
  failed=$((failed+1))
done <<< "$TARGETS"

echo "썸네일 생성 ${made}건, 기존 유지 ${skipped}건, 실패 ${failed}건"
