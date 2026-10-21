#!/bin/bash
# 카카오 오픈톡 일일 현황 알림 전송 (macOS 전용, Claude 세션 크론이 매일 06:00에 돌린다)
#
# 사용자 지시(2026-10-21): 전날까지의 현황을 요약해 매일 오전 6시, 하루 한 번 "공공AX 네트워크" 방에 보낸다.
# - 본문: scripts/kakao_digest.py (전날 현황판 행 + 전날 변경 기록).
# - launchd로는 돌리지 않는다: launchd 아래 프로세스에는 손쉬운 사용 권한이 없어 UI 자동화가
#   실패한다(2026-10-21 실측). 권한이 있는
#   터미널/Claude 세션에서 돌려야 한다 — 그래서 수집 크론과 같은 세션 크론으로 묶는다.
# - kakaocli 호출은 이 bash에서 직접 한다(python을 거치면 앱 데이터 접근이 막히는 환경이 있다).
# - 전송은 scripts/kakao_send.applescript(System Events) — kakaocli send는 목록이 큰 계정에서 방 창을
#   못 열고 자주 실패해 쓰지 않는다. 보낸 뒤 로컬 DB에서 '내가 보낸, 첫 줄이 같은 메시지'를 찾아
#   도착을 확인하고, 없을 때만 다시 보낸다(최대 3회) — 중복 방지 장치.
# - 하루 한 번: data/private/kakao_digest_state의 날짜 + 보내기 전 DB 도착 확인, 두 겹.
# - 늦게 돌면(맥 잠자기 등) CUTOFF_HOUR 이후엔 그날은 건너뛴다 — 늦은 '아침 알림'은 소음이다.
# 사용법: bash scripts/kakao_digest.sh [--me] [--force]
#   --me     나와의 채팅으로 보낸다(시험용 — 하루 한 번 기록을 남기지 않는다)
#   --force  오늘 이미 보냈거나 마감 시각이 지나도 보낸다
#   --day=YYYY-MM-DD  그날 기준 본문으로(시험용, 기본은 한국 시간 어제)
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"   # launchd 최소 PATH 대비
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
LOG_DIR="$ROOT/data/private"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/kakao_digest.log"
STATE="$LOG_DIR/kakao_digest_state"   # 마지막으로 보낸 한국 날짜(YYYY-MM-DD)
CUTOFF_HOUR=12
MAX_ATTEMPTS=3
SEND_TIMEOUT_S=120                    # 한 번에 15초 안팎
VERIFY_WAIT_S=20

TO_ME=0; FORCE=0; DAY_ARGS=()
for a in "$@"; do
  case "$a" in
    --me) TO_ME=1 ;; --force) FORCE=1 ;; --day=*) DAY_ARGS=(--day "${a#--day=}") ;;
    *) echo "알 수 없는 인자: $a" >&2; exit 2 ;;
  esac
done

log() { echo "$(date '+%F %T') $1" >> "$LOG"; }

LOCK="$LOG_DIR/kakao_digest.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then
    rmdir "$LOCK" 2>/dev/null && mkdir "$LOCK" 2>/dev/null || exit 0
  else
    exit 0
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

TODAY=$(TZ=Asia/Seoul date '+%F')
HOUR=$(TZ=Asia/Seoul date '+%H')
if [ "$TO_ME" = 0 ] && [ "$FORCE" = 0 ]; then
  [ "$(cat "$STATE" 2>/dev/null)" = "$TODAY" ] && exit 0
  if [ "$((10#$HOUR))" -ge "$CUTOFF_HOUR" ]; then log "${CUTOFF_HOUR}시 이후 — $TODAY 알림 건너뜀"; exit 0; fi
fi

TEXT=$(python3 scripts/kakao_digest.py ${DAY_ARGS[@]+"${DAY_ARGS[@]}"} 2>>"$LOG") || { log "본문 생성 실패 — 중단"; exit 1; }
HEAD=${TEXT%%$'\n'*}
BODY="$LOG_DIR/kakao_digest_body.txt"; printf '%s\n' "$TEXT" > "$BODY"
ROOM=$(python3 -c 'import json;print(json.load(open("config/rooms.json"))["kakao_rooms"][0])' 2>/dev/null)

if [ "$TO_ME" = 1 ]; then
  CHAT_ID=$(kakaocli chats --json 2>>"$LOG" | python3 -c '
import json,sys
print(next((c["id"] for c in json.load(sys.stdin) if c.get("member_count")==1),""))' 2>/dev/null)
  TARGET="나와의 채팅"; SEND_ROOM="@me"
else
  CHAT_ID=$(python3 -c 'import json;print(json.load(open("data/state.json"))["kakao"]["chat_id"])' 2>/dev/null)
  TARGET="$ROOM"; SEND_ROOM="$ROOM"
fi
if [ -z "$ROOM" ] || [ -z "$CHAT_ID" ]; then log "방 이름 또는 chat_id 없음 — 중단"; exit 1; fi

arrived() {   # 최근 3시간 안에 내가 보낸 메시지 중 첫 줄이 HEAD인 것이 있는가
  kakaocli messages --chat-id "$CHAT_ID" --since 3h --limit 300 --json 2>/dev/null | HEAD="$HEAD" python3 -c '
import json,os,sys
head=os.environ["HEAD"]
try: msgs=json.load(sys.stdin)
except ValueError: sys.exit(1)
sys.exit(0 if any(m.get("is_from_me") and (m.get("text") or "").split("\n",1)[0]==head for m in msgs) else 1)'
}

ok=0
if arrived; then
  log "$TARGET: 이미 도착해 있음 — 보내지 않음"; ok=1
else
  for attempt in $(seq 1 $MAX_ATTEMPTS); do
    out=$(timeout "$SEND_TIMEOUT_S" osascript scripts/kakao_send.applescript "$SEND_ROOM" "$BODY" 2>&1); rc=$?
    log "시도 $attempt: rc=$rc ${out:0:120}"
    sleep "$VERIFY_WAIT_S"
    if arrived; then ok=1; break; fi
  done
fi

if [ "$ok" = 1 ]; then
  log "$TARGET: ${HEAD} 전송 확인"
  [ "$TO_ME" = 0 ] && echo "$TODAY" > "$STATE"
  exit 0
fi
log "$TARGET: 전송 실패(${MAX_ATTEMPTS}회) — 화면 잠김·카카오톡 로그아웃·손쉬운 사용 권한을 확인"
osascript -e 'display notification "오픈톡 현황 알림 전송 실패 — data/private/kakao_digest.log" with title "PAX"' 2>/dev/null
exit 1
