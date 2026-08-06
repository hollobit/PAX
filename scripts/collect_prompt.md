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
  적고 org_type은 "기타"로 한다.
- 제외: 일반 뉴스 링크만 있는 글, 세미나/강의 홍보, 잡담, 의견/질문, 민간기업 사례
사례로 판단한 항목을 아래 형식의 dict로 만들어 data/incoming/TODAY.json에
JSON 리스트로 저장한다:
- raw_text: 원문 전체 (해시용 — 병합 시 자동 제거됨)
- date: 게시일 YYYY-MM-DD (불명확하면 수집일)
- collected_at: TODAY
- source: "threads" 또는 "kakao"
- link: threads면 게시물 URL, kakao면 null
- org / org_type: 기관명과 유형 (중앙부처|지자체|공공기관|교육|기타)
- title: 한 줄 제목 (직접 작성)
- summary: 2~3문장, 300자 이내 요약 (닉네임·인용부호·연락처 금지, 재작성)
- tags: 분야·기술 태그 2~4개 (예: 민원, 문서자동화, LLM, RAG, 챗봇, 데이터분석)

## 5. 병합·배포 데이터 갱신
```bash
PYTHONPATH=scripts python3 -m pax.merge data/incoming/TODAY.json
PYTHONPATH=scripts python3 -m pax.publish
```
- merge가 거부 건을 출력하면 data/rejected/TODAY.json을 열어 원인(주로 익명화)을
  수정한 새 incoming 파일로 1회 재시도한다.

## 6. 커밋·푸시
```bash
git add data/cases.json site/data/cases.json
git commit -m "chore: 사례 데이터 갱신 (TODAY)"
git push
```
- 변경이 없으면 커밋하지 않는다.

## 7. 상태·로그 기록
- data/state.json 갱신: threads.seen_ids에 새로 처리한 링크 추가(500개 초과분은
  오래된 것부터 제거), kakao.last_read를 마지막 메시지 시각으로.
- log.md 맨 아래에 한 줄 추가:
  `- TODAY: threads 수집 N건 / kakao 수집 M건 / 신규 사례 K건 / 실패: (없음 또는 사유)`
