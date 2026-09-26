"""3D PAX 거리 자료 — 벡터 타일 해석기(site/pax3d-mvt.js)를 저장해 둔 실제 타일로 점검한다.

픽스처: OpenFreeMap z14/13984/6405 (세종 정부청사 일대), © OpenStreetMap contributors, ODbL.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
pytestmark = pytest.mark.skipif(not shutil.which("node"), reason="node 없음")

SCRIPT = """
import fs from 'fs';
const src = fs.readFileSync('site/pax3d-mvt.js', 'utf8');
const mod = await import('data:text/javascript,' + encodeURIComponent(src));
const buf = new Uint8Array(fs.readFileSync('tests/fixtures/mvt-sejong-14-13984-6405.pbf'));
const t = mod.decodeTile(buf, ['building', 'transportation', 'transportation_name', 'poi']);
const b = t.building.features;
console.log(JSON.stringify({
  extent: t.building.extent,
  buildings: b.length,
  heights: b.every((f) => typeof f.props.render_height === 'number'),
  polygons: b.every((f) => f.type === 3 && f.parts.every((p) => p.length >= 4
    && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1])),
  roads: t.transportation.features.length,
  names: [...new Set(t.transportation_name.features.map((f) => f.props.name))],
  pois: t.poi.features.map((f) => f.props.name).filter(Boolean),
  skipped: Object.keys(t).sort(),
}));
"""


@pytest.fixture(scope="module")
def tile():
    out = subprocess.run(["node", "--input-type=module", "-e", SCRIPT], cwd=ROOT,
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_only_requested_layers_are_decoded(tile):
    assert tile["skipped"] == ["building", "poi", "transportation", "transportation_name"]
    assert tile["extent"] == 4096


def test_buildings_are_closed_polygons_with_heights(tile):
    assert tile["buildings"] == 8
    assert tile["heights"] and tile["polygons"]


def test_korean_road_names_and_pois_survive_utf8(tile):
    assert tile["roads"] == 134
    assert "도움6로" in tile["names"]
    assert any("정부세종청사" in n for n in tile["pois"])
