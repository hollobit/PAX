"""3D PAX 섬 마을 — 사례 내용별 건물 종류와 길가 배치(site/pax3d-village-plan.js, three 없는 순수 모듈)."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULE = (ROOT / "site" / "pax3d-village-plan.js").as_uri()


def run(js: str):
    out = subprocess.run(["node", "--input-type=module", "-e", js, MODULE],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_village_kind_follows_case_content():
    got = run("""
    const { villageKind } = await import(process.argv[1]);
    const k = (c) => villageKind({ title: '', tags: [], org_type: '공직 개인', ...c });
    console.log(JSON.stringify({
      law: k({ title: '국가법령정보 MCP — 판례 검색', tags: ['MCP'] }),
      audit: k({ task_category: '감사·법무' }),
      data: k({ task_category: '데이터·통계' }),
      map: k({ title: '도로 GIS 지도 뷰어' }),
      mcp: k({ title: '날씨 MCP 서버', tags: ['MCP'] }),
      school: k({ org_type: '교육기관', title: '급식 안내' }),
      hall: k({ org_type: '중앙행정기관', task_category: '공통·범용' }),
      office: k({ task_category: '문서·기안' }),
      shop: k({ task_category: '민원' }),
      house: k({ task_category: '공통·범용' }),
    }));
    """)
    assert got == {"law": "library", "audit": "library", "data": "observatory", "map": "observatory",
                   "mcp": "workshop", "school": "school", "hall": "hall", "office": "office",
                   "shop": "shop", "house": "house"}


PLAN = """
const { planVillage } = await import(process.argv[1]);
const R = %(radius)s;
// 울퉁불퉁한 섬: 각도에 따라 반지름이 ±12%% 흔들린다
const inside = (p) => Math.hypot(p.x - 3, p.y + 1) < R * (1 + 0.12 * Math.sin(5 * Math.atan2(p.y + 1, p.x - 3)));
const kinds = ['library', 'house', 'workshop'];
const items = Array.from({ length: %(n)s }, (_, i) => ({ id: 'c' + i, kind: kinds[i %% 3] }));
const plan = planVillage({ center: { x: 3, y: -1 }, radius: R, inside, items, size: %(size)s, seed: '섬' });
const again = planVillage({ center: { x: 3, y: -1 }, radius: R, inside, items, size: %(size)s, seed: '섬' });
console.log(JSON.stringify({
  slots: items.map((it) => ({ ...plan.slots.get(it.id), kind: it.kind })),
  same: JSON.stringify([...plan.slots]) === JSON.stringify([...again.slots]),
  roads: plan.roads, gate: plan.gate, plaza: plan.plaza,
  allInside: items.every((it) => inside(plan.slots.get(it.id))),
}));
"""


def _plan(n, radius=1.6, size=0.05):
    return run(PLAN % {"n": n, "radius": radius, "size": size})


def _seg_dist(p, a, b):
    dx, dy = b["x"] - a["x"], b["y"] - a["y"]
    L2 = dx * dx + dy * dy or 1e-12
    t = max(0.0, min(1.0, ((p["x"] - a["x"]) * dx + (p["y"] - a["y"]) * dy) / L2))
    return ((p["x"] - a["x"] - t * dx) ** 2 + (p["y"] - a["y"] - t * dy) ** 2) ** 0.5


def test_every_case_gets_a_deterministic_slot_inside_the_island():
    got = _plan(300)
    assert len(got["slots"]) == 300 and got["allInside"] and got["same"]
    assert all(isinstance(s["rot"], (int, float)) for s in got["slots"])


def test_buildings_do_not_overlap_or_sit_on_roads():
    size = 0.05
    got = _plan(240, size=size)
    pts = got["slots"]
    for i, a in enumerate(pts):
        for b in pts[i + 1:]:
            assert ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5 >= size * 1.05
    on_road = 0
    for p in pts:
        for road in got["roads"]:
            if any(_seg_dist(p, road[k], road[k + 1]) < size * 0.45 for k in range(len(road) - 1)):
                on_road += 1
                break
    assert on_road == 0


def test_buildings_line_the_roads_and_face_them():
    size = 0.05
    got = _plan(120, size=size)
    near = 0
    for p in got["slots"]:
        best = min(_seg_dist(p, r[k], r[k + 1]) for r in got["roads"] for k in range(len(r) - 1))
        near += best < size * 1.6
    assert near >= len(got["slots"]) * 0.9  # 거의 모든 건물이 길가에 선다


def test_same_kind_forms_one_quarter():
    got = _plan(90)
    import math
    by_angle = sorted(got["slots"], key=lambda s: math.atan2(s["y"] + 1, s["x"] - 3))
    kinds = [s["kind"] for s in by_angle]
    runs = sum(1 for i in range(len(kinds)) if kinds[i] != kinds[i - 1])  # 원형으로 센 경계 수
    assert runs <= 6  # 세 종류가 각각 한 구역(경계 3개) — 바깥 고리 끝자락 섞임까지 여유


def test_small_island_still_has_plaza_roads_and_gate():
    got = _plan(8, radius=0.7)
    assert len(got["slots"]) == 8 and got["roads"] and got["plaza"]["r"] > 0
    assert set(got["gate"]) >= {"x", "y", "rot"}
