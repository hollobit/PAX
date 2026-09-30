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


def test_subfolder_modules_are_stamped_relative_to_the_importer(tmp_path):
    # 3D PAX가 city3d/js 모듈을 부르고, 그 모듈이 또 이웃 모듈을 부른다 — 안쪽이 바뀌면 바깥 스탬프도 바뀐다
    site = _site(tmp_path)
    js = site / "city3d" / "js"
    js.mkdir(parents=True)
    (js / "layers.js").write_text("export const A = 1;\n", encoding="utf-8")
    (js / "load.js").write_text("import { A } from './layers.js';\n", encoding="utf-8")
    (site / "world.js").write_text("import { A } from './city3d/js/load.js';\n", encoding="utf-8")
    (site / "city3d" / "index.html").write_text('<script src="js/load.js"></script><a href="../world.js">',
                                                encoding="utf-8")
    assert any("load.js" in p for p in sa.find_problems(site))
    sa.stamp_all(site)
    assert sa.find_problems(site) == []
    assert f"'./layers.js?v={sa.digest(js / 'layers.js')}'" in (js / "load.js").read_text(encoding="utf-8")
    before = (site / "world.js").read_text(encoding="utf-8")
    (js / "layers.js").write_text("export const A = 2;\n", encoding="utf-8")
    sa.stamp_all(site)
    assert (site / "world.js").read_text(encoding="utf-8") != before
    assert 'href="../world.js"' in (site / "city3d" / "index.html").read_text(encoding="utf-8")  # 거슬러 오르는 경로는 두지 않는다
