# MCP 보안·안전 검증 리뷰 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 등재된 MCP 사례를 6축 프레임으로 검증하고 결과를 "MCP 검증" 메뉴로 공개한다.

**Architecture:** check_mcp.py(자동 축 1~3) + 세션 LLM 감사(축 4~5) → data/mcp_reviews.json 원장 → build_mcp_review.py(공개 필터 강제) → site/data/mcp-review.json → mcp-review 페이지 + 사례 배지. 스펙: `docs/superpowers/specs/2026-08-28-mcp-security-review-design.md`

**Tech Stack:** Python 표준 라이브러리 + npm audit/pip-audit(시스템 기설치분), 바닐라 JS, pytest.

## Global Constraints

- 공개 산출물(site/**, data/mcp_reviews.json)에 악용 가능 상세(재현 경로·PoC·취약 코드 위치) 기재 금지 — 상세는 `data/private/mcp_findings/`(gitignore)에만
- verdict는 `통과|주의|심각(비공개 처리 중)|미검증|해당 없음` 5종만 허용
- LLM 감사 판정은 파일·행 근거 인용 없이 기록 금지
- 동적 검사(Inspector)는 자격증명 없이·임시 디렉토리에서만, 타임아웃 120초, 검사 후 클론 삭제
- 침묵 통과 금지 — 도구 부재·클론 실패는 반드시 "미검증(사유)"로 기록
- 기존 규칙: 외부 CDN 금지, 2줄 메뉴·80vw, ensure_ascii=False indent=1, conventional commits, 전체 pytest 통과 후 커밋

---

### Task 1: 기반 — 비공개 경로·대상 추출·원장 스키마

**Files:**
- Modify: `.gitignore` (+`data/private/`)
- Create: `scripts/pax/mcp_review.py`, `data/mcp_reviews.json`(`{"reviews": []}`)
- Test: `tests/test_mcp_review.py`

**Interfaces:**
- Produces: `VERDICTS`(frozenset 5종), `AXES`(6키: permission_surface, secrets, supply_chain, injection, data_flow, hygiene), `load_reviews(path) -> dict`, `validate_review(r, case_ids)`, `mcp_targets(cases) -> list[dict]`(MCP 사례 + 저장소 URL 추출 — m축 평가 M* 또는 title/tags에 'MCP' 포함)

- [ ] **Step 1: 실패하는 테스트**

```python
def test_mcp_targets_selects_mcp_cases():
    cases = [
        {"id": "a", "title": "건축HUB MCP", "tags": [], "link": "https://github.com/x/y"},
        {"id": "b", "title": "일반 도구", "tags": ["웹앱"], "link": "https://ex.com"},
        {"id": "c", "title": "원격 도구", "tags": ["MCP"], "link": "https://svc.kr/"},
    ]
    t = mcp_targets(cases)
    ids = [x["case_id"] for x in t]
    assert "a" in ids and "c" in ids and "b" not in ids
    assert next(x for x in t if x["case_id"] == "a")["repo"] == "https://github.com/x/y"
    assert next(x for x in t if x["case_id"] == "c")["repo"] is None  # 원격 — 코드 비공개

def test_validate_review_rejects_bad_verdict():
    r = {"case_id": "a", "axes": {"secrets": {"verdict": "안전함", "note": ""}}}
    with pytest.raises(ValueError, match="verdict"):
        validate_review(r, {"a"})
```

- [ ] **Step 2: RED 확인** → **Step 3: 구현** (repo 판별: github.com/gitlab.aigov 링크 우선, link·case_url·mirror_url 순서) → **Step 4: GREEN** → **Step 5: 커밋** `feat: MCP 검증 원장 스키마·대상 추출`

---

### Task 2: check_mcp — 축 1 권한 표면 (자동)

**Files:**
- Create: `scripts/check_mcp.py`
- Test: `tests/test_check_mcp.py` (픽스처: `tests/fixtures/mcp_repo_*` 소형 저장소 디렉토리)

**Interfaces:**
- Produces: `scan_permission_surface(repo_dir) -> {"verdict", "note", "counts"}` — 소스에서 도구 등록·위험 호출 패턴을 센다

- [ ] **Step 1: 실패하는 테스트** — 픽스처 3종: ① 읽기 전용(requests.get만)→통과, ② subprocess/shell=True 존재→주의(노트에 '셸 실행 도구' 명시), ③ open(...,'w')+광범위 글롭→주의
- [ ] **Step 2: RED** → **Step 3: 구현**

```python
RISK_PATTERNS = {
    "shell": re.compile(r"subprocess|child_process|execSync|os\.system|shell=True"),
    "fs_write": re.compile(r"open\([^)]*['\"]w|writeFile|fs\.write|shutil\.rmtree"),
    "network": re.compile(r"requests\.|fetch\(|axios|urllib|httpx"),
}
def scan_permission_surface(repo_dir: Path) -> dict:
    counts = {k: 0 for k in RISK_PATTERNS}
    for f in iter_source_files(repo_dir):  # .py .js .ts .mjs, node_modules·.git 제외
        text = f.read_text(errors="ignore")
        for k, pat in RISK_PATTERNS.items():
            counts[k] += len(pat.findall(text))
    if counts["shell"]:
        return {"verdict": "주의", "note": f"셸 실행 패턴 {counts['shell']}건 — 도구 목적 대비 검토 필요", "counts": counts}
    if counts["fs_write"]:
        return {"verdict": "주의", "note": f"파일 쓰기 패턴 {counts['fs_write']}건", "counts": counts}
    return {"verdict": "통과", "note": "셸·쓰기 패턴 없음(네트워크 호출만)", "counts": counts}
```

- [ ] **Step 4: GREEN** → **Step 5: 커밋** `feat: check_mcp 권한 표면 스캔`

---

### Task 3: check_mcp — 축 2 시크릿 (자동)

- [ ] **Step 1: 실패하는 테스트** — ① AKIA·sk-실키 픽스처→심각(비공개 처리 중) + note는 "자격증명 패턴 발견(상세 비공개)"만, ② `.env` 커밋→주의, ③ 플레이스홀더(`YOUR_API_KEY`)만→통과. **테스트가 note에 키 원문이 없음을 검증**
- [ ] **Step 2: RED** → **Step 3: 구현**

```python
SECRET_PATTERNS = [
    re.compile(r"AKIA[0-9A-Z]{16}"), re.compile(r"sk-[A-Za-z0-9]{32,}"),
    re.compile(r"ghp_[A-Za-z0-9]{36}"), re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"AIza[0-9A-Za-z_\-]{35}"),
]
PLACEHOLDER = re.compile(r"YOUR_|EXAMPLE|<[A-Z_]+>|xxxx", re.I)
# 발견 시: 공개 note에는 종류·개수만. 파일·매치 상세는 data/private/mcp_findings/<case_id>.md 에 기록
```

- [ ] **Step 4: GREEN** → **Step 5: 커밋** `feat: check_mcp 시크릿 스캔 — 상세 비공개 분리`

---

### Task 4: check_mcp — 축 3 공급망 (자동)

- [ ] **Step 1: 실패하는 테스트** — subprocess를 monkeypatch로 모킹: ① npm audit JSON(critical 1·high 2)→주의("High+ CVE 3건"), ② pip-audit 클린→통과, ③ audit 도구 없음(FileNotFoundError)→미검증("도구 없음"), ④ 락파일 부재→주의 병기
- [ ] **Step 2: RED** → **Step 3: 구현** — package.json 있으면 `npm audit --json --package-lock-only`(락 없으면 생성 시도 없이 '락파일 없음' 주의), pyproject/requirements 있으면 `pip-audit -r … --format json`. 두 생태계 모두 없으면 "해당 없음"
- [ ] **Step 4: GREEN** → **Step 5: 커밋** `feat: check_mcp 공급망 감사`

---

### Task 5: check_mcp — 클론·병합·CLI

**Interfaces:**
- Produces: `python3 scripts/check_mcp.py [--case <id>] [--audit-only]` — 대상 순회: shallow clone(`git clone --depth 1`, gitlab.aigov는 `-c http.sslVerify=false`) → 축 1~3 실행 → 원장 병합(기존 injection/data_flow/hygiene·disclosure 보존) → 임시 디렉토리 삭제. `--audit-only`는 축 3만 갱신(주간용)

- [ ] **Step 1: 실패하는 테스트** — ① 병합이 기존 LLM 축·disclosure를 보존, ② clone 실패 시 전축 "미검증(저장소 접근 불가)", ③ repo=None(원격 MCP) 시 축 1·2 "해당 없음(코드 비공개)", ④ checked_at·tools 버전 기록
- [ ] **Step 2: RED** → **Step 3: 구현** (tempfile.TemporaryDirectory, hygiene 축은 cases.json의 license/maintenance/mcp_official에서 자동 도출) → **Step 4: GREEN** → **Step 5: 커밋** `feat: check_mcp 오케스트레이터`

---

### Task 6: build_mcp_review — 공개 필터·요약 (핵심 게이트)

**Files:**
- Create: `scripts/build_mcp_review.py`
- Test: `tests/test_build_mcp_review.py`

- [ ] **Step 1: 실패하는 테스트(핵심)**

```python
def test_unresolved_disclosure_masked(tmp_path):
    ledger = {"reviews": [{"case_id": "a", "overall": "심각(비공개 처리 중)",
        "axes": {"secrets": {"verdict": "심각(비공개 처리 중)", "note": "이 노트는 나가면 안 됨"}},
        "disclosure": {"notified_at": "2026-08-29", "resolved": False}}]}
    out = build_public(ledger)
    ax = out["reviews"][0]["axes"]["secrets"]
    assert ax["note"] == "비공개 처리 중 — 개발자에게 통보되었습니다"
    assert "나가면 안 됨" not in json.dumps(out, ensure_ascii=False)

def test_summary_counts():  # 양호/주의/부분 검증 집계 + 최다 주의 축
    ...
```

- [ ] **Step 2: RED** → **Step 3: 구현** — overall 산정 규칙(스펙 §2)도 여기서 재계산해 원장 값과 불일치 시 에러(이중 검증). 출력: site/data/mcp-review.json {generated_at, summary, reviews(공개 필드만)}
- [ ] **Step 4: GREEN** → **Step 5: 커밋** `feat: build_mcp_review — disclosure 마스킹 강제`

---

### Task 7: MCP 검증 페이지 (site/mcp-review.html/js)

- [ ] **Step 1: HTML 골격** — 2줄 메뉴(기존 복사), 80vw, 방법론 헤더(6축 설명·"미검증≠위험"·disclosure 정책·기관 자체 보안성 검토 면책), 요약 카드 4개, 매트릭스 `<table>`(행=사례, 열=6축+동적+종합), 로드 실패 안내
- [ ] **Step 2: JS 렌더** — mcp-review.json fetch, 판정 배지(색+텍스트 병기 — 색맹 대비), 사례 링크 `case/<id>.html`, 종합 등급→스타 정렬, gap-map.js의 el() 패턴 재사용
- [ ] **Step 3: node --check** → 커밋 `feat: MCP 검증 매트릭스 페이지`

---

### Task 8: 메뉴·사례 배지 연동

- [ ] **Step 1: 전 화면 내부 메뉴에 "MCP 검증" 추가** — connections 계획과 동일 요령(`grep -c` 검증), build_case_pages 템플릿 포함
- [ ] **Step 2: build_case_pages 배지** — mcp-review.json에 있는 사례면 "MCP 검증: <종합> (<checked_at>)" 배지 + mcp-review.html 링크. 없으면 표시 없음
- [ ] **Step 3: 재생성·커밋** `feat: MCP 검증 메뉴·사례 배지`

---

### Task 9: LLM 감사 절차서 + 운영 편입

**Files:**
- Create: `scripts/mcp_audit_prompt.md` — 축 4·5 감사 절차: 검토 파일 우선순위(도구 핸들러→외부 호출→입력 경로), 판정 기준표, 기록 형식(근거 파일·행 필수, 악용 상세는 private 경로), disclosure 발동 조건·통보 문안 템플릿
- Modify: `scripts/collect_prompt.md` — 4단계에 "신규 MCP 사례면 check_mcp --case + LLM 감사(mcp_audit_prompt.md) 수행", 5단계 파이프라인에 build_mcp_review 삽입(build_eval_data 뒤), 주간 점검에 `check_mcp.py --audit-only`
- [ ] 작성 → 커밋 `docs: MCP 감사 절차·수집 편입`

---

### Task 10: 전수 백필 (절차 태스크)

- [ ] **Step 1: 자동 축 백필** — `python3 scripts/check_mcp.py` 전수 실행(약 30건, 클론 포함 ~20분). 실패 목록 정리
- [ ] **Step 2: LLM 감사 백필** — 세션에서 mcp_audit_prompt.md 절차로 전수 감사(사례당 핵심 파일 열람, 근거 기록). 심각 발견 시 사용자에게 보고 후 disclosure 절차 개시(개발자 통보는 사용자 승인 후)
- [ ] **Step 3: 선별 동적 검사** — 기관 제공·스타 30+·원격 MCP 대상 Inspector `tools/list` 대조, dynamic 필드 기록
- [ ] **Step 4: build_mcp_review → 페이지 확인 → 커밋** `feat: MCP 검증 백필 — n건`

---

### Task 11: 배포·검증

- [ ] 전체 pytest·node --check → 파이프라인 1회 완주 → 커밋·양 브랜치 푸시 → 배포 검증 루프 → 라이브 mcp-review.html·mcp-review.json 확인 → log.md 기록(검증 n건, 양호/주의 분포, 최다 주의 축)

---

## 실행 순서·의존성

```
Task 1 ─→ Task 2 ─→ Task 3 ─→ Task 4 ─→ Task 5 ─→ Task 6 ─→ Task 7 ─→ Task 8 ─┐
                                                    Task 9 (Task 5 이후 언제든) ├─→ Task 10 ─→ Task 11
```

Task 2~4는 순서 무관(같은 파일이라 순차 권장). 백필(10)은 코드 완성 후 일괄.
심각 발견 시 disclosure(개발자 통보)는 **사용자 승인 게이트**를 거친다 — 자동 발송 금지.
