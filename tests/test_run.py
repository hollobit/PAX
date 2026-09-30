from pax.run import POST_COLLECT, needs_thumbs, plan


def _names(steps):
    return [s.name for s in steps]


def test_post_collect_order_respects_data_dependencies():
    # 읽는 쪽이 만드는 쪽보다 먼저 돌면 새 사례가 한 회차 동안 '평가 데이터 없음'으로 공개된다
    order = _names(POST_COLLECT)
    before = lambda a, b: order.index(a) < order.index(b)  # noqa: E731
    assert before("eval_data", "champions")        # 챔피언 점수는 평가를 읽는다
    assert before("eval_data", "case_pages")       # 사례 페이지는 평가표를 싣는다
    assert before("mcp_review", "case_pages")      # 사례 페이지는 MCP 검증 배지를 싣는다
    assert before("thumbs", "publish")             # thumb_v는 썸네일이 생긴 뒤에 찍는다
    assert before("publish", "case_pages")
    assert before("community_stats", "index")      # 지수는 커뮤니티 지표를 읽는다
    assert before("champions", "index")
    assert before("index", "dashboard_history")    # 이력은 오늘의 지수·챔피언 값을 적는다
    assert before("champions", "dashboard_history")


def test_every_step_is_a_known_script_or_module():
    import os
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for s in POST_COLLECT:
        target = s.argv[0]
        if target.endswith((".py", ".sh")):
            assert os.path.exists(os.path.join(root, target)), target
        else:
            assert target.startswith("pax."), target


def test_thumbs_step_skipped_when_every_case_has_one(tmp_path):
    thumbs = tmp_path / "thumbs"
    thumbs.mkdir()
    (thumbs / "a.jpg").write_bytes(b"x")
    cases = [{"id": "a", "link": "https://a.example/"}]
    assert needs_thumbs(cases, thumbs) is False
    cases.append({"id": "b", "link": "https://b.example/"})
    assert needs_thumbs(cases, thumbs) is True
    # 대표 주소가 없는 사례는 썸네일을 만들 수 없으니 필요로 치지 않는다
    assert needs_thumbs([{"id": "c"}], thumbs) is False


def test_plan_drops_thumbs_when_not_needed():
    names = _names(plan(thumbs_needed=False))
    assert "thumbs" not in names
    assert "publish" in names  # WebP 짝 맞추기·thumb_v는 publish가 계속 맡는다
