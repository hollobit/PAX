# PAX 일일 수집 절차 (크론 세션용)

작업 디렉토리: /Users/jonghongjeon/git/PAX
오늘 날짜를 `TODAY`(YYYY-MM-DD)로 둔다. 모든 단계는 실패해도 다음 단계로 진행하고,
마지막에 log.md에 결과를 기록한다.

## 0. 준비
- **크론 만료 점검 (매 실행 필수)**: `data/state.json`의 `cron.registered_at`을 확인한다.
  세션 크론은 등록 후 7일에 만료되므로, **오늘이 registered_at+5일 이상이면**(만료 2일 전)
  CronList로 기존 작업을 확인 → CronDelete로 삭제 → 같은 프롬프트로 07:00/15:00/23:00 세 건을
  CronCreate 재등록하고, state.json의 registered_at·ids를 갱신한 뒤 log에 기록한다.
  CronList가 비어 있으면(만료 이미 발생) 즉시 재등록한다.
- `config/rooms.json`을 읽어 수집 대상을 확인한다.
- `data/state.json`을 읽는다. 없으면 `{"threads": {"seen_ids": []}, "kakao": {"last_read": null}}`로 시작한다.
  - threads.seen_ids: 이미 처리한 게시물 URL 목록 (최대 500개 유지)
  - kakao.last_read: 마지막으로 읽은 메시지의 "날짜 시각" 문자열

## 1. Threads 수집 (claude-in-chrome 스킬)
- claude-in-chrome 스킬을 로드하고 새 탭에서
  https://www.threads.com/search?q=%EA%B3%B5%EA%B3%B5AX&serp_type=tags 를 연다.
  이 URL은 config/rooms.json의 threads[].query("공공AX")에 대한 검색 URL이다 —
  쿼리를 바꾸면 이 URL도 함께 갱신한다.
- 로그인 화면이 나오면 이 소스는 건너뛰고 log에 "threads: 로그인 필요"를 기록한다.
- 페이지를 2~3회 스크롤하며 게시물별로 (원문 텍스트, 게시물 링크, 작성일)을 읽는다.
  **실측 요령**: 검색 페이지는 DOM 가상화 때문에 스크롤 누적 수집이 불안정하다(45초 JS 타임아웃) —
  로드 직후 첫 배치(~20건)를 즉시 추출한다. permalink는 `a[href*="/post/"]` + `data-pressable-container`
  상위 탐색. 확장 출력에 긴 따옴표·콤마 배열과 본문을 섞으면 `[BLOCKED: Cookie/query string data]`로
  차단된다 → ① 게시물 ID만 공백 구분으로 반환 ② 본문은 ID별로 나눠 개행을 `§`로 치환해 반환.
  Chrome 확장 미연결이면 건너뛰고 log에 기록한다.
  첫 배치에서 ID는 잡혔는데 본문 추출 전에 피드가 재렌더돼 사라졌으면(재로드해도 비결정적),
  `https://www.threads.com/post/<ID>`로 직접 접근한다 — 정식 @작성자 주소로 리디렉션된다(2026-09-01 실측).
  **심야 축소(2026-09-01~03 3회 관측)**: 23시 전후 회차에서 검색 피드가 기확인 게시물 1건만 렌더되는
  현상이 반복된다 — 재로드해도 동일하므로 재시도하지 말고 '부분 관측'으로 기록한다. 낮 회차(07·15시)는
  정상 20건이라 관측 공백은 다음 아침 회차가 자연히 메운다.
- state의 seen_ids에 있는 링크는 무시한다. 새 게시물만 raw 목록에 담는다.
- 사례로 선별할 게시물은 게시물 페이지를 열어 **본문 속 외부 링크**를 확인한다:
  `a[href^="https://l.threads.com/"]`의 `u` 파라미터를 디코딩하면 원본 URL이 나온다.
  이 URL(서비스/저장소 등)을 case_url 후보로 기록한다.

## 2. 카카오톡 수집 (kakaocli)
- `kakaocli`로 로컬 DB를 직접 읽는다 (2026-08-07 검증된 경로):
  ```bash
  kakaocli messages --chat-id <state.json의 kakao.chat_id> --since 1d --limit 2000 --json
  ```
  chat_id가 state.json에 없으면 `kakaocli search "공공AX" --json`으로 히트가 가장 많은
  chat_id를 찾는다 (방 이름은 DB에서 "(unknown)"으로 나오므로 이름 매칭은 불가).
- `kakaocli` 미설치/실패 시(빌드에 전체 Xcode 필요) kakaotalk-mac 스킬로 폴백하고,
  둘 다 안 되면 이 소스는 건너뛰고 log에 기록한다.
- last_read 이후의 메시지만 사용한다 (첫 실행이면 최근 3일 분량만).
- **수신 범위 점검**: 반환된 메시지의 최소 timestamp가 last_read보다 뒤면 창이 잘린 것 —
  --since 2d --limit 5000으로 확장 재수집해 공백을 보정한다(2026-08-24 실제 발생).
- **동기화 중단 판별**: kakaocli는 Mac 카카오톡 앱의 로컬 DB를 읽으므로 앱이 꺼져 있으면 새 메시지가 없다.
  DB 최신 timestamp가 last_read와 같으면 "0건"이 아니라 "동기화 중단(앱 실행 필요)"으로 log에 기록한다.
- 봇 메시지(예: "Cronjob Response" 시작)와 120자 미만 잡담은 후보에서 제외해도 된다.
- 메시지의 (텍스트, timestamp)를 raw 목록에 담는다. sender_id·닉네임은 raw에만 저장한다.

## 3. 원본 저장
- 수집한 raw 목록을 data/raw/TODAY.json에 저장한다 (커밋 금지 경로).
- **카카오 원본은 반드시 kakaocli 출력 리스트 그대로** `data/raw/TODAY-kakao.json`(오전) /
  `TODAY-kakao-pm.json`(오후·야간)에 저장한다 — `build_community_stats.py`가 `data/raw/*kakao*.json`
  중 리스트 형식 파일만 읽어 일별 대화량·가입자 추이를 집계하므로, 이름에 kakao가 없거나 dict로
  감싸면 그 회차 대화량이 통째로 빠진다(2026-08-30 실제 발생).
- 수집 0건이면 4~6단계를 건너뛰고 7단계로 간다.

## 4. 사례 선별·구조화 (AI 판단)
raw 항목마다 판단한다 — **실제 공공AX 사례인가?** 아래 두 카테고리 중 하나에
해당하면 포함한다.
- (a) 특정 공공기관(중앙부처/지자체/공공기관/교육기관)이 AI를 도입·시범운영·계획한
  구체적 내용이 있는 글 → org에 기관명을 적는다.
- (b) 공직 실무자·커뮤니티가 공공업무를 위해 직접 개발·활용한 AI 도구/자동화
  사례 → 명시된 기관이 없으면 org에 "공직 커뮤니티" 또는 "공직 현장(개인 개발)"을
  적고 org_type은 "공직 개인"(실무자 개인) 또는 "커뮤니티"로 한다.
- (c) 개발물·서비스의 **링크가 공유된** 개발 사례(웹서비스, GitHub 저장소, 배포된
  도구 등) → 짧은 소개 글이어도 포함하고, 공유된 공개 URL을 link에 담는다.
  앞뒤 메시지 문맥으로 어떤 개발물인지 확인해 title/summary를 작성한다.
- 제외: 일반 뉴스 링크만 있는 글, 세미나/강의 홍보, 잡담, 의견/질문, 민간기업 사례,
  단순 타사 도구 추천(본인 개발·활용 사례가 아닌 것),
  **사례 URL(서비스·저장소·기사 등 실체 링크)이 없는 단순 소식**(인사·발령·모임 후기·동정)
- **신규 MCP 사례**(제목·태그에 MCP): 등재 후
  `PYTHONPATH=scripts python3 scripts/check_mcp.py --case <id>` 실행 +
  scripts/mcp_audit_prompt.md 절차로 LLM 감사(축 4·5)를 수행한다.
사례로 판단한 항목을 아래 형식의 dict로 만들어 data/incoming/TODAY.json에
JSON 리스트로 저장한다:
- raw_text: 원문 전체 (해시용 — 병합 시 자동 제거됨)
- date: 게시일 YYYY-MM-DD (불명확하면 수집일)
- collected_at: TODAY
- source: "threads" 또는 "kakao"
- link: threads면 게시물 URL. kakao면 기본 null이되, 메시지에서 공유된 공개
  서비스/저장소 URL(https)이 있으면 그 URL (채팅 원문 링크는 절대 아님)
- org / org_type: 기관명과 유형. org_type은 10분류 중 하나 —
  중앙행정기관|광역지자체|기초지자체|지방의회|공공기관|교육기관|공직 개인|커뮤니티|민간(참고)|해외(참고).
  실무자 개인 개발은 "공직 개인", 시민·개발자 커뮤니티 산출물은 "커뮤니티".
- case_class (선택): 기관 공식|개인 개발|커뮤니티|참고 — org_type과 일관되게.
- region (선택): 광역시도 축약(서울|부산|…|제주). 본문에서 확인될 때만 넣고 모르면 생략.
- task_category: 업무 분류 10종 중 하나 — 인사·복무|회계·정산|계약·조달|민원|문서·기안|감사·법무|시설·안전|데이터·통계|기획·정책|공통·범용.
- runtime_env (선택): 브라우저만|설치 필요|MCP·CLI 설정|AI 도구 설정|서버 구축 — 확실할 때만.
- network_req (선택): 폐쇄망 가능|로컬 완결|인터넷 필수 — 게시물에 명시된 경우만.
- title: 한 줄 제목 (직접 작성)
- summary: 2~3문장, 300자 이내 요약 (닉네임·인용부호·연락처 금지, 재작성)
- tags: 분야·기술 태그 2~4개 (예: 민원, 문서자동화, LLM, RAG, 챗봇, 데이터분석)
- mirror_url (선택): link·case_url이 모두 찬 사례의 세 번째 주소 슬롯 —
  주로 GitHub↔공공 깃랩 미러 병기에 쓴다.
- case_url (선택): 게시물/메시지에서 확인한 사례 대상 URL(https).
  같은 도구가 깃허브와 정부 공공 깃랩(gitlab.aigov.go.kr) 양쪽에 있으면
  한쪽을 link, 다른 쪽을 case_url에 담아 두 주소를 모두 제공한다(미러 저장소 병기 규칙). 있으면 사이트가
  설명문 대신 이 URL의 썸네일을 보여주고 클릭 시 연결한다.
- popularity (선택): 커뮤니티 반응 지표(예: Threads 좋아요 수, 양의 정수).
  100 이상 확인된 경우에만 넣는다 — 사이트가 인기 배지와 인기순 상단 배치에 사용.

## 5. 병합·배포 데이터 갱신
```bash
PYTHONPATH=scripts python3 -m pax.merge data/incoming/TODAY.json
python3 scripts/tag_licenses.py   # 신규 사례의 저장소 라이선스 확인·태깅 (기존 태깅은 건너뜀)
PYTHONPATH=scripts python3 -m pax.publish
python3 scripts/build_champions.py
python3 scripts/build_index.py            # 공공 AX 지수 갱신 (분기 말에는 --snapshot 추가)
python3 scripts/build_case_pages.py       # 사례별 정적 상세 페이지 재생성
python3 scripts/build_community_stats.py  # 커뮤니티 활력 지표(대화량·가입자·Threads 관측) 갱신
PYTHONPATH=scripts python3 scripts/build_mcp_review.py  # MCP 검증 공개본 (원장 변경 시)
```
- merge가 거부 건을 출력하면 data/rejected/TODAY.json을 열어 원인(주로 익명화)을
  수정한 새 incoming 파일로 1회 재시도한다.
- 썸네일 생성: `bash scripts/make_thumbs.sh` (case_url/kakao link 대상, 기존 것은
  건너뜀). 실패한 URL은 무시해도 된다 — 사이트가 설명문으로 폴백한다.
- 변경 기록: 신규 사례가 1건 이상 병합됐으면 site/data/changelog.json의 entries
  맨 앞에 오늘 날짜 항목을 추가한다(같은 날짜가 이미 있으면 그 items에 덧붙임).
  형식: "OO 사례 N건 추가 — 대표 사례 2~3개 제목 (총 M건)". 닉네임 금지.

### 주간 점검 (월요일 오전 실행분에서만)
- `python3 scripts/check_health.py` — 전체 사례 링크 생존·유지보수 상태 재점검 (약 3분).
  끊긴 링크가 새로 나오면 log에 기록한다.
- 카카오 대화량 백필: `kakaocli messages --chat-id <id> --since 8d --limit 20000 --json`으로
  지난주 전체를 재조회해 data/raw/TODAY-kakao-backfill.json으로 저장 —
  수집 창(1d·개수 제한)에 잘린 메시지를 원장에 보정한다(build_community_stats가 자동 반영).
- MCP CVE 재검: `PYTHONPATH=scripts python3 scripts/check_mcp.py --audit-only` 후
  build_mcp_review·build_case_pages 재실행 — 주의 항목 변화는 log에 기록.
- 공공 깃랩 스타 조사: `https://gitlab.aigov.go.kr/api/v4/projects?order_by=star_count&sort=desc&per_page=100`
  을 curl로 조회해 스타 3+ 중 미등재(전체 사례의 link/case_url/mirror_url과 대조)를 찾는다.
  기등재 사례의 미러면 mirror_url로 병기하고, **순수 신규는 자동 등재한다**(사용자 지시 2026-08-31 —
  이전의 '후보 보고 후 대기' 규칙 폐지): `.claude/skills/pax-register/SKILL.md` §1 절차대로 README 실체 확인 →
  분류 → incoming·merge → 평가 항목 → 썸네일 → changelog까지 같은 회차에 수행하고, 등재 내역을 log에 남긴다.
  포함 기준(§4)에 미달하는 저장소(실체 없는 테스트·포크 등)만 제외 사유와 함께 log에 기록한다.

## 6. 커밋·푸시
```bash
git add data/cases.json data/community_stats.json site/data site/thumbs site/case
git commit -m "chore: 사례 데이터 갱신 (TODAY)"
git push
```
- 변경이 없으면 커밋하지 않는다. 변경이 있으면 **푸시까지 반드시 완료**한다 — 사용자 지시(2026-08-30):
  회차를 미커밋·미푸시 상태로 끝내지 않는다. 절차서·스크립트를 고쳤으면 같은 회차에 함께 커밋한다.
  `main`도 동기화한다: `git push origin feat/pax-archive:main` (두 브랜치 동일 유지 관행).

## 7. 상태·로그 기록
- data/state.json 갱신: threads.seen_ids에 새로 처리한 링크 추가(500개 초과분은
  오래된 것부터 제거), kakao.last_read를 마지막 메시지 시각으로.
- log.md 맨 아래에 한 줄 추가:
  `- TODAY: threads 수집 N건 / kakao 수집 M건 / 신규 사례 K건 / 실패: (없음 또는 사유)`
