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


def test_kakao_export_line_mid_text_flagged():
    case = make_case(summary="사례 공유가 있었다.\n[홍길동] [오후 2:31] 우리 기관 도입 사례입니다.")
    assert any("닉네임" in i for i in find_privacy_issues(case))


def test_direct_quote_flagged():
    case = make_case(summary='담당자는 “예산이 부족하다”라고 말했다.')
    assert any("인용" in i for i in find_privacy_issues(case))


def test_overlong_summary_flagged():
    case = make_case(summary="가" * 301)
    assert any("길이" in i for i in find_privacy_issues(case))


def test_phone_number_in_org_flagged():
    case = make_case(org="문의 010-1234-5678")
    assert any("전화번호" in i for i in find_privacy_issues(case))


def test_nickname_pattern_in_tags_flagged():
    case = make_case(tags=["민원", "홍길동님:"])
    assert any("닉네임" in i for i in find_privacy_issues(case))


def test_straight_double_quote_in_summary_flagged():
    case = make_case(summary='담당자는 "예산이 부족하다"라고 말했다.')
    assert any("인용" in i for i in find_privacy_issues(case))


def test_straight_single_quote_in_summary_allowed():
    case = make_case(title="서울시 '스마트 민원' 챗봇 도입")
    assert find_privacy_issues(case) == []
