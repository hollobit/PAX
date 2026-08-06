# PAX — 공공AX 사례 아카이브 설계서

- 작성일: 2026-08-06
- 상태: 사용자 승인됨 (구두 승인, 세부 검토 대기)

## 1. 목적

Threads의 공공AX 태그 게시물과 카카오톡 오픈채팅방 "공공AX 네트워크"에 올라오는 내용 중
실제 공공기관 AI 전환(AX) 사례를 **하루 1회 자동 수집·선별·요약**하여
공개 정적 사이트(GitHub Pages)에 목록으로 제공한다.

## 2. 확정된 결정 사항

| 항목 | 결정 |
|---|---|
| 수집 방식 | 브라우저/클라이언트 자동화 (Claude in Chrome + Mac 카카오톡) |
| 사이트 형태 | 정적 사이트 + GitHub Pages |
| 수집 주기 | 하루 1회 자동 (이 Mac에서 Claude Code 크론 세션) |
| 큐레이션 | AI 선별 + 구조화 요약 (잡담·홍보 제외, 실제 사례만) |
| 공개 범위 | AI 재작성 요약만 공개, 작성자 익명화. Threads는 원문 링크 제공, 오픈채팅은 출처 표기만 |
| 카카오톡 대상 방 | "공공AX 네트워크" (rooms.json으로 추가 확장 가능) |

## 3. 아키텍처

```
[매일 1회: Claude Code 크론 세션 (이 Mac)]
  ① Threads 수집   — Claude in Chrome으로 threads.com 공공AX 태그 검색 페이지를
                     열어 새 게시물(텍스트, 작성일, 원문 링크)을 읽음
  ② 카카오톡 수집  — kakaotalk-mac 스킬로 "공공AX 네트워크" 방의
                     마지막 수집 시점 이후 메시지를 읽음
  ③ AI 선별·구조화 — 수집 글에서 실제 사례만 판별하고
                     기관/분야/기술/요약으로 구조화 + 익명화 → 후보 JSON 생성
  ④ 병합 (스크립트) — scripts/merge_cases.py가 스키마 검증, 중복 제거 후
                     data/cases.json에 append-only 병합
  ⑤ 배포 (스크립트) — 사이트 데이터 갱신 → git commit/push → GitHub Pages
```

### 역할 분담 원칙

- **AI(Claude 세션)가 하는 일**: 브라우저/카카오톡 조작, 사례 여부 판단, 요약 재작성, 태그 부여
- **결정적 스크립트가 하는 일**: 스키마 검증, 중복 제거, append-only 병합, 배포
- 이유: 판단은 AI가 잘하지만, 데이터 무결성은 매일 실행해도 결과가 흔들리지 않는
  결정적 코드가 보장해야 한다.

### 오류 처리

- Chrome 미실행/로그인 만료 → Threads 수집만 건너뛰고 카카오톡은 진행 (반대도 동일)
- 소스별 성공/실패와 수집 건수를 `log.md`에 기록
- `data/cases.json`은 append-only: 병합 스크립트는 기존 항목을 절대 수정/삭제하지 않음
- 병합 전 스키마 검증 실패 항목은 격리 파일(`data/rejected/`)로 보관하고 사이트에 미반영

## 4. 데이터 모델

### `data/cases.json` — 공개 사례 목록 (사이트가 직접 로드)

```json
{
  "updated_at": "2026-08-06T09:00:00+09:00",
  "cases": [
    {
      "id": "sha256 앞 16자리 (source + 원문 정규화 텍스트 해시)",
      "date": "2026-08-05",
      "collected_at": "2026-08-06",
      "source": "threads | kakao",
      "link": "https://www.threads.com/... (threads만, kakao는 null)",
      "org": "서울시",
      "org_type": "중앙부처 | 지자체 | 공공기관 | 교육 | 기타",
      "title": "AI가 재작성한 한 줄 제목",
      "summary": "2~3문장 요약 (닉네임·원문 인용 없음)",
      "tags": ["민원", "LLM", "문서자동화"]
    }
  ]
}
```

### `data/state.json` — 증분 수집 상태 (로컬 전용)

- 소스별 마지막 수집 시각, 처리된 글 id(해시) 목록

### `data/raw/` — 수집 원본 (로컬 전용, **공개 repo에 커밋 금지**)

- 날짜별 원본 JSON. 닉네임·원문이 포함되므로 `.gitignore` 처리
- `state.json`도 원문 해시 외 개인정보는 담지 않되, raw와 함께 로컬 전용으로 유지

### `config/rooms.json` — 수집 대상 설정

```json
{
  "threads": [{ "type": "tag_search", "query": "공공AX" }],
  "kakao_rooms": ["공공AX 네트워크"]
}
```

## 5. 사이트 (site/)

- 순수 HTML/CSS/JS 단일 페이지, 빌드 도구 없음. `fetch('data/cases.json')`로 렌더링
- 기능:
  - 카드형 목록, 최신순 정렬
  - 키워드 검색(제목·요약·기관·태그 대상)
  - 필터: 기관유형, 태그, 출처(Threads/오픈채팅)
  - 상단 통계: 전체 사례 수, 최근 수집일
- 한국어 UI, 모바일 반응형, 라이트/다크 테마
- 출처 표기: Threads 사례는 원문 링크 버튼, 오픈채팅 사례는 "출처: 오픈채팅" 배지

## 6. 저장소·배포

- GitHub 공개 repo `PAX` 신규 생성 (gh CLI)
- GitHub Pages: `main` 브랜치 `/site` 디렉토리(또는 Pages 기본 루트 설정에 맞춤)
- 공개되는 것: `site/`, `data/cases.json`, 스크립트, 설계 문서
- 공개 금지: `data/raw/`, `data/state.json` (.gitignore)

## 7. 스케줄링

- Claude Code 크론(CronCreate)으로 매일 오전(09:00 KST) 이 Mac에서 수집 세션 실행
- 실행 프롬프트는 `scripts/collect_prompt.md`에 고정 문서화하여 크론이 참조
- Mac이 꺼져 있으면 해당 회차는 건너뜀 (다음 실행에서 state.json 기준 증분 수집으로 따라잡음)

## 8. 테스트

- 대상: 결정적 스크립트 (pytest)
  - 스키마 검증: 필수 필드 누락/타입 오류 거부
  - 중복 제거: 동일 해시 재유입 시 무시
  - append-only 병합: 기존 항목 불변 보장
  - 익명화 검증: cases.json에 닉네임 패턴·원문 장문 인용이 없는지 검사
- 수집(브라우저·카카오톡)은 자동 테스트 대상에서 제외하고 수동 검증 절차를 문서화

## 9. 비범위 (YAGNI)

- 서버/DB, 관리자 페이지, 회원 기능 없음
- 실시간 수집 없음 (하루 1회로 충분)
- 원문 전문 보관·공개 없음
- Threads API 앱 등록 없음 (브라우저 세션 활용)
