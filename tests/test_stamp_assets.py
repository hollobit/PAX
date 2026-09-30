import stamp_assets as sa


def _site(tmp_path):
    site = tmp_path / "site"
    site.mkdir()
    (site / "a.js").write_text("console.log(1)\n", encoding="utf-8")
    (site / "b.css").write_text("body{}\n", encoding="utf-8")
    return site


def test_unstamped_local_references_get_a_stamp(tmp_path):
    site = _site(tmp_path)
    page = site / "p.html"
    page.write_text('<link href="b.css"><script src="a.js"></script><script src="https://cdn.example/x.js"></script>',
                    encoding="utf-8")
    assert sa.stamp_file(page, {}, site) is True
    text = page.read_text(encoding="utf-8")
    assert f'href="b.css?v={sa.digest(site / "b.css")}"' in text
    assert f'src="a.js?v={sa.digest(site / "a.js")}"' in text
    assert 'https://cdn.example/x.js"' in text  # 외부 주소는 건드리지 않는다


def test_module_imports_are_stamped_too(tmp_path):
    site = _site(tmp_path)
    mod = site / "m.js"
    mod.write_text("import { x } from './a.js';\n", encoding="utf-8")
    sa.stamp_file(mod, {}, site)
    assert f"from './a.js?v={sa.digest(site / 'a.js')}'" in mod.read_text(encoding="utf-8")


def test_find_problems_reports_missing_and_stale_stamps(tmp_path):
    site = _site(tmp_path)
    (site / "p.html").write_text('<script src="a.js"></script><link href="b.css?v=00000000">', encoding="utf-8")
    problems = sa.find_problems(site)
    assert any("a.js" in p and "스탬프 없음" in p for p in problems)
    assert any("b.css" in p and "옛 스탬프" in p for p in problems)
    sa.stamp_all(site)
    assert sa.find_problems(site) == []


def test_repository_site_is_fully_stamped():
    from pathlib import Path
    site = Path(__file__).resolve().parent.parent / "site"
    problems = sa.find_problems(site)
    assert not problems, f"{problems[:5]} — python3 scripts/stamp_assets.py 실행"
