import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_group_cases_by_place_and_zone():
    # 3D 월드가 건물을 세우는 자리 묶음 — 기관 소재지 > 시군구 > 시·도청 앞 > 섬 순으로 열쇠가 정해진다
    js = """
    const { groupCases, zoneKey } = await import(process.argv[1]);
    const located = new Map([
      ['a', { place: '서울', inst: { name: '서울시청' } }],
      ['b', { place: '서울', sgg: { name: '종로구' } }],
      ['c', { place: '서울' }],
      ['d', { place: '공직 현장 섬' }],
      ['e', { place: '서울', sgg: { name: '종로구' } }],
    ]);
    const cases = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    const { byPlace, byZone } = groupCases(cases, located);
    console.log(JSON.stringify({
      places: [...byPlace].map(([k, v]) => [k, v.map((c) => c.id)]),
      zones: [...byZone].map(([k, v]) => [k, v.list.map((c) => c.id)]),
    }));
    """
    url = (ROOT / "site" / "pax3d-places.js").as_uri()
    out = subprocess.run(["node", "--input-type=module", "-e", js, url], capture_output=True, text=True, check=True)
    got = json.loads(out.stdout)
    assert got["places"] == [["서울", ["a", "b", "c", "e"]], ["공직 현장 섬", ["d"]]]
    assert got["zones"] == [["inst:서울시청", ["a"]], ["sgg:서울/종로구", ["b", "e"]],
                            ["seat:서울", ["c"]], ["isl:공직 현장 섬", ["d"]]]
