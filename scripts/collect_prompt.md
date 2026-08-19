# PAX 일일 수집 절차 (크론 세션용)

작업 디렉토리: /Users/jonghongjeon/git/PAX
오늘 날짜를 `TODAY`(YYYY-MM-DD)로 둔다. 모든 단계는 실패해도 다음 단계로 진행하고,
마지막에 log.md에 결과를 기록한다.

## 0. 준비
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
- state의 seen_ids에 있는 링크는 무시한다. 새 게시물만 raw 목록에 담는다.
- 사례로 선별할 게시물은 게시물 페이지를 열어 **본문 속 외부 링크**를 확인한다:
  `a[href^="https://l.threads.com/"]`의 `u` 파라미터를 디코딩하면 원본 URL이 나온다.
  이 URL(서비스/저장소 등)을 case_url 후보로 기록한다.

## 2. 카카오톡 수집 (kakaocli)
- `kakaocli`로 로컬 DB를 직접 읽는다 (2026-08-07 검증된 경로):
  ```bash
  kakaocli messages --chat-id <state.json의 kakao.chat_id> --since 1d --limit 500 --json
  ```
  chat_id가 state.json에 없으면 `kakaocli search "공공AX" --json`으로 히트가 가장 많은
  chat_id를 찾는다 (방 이름은 DB에서 "(unknown)"으로 나오므로 이름 매칭은 불가).
- `kakaocli` 미설치/실패 시(빌드에 전체 Xcode 필요) kakaotalk-mac 스킬로 폴백하고,
  둘 다 안 되면 이 소스는 건너뛰고 log에 기록한다.
- last_read 이후의 메시지만 사용한다 (첫 실행이면 최근 3일 분량만).
- 봇 메시지(예: "Cronjob Response" 시작)와 120자 미만 잡담은 후보에서 제외해도 된다.
- 메시지의 (텍스트, timestamp)를 raw 목록에 담는다. sender_id·닉네임은 raw에만 저장한다.

## 3. 원본 저장
- 수집한 raw 목록을 data/raw/TODAY.json에 저장한다 (커밋 금지 경로).
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

## 6. 커밋·푸시
```bash
git add data/cases.json site/data/cases.json site/thumbs site/data/changelog.json site/data/champions.json
git commit -m "chore: 사례 데이터 갱신 (TODAY)"
git push
```
- 변경이 없으면 커밋하지 않는다.

## 7. 상태·로그 기록
- data/state.json 갱신: threads.seen_ids에 새로 처리한 링크 추가(500개 초과분은
  오래된 것부터 제거), kakao.last_read를 마지막 메시지 시각으로.
- log.md 맨 아래에 한 줄 추가:
  `- TODAY: threads 수집 N건 / kakao 수집 M건 / 신규 사례 K건 / 실패: (없음 또는 사유)`
