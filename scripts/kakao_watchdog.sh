#!/bin/bash
# 카카오톡 로컬 DB 동기화 워치독 (macOS 전용)
# - kakaocli chats로 전체 방의 최신 메시지 시각을 점검한다 (특정 방이 조용한 것과 구분).
# - STALL_MIN 분 이상 전체 정체면: ① 카카오톡 재실행 ② 재실행 후에도 정체면 macOS 알림.
# - 로그: data/private/watchdog.log (비공개 경로)
# 사용법: bash scripts/kakao_watchdog.sh [--check-only]
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"   # launchd 최소 PATH 대비
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/data/private"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/watchdog.log"
STALL_MIN=45
# 심야·새벽(01~08시 KST)엔 전 방 정적을 정체로 오탐하기 쉬움 — 임계 완화·알림 억제
HOUR=$(date '+%H')
if [ "$HOUR" -ge 1 ] && [ "$HOUR" -lt 8 ]; then STALL_MIN=240; NIGHT=1; else NIGHT=0; fi
STATE="$LOG_DIR/watchdog_state"   # 마지막 재실행 시각 기록(연속 재실행 방지)

now() { date '+%F %T'; }
log() { echo "$(now) $1" >> "$LOG"; }

latest_iso=$(kakaocli chats --json 2>/dev/null | python3 -c "
import sys,json
try: c=json.load(sys.stdin)
except Exception: print(''); raise SystemExit
ts=[str(x.get('last_message_at') or x.get('lastMessageAt') or '') for x in c]
ts=[t for t in ts if t]
print(max(ts) if ts else '')")
if [ -z "$latest_iso" ]; then log "점검 실패: kakaocli chats 응답 없음"; exit 0; fi

age_min=$(python3 -c "
import datetime
t=datetime.datetime.fromisoformat('$latest_iso'.replace('Z','+00:00'))
print(int((datetime.datetime.now(datetime.timezone.utc)-t).total_seconds()//60))")

CHAT_ID=18487372050628026
if [ "$age_min" -lt "$STALL_MIN" ]; then
  # 상시 수집: 최근 2일 창을 일자별 파일로 원자적 덤프 (커뮤니티 지표·정기 수집의 안전망)
  TODAY=$(date '+%F')
  OUT="$ROOT/data/raw/${TODAY}-kakao-auto.json"
  TMP=$(mktemp "$ROOT/data/raw/.kakao-auto.XXXXXX")
  if kakaocli messages --chat-id "$CHAT_ID" --since 2d --limit 8000 --json > "$TMP" 2>/dev/null      && python3 -c "import json,sys;json.load(open(sys.argv[1]))" "$TMP" 2>/dev/null; then
    mv "$TMP" "$OUT"
    N=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))))" "$OUT")
    log "정상: DB 최신 ${age_min}분 전 · 자동 수집 ${N}건 → $(basename "$OUT")"
  else
    rm -f "$TMP"
    log "정상: DB 최신 ${age_min}분 전 · 자동 수집 실패(다음 주기 재시도)"
  fi
  exit 0
fi

log "정체 감지: DB 최신 ${age_min}분 전 ($latest_iso)"
[ "${1:-}" = "--check-only" ] && { echo "STALL ${age_min}min"; exit 1; }

# 최근 90분 내 이미 재실행했으면 알림 단계로 (재실행 루프 방지)
last_restart=$(cat "$STATE" 2>/dev/null || echo 0)
now_epoch=$(date +%s)
if [ $((now_epoch - last_restart)) -gt 5400 ]; then
  log "조치: 카카오톡 재실행"
  osascript -e 'tell application "KakaoTalk" to quit' 2>/dev/null || true
  sleep 5
  open -a KakaoTalk 2>/dev/null && log "조치: 앱 기동 완료" || log "조치 실패: 앱 기동 불가"
  echo "$now_epoch" > "$STATE"
else
  if [ "$NIGHT" = "1" ]; then log "경고: 정체 지속 — 심야라 알림 보류(주간 재확인)"; exit 0; fi
  log "경고: 재실행 후에도 정체 지속 → 사용자 알림"
  osascript -e 'display notification "카카오톡 수신이 '"$age_min"'분째 멈춰 있습니다. 로그인 상태와 방 열람을 확인해 주세요. (PAX 수집 영향)" with title "PAX 카카오 워치독" sound name "Basso"' 2>/dev/null || true
fi
