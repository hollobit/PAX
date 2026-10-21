#!/bin/bash
# 오픈톡 현황 알림(06:00)이 잠긴 화면에 막히지 않도록 디스플레이 잠자기를 막는다 (macOS 전용).
#
# 사용자 지시(2026-10-22): 화면 잠금 때문에 06:00 발송이 실패하지 않게 할 것.
# - 이 맥은 디스플레이가 10분 유휴 뒤 꺼지고, 꺼지는 즉시 잠긴다. 잠긴 화면 뒤로는 UI 자동화가
#   들어가지 않는다(2026-10-22 06:00 실측: osascript 세 번 모두 120초 시간 초과).
# - caffeinate -di 로 디스플레이 잠자기를 막아 자동 잠금이 걸리지 않게 한다. 시스템 설정은 바꾸지 않는다.
# - -w 로 이 Claude 세션 프로세스에 묶는다: 세션이 끝나면(크론도 함께 사라질 때) 자동으로 풀려
#   맥이 원래대로 잠긴다. 손으로 잠그면 여전히 잠긴다 — 그때는 kakao_digest.sh가 잠금 해제를 기다린다.
# 정기 수집 크론이 매 회차(§0) 이 스크립트를 부른다. 이미 돌고 있으면 아무것도 하지 않는다.
set -u
MARK="caffeinate -di -w"

if pgrep -f "$MARK" >/dev/null; then
  echo "이미 실행 중: $(pgrep -f "$MARK" | head -1)"
  exit 0
fi

pid=$PPID
while [ "${pid:-1}" -gt 1 ]; do
  [ "$(basename "$(ps -o comm= -p "$pid" 2>/dev/null)")" = claude ] && break
  pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
done
if [ "${pid:-1}" -le 1 ]; then
  echo "Claude 세션 프로세스를 찾지 못함 — 세션 안에서 실행해야 한다" >&2
  exit 1
fi

nohup caffeinate -di -w "$pid" >/dev/null 2>&1 &
disown
echo "caffeinate 시작: 세션 pid $pid 가 끝날 때까지 디스플레이 잠자기 방지"
