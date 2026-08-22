# 생태계 연결 관측 (Ecosystem Connection Observatory) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공공데이터·API·MCP·저장소·프로젝트·챔피언·제도/표준의 연결 그래프와 자동 진단 패널을 PAX에 신설한다.

**Architecture:** 4층 구조 — 관계 데이터(cases.json 확장 + resources/standards/semantic_edges 레지스트리) → build_graph.py(정규화 조인·TF-IDF·군집) → graph.json → connections 페이지(자체 캔버스 그래프 + 진단 패널). 스펙: `docs/superpowers/specs/2026-08-22-ecosystem-graph-design.md`

**Tech Stack:** Python 3 표준 라이브러리만(빌드), 바닐라 JS/canvas(화면, 외부 CDN 금지), pytest(기존 tests/ 체계).

**상태:** 계획 확정, 구현 보류 — 사용자가 추후 재확인 후 착수 예정 (2026-08-22 결정)

## Global Constraints

- 외부 CDN·라이브러리 금지 (행정망 차단 환경 고려 — 사이트 전체 원칙)
- 미확인 원칙: 확인된 연결만 기록. 의미 관계는 `confidence: 확인|추정` + evidence 문장 필수
- data/cases.json 덮어쓰기 절대 금지 — 확장 필드는 merge 경유 또는 개별 필드 추가만
- 화면 규칙: 표준 2줄 메뉴(내부 1줄/외부 2줄, 전 화면 동일), 본문 폭 80vw
- 파이프라인 순서: … → build_eval_data → **build_graph(신규)** → build_index → build_case_pages → …
- 모든 신규 산출 파일: `json.dumps(..., ensure_ascii=False, indent=1)` (기존 관례)
- 커밋 메시지: conventional commits (feat/fix/docs/test), attribution 없음
- 테스트: 기존 61개에 추가, `python3 -m pytest tests/ -q` 전체 통과 후 커밋

---

### Task 1: 스키마 확장 — uses_data / uses_api

**Files:**
- Modify: `scripts/pax/schema.py` (OPTIONAL_FIELDS·검증 함수)
- Test: `tests/test_schema.py`

**Interfaces:**
- Produces: cases.json 사례에 `uses_data: [{name, provider?, url?}]`, `uses_api: [동일]` 허용. name은 비어있지 않은 str, url은 `http(s)://` 형식.

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def _base_case(**over):
    c = dict(VALID_CASE)  # 기존 테스트의 유효 사례 픽스처 재사용
    c.update(over)
    return c

def test_uses_data_valid():
    c = _base_case(uses_data=[{"name": "건축물대장", "provider": "국토교통부",
                               "url": "https://www.data.go.kr/data/1"}])
    validate_case(c)  # 예외 없어야 함

def test_uses_data_missing_name_rejected():
    c = _base_case(uses_data=[{"provider": "국토교통부"}])
    with pytest.raises(ValueError, match="uses_data"):
        validate_case(c)

def test_uses_api_bad_url_rejected():
    c = _base_case(uses_api=[{"name": "법령 OPEN API", "url": "ftp://x"}])
    with pytest.raises(ValueError, match="uses_api"):
        validate_case(c)
```

- [ ] **Step 2: 실행해 실패 확인** — `python3 -m pytest tests/test_schema.py -q` → FAIL
- [ ] **Step 3: 최소 구현**

```python
# schema.py — OPTIONAL_FIELDS에 "uses_data", "uses_api" 추가 후:
def _validate_resource_refs(case, field):
    for item in case.get(field, []):
        if not isinstance(item, dict) or not str(item.get("name", "")).strip():
            raise ValueError(f"{field}: 각 항목은 name이 있는 dict여야 합니다")
        url = item.get("url")
        if url and not re.match(r"https?://", url):
            raise ValueError(f"{field}: url 형식 오류 — {url}")
# validate_case 본문에서 두 필드에 대해 호출
```

- [ ] **Step 4: 테스트 통과 확인** — 신규 3개 + 기존 전체 PASS
- [ ] **Step 5: 커밋** — `feat: 사례 스키마에 uses_data/uses_api 자원 관계 필드 추가`

---

### Task 2: resources.json 스키마·검증 + 초기 구축

**Files:**
- Create: `data/resources.json`, `scripts/pax/resources.py` (로드·검증·정규화 유틸)
- Test: `tests/test_resources.py`

**Interfaces:**
- Produces: `load_resources() -> list[dict]` (검증 포함), `normalize_name(s) -> str`, `RESOURCE_ALIASES: dict[str, str]`. resources.json 항목: `{id, type, name, provider, url?, tier?, source, first_seen, status}` — type ∈ {공공데이터, 공공API, MCP}. (저장소·제도/표준은 여기 등재하지 않음 — 스펙 §3.6)

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_normalize_name_strips_and_aliases():
    assert normalize_name("건축물대장 정보") == "건축물대장"   # 별칭 사전 경유
    assert normalize_name("국가법령정보(Open API)") == normalize_name("국가법령정보 OPEN API")

def test_load_resources_rejects_dup_id(tmp_path):
    bad = {"resources": [RES_A, dict(RES_A)]}  # 같은 id 2건
    with pytest.raises(ValueError, match="중복 id"):
        load_resources(write_tmp(tmp_path, bad))

def test_load_resources_rejects_bad_type(tmp_path):
    with pytest.raises(ValueError, match="type"):
        load_resources(write_tmp(tmp_path, {"resources": [dict(RES_A, type="저장소")]}))
```

- [ ] **Step 2: 실패 확인** → **Step 3: resources.py 구현**

```python
RESOURCE_TYPES = {"공공데이터", "공공API", "MCP"}
SOURCES = {"포털목록", "사례관측", "보도자료", "커뮤니티"}
RESOURCE_ALIASES = {"건축물대장정보": "건축물대장"}  # 백필 중 발견분을 계속 추가

def normalize_name(s: str) -> str:
    s = re.sub(r"[\s()\[\]·]", "", s).lower()
    return RESOURCE_ALIASES.get(s, s)
```

- [ ] **Step 4: 통과 확인** → **Step 5: 커밋** — `feat: 자원 레지스트리 스키마·정규화 유틸`
- [ ] **Step 6: 초기 데이터 구축 (브라우저 조사 — 코드 아님)**
  - data.go.kr 국가중점데이터 목록을 Chrome(claude-in-chrome)으로 조회해 등재 (~100–200건, `tier: 국가중점`, `source: 포털목록`)
  - data.go.kr 활용신청 상위 API 100건 + 큐레이션 API ~20건(법제처 OPEN API, 열린국회, 서울열린데이터광장, 나이스) 등재
  - MCP: 기존 관측소 MCP 현황 + gitlab.aigov 검색 결과를 전수 등재 (`type: MCP`)
  - 각 항목 `first_seen`은 등재일. data.go.kr이 봇 차단 시 Chrome 페이지 텍스트 추출 사용(oss.kr 선례)
- [ ] **Step 7: `python3 -c "from scripts.pax.resources import load_resources; print(len(load_resources()))"` 로 검증 통과 확인 후 커밋** — `feat: 자원 레지스트리 초기 구축(국가중점·상위API·MCP)`

---

### Task 3: standards.json 초기 등재

**Files:**
- Create: `data/standards.json`
- Test: `tests/test_standards.py` (build_graph에서 재사용할 로더 검증)
- Modify: `scripts/pax/resources.py` (load_standards 추가 — 같은 파일에 두어 로더 응집)

**Interfaces:**
- Produces: `load_standards() -> list[dict]` — 항목 `{id, name, type, scope, url?, compliance_signal, global_counterpart, note}`. type ∈ {법령, 제도, 표준, 가이드라인, 상호호환성, 글로벌}. `compliance_signal`은 null 또는 사례 필드명 문자열.

- [ ] **Step 1: 실패하는 테스트** — 유효 로드 / 잘못된 type 거부 / compliance_signal이 KNOWN_SIGNALS(`{"license","n2sf_class","mcp_official","approval_gate","link_ok","maintenance"}`) 밖이면 거부
- [ ] **Step 2: 실패 확인** → **Step 3: load_standards 구현** → **Step 4: 통과**
- [ ] **Step 5: 초기 20건 등재** — 스펙 §3.3 목록 그대로. 법령 6건(공공데이터법·전자정부법·AI기본법·개인정보보호법 등)은 korean-law MCP `search_law`로 현행 여부·정식 명칭·law.go.kr URL 확인 후 기입 (조사 단계, 코드 아님)
- [ ] **Step 6: 커밋** — `feat: 제도·표준 레지스트리 초기 20건 — 법령은 국가법령정보 검증`

---

### Task 4: semantic_edges.json 형식·검증

**Files:**
- Create: `data/semantic_edges.json` (빈 배열로 시작: `{"edges": []}`)
- Modify: `scripts/pax/resources.py` (load_semantic_edges)
- Test: `tests/test_semantic_edges.py`

**Interfaces:**
- Produces: `load_semantic_edges() -> list[dict]` — `{source, target, rel, evidence, confidence, extracted_at}` 전 필드 필수. rel ∈ {유사, 파생, 보완, 대체, 선행}, confidence ∈ {확인, 추정}.

- [ ] **Step 1: 실패하는 테스트** — 유효 로드 / evidence 빈 문자열 거부 / rel 오타 거부
- [ ] **Step 2–4: RED → 구현 → GREEN** (구현은 standards 로더와 동일 패턴)
- [ ] **Step 5: 커밋** — `feat: 의미 관계 엣지 저장 형식·검증`

---

### Task 5: build_graph.py — 그래프·지표 산출 (핵심 태스크)

**Files:**
- Create: `scripts/build_graph.py`
- Test: `tests/test_build_graph.py` (소형 픽스처: 사례 4·챔피언 1·자원 3·기준 2·의미엣지 1)

**Interfaces:**
- Consumes: Task 1–4의 로더·정규화, cases.json, site/data/champions.json
- Produces: `site/data/graph.json`:

```json
{"generated_at": "...",
 "nodes": [{"id": "case:<id>", "type": "project|champion|data|api|mcp|repo_github|repo_gitlab|standard",
            "label": "...", "meta": {"url": "...", "task_category": "...", "ministry": "..."}}],
 "edges": [{"source": "...", "target": "...", "rel": "uses_data|uses_api|mcp|repo|mirror|champion|standard|semantic:유사|similar_auto",
            "confidence": "확인|추정|자동"}],
 "metrics": {"hubs": [...상위10...], "isolated": {...유형별 고립 수·목록...},
             "domain_matrix": [{"category": "...", "data": 3, "api": 5, "...": 0, "density": 1.2}],
             "standards_gaps": {"기준공백": [...], "이행공백": [...], "조화공백": [...]},
             "clusters": [{"label": "...", "size": 12, "hub": "...", "gaps": "..."}],
             "link_index": {"avg_degree": 0.0, "reuse_rate": 0.0, "data_util_rate": 0.0, "standards_mapping_rate": 0.0}}}
```

- [ ] **Step 1: 노드·엣지 생성 실패 테스트** — 픽스처에서: 사례 4 + 자원 3(그중 1개는 어떤 사례도 안 씀) + 챔피언 1 → 노드 수·엣지 수 정확 일치, 미사용 자원이 `metrics.isolated`에 포함, url 일치 조인·정규화 이름 조인 각 1건씩 검증
- [ ] **Step 2: 실패 확인** → **Step 3: 조인·노드·엣지 구현**

```python
def build_nodes_edges(cases, champions, resources, sem_edges):
    nodes, edges, by_key = {}, [], {}
    for r in resources:  # 하향 등재분 먼저 — 미사용이어도 노드로 존재해야 공백이 보인다
        nid = f"res:{r['id']}"
        nodes[nid] = {"id": nid, "type": TYPE_MAP[r["type"]], "label": r["name"], "meta": {...}}
        by_key[("url", (r.get("url") or "").rstrip("/"))] = nid
        by_key[("name", normalize_name(r["name"]))] = nid
    unmatched = []
    for c in cases:
        ...  # case 노드, repo 노드(link/case_url/mirror_url), mirror 엣지
        for field, rel in (("uses_data", "uses_data"), ("uses_api", "uses_api")):
            for ref in c.get(field, []):
                nid = (by_key.get(("url", (ref.get("url") or "").rstrip("/")))
                       or by_key.get(("name", normalize_name(ref["name"]))))
                if nid is None:  # 조인 실패 → 자동 등재 + 로그 (스펙 §3.6 규칙 2)
                    unmatched.append(ref["name"]); nid = auto_register(nodes, by_key, ref, field)
                edges.append({"source": f"case:{c['id']}", "target": nid, "rel": rel, "confidence": "확인"})
    return list(nodes.values()), edges, unmatched
```

- [ ] **Step 4: 통과** → **Step 5: 커밋** — `feat: build_graph 노드·엣지·조인`
- [ ] **Step 6: TF-IDF 유사도 실패 테스트** — 동일 텍스트 코사인=1.0, 무관 텍스트<0.2, 사례당 top-3 컷, 임계값(THRESHOLD=0.35, 상수) 미만 제외
- [ ] **Step 7: 구현**

```python
def tokenize(text):
    words = re.findall(r"[가-힣a-z0-9]+", text.lower())
    grams = [w[i:i+2] for w in words if len(w) > 1 for i in range(len(w)-1)]
    return words + grams

def tfidf_similar(cases, threshold=0.35, top_k=3):
    docs = {c["id"]: Counter(tokenize(c["title"] + " " + c.get("desc", ""))) for c in cases}
    df = Counter(t for d in docs.values() for t in d)
    n = len(docs)
    vecs = {cid: {t: f * math.log(n / df[t]) for t, f in d.items()} for cid, d in docs.items()}
    # 코사인: dot/(norm*norm), 각 사례 상위 top_k 쌍만 (i<j 중복 제거) 반환
```

- [ ] **Step 8: 통과·커밋** — `feat: build_graph TF-IDF 유사(자동) 엣지`
- [ ] **Step 9: 군집(label propagation) 실패 테스트** — 두 개의 분리된 삼각형 그래프 → 군집 2개, 라벨은 지배적 분야명 포함, 수렴(반복 상한 100)
- [ ] **Step 10: 구현** — 인접 리스트에서 각 노드가 이웃 다수결 라벨을 채택, 변화 없을 때까지(결정론성 위해 노드 id 정렬 순회·동률 시 사전순 최솟값)
- [ ] **Step 11: 통과·커밋** — `feat: build_graph 군집 탐지·군집 요약`
- [ ] **Step 12: metrics 실패 테스트** — hubs 정렬·톱10, domain_matrix 행=task_category 10종+미분류, standards_gaps 3유형(각 판정 규칙은 스펙 §3.4 표 그대로: 기준공백=signal null만 존재 or 항목 부재, 이행공백=signal 필드 관측치 집계(예: license 명시율)와 함께 목록화, 조화공백=global_counterpart 빈 항목), link_index 4지표(0~1 범위 또는 평균 차수)
- [ ] **Step 13: 구현·통과·커밋** — `feat: build_graph 진단 지표 — 허브·공백·분야 매트릭스·표준 3공백·연결 지수`
- [ ] **Step 14: 실데이터 실행** — `python3 scripts/build_graph.py` → graph.json 생성, unmatched 로그를 보고 RESOURCE_ALIASES 보강 반복(고아 관측 0 목표). 커밋 — `feat: graph.json 첫 산출`

---

### Task 6: build_index.py 연결 지수 편입

**Files:**
- Modify: `scripts/build_index.py`
- Test: `tests/test_build_index.py` (기존 파일에 추가)

**Interfaces:**
- Consumes: site/data/graph.json의 `metrics.link_index`
- Produces: index.json에 `link_index` 블록(4지표), 분기 스냅샷에 동일 포함

- [ ] **Step 1: 실패 테스트** — graph.json 픽스처 존재 시 index에 link_index 4키 존재·값 범위 검증, graph.json 부재 시 index 빌드가 죽지 않고 link_index 생략(파이프라인 순서 역전 대비)
- [ ] **Step 2–4: RED → 구현(파일 있으면 읽어 병합) → GREEN**
- [ ] **Step 5: 커밋** — `feat: 공공 AX 지수에 연결 지수 편입`

---

### Task 7: connections 페이지 — 그래프 화면

**Files:**
- Create: `site/connections.html`, `site/connections.js`
- Modify: `site/style.css` (그래프·패널 스타일)

**Interfaces:**
- Consumes: site/data/graph.json, site/ministries.js(부처 필터), 기존 2줄 메뉴 마크업(다른 페이지에서 복사)
- Produces: 메뉴명 "연결 관측". URL 파라미터 `?type=`, `?category=` 필터 상태 동기화.

- [ ] **Step 1: HTML 골격** — 2줄 메뉴(기존 페이지에서 복사, `./` 프리픽스), 80vw 컨테이너, `<canvas id="graph">`, 유형 토글 체크박스 8개(+의미 엣지 토글), 분야·부처 `<select>`, 검색 `<input>`, 사이드 패널 `<aside>`, 진단 패널 섹션 6개(h2 + 빈 컨테이너), 표 뷰 `<table id="edge-table">`, `<noscript>`/로드 실패 안내
- [ ] **Step 2: force 시뮬레이션 코어**

```javascript
// connections.js — 외부 의존 없음. 수렴 후 정지(α < 0.005에서 rAF 중단).
function step(nodes, edges, alpha) {
  for (const e of edges) {            // 스프링: 이상 거리 60px
    const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y;
    const d = Math.hypot(dx, dy) || 1, f = (d - 60) / d * 0.02 * alpha;
    e.s.x += dx * f; e.s.y += dy * f; e.t.x -= dx * f; e.t.y -= dy * f;
  }
  // 반발: 격자 버킷(셀 120px)으로 이웃만 검사 — O(n²) 회피, 600노드 60fps 목표
  // 중심 인력: 유형별 앵커 없이 전체 무게중심으로 약하게(0.001)
}
```

- [ ] **Step 3: 렌더·인터랙션** — 유형별 색(8색, 기존 팔레트 변수 재사용)·모양(원/사각/다이아), 의미 엣지 점선(`setLineDash`), 줌·팬(wheel/drag, transform 행렬), 노드 클릭 → 사이드 패널(연결 목록, 사례는 `case/<id>.html` 링크), 검색은 라벨 부분일치 → 해당 노드 하이라이트·센터링
- [ ] **Step 4: 표 뷰 렌더** — 전체 엣지를 (출발, 관계, 도착, 신뢰) 4열로. 필터 상태 공유
- [ ] **Step 5: `node --check site/connections.js`** → 커밋 — `feat: 연결 관측 그래프 화면`

---

### Task 8: 진단 패널 렌더

**Files:**
- Modify: `site/connections.js` (renderDiagnostics 함수군 — 파일이 800줄 초과하면 `site/connections-panels.js` 분리)

**Interfaces:**
- Consumes: graph.json `metrics` 전체
- Produces: ① 허브 톱10 표 ② 공백 보드(고립 자원·무연결 챔피언·미러 없는 저장소 카드) ③ 분야별 자원 매트릭스 표(셀 클릭 → `?category=` 필터 적용해 그래프 스크롤) ④ 제도·표준 진단표(3유형 탭, 각 행에 정책 제언 문장 — 제언 템플릿은 `SUGGESTIONS[공백유형][자원유형]` 상수 사전) ⑤ 의미 군집 카드(클릭 → 군집 하이라이트) ⑥ 연결 지수 카드 4개

- [ ] **Step 1: metrics 렌더 구현** (섹션별 함수 분리, gap-map.js의 el() 패턴 재사용)
- [ ] **Step 2: 제언 템플릿 사전 작성** — 스펙 §5-4. v2 보고서 §10 제언과 문구 정합(모순 금지, 표현은 화면용으로 축약 가능)
- [ ] **Step 3: node --check + 로컬 브라우저 확인** → 커밋 — `feat: 연결 관측 진단 패널`

---

### Task 9: 전 화면 메뉴에 "연결 관측" 추가

**Files:**
- Modify: `site/index.html`, `site/observatory.html`, `site/gap-map.html`, `site/playbook.html`, `site/guidelines.html`, `site/changelog.html`, `site/connections.html`, `scripts/build_case_pages.py` (사례 페이지 템플릿 — `../` 프리픽스)

- [ ] **Step 1: 내부 메뉴 1줄에 "연결 관측" 링크 추가** — 격차 지도 다음 위치, 전 화면 동일 순서
- [ ] **Step 2: build_case_pages 재실행으로 사례 페이지 196건 갱신**
- [ ] **Step 3: 전 페이지 grep으로 메뉴 순서 일치 검증** (`grep -c 'connections.html' site/*.html` = 페이지 수) → 커밋 — `feat: 전 화면 메뉴에 연결 관측 추가`

---

### Task 10: 백필 — 기존 사례 전수 관계 태깅 + 의미 관계 추출

**Files:**
- Modify: `data/cases.json` (uses_data/uses_api 필드), `data/semantic_edges.json`, `scripts/pax/resources.py` (RESOURCE_ALIASES 보강)

절차 태스크(코드 아님) — 세션 LLM이 수행:

- [ ] **Step 1: 전 사례의 제목·설명·사례 페이지를 일괄 검토** — 공공데이터·API 사용이 **본문에 명시된 것만** uses_data/uses_api 기입. 저장소 사례는 README도 확인(gh api / curl, gitlab.aigov는 `curl -sL`). 근거 없는 추정 금지
- [ ] **Step 2: 의미 관계 추출** — 사례 간 유사/파생/보완/대체/선행을 evidence 문장과 함께 semantic_edges.json에 기록. 확신 없으면 `confidence: 추정`
- [ ] **Step 3: `python3 -m pytest tests/ -q`로 스키마 전체 재검증** → `python3 scripts/build_graph.py` 재실행, unmatched 0 확인
- [ ] **Step 4: 커밋** — `feat: 전 사례 자원 관계·의미 관계 백필` (사례 수·엣지 수를 본문에 기록)

---

### Task 11: 수집 절차·주간 점검 편입 + 파이프라인 배선

**Files:**
- Modify: `scripts/collect_prompt.md`

- [ ] **Step 1: 4단계(선별)에 태깅 지침 추가** — "본문·README에서 공공데이터·API 사용 확인 시 uses_data/uses_api 기입(미확인 시 생략). 신규 사례와 기존 사례 간 의미 관계를 semantic_edges.json에 추가(evidence 필수)"
- [ ] **Step 2: 5단계 파이프라인에 build_graph 삽입** — build_eval_data와 build_index 사이. git add 경로에 `data/resources.json data/standards.json data/semantic_edges.json` 추가
- [ ] **Step 3: 주간 점검(월요일) 절차에 추가** — "resources.json 하향 목록 재조회(국가중점·상위 API 신규/폐지, MCP 깃랩 검색), status 갱신"
- [ ] **Step 4: 커밋** — `docs: 수집 절차에 관계 태깅·그래프 빌드·자원 목록 주간 갱신 편입`

---

### Task 12: 배포·검증

- [ ] **Step 1: 전체 파이프라인 1회 완주** — merge부터 changelog까지 순서대로 실행, 에러 0
- [ ] **Step 2: 전체 테스트** — `python3 -m pytest tests/ -q` PASS, `node --check site/*.js` PASS
- [ ] **Step 3: 커밋·푸시** — feat/pax-archive → `git branch -f main feat/pax-archive` → 양 브랜치 푸시
- [ ] **Step 4: 배포 검증 루프** — `gh run list --branch main` headSha 일치+success, cache-bust curl로 connections.html·graph.json 라이브 확인
- [ ] **Step 5: log.md 기록** — 노드·엣지·군집 수, 연결 지수 첫 값 기재

---

## 실행 순서·의존성 요약

```
Task 1 (스키마) ─┬─→ Task 5 (build_graph) ─→ Task 6 (지수) ─┐
Task 2 (자원)   ─┤                                          ├─→ Task 12 (배포)
Task 3 (표준)   ─┤   Task 7 (그래프 화면) ─→ Task 8 (진단 패널) ─┤
Task 4 (의미)   ─┘   Task 9 (메뉴)                            │
Task 10 (백필) — Task 5 이후 언제든 (build_graph 재실행 포함)   │
Task 11 (절차 편입) — Task 5 이후                             ─┘
```

Task 2·3의 조사 단계(브라우저·korean-law)는 시간이 걸리므로, 먼저 소수 시드(각 10건)로
Task 5–8을 관통시킨 뒤 목록을 채우는 순서도 허용된다(스키마·코드는 규모와 무관).
