# PAX 공공AX 사례 아카이브 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Threads 공공AX 태그와 카카오톡 오픈채팅 "공공AX 네트워크"에서 공공AX 사례를 매일 수집·선별·요약해 GitHub Pages 정적 사이트로 제공한다.

**Architecture:** AI 세션(수집·판단·요약)과 결정적 Python 스크립트(검증·병합·배포)를 분리한다. 스크립트는 stdlib만 사용하는 순수 함수 중심으로 작성하고, `data/cases.json`은 append-only로만 갱신한다. 사이트는 빌드 없는 정적 HTML/CSS/JS다.

**Tech Stack:** Python 3.11+ (stdlib only), pytest, 순수 HTML/CSS/JS, GitHub Pages (Actions 정적 배포), Claude Code 크론 + claude-in-chrome + kakaotalk-mac 스킬

## Global Constraints

- Python 3.11+, 외부 패키지 금지 (테스트만 pytest 사용)
- 모든 데이터 처리 함수는 입력을 변형하지 않는다 (immutability — 새 객체 반환)
- `data/cases.json`은 append-only: 기존 항목 수정·삭제 금지
- `data/raw/`, `data/state.json`, `data/incoming/`, `data/rejected/`는 커밋 금지 (.gitignore)
- 공개 산출물(cases.json, 사이트)에 닉네임·원문 인용·연락처 미포함
- 파일당 800줄 이하, 함수당 50줄 이하
- 사이트 UI는 한국어, 모바일 반응형, 라이트/다크 테마
- 커밋 메시지: `<type>: <description>` (feat/fix/docs/test/chore)

## File Structure

```
PAX/
├── .gitignore
├── config/rooms.json              # 수집 대상 (Threads 쿼리, 카카오 방 목록)
├── data/cases.json                # 공개 사례 데이터 (append-only, 커밋됨)
│   └── (raw/, incoming/, rejected/, state.json — 로컬 전용, 커밋 금지)
├── scripts/
│   ├── pax/__init__.py
│   ├── pax/schema.py              # 사례 스키마 검증
│   ├── pax/privacy.py             # 익명화/개인정보 검사
│   ├── pax/merge.py               # id 부여, 중복 제거, append-only 병합 (CLI)
│   ├── pax/publish.py             # cases.json → site/data/ 복사 (CLI)
│   └── collect_prompt.md          # 매일 크론 세션이 따르는 수집 절차서
├── site/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── data/cases.json            # publish가 복사 (커밋됨)
├── tests/
│   ├── conftest.py
│   ├── test_schema.py
│   ├── test_privacy.py
│   ├── test_merge.py
│   └── test_publish.py
└── .github/workflows/pages.yml    # site/ 를 GitHub Pages로 배포
```

---

### Task 1: 프로젝트 뼈대 + 스키마 검증 (`pax/schema.py`)

**Files:**
- Create: `.gitignore`, `config/rooms.json`, `data/cases.json`, `scripts/pax/__init__.py`, `scripts/pax/schema.py`
- Test: `tests/conftest.py`, `tests/test_schema.py`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `validate_case(case: dict) -> list[str]` — 오류 메시지 목록, 빈 리스트면 유효
  - 상수 `REQUIRED_FIELDS: frozenset[str]`, `SOURCES: frozenset[str]`, `ORG_TYPES: frozenset[str]`
  - `tests/conftest.py`의 `make_case(**overrides) -> dict` 픽스처 헬퍼 (모든 테스트가 사용)

- [ ] **Step 1: 뼈대 파일 생성**

`.gitignore`:
```
__pycache__/
.pytest_cache/
data/raw/
data/incoming/
data/rejected/
data/state.json
log.md
```

`config/rooms.json`:
```json
{
  "threads": [{ "type": "tag_search", "query": "공공AX" }],
  "kakao_rooms": ["공공AX 네트워크"]
}
```

`data/cases.json`:
```json
{
  "updated_at": null,
  "cases": []
}
```

`scripts/pax/__init__.py`: 빈 파일.

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/conftest.py`:
```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))


def make_case(**overrides) -> dict:
    base = {
        "id": "a" * 16,
        "date": "2026-08-05",
        "collected_at": "2026-08-06",
        "source": "threads",
        "link": "https://www.threads.com/@user/post/abc",
        "org": "서울시",
        "org_type": "지자체",
        "title": "AI 민원 상담 챗봇 도입",
        "summary": "서울시가 민원 응대에 LLM 기반 챗봇을 도입해 상담 대기 시간을 줄였다.",
        "tags": ["민원", "LLM"],
    }
    return {**base, **overrides}
```

`tests/test_schema.py`:
```python
from conftest import make_case
from pax.schema import validate_case


def test_valid_case_passes():
    assert validate_case(make_case()) == []


def test_missing_required_field_rejected():
    case = make_case()
    del case["org"]
    errors = validate_case(case)
    assert any("org" in e for e in errors)


def test_unknown_source_rejected():
    errors = validate_case(make_case(source="blog"))
    assert any("source" in e for e in errors)


def test_kakao_case_must_not_have_link():
    errors = validate_case(make_case(source="kakao", link="https://example.com"))
    assert any("link" in e for e in errors)


def test_kakao_case_with_null_link_passes():
    assert validate_case(make_case(source="kakao", link=None)) == []


def test_threads_link_must_be_threads_url():
    errors = validate_case(make_case(link="https://example.com/post/1"))
    assert any("link" in e for e in errors)


def test_bad_date_format_rejected():
    errors = validate_case(make_case(date="2026/08/05"))
    assert any("date" in e for e in errors)


def test_unknown_org_type_rejected():
    errors = validate_case(make_case(org_type="사기업"))
    assert any("org_type" in e for e in errors)


def test_empty_tags_rejected():
    errors = validate_case(make_case(tags=[]))
    assert any("tags" in e for e in errors)


def test_empty_summary_rejected():
    errors = validate_case(make_case(summary="  "))
    assert any("summary" in e for e in errors)
```

- [ ] **Step 3: 실패 확인**

Run: `cd /Users/jonghongjeon/git/PAX && python3 -m pytest tests/test_schema.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'pax.schema'`)

- [ ] **Step 4: 최소 구현**

`scripts/pax/schema.py`:
```python
"""공개 사례(case) 스키마 검증. 오류 메시지 리스트를 반환한다 (빈 리스트 = 유효)."""
import re

REQUIRED_FIELDS = frozenset(
    ["id", "date", "collected_at", "source", "link", "org",
     "org_type", "title", "summary", "tags"]
)
SOURCES = frozenset(["threads", "kakao"])
ORG_TYPES = frozenset(["중앙부처", "지자체", "공공기관", "교육", "기타"])

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_THREADS_LINK_RE = re.compile(r"^https://www\.threads\.(com|net)/")


def validate_case(case: dict) -> list[str]:
    errors = []
    missing = REQUIRED_FIELDS - case.keys()
    for field in sorted(missing):
        errors.append(f"필수 필드 누락: {field}")
    if missing:
        return errors

    if case["source"] not in SOURCES:
        errors.append(f"알 수 없는 source: {case['source']}")
    elif case["source"] == "kakao":
        if case["link"] is not None:
            errors.append("kakao 사례는 link가 null이어야 합니다")
    else:  # threads
        if not isinstance(case["link"], str) or not _THREADS_LINK_RE.match(case["link"]):
            errors.append("threads 사례의 link는 threads.com/net URL이어야 합니다")

    for field in ("date", "collected_at"):
        if not isinstance(case[field], str) or not _DATE_RE.match(case[field]):
            errors.append(f"{field}는 YYYY-MM-DD 형식이어야 합니다")

    if case["org_type"] not in ORG_TYPES:
        errors.append(f"알 수 없는 org_type: {case['org_type']}")

    for field in ("org", "title", "summary"):
        if not isinstance(case[field], str) or not case[field].strip():
            errors.append(f"{field}는 비어 있지 않은 문자열이어야 합니다")

    tags = case["tags"]
    if (not isinstance(tags, list) or not tags
            or not all(isinstance(t, str) and t.strip() for t in tags)):
        errors.append("tags는 비어 있지 않은 문자열 리스트여야 합니다")

    if not isinstance(case["id"], str) or not re.match(r"^[0-9a-f]{16}$", case["id"]):
        errors.append("id는 16자리 소문자 16진수여야 합니다")

    return errors
```

- [ ] **Step 5: 통과 확인**

Run: `python3 -m pytest tests/test_schema.py -v`
Expected: 전부 PASS

- [ ] **Step 6: Commit**

```bash
git add .gitignore config data/cases.json scripts tests
git commit -m "feat: 프로젝트 뼈대 및 사례 스키마 검증 추가"
```

---

### Task 2: 익명화/개인정보 검사 (`pax/privacy.py`)

**Files:**
- Create: `scripts/pax/privacy.py`
- Test: `tests/test_privacy.py`

**Interfaces:**
- Consumes: `tests/conftest.py`의 `make_case`
- Produces: `find_privacy_issues(case: dict) -> list[str]` — 문제 목록, 빈 리스트면 통과. Task 3의 merge가 validate_case와 함께 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_privacy.py`:
```python
from conftest import make_case
from pax.privacy import find_privacy_issues


def test_clean_case_passes():
    assert find_privacy_issues(make_case()) == []


def test_phone_number_flagged():
    case = make_case(summary="문의는 010-1234-5678로 하라는 안내가 있었다.")
    assert any("전화번호" in i for i in find_privacy_issues(case))


def test_email_flagged():
    case = make_case(summary="담당자 hong@korea.kr 앞으로 신청을 받는다.")
    assert any("이메일" in i for i in find_privacy_issues(case))


def test_chat_nickname_pattern_flagged():
    case = make_case(summary="홍길동님: 우리 기관은 챗봇을 도입했습니다.")
    assert any("닉네임" in i for i in find_privacy_issues(case))


def test_kakao_export_line_flagged():
    case = make_case(summary="[홍길동] [오후 2:31] 사례 공유합니다.")
    assert any("닉네임" in i for i in find_privacy_issues(case))


def test_direct_quote_flagged():
    case = make_case(summary="담당자는 “예산이 부족하다”라고 말했다.")
    assert any("인용" in i for i in find_privacy_issues(case))


def test_overlong_summary_flagged():
    case = make_case(summary="가" * 301)
    assert any("길이" in i for i in find_privacy_issues(case))
```

- [ ] **Step 2: 실패 확인**

Run: `python3 -m pytest tests/test_privacy.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'pax.privacy'`)

- [ ] **Step 3: 최소 구현**

`scripts/pax/privacy.py`:
```python
"""공개 전 익명화 검사. 요약·제목에 개인정보/원문 흔적이 있으면 문제 목록을 반환한다."""
import re

MAX_SUMMARY_LEN = 300

_PHONE_RE = re.compile(r"01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_NICKNAME_RE = re.compile(r"\S{2,10}님\s*:")          # "홍길동님:" 채팅 붙여넣기
_KAKAO_EXPORT_RE = re.compile(r"^\[[^\]]{1,20}\]\s*\[")  # "[닉네임] [오후 2:31]"
_QUOTE_CHARS = ("“", "”", "「", "」")


def find_privacy_issues(case: dict) -> list[str]:
    issues = []
    text = f"{case.get('title', '')}\n{case.get('summary', '')}"

    if _PHONE_RE.search(text):
        issues.append("전화번호 패턴이 포함되어 있습니다")
    if _EMAIL_RE.search(text):
        issues.append("이메일 주소가 포함되어 있습니다")
    if _NICKNAME_RE.search(text) or _KAKAO_EXPORT_RE.search(case.get("summary", "")):
        issues.append("채팅 닉네임 패턴이 포함되어 있습니다")
    if any(ch in text for ch in _QUOTE_CHARS):
        issues.append("직접 인용 부호가 포함되어 있습니다 (요약으로 재작성 필요)")
    if len(case.get("summary", "")) > MAX_SUMMARY_LEN:
        issues.append(f"summary 길이 초과 (최대 {MAX_SUMMARY_LEN}자)")

    return issues
```

- [ ] **Step 4: 통과 확인**

Run: `python3 -m pytest tests/test_privacy.py tests/test_schema.py -v`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/pax/privacy.py tests/test_privacy.py
git commit -m "feat: 공개 전 익명화/개인정보 검사 추가"
```

---

### Task 3: 병합 파이프라인 (`pax/merge.py`)

**Files:**
- Create: `scripts/pax/merge.py`
- Test: `tests/test_merge.py`

**Interfaces:**
- Consumes: `validate_case` (Task 1), `find_privacy_issues` (Task 2)
- Produces:
  - `normalize_text(text: str) -> str` — NFC 정규화 + 공백 축약
  - `make_id(source: str, raw_text: str) -> str` — sha256 앞 16자리
  - `prepare_candidate(cand: dict) -> dict` — `raw_text`로 id를 계산해 채우고 `raw_text` 키를 제거한 **새** dict 반환
  - `merge_cases(existing_doc: dict, candidates: list[dict], updated_at: str) -> tuple[dict, list[dict]]` — (새 문서, 거부 목록). 입력 불변.
  - CLI: `python3 -m pax.merge <incoming.json>` — `data/cases.json` 갱신, 거부분은 `data/rejected/<incoming 파일명>` 저장
  - 후보(incoming) JSON 형식: 사례 dict의 리스트. 각 dict는 스키마 필드 중 `id` 대신 `raw_text`(원문, 해시용)를 가진다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_merge.py`:
```python
import copy
import json
import subprocess
import sys
from pathlib import Path

from conftest import make_case
from pax.merge import make_id, merge_cases, normalize_text, prepare_candidate


def make_candidate(**overrides) -> dict:
    cand = make_case(**overrides)
    del cand["id"]
    cand.setdefault("raw_text", "서울시 챗봇 도입 원문 텍스트")
    return cand


def test_normalize_collapses_whitespace_and_nfc():
    assert normalize_text("  안녕\n\n세상  ") == "안녕 세상"


def test_make_id_deterministic_and_format():
    a = make_id("threads", "원문  텍스트")
    b = make_id("threads", "원문 텍스트")   # 공백 차이는 무시
    assert a == b and len(a) == 16 and int(a, 16) >= 0


def test_make_id_differs_by_source():
    assert make_id("threads", "같은 글") != make_id("kakao", "같은 글")


def test_prepare_candidate_fills_id_and_strips_raw_text():
    cand = make_candidate()
    prepared = prepare_candidate(cand)
    assert prepared["id"] == make_id(cand["source"], cand["raw_text"])
    assert "raw_text" not in prepared
    assert "raw_text" in cand  # 입력 불변


def test_merge_appends_valid_candidate():
    doc = {"updated_at": None, "cases": []}
    new_doc, rejected = merge_cases(doc, [make_candidate()], "2026-08-06T09:00:00+09:00")
    assert len(new_doc["cases"]) == 1 and rejected == []
    assert new_doc["updated_at"] == "2026-08-06T09:00:00+09:00"


def test_merge_is_append_only_and_immutable():
    existing = make_case(id=make_id("threads", "기존 글"))
    doc = {"updated_at": "old", "cases": [existing]}
    snapshot = copy.deepcopy(doc)
    new_doc, _ = merge_cases(doc, [make_candidate()], "now")
    assert doc == snapshot                     # 입력 불변
    assert new_doc["cases"][0] == existing     # 기존 항목 보존


def test_merge_skips_duplicate_of_existing():
    cand = make_candidate(raw_text="같은 원문")
    doc = {"updated_at": None, "cases": [prepare_candidate(cand)]}
    new_doc, rejected = merge_cases(doc, [make_candidate(raw_text="같은  원문")], "now")
    assert len(new_doc["cases"]) == 1 and rejected == []


def test_merge_skips_duplicate_within_batch():
    doc = {"updated_at": None, "cases": []}
    cands = [make_candidate(raw_text="한 글"), make_candidate(raw_text="한  글")]
    new_doc, _ = merge_cases(doc, cands, "now")
    assert len(new_doc["cases"]) == 1


def test_merge_rejects_invalid_candidate():
    doc = {"updated_at": None, "cases": []}
    bad = make_candidate(org_type="사기업")
    new_doc, rejected = merge_cases(doc, [bad], "now")
    assert new_doc["cases"] == [] and len(rejected) == 1
    assert rejected[0]["errors"]


def test_merge_rejects_privacy_violation():
    doc = {"updated_at": None, "cases": []}
    bad = make_candidate(summary="문의: 010-1234-5678")
    _, rejected = merge_cases(doc, [bad], "now")
    assert len(rejected) == 1


def test_cli_merges_incoming_file(tmp_path):
    root = tmp_path
    (root / "data").mkdir()
    (root / "data" / "cases.json").write_text(
        json.dumps({"updated_at": None, "cases": []}), encoding="utf-8")
    incoming = root / "incoming.json"
    incoming.write_text(json.dumps([make_candidate()], ensure_ascii=False),
                        encoding="utf-8")
    scripts_dir = Path(__file__).resolve().parent.parent / "scripts"
    result = subprocess.run(
        [sys.executable, "-m", "pax.merge", str(incoming)],
        cwd=root, capture_output=True, text=True,
        env={"PYTHONPATH": str(scripts_dir), "PATH": "/usr/bin:/bin"},
    )
    assert result.returncode == 0, result.stderr
    saved = json.loads((root / "data" / "cases.json").read_text(encoding="utf-8"))
    assert len(saved["cases"]) == 1
```

- [ ] **Step 2: 실패 확인**

Run: `python3 -m pytest tests/test_merge.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'pax.merge'`)

- [ ] **Step 3: 최소 구현**

`scripts/pax/merge.py`:
```python
"""후보 사례를 검증·중복 제거 후 data/cases.json에 append-only로 병합한다.

사용법: python3 -m pax.merge <incoming.json>   (repo 루트에서 실행)
incoming 형식: 사례 dict 리스트. 각 dict는 `id` 대신 `raw_text`(해시용 원문)를 가진다.
"""
import datetime
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

from pax.privacy import find_privacy_issues
from pax.schema import validate_case

CASES_PATH = Path("data/cases.json")
REJECTED_DIR = Path("data/rejected")


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text)).strip()


def make_id(source: str, raw_text: str) -> str:
    digest = hashlib.sha256(f"{source}:{normalize_text(raw_text)}".encode())
    return digest.hexdigest()[:16]


def prepare_candidate(cand: dict) -> dict:
    prepared = {k: v for k, v in cand.items() if k != "raw_text"}
    prepared["id"] = make_id(cand.get("source", ""), cand.get("raw_text", ""))
    return prepared


def merge_cases(existing_doc: dict, candidates: list[dict],
                updated_at: str) -> tuple[dict, list[dict]]:
    seen_ids = {c["id"] for c in existing_doc["cases"]}
    accepted, rejected = [], []
    for cand in candidates:
        prepared = prepare_candidate(cand)
        errors = validate_case(prepared) + find_privacy_issues(prepared)
        if errors:
            rejected.append({"case": cand, "errors": errors})
            continue
        if prepared["id"] in seen_ids:
            continue
        seen_ids.add(prepared["id"])
        accepted.append(prepared)
    new_doc = {"updated_at": updated_at,
               "cases": [*existing_doc["cases"], *accepted]}
    return new_doc, rejected


def main() -> int:
    if len(sys.argv) != 2:
        print("사용법: python3 -m pax.merge <incoming.json>", file=sys.stderr)
        return 2
    incoming_path = Path(sys.argv[1])
    candidates = json.loads(incoming_path.read_text(encoding="utf-8"))
    existing_doc = json.loads(CASES_PATH.read_text(encoding="utf-8"))

    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
    new_doc, rejected = merge_cases(existing_doc, candidates, now.isoformat(timespec="seconds"))

    CASES_PATH.write_text(
        json.dumps(new_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if rejected:
        REJECTED_DIR.mkdir(parents=True, exist_ok=True)
        out = REJECTED_DIR / incoming_path.name
        out.write_text(json.dumps(rejected, ensure_ascii=False, indent=2),
                       encoding="utf-8")
        print(f"거부 {len(rejected)}건 → {out}")
    added = len(new_doc["cases"]) - len(existing_doc["cases"])
    print(f"신규 {added}건 병합, 총 {len(new_doc['cases'])}건")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: 통과 확인**

Run: `python3 -m pytest tests/ -v`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/pax/merge.py tests/test_merge.py
git commit -m "feat: 후보 사례 병합 파이프라인(검증·중복제거·append-only) 추가"
```

---

### Task 4: 사이트 데이터 동기화 (`pax/publish.py`)

**Files:**
- Create: `scripts/pax/publish.py`
- Test: `tests/test_publish.py`

**Interfaces:**
- Consumes: `data/cases.json` (Task 3이 갱신)
- Produces:
  - `sync_site_data(src: Path, dst: Path) -> None` — src를 dst로 복사 (디렉토리 자동 생성)
  - CLI: `python3 -m pax.publish` — `data/cases.json` → `site/data/cases.json`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_publish.py`:
```python
import json
from pathlib import Path

from pax.publish import sync_site_data


def test_sync_copies_and_creates_dirs(tmp_path):
    src = tmp_path / "data" / "cases.json"
    src.parent.mkdir()
    src.write_text(json.dumps({"updated_at": None, "cases": []}), encoding="utf-8")
    dst = tmp_path / "site" / "data" / "cases.json"
    sync_site_data(src, dst)
    assert dst.exists()
    assert dst.read_text(encoding="utf-8") == src.read_text(encoding="utf-8")


def test_sync_overwrites_existing_dst(tmp_path):
    src = tmp_path / "cases.json"
    src.write_text("new", encoding="utf-8")
    dst = tmp_path / "site" / "cases.json"
    dst.parent.mkdir()
    dst.write_text("old", encoding="utf-8")
    sync_site_data(src, dst)
    assert dst.read_text(encoding="utf-8") == "new"
```

- [ ] **Step 2: 실패 확인**

Run: `python3 -m pytest tests/test_publish.py -v`
Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: 최소 구현**

`scripts/pax/publish.py`:
```python
"""data/cases.json을 site/data/cases.json으로 복사한다 (Pages 배포용)."""
import shutil
import sys
from pathlib import Path


def sync_site_data(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)


def main() -> int:
    src = Path("data/cases.json")
    dst = Path("site/data/cases.json")
    if not src.exists():
        print(f"원본 없음: {src}", file=sys.stderr)
        return 1
    sync_site_data(src, dst)
    print(f"{src} → {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: 통과 확인**

Run: `python3 -m pytest tests/ -v`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/pax/publish.py tests/test_publish.py
git commit -m "feat: 사이트 데이터 동기화 스크립트 추가"
```

---

### Task 5: 정적 사이트 (`site/`)

**Files:**
- Create: `site/index.html`, `site/style.css`, `site/app.js`

**Interfaces:**
- Consumes: `site/data/cases.json` (Task 4의 sync 결과, Task 3의 문서 형식)
- Produces: 완성된 공개 페이지. 이후 태스크는 이 디렉토리를 그대로 배포한다.

**구현 요구사항** (frontend-design 수준의 완성도로 구현하되 아래를 만족할 것):

- 순수 HTML/CSS/JS, 외부 CDN·폰트·라이브러리 금지 (Pages에서 자체 호스팅)
- `fetch('./data/cases.json')` 로드 → 최신순(date 내림차순, 동률이면 collected_at) 카드 목록
- 헤더: 사이트명 "공공AX 사례 아카이브", 설명 한 줄, 통계(전체 사례 수 · 최근 갱신일)
- 컨트롤 바: 키워드 검색 입력(제목·요약·기관·태그 대상, 입력 즉시 필터링),
  기관유형 필터(전체/중앙부처/지자체/공공기관/교육/기타), 출처 필터(전체/Threads/오픈채팅)
- 카드: 제목, 요약, 기관명 + 기관유형 배지, 태그 칩, 날짜,
  Threads면 "원문 보기 ↗" 링크(새 탭, `rel="noopener"`), kakao면 "출처: 오픈채팅" 배지
- 태그 칩 클릭 시 해당 태그로 필터링 (다시 클릭하면 해제)
- 결과 0건이면 "조건에 맞는 사례가 없습니다" 빈 상태 표시
- fetch 실패 시 "데이터를 불러오지 못했습니다" 오류 상태 표시 (콘솔에 상세 로그)
- `prefers-color-scheme` 기반 라이트/다크, 모바일(360px)~데스크톱 반응형 (CSS Grid)
- XSS 방지: 데이터는 반드시 `textContent`로 삽입, innerHTML에 데이터 문자열 연결 금지
- `<html lang="ko">`, 시맨틱 태그(header/main/article), 필터 컨트롤에 `<label>` 연결

- [ ] **Step 1: 미리보기용 샘플 데이터 생성**

`site/data/cases.json` (임시 샘플 — 실수집 후 덮어써짐):
```json
{
  "updated_at": "2026-08-06T09:00:00+09:00",
  "cases": [
    {
      "id": "0000000000000001",
      "date": "2026-08-05",
      "collected_at": "2026-08-06",
      "source": "threads",
      "link": "https://www.threads.com/@sample/post/sample1",
      "org": "서울특별시",
      "org_type": "지자체",
      "title": "민원 상담에 LLM 챗봇 도입",
      "summary": "서울시가 120 다산콜 민원 상담 일부에 LLM 기반 챗봇을 도입해 야간 응대를 자동화했다. 반복 민원의 응답 시간이 크게 줄었다는 평가다.",
      "tags": ["민원", "LLM", "챗봇"]
    },
    {
      "id": "0000000000000002",
      "date": "2026-08-04",
      "collected_at": "2026-08-06",
      "source": "kakao",
      "link": null,
      "org": "행정안전부",
      "org_type": "중앙부처",
      "title": "공문서 초안 작성 AI 시범 운영",
      "summary": "행정안전부가 내부 보고서와 공문서 초안 작성을 돕는 생성형 AI 도구를 일부 부서에서 시범 운영 중이라는 사례가 공유됐다.",
      "tags": ["문서자동화", "생성형AI"]
    }
  ]
}
```

- [ ] **Step 2: index.html / style.css / app.js 구현**

위 요구사항 전체를 구현한다. 뼈대 (구조 고정, 스타일·세부는 요구사항 준수 하에 재량):

`site/index.html`:
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>공공AX 사례 아카이브</title>
  <meta name="description" content="Threads와 오픈채팅에서 수집한 공공기관 AI 전환(AX) 사례 모음">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="site-header">
    <h1>공공AX 사례 아카이브</h1>
    <p class="tagline">Threads · 오픈채팅에서 매일 수집한 공공기관 AI 전환 사례</p>
    <p class="stats" id="stats" aria-live="polite"></p>
  </header>
  <main>
    <section class="controls" aria-label="검색 및 필터">
      <label>검색 <input type="search" id="search" placeholder="제목·요약·기관·태그 검색"></label>
      <label>기관유형 <select id="org-type-filter"></select></label>
      <label>출처 <select id="source-filter"></select></label>
    </section>
    <section id="active-tag" class="active-tag" hidden></section>
    <section id="case-list" class="case-list" aria-label="사례 목록"></section>
    <p id="empty-state" class="empty-state" hidden>조건에 맞는 사례가 없습니다</p>
    <p id="error-state" class="empty-state" hidden>데이터를 불러오지 못했습니다</p>
  </main>
  <footer class="site-footer">
    <p>요약은 AI가 재작성한 것으로 원문과 다를 수 있습니다. 오픈채팅 사례는 작성자 보호를 위해 원문을 공개하지 않습니다.</p>
  </footer>
  <script src="app.js"></script>
</body>
</html>
```

`site/app.js` 핵심 로직 (전체 상태를 하나의 불변 filter 객체로 관리):
```javascript
const state = { cases: [], filter: { q: '', orgType: '전체', source: '전체', tag: null } };

async function load() {
  try {
    const res = await fetch('./data/cases.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    state.cases = [...doc.cases].sort((a, b) =>
      (b.date + b.collected_at).localeCompare(a.date + a.collected_at));
    renderStats(doc.updated_at, state.cases.length);
    buildFilterOptions(state.cases);
    render();
  } catch (err) {
    console.error('cases.json 로드 실패:', err);
    document.getElementById('error-state').hidden = false;
  }
}

function matches(c, f) {
  if (f.orgType !== '전체' && c.org_type !== f.orgType) return false;
  if (f.source !== '전체' && c.source !== (f.source === 'Threads' ? 'threads' : 'kakao')) return false;
  if (f.tag && !c.tags.includes(f.tag)) return false;
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  return [c.title, c.summary, c.org, ...c.tags].join(' ').toLowerCase().includes(q);
}
// render(): case-list를 비우고 matches 통과 사례마다 카드 DOM을 생성
// (모든 텍스트는 textContent로 주입), 0건이면 empty-state 표시.
// 카드 구성: <article> 제목, 배지(org_type)+기관명, 요약, 태그 버튼들, 날짜,
//            threads → <a href=link target="_blank" rel="noopener">원문 보기 ↗</a>
//            kakao   → <span class="badge">출처: 오픈채팅</span>
```

- [ ] **Step 3: 로컬 미리보기로 검증**

```bash
cd site && python3 -m http.server 8901 &
sleep 1 && curl -s http://localhost:8901/ | head -5
curl -s http://localhost:8901/data/cases.json | python3 -m json.tool > /dev/null && echo DATA_OK
```
브라우저(claude-in-chrome 사용 가능)로 http://localhost:8901 열어 확인:
샘플 2건 렌더링, 검색 "민원" → 1건, 기관유형 "중앙부처" → 1건, 출처 필터 동작,
태그 클릭 필터, 다크 모드(`prefers-color-scheme` 에뮬레이션), 360px 뷰포트.
확인 후 서버 종료: `kill %1`

- [ ] **Step 4: Commit**

```bash
git add site
git commit -m "feat: 공공AX 사례 아카이브 정적 사이트 구현"
```

---

### Task 6: 수집 절차서 (`scripts/collect_prompt.md`)

**Files:**
- Create: `scripts/collect_prompt.md`

**Interfaces:**
- Consumes: `config/rooms.json`, `python3 -m pax.merge`, `python3 -m pax.publish` (Task 1·3·4)
- Produces: 매일 크론 세션이 그대로 따르는 수집 절차 문서. Task 8의 크론 프롬프트가 이 파일을 참조한다.

- [ ] **Step 1: 절차서 작성**

`scripts/collect_prompt.md` 전문:
```markdown
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
- 로그인 화면이 나오면 이 소스는 건너뛰고 log에 "threads: 로그인 필요"를 기록한다.
- 페이지를 2~3회 스크롤하며 게시물별로 (원문 텍스트, 게시물 링크, 작성일)을 읽는다.
- state의 seen_ids에 있는 링크는 무시한다. 새 게시물만 raw 목록에 담는다.

## 2. 카카오톡 수집 (kakaotalk-mac 스킬)
- kakaotalk-mac 스킬을 로드하고 rooms.json의 각 방(예: "공공AX 네트워크")을 연다.
- 카카오톡이 실행 불가/미로그인이면 이 소스는 건너뛰고 log에 기록한다.
- last_read 이후의 메시지를 읽는다 (첫 실행이면 최근 3일 분량만).
- 메시지의 (텍스트, 표시된 날짜/시각)을 raw 목록에 담는다. 닉네임은 raw에만 저장한다.

## 3. 원본 저장
- 수집한 raw 목록을 data/raw/TODAY.json에 저장한다 (커밋 금지 경로).
- 수집 0건이면 4~6단계를 건너뛰고 7단계로 간다.

## 4. 사례 선별·구조화 (AI 판단)
raw 항목마다 판단한다 — **실제 공공AX 사례인가?**
- 포함: 특정 공공기관(중앙부처/지자체/공공기관/교육기관)이 AI를 도입·시범운영·계획한
  구체적 내용이 있는 글
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
python3 -m pax.merge data/incoming/TODAY.json
python3 -m pax.publish
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
```

- [ ] **Step 2: 절차서 정합성 점검**

절차서가 참조하는 경로·명령이 실제로 존재하는지 확인:
```bash
python3 -c "import json; json.load(open('config/rooms.json'))" && echo CONFIG_OK
PYTHONPATH=scripts python3 -m pax.merge 2>&1 | grep -q 사용법 && echo MERGE_CLI_OK
PYTHONPATH=scripts python3 -m pax.publish && echo PUBLISH_OK
```
Expected: CONFIG_OK, MERGE_CLI_OK, PUBLISH_OK (publish는 site/data 갱신 — git checkout으로 되돌리기)

- [ ] **Step 3: Commit**

```bash
git checkout site/data/cases.json
git add scripts/collect_prompt.md
git commit -m "docs: 일일 수집 절차서 추가"
```

---

### Task 7: GitHub repo 생성 + Pages 배포

**Files:**
- Create: `.github/workflows/pages.yml`, `README.md`

**Interfaces:**
- Consumes: `site/` (Task 5)
- Produces: 공개 URL `https://<owner>.github.io/PAX/` — Task 8 크론이 push하면 자동 재배포

- [ ] **Step 1: Pages 워크플로 작성**

`.github/workflows/pages.yml`:
```yaml
name: Deploy Pages
on:
  push:
    branches: [main]
    paths: [site/**]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site
      - id: deployment
        uses: actions/deploy-pages@v4
```

`README.md`: 프로젝트 한 줄 소개, 사이트 URL, 데이터 갱신 주기, 익명화 정책 요약,
로컬 테스트 방법(`PYTHONPATH=scripts python3 -m pytest tests/`) 를 담아 작성.

- [ ] **Step 2: repo 생성·푸시·Pages 활성화**

```bash
git add .github README.md && git commit -m "ci: GitHub Pages 배포 워크플로 추가"
gh repo create PAX --public --source . --push
gh api -X POST repos/{owner}/PAX/pages -f build_type=workflow || \
  gh api -X PUT repos/{owner}/PAX/pages -f build_type=workflow
gh workflow run "Deploy Pages" 2>/dev/null || true
```
(`{owner}`는 `gh api user -q .login`으로 확인. 사용자에게 repo 공개 전 확인받을 것 —
공개 repo 생성은 외부 공개 행위이므로 실행 전 사용자 승인 필요.)

- [ ] **Step 3: 배포 확인**

```bash
gh run watch --exit-status $(gh run list -w "Deploy Pages" -L 1 --json databaseId -q '.[0].databaseId')
curl -s -o /dev/null -w "%{http_code}" https://$(gh api user -q .login).github.io/PAX/
```
Expected: 200, 브라우저에서 샘플 사례 2건이 보임

---

### Task 8: 크론 등록 + 시범 수집

**Files:**
- Modify: 없음 (크론 등록 + 실전 검증)

**Interfaces:**
- Consumes: `scripts/collect_prompt.md` (Task 6), 배포된 사이트 (Task 7)
- Produces: 매일 09:00 KST 자동 수집 크론, 첫 실데이터

- [ ] **Step 1: 시범 수집을 현재 세션에서 1회 수동 실행**

`scripts/collect_prompt.md`의 절차를 처음부터 끝까지 직접 수행한다
(claude-in-chrome으로 Threads 읽기 → 카카오톡 "공공AX 네트워크" 읽기 → 선별 →
merge → publish → 커밋·푸시). 문제가 있으면 절차서/스크립트를 수정하고 커밋한다.

- [ ] **Step 2: 사이트에서 실데이터 확인**

배포 완료 후 공개 URL에서 샘플이 아닌 실제 수집 사례가 보이는지 확인한다.
(샘플 데이터는 merge된 실데이터로 자연히 대체됨 — cases.json에 샘플 id가 남아 있으면
data/cases.json과 site/data/cases.json에서 샘플 2건을 제거하고 커밋한다.)

- [ ] **Step 3: 크론 등록**

CronCreate 도구로 등록:
- schedule: `0 9 * * *` (매일 09:00, 로컬 KST)
- prompt: "cd /Users/jonghongjeon/git/PAX 후 scripts/collect_prompt.md를 읽고
  그 절차를 처음부터 끝까지 수행하라."

- [ ] **Step 4: 마무리 커밋**

```bash
git add -A && git status --short   # 커밋 누락 확인
git commit -m "chore: 시범 수집 반영" || true
git push
```

---

## Self-Review 결과

- **Spec coverage:** 스펙 2~9절 전부 태스크에 매핑됨 (스키마→1, 익명화→2, 병합→3, 배포 복사→4, 사이트→5, 절차서·rooms.json→6/1, repo·Pages→7, 크론·오류처리→6/8, 테스트→1~4).
- **Placeholder scan:** 코드 블록 전부 실행 가능한 실코드. Task 5의 render()는 요구사항 명세 + 뼈대로 대체 (frontend 재량 영역 명시).
- **Type consistency:** `merge_cases(existing_doc, candidates, updated_at) -> (dict, list)` 시그니처가 Task 3 정의·테스트·CLI에서 일치. `make_case`/`make_candidate` 헬퍼 일관.
