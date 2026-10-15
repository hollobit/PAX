"""사례별 패턴 구성도 — 판정된 부품을 층별 줄에 놓고 배선을 화살표로 이은 정적 SVG.

층 순서는 위에서부터 서비스 블록(D) → 업무 컴포넌트(B) → 제어 흐름(B′) → 공통 서비스(A) → 운영(C) → 보안(S)
→ 상호작용(F) → 안티패턴(X). 확인된 부품은 실선, 계획만 된 부품은 점선, 카탈로그가 함께 갖추라고 권하지만
확인되지 않은 필수 부품은 회색 점선으로 그린다. 노드는 아래 '이 사례에 쓰인 패턴' 상세(#pat-<id>)로 이어진다.
"""
from __future__ import annotations

import re

from pax.case_details import esc

ROWS = [("D", "서비스 블록"), ("B", "업무 컴포넌트"), ("Bp", "제어 흐름"), ("A", "공통 서비스"),
        ("C", "운영"), ("S", "보안"), ("F", "상호작용"), ("X", "안티패턴")]
FILL = {"D": "#ece4d6", "B": "#dfe9f5", "Bp": "#e6e0f3", "A": "#dcefe3", "C": "#f6ead2", "S": "#f6dcd8",
        "F": "#e3f1f1", "X": "#3a3226"}
NODE_W, NODE_H, GAP, ROW_H, LABEL_W, PAD = 168, 34, 14, 58, 96, 16


def _row(pid: str) -> str:
    if pid.startswith("B′"):
        return "Bp"
    return pid[:1] if pid[:1] in FILL else ""


def _nodes(tag: dict) -> dict[str, str]:
    """부품 id → 상태(main·present·planned·missing·anti). 먼저 나온 상태가 이긴다."""
    nodes: dict[str, str] = {}

    def add(ids, state):
        for i in ids or []:
            if i and _row(i) and i not in nodes:
                nodes[i] = state
    wf = tag.get("workflow") or {}
    op, sec, it = tag.get("operational") or {}, tag.get("security") or {}, tag.get("interaction") or {}
    add([wf.get("primary")], "main")
    add(wf.get("secondary"), "present")
    add(tag.get("blocks"), "present")
    add(tag.get("control_flow"), "present")
    add(tag.get("platform"), "present")
    for g in (op, sec):
        add(g.get("present"), "present")
        add(g.get("implemented"), "present")
    add(sec.get("structural"), "present")
    add(it.get("present"), "present")
    add(tag.get("anti_patterns"), "anti")
    add(tag.get("platform_planned"), "planned")
    for g in (op, sec, it):
        add(g.get("planned"), "planned")
    add(tag.get("missing_required"), "missing")
    return nodes


def _edges(tag: dict, placed: dict) -> list[tuple[str, str]]:
    out = []
    for w in tag.get("wiring") or []:
        parts = [re.sub(r"\(.*?\)", "", p).strip() for p in re.split(r"→", w)]
        for a, b in zip(parts, parts[1:]):
            if a in placed and b in placed and a != b and (a, b) not in out:
                out.append((a, b))
    return out


def _label(pid: str, catalog: dict) -> str:
    name = (catalog.get("patterns", {}).get(pid) or {}).get("name", "")
    text = f"{pid} {name}".strip()
    return text if len(text) <= 13 else text[:12] + "…"


def composition_svg(tag: dict, catalog: dict) -> str:
    nodes = _nodes(tag)
    if not nodes:
        return ""
    rows = [(k, n) for k, n in ROWS if any(_row(i) == k for i in nodes)]
    per_row = {k: [i for i in nodes if _row(i) == k] for k, _ in rows}
    cols = max(len(v) for v in per_row.values())
    width = LABEL_W + cols * (NODE_W + GAP) + PAD
    height = len(rows) * ROW_H + PAD * 2
    placed = {}
    for r, (k, _) in enumerate(rows):
        y = PAD + r * ROW_H + (ROW_H - NODE_H) / 2
        for c, pid in enumerate(per_row[k]):
            placed[pid] = (LABEL_W + c * (NODE_W + GAP), y)
    parts = [f'<svg class="dp-svg" viewBox="0 0 {width:.0f} {height:.0f}" role="img" aria-labelledby="dp-svg-t" '
             f'xmlns="http://www.w3.org/2000/svg"><title id="dp-svg-t">이 사례의 패턴 구성도 — 층별 부품과 배선</title>',
             '<defs><marker id="dp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
             'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6b6153"/></marker></defs>']
    for r, (k, name) in enumerate(rows):
        y = PAD + r * ROW_H
        parts.append(f'<rect x="4" y="{y + 4:.0f}" width="{width - 8:.0f}" height="{ROW_H - 8}" rx="8" '
                     f'fill="{FILL[k]}" fill-opacity="0.28"/>')
        parts.append(f'<text x="12" y="{y + ROW_H / 2 + 4:.0f}" class="dp-svg__row">{esc(name)}</text>')
    for a, b in _edges(tag, placed):
        (ax, ay), (bx, by) = placed[a], placed[b]
        x1, x2 = ax + NODE_W / 2, bx + NODE_W / 2
        y1 = ay + (NODE_H if by > ay else 0) if by != ay else ay + NODE_H / 2
        y2 = by + (0 if by > ay else NODE_H) if by != ay else by + NODE_H / 2
        if by == ay:
            x1, x2 = (ax + NODE_W, bx) if bx > ax else (ax, bx + NODE_W)
        mid = (y1 + y2) / 2
        parts.append(f'<path d="M{x1:.0f},{y1:.0f} C{x1:.0f},{mid:.0f} {x2:.0f},{mid:.0f} {x2:.0f},{y2:.0f}" '
                     'fill="none" stroke="#6b6153" stroke-width="1.4" marker-end="url(#dp-arrow)"/>')
    for pid, (x, y) in placed.items():
        state = nodes[pid]
        k = _row(pid)
        fill = "#f4f1ea" if state == "missing" else FILL[k]
        stroke = {"main": "#8c2b23", "missing": "#9a917f", "anti": "#3a3226"}.get(state, "#5a5248")
        dash = ' stroke-dasharray="5 4"' if state in ("planned", "missing") else ""
        sw = 2.4 if state == "main" else 1.2
        color = "#fbf6ea" if k == "X" else ("#8a8272" if state == "missing" else "#2b2620")
        tail = {"planned": " · 계획", "missing": " · 보완 필요", "main": " · 주 패턴"}.get(state, "")
        parts.append(f'<a href="#pat-{esc(pid)}" data-state="{state}"><title>{esc(pid)}{esc(tail)}</title>'
                     f'<rect x="{x:.0f}" y="{y:.0f}" width="{NODE_W}" height="{NODE_H}" rx="17" fill="{fill}" '
                     f'stroke="{stroke}" stroke-width="{sw}"{dash}/>'
                     f'<text x="{x + NODE_W / 2:.0f}" y="{y + NODE_H / 2 + 5:.0f}" text-anchor="middle" '
                     f'class="dp-svg__node" fill="{color}">{esc(_label(pid, catalog))}</text></a>')
    parts.append("</svg>")
    return "".join(parts)
