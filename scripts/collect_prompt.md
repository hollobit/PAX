# PAX 일일 수집 절차 (크론 세션용)

작업 디렉토리: 이 저장소의 루트(모든 명령은 루트에서 실행한다).
오늘 날짜를 `TODAY`(YYYY-MM-DD, 한국 시간)로 둔다. 수집 단계(§1~§4)는 한 소스가 실패해도 다음 소스로
진행하고 마지막에 log.md에 결과를 기록한다. 단, §5의 `pax.run post-collect`는 실패하면 멈추며,
그때는 커밋하지 않는다(§6) — 산출물이 반만 새것이라 공개하면 수치가 서로 어긋난다.

## 0. 준비
- **크론 점검 (매 실행 필수)**: 먼저 CronList로 실제 등록 상태를 본다 — 세션 크론은 세션이 끝나면
  사라지므로 `data/state.json`의 `cron.registered_at`만으로는 판단할 수 없다.
  비어 있으면 07:00/15:00/23:00 세 건을 같은 프롬프트로 즉시 CronCreate 재등록한다.
  남아 있으면 registered_at+5일 이상일 때(7일 만료 2일 전) CronDelete 후 같은 세 건을 재등록한다.
  재등록했으면 state.json의 registered_at·ids를 갱신하고 log에 기록한다.
- `config/rooms.json`을 읽어 수집 대상을 확인한다.
- `data/state.json`을 읽는다. 없으면 `{"threads": {"seen_ids": []}, "kakao": {"last_read": null}}`로 시작한다.
  - threads.seen_ids: 이미 처리한 게시물 URL 목록 (최대 500개 유지)
  - kakao.last_read: 마지막으로 읽은 메시지의 "날짜 시각" 문자열

## 1. Threads 수집 (claude-in-chrome 스킬)
- claude-in-chrome 스킬을 로드하고 새 탭에서
  https://www.threads.com/search?q=%23%EA%B3%B5%EA%B3%B5AX 를 연다(해시태그 검색).
  이 주소는 config/rooms.json의 `threads[].search_url`이 정본이다 — 바뀌면 양쪽을 함께 고친다.
- 로그인 화면이 나오면 이 소스는 건너뛰고 log에 "threads: 로그인 필요"를 기록한다.
- 페이지를 2~3회 스크롤하며 게시물별로 (원문 텍스트, 게시물 링크, 작성일)을 읽는다.
  **실측 요령**: 검색 페이지는 DOM 가상화 때문에 스크롤 누적 수집이 불안정하다(45초 JS 타임아웃) —
  로드 직후 첫 배치(~20건)를 즉시 추출한다. permalink는 `a[href*="/post/"]` + `data-pressable-container`
  상위 탐색. 확장 출력에 긴 따옴표·콤마 배열과 본문을 섞으면 `[BLOCKED: Cookie/query string data]`로
  차단된다 → ① 게시물 ID만 공백 구분으로 반환 ② 본문은 ID별로 나눠 개행을 `§`로 치환해 반환.
  Chrome 확장 미연결이면 건너뛰고 log에 기록한다.
  첫 배치에서 ID는 잡혔는데 본문 추출 전에 피드가 재렌더돼 사라졌으면(재로드해도 비결정적),
  `https://www.threads.com/post/<ID>`로 직접 접근한다 — 정식 @작성자 주소로 리디렉션된다.
  **해시태그 검색은 연관 검색이다**: 20건 남짓이 나오지만 민간 AX 경험담·코인 글이 섞이므로
  **게시물마다 본문에 공공AX가 있는지 보고 거른다**.
  **`https://www.threads.com/tag/공공AX`는 쓰지 않는다** — 20건이 나와 정상처럼 보이지만 공공AX가
  한 번도 안 나오는 무관한 추천 피드라, 건수만 보고 수집하면 아카이브가 오염된다.
  피드가 1~2건만 렌더되는 회차가 있다(서버측 상태 — 스크롤·재로드로 안 풀린다). 재로드 1회가 무효면
  '부분 관측'으로 log에 적고 넘어간다: 다음 정상 회차와 카카오 공유 경로가 공백을 메우고 seen_ids가
  중복을 막는다. 이틀 이상 전 회차가 축소되면 스크린샷으로 검색 화면 변경을 진단한다.
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
  --since 2d --limit 5000으로 확장 재수집해 공백을 보정한다.
- **동기화 전제**: kakaocli는 앱이 관리하는 로컬 DB를 읽기만 한다. 읽기는 앱 없이 되지만 새 메시지를
  DB에 채우는 것은 앱이므로, 앱이 꺼져 있으면 새 메시지가 없다.
  DB 최신 timestamp가 last_read와 같으면 "0건"이 아니라 "동기화 중단(앱 실행 필요)"으로 log에 기록하고
  `data/private/watchdog.log`의 조치 이력을 함께 남긴다. 앱 재기동·정체 감시는 워치독
  (`scripts/kakao_watchdog.sh`, launchd 10분 주기)이 맡는다 — 손으로 조치할 때는 그 스크립트 머리 주석의
  전제를 따른다(숨김 기동 `open -j` 금지, 기동 성공은 `pgrep`으로 확인).
- **상시 자동 덤프**: 워치독은 동기화가 정상인 주기마다 최근 2일 창을 `data/raw/날짜-kakao-auto.json`으로
  덤프하고, 커뮤니티 지표가 이 파일을 자동 집계한다. 정기 수집의 선별(last_read 기준)은 그대로 한다.
- 봇 메시지(예: "Cronjob Response" 시작)와 120자 미만 잡담은 후보에서 제외해도 된다.
- 메시지의 (텍스트, timestamp)를 raw 목록에 담는다. sender_id·닉네임은 raw에만 저장한다.

## 3. 원본 저장
- 수집한 raw 목록을 data/raw/TODAY.json에 저장한다 (커밋 금지 경로).
- **카카오 원본은 반드시 kakaocli 출력 리스트 그대로** `data/raw/TODAY-kakao.json`(오전) /
  `TODAY-kakao-pm.json`(오후·야간)에 저장한다 — `build_community_stats.py`가 `data/raw/*kakao*.json`
  중 리스트 형식 파일만 읽어 일별 대화량·가입자 추이를 집계하므로, 이름에 kakao가 없거나 dict로
  감싸면 그 회차 대화량이 통째로 빠진다.
- 메시지·게시물 수집이 0건이면 4단계와 병합을 건너뛴다. **§5의 `pax.run post-collect`는 그래도 실행한다** —
  raw 아카이브 전체를 다시 훑는 집계라 이전 회차 누락분이 여기서 메워진다.

## 4. 사례 선별·구조화 (AI 판단)
raw 항목마다 판단한다 — **실제 공공AX 사례인가?** 아래 세 카테고리 중 하나에
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
  한쪽을 link, 다른 쪽을 case_url에 담아 두 주소를 모두 제공한다(미러 저장소 병기 규칙).
  **표시 대상은 `scripts/pax/urls.py`의 `preferred_url()`이 고른다 — 운영 사이트가 저장소보다 먼저이므로
  슬롯 순서를 맞추려 애쓸 필요 없이 아는 주소를 빠짐없이 채우면 된다.**
- popularity (선택): 커뮤니티 반응 지표(예: Threads 좋아요 수, 양의 정수).
  100 이상 확인된 경우에만 넣는다 — 사이트가 인기 배지와 인기순 상단 배치에 사용.

## 5. 병합·배포 데이터 갱신

**신규 사례가 있으면 먼저 병합하고 평가 항목을 늘린다** — 이 두 가지는 판단이 필요해 세션이 한다:
```bash
PYTHONPATH=scripts python3 -m pax.merge data/incoming/TODAY.json
```
- merge가 거부 건을 출력하면 data/rejected/TODAY.json을 열어 원인(주로 익명화)을
  수정한 새 incoming 파일로 1회 재시도한다.
- 평가 항목(`docs/native/eval_additions.json`)을 같은 회차에 늘린다 — 빠뜨리면 대시보드에서
  새 사례가 '미평가'로 남는다(형식: `.claude/skills/pax-register/references/eval-vocab.md`).
- 신규 MCP 사례는 §4 끝의 check_mcp·LLM 감사를 병합 뒤에 한다.

**그다음 매 회차(신규 0건이어도) 후처리를 한 명령으로 돌린다:**
```bash
PYTHONPATH=scripts python3 -m pax.run post-collect   # 순서만 보려면 --dry-run
```
원장 교차 점검(추가분 기준) → 라이선스 태깅 → 평가 빌드 → 평가 대조 → MCP 공개본 → (없는 썸네일만) 썸네일 → 사이트 사본·경량판·WebP →
챔피언 → 사례 페이지 → 대화량·가입자 → 동영상 → 뉴스 → 지수 → 현황판 이력 → 메뉴 동기화 → 자산 스탬프.
순서는 `scripts/pax/run.py`의 POST_COLLECT가 정본이고 테스트가 지킨다(읽는 쪽이 만드는 쪽보다
먼저 돌면 새 사례가 한 회차 동안 '평가 데이터 없음'으로 공개된다). 한 단계가 실패하면 거기서
멈추고 종료 코드를 돌려주며 저장소 루트에 `.pax-run-failed`(실패 단계)를 남긴다 — 원인을 log에 적고,
고친 뒤 `python3 -m pax.run post-collect --from <단계>`로 이어서 돌린다. 끝까지 성공하면 표식이 지워진다. 분기 말에는
`PYTHONPATH=scripts python3 scripts/build_index.py --snapshot`을 따로 한 번 더 돌린다.
- 산출물은 시각만 바뀌면 다시 쓰지 않는다 — 사례·지표가 그대로인 회차는 커밋할 것이 없다(§6).
- 썸네일 실패한 URL은 무시해도 된다 — 사이트가 설명문으로 폴백한다.
- 변경 기록: 신규 사례가 1건 이상 병합됐으면 site/data/changelog.json의 entries
  맨 앞에 오늘 날짜 항목을 추가한다(같은 날짜가 이미 있으면 그 items에 덧붙임).
  형식: "OO 사례 N건 추가 — 대표 사례 2~3개 제목 (총 M건)". 닉네임 금지.
  기능 변경도 같은 자리에 적는다(사용자 지시 2026-09-11).

### 주간 점검 (월요일 오전 실행분에서만 — **`pax.run post-collect`보다 먼저** 한다)
헬스 점검·MCP 재검은 원장을 고친다. 후처리 전에 해야 같은 회차에 사이트까지 반영된다.
- `python3 scripts/check_health.py` — 전체 사례 링크 생존·유지보수 상태 재점검 (약 3분).
  끊긴 링크가 새로 나오면 log에 기록한다.
- 카카오 대화량 백필: `kakaocli messages --chat-id <id> --since 8d --limit 20000 --json`으로
  지난주 전체를 재조회해 data/raw/TODAY-kakao-backfill.json으로 저장 —
  수집 창(1d·개수 제한)에 잘린 메시지를 원장에 보정한다(build_community_stats가 자동 반영).
- MCP CVE 재검: `PYTHONPATH=scripts python3 scripts/check_mcp.py --audit-only` — 공개본·사례 배지는
  이어지는 `pax.run post-collect`가 다시 만든다. 주의 항목 변화는 log에 기록.
- 공공 깃랩 스타 조사: `https://gitlab.aigov.go.kr/api/v4/projects?order_by=star_count&sort=desc&per_page=100`
  을 curl로 조회하되 **스타순 상위 200개(2페이지)**를 훑어(2026-09-06 사용자 지시로 확대) ★1 이상 중 실체 있는 미등재(전체 사례의 link/case_url/mirror_url과 대조)를 찾는다.
  기등재 사례의 미러면 mirror_url로 병기하고, **순수 신규는 자동 등재한다**(사용자 지시 2026-08-31):
  `.claude/skills/pax-register/SKILL.md` §1 절차대로 README 실체 확인 →
  분류 → incoming·merge → 평가 항목 → 썸네일 → changelog까지 같은 회차에 수행하고, 등재 내역을 log에 남긴다.
  포함 기준(§4)에 미달하는 저장소(실체 없는 테스트·포크 등)만 제외 사유와 함께 log에 기록한다.

## 6. 커밋·푸시
```bash
git add data/cases.json data/community_stats.json data/mcp_reviews.json docs/native/eval_additions.json \
        site/data site/thumbs site/case
git commit -m "feat: 사례 N건 추가 — 대표 제목 (총 M건)"   # 신규 0건이면 "chore: 지표 갱신 (TODAY 오전|오후|야간) — 주요 수치"
git push
```
- **저장소 루트에 `.pax-run-failed`가 있으면 커밋하지 않는다** — 후처리가 중간에 멈춘 상태다(§5).
- 변경이 없으면 커밋하지 않는다. 변경이 있으면 **푸시까지 반드시 완료**한다 — 사용자 지시(2026-08-30):
  회차를 미커밋·미푸시 상태로 끝내지 않는다. 절차서·스크립트를 고쳤으면 같은 회차에 함께 커밋한다.
  `main`도 동기화한다: `git push origin feat/pax-archive:main` (두 브랜치 동일 유지 관행).

## 7. 상태·로그 기록
- data/state.json 갱신: threads.seen_ids에 새로 처리한 링크 추가(500개 초과분은
  오래된 것부터 제거), kakao.last_read를 마지막 메시지 시각으로.
- log.md 맨 아래에 한 줄 추가:
  `- TODAY: threads 수집 N건 / kakao 수집 M건 / 신규 사례 K건 / 실패: (없음 또는 사유)`
