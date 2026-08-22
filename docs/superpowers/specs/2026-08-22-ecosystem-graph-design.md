# PAX 생태계 연결 관측 (Ecosystem Connection Observatory) 설계

날짜: 2026-08-22
상태: 사용자 승인 대기
선행 문서: 2026-08-18-pax-expansion-analysis.md (v2), 2026-08-21-public-gitlab-oss-strategy.md

## 1. 목적

공공데이터·공공API·정부MCP·공공 깃랩/GitHub 저장소·공공AX 프로젝트·공공 AI 챔피언·제도/표준이
**얼마나 밀접하게 연결되어 있는지**를 상설 그래프로 조망하고, 그 연결 상태에서
**진단(잘 되는 곳 / 부족한 곳 / 개선 과제 / 필요한 정책)**을 자동 도출한다.

답해야 할 질문 (사용자 확정):
1. **허브·연결 밀도** — 어떤 자원이 가장 많이 재사용되는가, 누가 연결의 중심인가
2. **공백·격차** — 고립된 자원, 무연결 챔피언, 활용되지 않는 데이터·API
3. **계보·확산 경로** — 하나의 자원이 여러 프로젝트로 파생되는 경로
4. **정책 근거** — 추진단·보고서에 쓸 수 있는 실측 증거 화면
5. **분야별 자원 현황** — 분야 × 자원 유형별 재고와 충족도 상세 분석
6. **제도·표준 공백** — 법·제도·표준·가이드라인·상호호환성·글로벌 조화 관점의 결핍 파악

원칙: 보여주기식 그래프가 아니라 **진단 도구**. 모든 진단은 데이터에서 자동 파생되어
매 수집마다 갱신된다. 미확인 원칙(확인된 연결만 기록)을 유지한다.

## 2. 아키텍처 — 4층 구조

```
[1층 관계 데이터]  cases.json 확장 필드 + standards.json + semantic_edges.json(LLM 추출)
        ↓ scripts/build_graph.py (TF-IDF 유사도·군집 탐지 포함, 파이프라인 편입)
[2층 그래프 화면]  site/connections.html/js — 자체 구현 force-directed 캔버스
[3층 진단 패널]   graph.json의 metrics — 허브·공백·분야 매트릭스·정책 제언
[4층 제도·표준]   standards.json — 3유형 공백 진단 (기준/이행/조화)
```

기존 파이프라인 패턴(수집 → 빌드 스크립트 → site/data/*.json → 정적 페이지 렌더)을 그대로 따른다.
외부 CDN·라이브러리 없음(행정망 차단 환경 고려, 기존 사이트 원칙과 동일).

## 3. 1층 — 관계 데이터

### 3.1 cases.json 스키마 확장 (OPTIONAL_FIELDS 추가)

```json
"uses_data": [{"name": "건축물대장", "provider": "국토교통부", "url": "https://www.data.go.kr/..."}],
"uses_api":  [{"name": "국가법령정보 OPEN API", "provider": "법제처", "url": "https://open.law.go.kr/..."}]
```

- `uses_data`: 사례가 활용하는 공공데이터셋. name 필수, provider·url 선택.
- `uses_api`: 사례가 호출하는 공공API. 구조 동일.
- schema.py 검증: 리스트의 각 항목은 dict이며 name 비어있지 않을 것. url은 http(s) 형식.
- 기존 암묵 관계는 그대로 활용: 챔피언(champions.json), 저장소(link/case_url/mirror_url),
  MCP(mcp_provider_agency/mcp_official), 부처(ministries.js 매칭), 지역(region), 분야(task_category).

### 3.2 전수 백필 + 수집 편입

- **백필**: 기존 사례 전건의 제목·설명·사례 페이지·README를 분석해 확인된 데이터·API 연결만 태깅.
  근거 없는 추정 금지 — 본문에 명시된 것만. eval_additions.json 방식처럼 별도 파일
  (`data/graph_additions.json`)로 관리하지 않고 **cases.json에 직접 기록**한다
  (관계는 사례의 속성이며, merge가 id 기준으로 보존하므로 안전).
- **수집 편입**: scripts/collect_prompt.md 4단계(사례 선별)에 태깅 지침 추가 —
  "본문·README에서 공공데이터셋·공공API 사용이 확인되면 uses_data/uses_api에 기록(미확인 시 생략)".

### 3.3 data/standards.json — 제도·표준 레지스트리 (큐레이션)

```json
{
 "standards": [
  {
   "id": "kr-public-data-act",
   "name": "공공데이터의 제공 및 이용 활성화에 관한 법률",
   "type": "법령",
   "scope": ["공공데이터", "공공API"],
   "url": "https://law.go.kr/...",
   "compliance_signal": null,
   "global_counterpart": ["EU Open Data Directive"],
   "note": "제공 의무의 근거. AX 활용 단계 규정은 없음"
  },
  {
   "id": "license-notation",
   "name": "오픈소스 라이선스 명시 (NIPA 공개SW 가이드)",
   "type": "가이드라인",
   "scope": ["공공 깃랩", "GitHub"],
   "compliance_signal": "license",
   "global_counterpart": ["SPDX", "REUSE"],
   "note": "PAX 실측 명시율과 대조"
  }
 ]
}
```

- `type`: 법령 | 제도 | 표준 | 가이드라인 | 상호호환성 | 글로벌 — 6유형.
- `scope`: 적용되는 노드 유형 또는 분야.
- `compliance_signal`: PAX 관측 필드명(license, n2sf_class, mcp_official, approval_gate,
  link_ok, maintenance 등) 또는 null(관측 신호 없음 = 그 자체가 공백 신호).
- `global_counterpart`: 국제 기준 대응물. 비어 있으면 조화 공백 후보.
- 초기 등재 목록(설계 확정, 구현 시 그대로 등재): 공공데이터법, 전자정부법, AI기본법(2026 시행),
  개인정보보호법, N2SF 등급제, 행정망 보안 규정, NIPA 공개SW 가이드, NIA 이슈리포트 기준,
  디지털플랫폼정부 표준프레임워크, 공공 API 표준(행안부), MCP 스펙(Anthropic),
  ISO/IEC 42001(AIMS), ISO/IEC 5259(데이터 품질), W3C 웹 표준·접근성(KWCAG),
  EU AI Act, NIST AI RMF, OECD AI 원칙, SPDX/REUSE, AI-BOM. 약 20건 내외로 시작.

### 3.4 제도·표준 3유형 공백 진단 (build_graph.py가 산출)

| 유형 | 판정 규칙 | 예시(현 실측) |
|---|---|---|
| **기준 공백** | scope에 해당하는 자원·활동이 관측되는데 적용할 기준 항목이 레지스트리에 없음, 또는 compliance_signal이 null인 기준만 존재 | 에이전트 감사 표준, MCP 보안 인증 기준 부재 |
| **이행 공백** | compliance_signal 필드의 관측치가 기준 미달 | 라이선스 명시율 36%, 승인게이트 미확인 100%, N2SF 미분류 다수 |
| **조화 공백** | global_counterpart가 비었거나, 국내 기준과 글로벌 기준이 모두 있는데 매핑 관계가 명시되지 않음 | 국내 AX 가이드 ↔ NIST AI RMF 미매핑 |

### 3.5 의미 관계 레이어 (GraphRAG 적응)

명시적 연결(uses_data 등)만으로는 "같은 문제를 푸는 도구들", "파생 관계"가 안 보인다.
GraphRAG의 구성(LLM 개체·관계 추출 → 그래프 → 군집 탐지 → 군집 요약)을
정적 파이프라인에 맞게 이식한다:

1. **LLM 의미 관계 추출** — 수집·백필 단계에서 세션 LLM이 사례 본문·README로부터
   의미 관계를 추출해 `data/semantic_edges.json`에 기록:
   ```json
   {"source": "<case_id>", "target": "<case_id|node_id>",
    "rel": "유사|파생|보완|대체|선행",
    "evidence": "근거 문장 인용", "confidence": "확인|추정", "extracted_at": "2026-08-22"}
   ```
   - 미확인 원칙의 변형: 의미 관계는 본질적으로 해석이므로 `confidence`로 구분하고,
     evidence 문장을 반드시 남긴다. "추정" 엣지는 화면에서 점선·토글로 구분 표시.
   - 수집 절차(collect_prompt.md 4단계)에 "신규 사례와 기존 사례 간 의미 관계 추출" 지침 추가.
2. **TF-IDF 유사도 엣지** — build_graph.py가 사례 제목+설명의 간이 토큰(공백 분리 + 한글 2-gram) TF-IDF 코사인
   유사도를 계산(순수 파이썬, 외부 의존 없음), 임계값 이상·사례당 top-3만 `유사(자동)`
   엣지로 추가. LLM 추출과 별개 method로 표기해 구분.
3. **군집 탐지** — label propagation(자체 구현)으로 전체 그래프의 의미 군집을 산출.
   군집 라벨은 규칙 기반(지배적 분야·기관·자원 유형 조합)으로 자동 생성.
4. **군집 요약** — 각 군집의 요약 카드(구성 노드 수, 대표 허브, 내부 공백)를
   graph.json의 metrics.clusters에 포함 → 진단 패널에 "의미 군집 지도"로 렌더.
   이 군집 요약이 후속 pax-mcp(로드맵 2-10)의 검색 컨텍스트 단위가 된다.

## 4. 2층 — 그래프 화면 (site/connections.html/js)

- **노드 8유형**: 공공데이터 · 공공API · MCP · 깃랩 저장소 · GitHub 저장소 · 프로젝트(사례) ·
  챔피언 · 제도/표준. 유형별 색·모양 구분, 범례 고정.
- **엣지**: 프로젝트—데이터(활용), 프로젝트—API(호출), 프로젝트—MCP(제공/사용),
  프로젝트—저장소(공개/미러), 프로젝트—챔피언(제작), 프로젝트—제도·표준(준수/적용),
  저장소—저장소(미러쌍), 프로젝트—프로젝트(의미: 유사/파생/보완/대체/선행 — 점선, 토글).
- **렌더링**: 자체 구현 force-directed 시뮬레이션(canvas). 노드 300~600개 규모에서
  requestAnimationFrame 60fps 목표, 수렴 후 시뮬레이션 정지. 외부 라이브러리 없음.
- **인터랙션**: ① 유형별 표시 토글 ② 분야(task_category)·부처 필터 ③ 노드 클릭 →
  사이드 패널에 상세(연결 목록, 사례는 case/<id>.html 링크) ④ 검색(노드명)
  ⑤ 드래그·줌·팬.
- **접근성 폴백**: 그래프 아래 동일 데이터의 표 뷰(연결 목록) 제공 — canvas 비지원·스크린리더 대응.
- 표준 2줄 메뉴·80vw 폭 등 기존 화면 규칙 준수. 메뉴명: **"연결 관측"** (내부 메뉴 1줄에 추가).

## 5. 3층 — 진단 패널 (같은 페이지 하단)

graph.json의 metrics를 렌더. 전부 자동 산출:

1. **허브 톱10** — 연결 수 상위 노드(유형 병기). "가장 재사용되는 자원 / 연결 중심 챔피언".
2. **공백 보드** — 고립 노드(연결 0), 무연결 챔피언, 프로젝트 0건인 주요 데이터·API,
   미러 없는 단독 저장소 수.
3. **분야별 자원 현황 매트릭스** — 행: task_category 10종(+미분류), 열: 데이터/API/MCP/
   깃랩/GitHub/프로젝트/챔피언 보유 수 + 연결 밀도(분야 내 평균 연결 수). 셀 클릭 →
   해당 분야 필터로 그래프 이동. "어느 분야가 자원은 있는데 연결이 없는지"가 한눈에 보이게.
4. **제도·표준 진단표** — 3유형 공백 목록(3.4) + 각 공백에 대응하는 **정책 제언 문장**
   (규칙 기반 템플릿: 공백 유형 × 자원 유형 → 제언. v2 보고서 §10 제언과 문구 정합).
5. **의미 군집 지도** — 군집별 요약 카드(라벨, 노드 수, 대표 허브, 내부 공백).
   군집 클릭 → 그래프가 해당 군집만 하이라이트.
6. **연결 지수** — build_index.py에 편입: 평균 연결도, 자원 재사용률(2개 이상 프로젝트가
   쓰는 자원 비율), 데이터 활용률(연결 1건 이상인 데이터 비율), 표준 매핑률.
   분기 스냅샷(snapshots/*.json)에 포함되어 추이 관측 가능.

## 6. 데이터 흐름·파이프라인 편입

```
수집(태깅 포함) → merge → tag_licenses → publish → make_thumbs → build_champions
→ build_eval_data → build_graph(신규) → build_index(연결 지수 포함) → build_case_pages
→ build_community_stats → changelog → 커밋·배포 검증
```

- build_graph.py: 입력 cases.json + champions.json + standards.json + semantic_edges.json →
  출력 site/data/graph.json (nodes/edges/metrics). build_index보다 먼저 실행
  (연결 지수를 index가 읽음).
- collect_prompt.md 5단계에 build_graph 실행 추가.

## 7. 에러 처리·엣지 케이스

- uses_data/uses_api의 동일 자원 이름 표기 변형("건축물대장" vs "건축물대장정보") →
  build_graph가 정규화 맵(공백·괄호 제거, 별칭 사전)으로 동일 노드 병합. 병합 로그 출력.
- standards.json의 compliance_signal이 존재하지 않는 필드명을 가리키면 빌드 에러(오타 방지).
- 그래프 데이터 로드 실패 시 표 뷰만 렌더하고 안내 문구 표시(기존 gap-map 패턴).
- 노드 수 폭증 대비: 유형별 기본 표시 상한 없음(현 규모 수백 노드), 1,000 노드 초과 시
  초기 뷰를 "연결 2+ 노드만"으로 축소하는 스위치(임계값 상수).

## 8. 테스트

- **스키마**: uses_data/uses_api 형식 검증 유닛 테스트(정상/이름 누락/URL 비정상).
- **build_graph**: 소형 픽스처(사례 3·챔피언 1·기준 2)로 노드·엣지 수, 허브 산출,
  3유형 공백 판정, 이름 정규화 병합을 검증. compliance_signal 오타 시 에러 검증.
- **의미 레이어**: TF-IDF 유사도 산출(동일 텍스트=1.0, 무관 텍스트<임계값),
  top-3 컷, label propagation 군집 수렴, semantic_edges.json 형식(rel·evidence 필수) 검증.
- **build_index 연동**: 연결 지수 필드 존재·범위 검증.
- **JS**: node --check + 배포 후 라이브 페이지 로드 검증(기존 검증 루프).
- TDD로 진행(RED→GREEN), 기존 61개 테스트에 추가.

## 9. 구현 범위 (이 스펙 = 1사이클)

포함: 스키마 확장, standards.json 초기 20건, build_graph.py(TF-IDF·군집 포함),
전수 백필(명시 관계 + 의미 관계 LLM 추출), connections 페이지(그래프+진단 패널+군집 지도+표 뷰),
연결 지수 index 편입, 수집 절차 편입(관계 태깅+의미 관계 추출), 메뉴 추가.

제외(후속): 계보 시각화 전용 뷰(엣지에 시간축 부여), 표준 카드(§10-6)와의 양방향 링크,
기준 레지스트리의 외부 소스 자동 동기화, 그래프 스냅샷 이미지 내보내기.
