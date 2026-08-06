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
