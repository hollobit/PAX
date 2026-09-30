#!/bin/bash
# 카카오 워치독을 이 Mac의 launchd에 등록한다(새 기기로 옮기거나 등록이 풀렸을 때).
# 전제: kakaocli 설치·로그인, 카카오톡 앱 로그인, data/state.json에 kakao.chat_id.
# 사용: bash scripts/launchd/install_watchdog.sh     해제: launchctl bootout gui/$(id -u)/kr.pax.kakao-watchdog
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL=kr.pax.kakao-watchdog
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents"
sed "s#__REPO__#$REPO#g" "$REPO/scripts/launchd/$LABEL.plist.template" > "$DEST"
plutil -lint "$DEST" >/dev/null
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true   # 이미 있으면 다시 싣는다
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "등록: $DEST (10분 주기, 로그: data/private/watchdog.log)"
launchctl print "gui/$(id -u)/$LABEL" | grep -E "state|run interval" || true
