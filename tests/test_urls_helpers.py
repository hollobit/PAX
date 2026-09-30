from pax.urls import case_urls


def test_case_urls_lists_filled_slots_in_fixed_order():
    c = {"link": "https://a", "case_url": "", "mirror_url": "https://c"}
    assert case_urls(c) == ["https://a", "https://c"]
    assert case_urls({}) == []
