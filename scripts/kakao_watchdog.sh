#!/bin/bash
# 카카오톡 로컬 DB 동기화 워치독 (macOS 전용)
#
# 전제: kakaocli는 앱이 관리하는 암호화 SQLite를 '읽기만' 한다(서버 통신 경로 없음).
#       따라서 앱이 떠 있지 않으면 DB에 새 메시지가 들어오지 않는다 — 앱은 사실상 동기화 데몬이다.
#       이 스크립트의 목표는 "앱을 항상 살려 두되 사용자 눈에는 띄지 않게" 하는 것이다.
#
# - 0층 프로세스 감시: 앱이 죽어 있으면 즉시 '숨긴 채' 재기동한다(open -g -j → 창·독 전환 없음).
#   사용자가 ⌘Q로 닫아도 다음 주기에 조용히 복구되므로 수집이 끊기지 않는다.
# - 1층 로그인 감시: 앱은 떴는데 로그아웃 상태면 재기동으로 못 고친다 — 사용자 알림으로 넘긴다.
# - 2층 정체 감시: kakaocli chats로 전체 방의 최신 시각을 점검한다(특정 방이 조용한 것과 구분).
#   STALL_MIN 분 이상 전체 정체면 ① 재실행 ② 그래도 정체면 macOS 알림.
# - 로그: data/private/watchdog.log (비공개 경로)
# 사용법: bash scripts/kakao_watchdog.sh [--check-only]
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"   # launchd 최소 PATH 대비
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/data/private"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/watchdog.log"

# 동시 실행 방지 — launchd 주기 실행과 수동 실행이 겹치면 기동 중인 앱을 서로 오판한다.
LOCK="$LOG_DIR/watchdog.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  # 15분 넘게 남아 있는 락은 비정상 종료 잔재로 보고 회수한다
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +15 2>/dev/null)" ]; then
    rmdir "$LOCK" 2>/dev/null && mkdir "$LOCK" 2>/dev/null || exit 0
  else
    exit 0
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
STALL_MIN=45
# 심야·새벽(01~08시 KST)엔 전 방 정적을 정체로 오탐하기 쉬움 — 임계 완화·알림 억제
HOUR=$(date '+%H')
if [ "$HOUR" -ge 1 ] && [ "$HOUR" -lt 8 ]; then STALL_MIN=240; NIGHT=1; else NIGHT=0; fi
STATE="$LOG_DIR/watchdog_state"   # 마지막 재실행 시각 기록(연속 재실행 방지)

now() { date '+%F %T'; }
log() { echo "$(now) $1" >> "$LOG"; }
# open -g -j 만으로는 창이 남고, 한 번 숨겨도 로그인이 끝나면 앱이 자기 창을 다시 띄운다
# (2026-09-09 실측). 그래서 로그인이 안정될 때까지 짧은 간격으로 재시도한다.
# 사용자가 직접 띄운 앱은 건드리지 않는다: 워치독이 살린 직후에만 호출한다.
hide_app() {
  local ok=0
  for _ in 1 2 3 4 5 6; do
    osascript -e 'tell application "System Events" to set visible of process "KakaoTalk" to false' >/dev/null 2>&1
    sleep 10
    vis=$(osascript -e 'tell application "System Events" to get visible of process "KakaoTalk"' 2>/dev/null)
    if [ "$vis" = "false" ]; then ok=1; break; fi
  done
  [ "$ok" = "1" ] && log "조치: 앱 숨김 처리(창 감춤 유지)" \
                  || log "조치: 앱 숨김 실패 — 앱이 창을 다시 띄움(수집에는 영향 없음)"
}

# ── 0층: 프로세스 감시 ── 앱이 없으면 새 메시지가 DB에 쌓이지 않으므로 최우선으로 되살린다.
# 가드는 '기동 실패'에만 걸어야 한다. 성공한 기동까지 기억하면 사용자가 앱을 닫았을 때
# 정당한 재기동을 막아 버린다(2026-09-09 실측 — 앱이 닫힌 채 방치됨).
FAIL_STATE="$LOG_DIR/watchdog_launch_fail"
if ! pgrep -x KakaoTalk >/dev/null 2>&1; then
  last_fail=$(cat "$FAIL_STATE" 2>/dev/null || echo 0)
  now_epoch=$(date +%s)
  if [ $((now_epoch - last_fail)) -le 600 ]; then
    log "대기: 앱 기동이 직전에 실패 — 10분 가드 중"
    exit 0
  fi
  # -g: 포그라운드로 가져오지 않음, -j: 숨긴 채 기동 → 사용자 화면을 방해하지 않는다
  if open -g -j -a KakaoTalk 2>/dev/null; then
    # 기동 명령이 성공해도 실제로 떴는지 확인한다(로그인 실패·크래시 대비)
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      pgrep -x KakaoTalk >/dev/null 2>&1 && break
      sleep 2
    done
    if pgrep -x KakaoTalk >/dev/null 2>&1; then
      rm -f "$FAIL_STATE"
      log "복구: 앱이 종료돼 있어 숨김 모드로 재기동"
      sleep 8
      hide_app
      sleep 12   # 로그인·동기화가 붙을 시간
    else
      echo "$now_epoch" > "$FAIL_STATE"
      log "복구 실패: 기동 명령은 성공했으나 프로세스가 뜨지 않음"
      exit 0
    fi
  else
    echo "$now_epoch" > "$FAIL_STATE"
    log "복구 실패: 앱 기동 불가(설치 경로 확인 필요)"
    exit 0
  fi
fi

# ── 1층: 로그인 감시 ── 떠 있어도 로그아웃이면 재기동으로 못 고친다(사용자 개입 필요).
app_state=$(kakaocli status 2>/dev/null | awk -F': *' '/App state:/{print $2}' | tr -d ' ')
# launching·connecting 같은 과도기 상태를 로그아웃으로 오인하면 헛알림이 뜬다(2026-09-09 실측).
# 한 번 더 여유를 준 뒤에도 명시적 로그아웃일 때만 사용자를 부른다.
case "$app_state" in
  loggedOut|notLoggedIn|needsLogin|loggedOut*)
    sleep 15
    app_state=$(kakaocli status 2>/dev/null | awk -F': *' '/App state:/{print $2}' | tr -d ' ') ;;
  *) app_state="loggedIn" ;;
esac
case "$app_state" in
  loggedOut|notLoggedIn|needsLogin)
    log "경고: 앱 상태 '$app_state' — 로그인 필요(자동 복구 불가)"
    if [ "$NIGHT" = "0" ]; then
      osascript -e 'display notification "카카오톡이 로그아웃 상태입니다. 로그인해 주셔야 수집이 재개됩니다." with title "PAX 카카오 워치독" sound name "Basso"' 2>/dev/null || true
    fi
    exit 0 ;;
esac

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
  if open -g -j -a KakaoTalk 2>/dev/null; then
    log "조치: 앱 숨김 기동 완료"; sleep 8; hide_app
  else
    log "조치 실패: 앱 기동 불가"
  fi
  echo "$now_epoch" > "$STATE"
else
  if [ "$NIGHT" = "1" ]; then log "경고: 정체 지속 — 심야라 알림 보류(주간 재확인)"; exit 0; fi
  log "경고: 재실행 후에도 정체 지속 → 사용자 알림"
  osascript -e 'display notification "카카오톡 수신이 '"$age_min"'분째 멈춰 있습니다. 로그인 상태와 방 열람을 확인해 주세요. (PAX 수집 영향)" with title "PAX 카카오 워치독" sound name "Basso"' 2>/dev/null || true
fi
