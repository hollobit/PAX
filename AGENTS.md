# AGENTS.md — PAX 저장소에서 작업하는 AI 에이전트 지침

이 파일은 사람과 AI 에이전트(Claude Code 크론 세션 포함)가 이 저장소에서 작업할 때
지켜야 할 규칙과 알아야 할 구조를 모아 둔 것이다. 세부 절차는 링크된 문서를 따른다.
공개 저장소이므로 이 파일에는 개인 식별 정보·채팅방 ID·키를 적지 않는다.

## 1. 프로젝트 한 줄 요약

PAX = Threads `공공AX` 태그 + 카카오톡 오픈채팅 "공공AX 네트워크"에서 공공부문 AI 전환 사례를
하루 3회 수집 → AI가 선별·재작성 → 결정적 스크립트가 검증·병합 → GitHub Pages로 공개하는 아카이브.
사이트: https://hollobit.github.io/PAX/ (2026-08-30 기준 사례 240건, 챔피언 109명).

## 2. 저장소 지도

| 경로 | 역할 | 공개 |
|---|---|---|
| `data/cases.json` | 사례 원장(append-only, `{updated_at, cases[]}`) | 공개 |
| `data/community_stats.json` | 커뮤니티 활력 지표 원장 | 공개 |
| `data/raw/`, `data/incoming/`, `data/rejected/`, `data/state.json`, `log.md`, `data/private/`, `data/champion_profiles.json`, `.claude/` | 수집 원문·중간 산출·세션 상태·운영 로그 | **비공개(.gitignore)** |
| `scripts/collect_prompt.md` | **일일 수집 절차서(크론 세션이 그대로 따름)** | |
| `scripts/mcp_audit_prompt.md` | MCP 사례 LLM 감사 절차(축 4·5) | |
| `config/rooms.json` | 수집 대상(Threads 태그·카카오 방 이름) | |
| `site/` | 정적 사이트(index·dashboard·observatory·gap-map·playbook·champions·mcp-review·guidelines·changelog·case/) | 공개 |
| `HISTORY.md` | 공개 연혁 — 주요 기능·운영 변경 시 갱신 | 공개 |
| `.claude/skills/pax-register/` | **사례 단건 등재·보강 스킬**(중복 검사 `preflight.py`·평가 항목·MCP 검증·썸네일·커밋 체크리스트) — 사용자가 URL을 주며 등재를 청하면 이 스킬을 쓴다 | 비공개(로컬) |

## 3. 절대 규칙

1. **비공개 경로를 절대 커밋하지 않는다.** 위 표의 비공개 항목은 .gitignore에 있다.
   초기에 `.claude/`가 커밋됐다가 히스토리를 통째로 지운 전력이 있다.
2. **원문을 공개하지 않는다.** 요약은 AI가 재작성한 문장만, 닉네임·인용부호·연락처 금지.
   `merge`의 익명화 화이트리스트 게이트가 최종 관문이며 우회·완화하지 않는다.
   거부(`data/rejected/`)가 나오면 incoming을 고쳐 1회 재시도한다.
3. **신규 사례는 반드시 `data/incoming/*.json` → `pax.merge` 경로로 들어간다.**
   `data/cases.json`을 손으로 늘리지 않는다. 기존 사례의 필드 보강(case_url·태그·모델 정보 등)은
   원장 편집 후 `pax.publish`로 site 사본을 갱신한다.
4. **재등재 금지 목록(사용자 지시)**: ① 국가인공지능전략위원회 공공AX분과 사례 ② 사례 URL(서비스·저장소·기사 등
   실체 링크)이 없는 단순 소식(인사·발령·모임 후기·동정). 수집 시 다시 넣지 않는다.
5. **정기 수집은 확인 질문 없이 끝까지 진행한다** — 수집·선별·병합·썸네일·변경기록·커밋·푸시·배포 확인까지.
   단, MCP 검증의 responsible-disclosure 공개(취약점 상세)는 사용자 승인 게이트를 거친다.
6. **크론은 세션 전용이다.** CronCreate 작업은 세션이 끝나면 사라지고 7일 후 만료된다.
   새 세션에서는 `data/state.json`의 `cron.registered_at`보다 **`CronList` 실측**을 먼저 보고,
   비어 있으면 07:00/15:00/23:00 세 건을 즉시 재등록하고 state·log에 기록한다.
7. **커밋 규칙**: `<type>: <한국어 설명>` (feat/fix/docs/chore/perf/ci/test). 사례 추가 커밋은 끝에 `(총 N건)`.
   정기 수집 커밋은 `data/cases.json data/community_stats.json site/data site/thumbs site/case`만 담고 변경 없으면 커밋하지 않는다.
   푸시 대상은 `main`(Pages 워크플로가 `site/**` 변경 시 배포).
8. **챔피언 데이터**: 공개 프로필 기반. 참고 분류(민간·해외) 계정은 챔피언 추출에서 제외한다.
   프로필 원장(`data/champion_profiles.json`)은 비공개다.

## 4. 파이프라인 명령

순서·명령·주간 점검·MCP 검증은 `scripts/collect_prompt.md` §4~§5가 정본이다(크론 세션이 그대로 따르며,
이 파일과 중복 유지하지 않는다). 테스트: `PYTHONPATH=scripts python3 -m pytest tests/`.

## 5. 사례 스키마

`scripts/pax/schema.py`가 정본(필수·선택 필드, 10분류 어휘). 코드로 알 수 없는 것 하나: `model_dependency`는
관측소 모델 채택률의 분모라서, LLM을 직접 호출하지 않는 도구는 반드시 `없음(비LLM)` 또는 `모델 중립(BYO)`으로 둔다.

## 6. 수집 요령

Threads·카카오톡 실측 요령(DOM 가상화, 확장 출력 차단 우회, 동기화 중단 판별, 원본 저장 형식)은
`scripts/collect_prompt.md` §1~§3에 있다 — 수집 작업을 할 때만 읽으면 된다.

## 7. 기록 규칙 (무엇을 어디에)

| 기록 | 위치 | 언제 |
|---|---|---|
| 수집 결과 한 줄 | `log.md` (비공개) | 매 수집·운영 변경 |
| 사이트 변경 기록 | `site/data/changelog.json` | 신규 사례 병합 시 |
| 공개 연혁 | `HISTORY.md` | 기능 추가·운영 방식 변경·보고서 발행 |
| 에이전트 규칙 변경 | 이 파일 + `scripts/collect_prompt.md` | 절차·기준이 바뀔 때 |
| 세션 간 기억 | Claude 메모리(`~/.claude/projects/.../memory/`) | 저장소에 없는 운영 맥락 |
