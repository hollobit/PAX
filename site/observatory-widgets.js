// 관측소 현황판 위젯 — 타일 골격·링 게이지·스파크라인·쌍 막대·직전 기록 대비 증감 배지.
// 형태 배정: 비율=링 게이지, 추세 있는 규모=스파크라인, 비교 가능한 규모=쌍 막대.
// 색: 카테고리 색 없음(각 지표는 독립) — 단일 강조색 + 상태색(라벨 병기).
import { el } from './pax-dom.js?v=b57d2715';

const NS = 'http://www.w3.org/2000/svg';
export const svgEl = (tag, attrs) => {
  const n = document.createElementNS(NS, tag);
  Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
  return n;
};
export const num = (v) => (v == null ? '—' : Number(v).toLocaleString('ko-KR'));
export const rate = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

// 타일 골격
export function tile(label, opts) {
  const box = document.createElement(opts && opts.href ? 'a' : 'div');
  box.className = 'dash-tile' + (opts && opts.tone ? ` dash-tile--${opts.tone}` : '');
  if (opts && opts.href) box.href = opts.href;
  const head = el('p', 'dash-tile__label', label);
  box.appendChild(head);
  return box;
}
export function sub(box, text) { box.appendChild(el('p', 'dash-tile__sub', text)); }

// 직전 기록일 대비 증감. 값이 같거나 비교할 이전 값이 없으면 아무것도 붙이지 않는다 —
// '0'이나 '—'를 채워 넣으면 변화가 없다는 뜻인지 자료가 없다는 뜻인지 구분되지 않는다.
export function makeDelta({ hist, histPrev, histPrevDate }) {
  return function delta2(box, key, opts) { delta(box, key, opts); return box; };

  function delta(box, key, opts) {
    const o = opts || {};
    if (!hist || !histPrev) return;
    const now = hist[key];
    const was = histPrev[key];
    if (now == null || was == null) return;
    const diff = now - was;
    if (!diff) return;
    const up = diff > 0;
    const txt = o.pct
      ? `${up ? '▲' : '▼'}${Math.abs(diff * 100).toFixed(1)}%p`
      : `${up ? '▲' : '▼'}${num(Math.abs(diff))}`;
    const badge = el('span', `dash-delta ${up ? 'dash-delta--up' : 'dash-delta--down'}`, txt);
    badge.title = `직전 기록(${histPrevDate}) 대비 ${up ? '증가' : '감소'}`
      + (hist.source === '복원' || (histPrev.source === '복원') ? ' · 복원값 포함' : '');
    const head = box.querySelector('.dash-tile__label');
    if (head) head.appendChild(badge);
  }
}

// ① 링 게이지 — 0~100% 비율
export function gauge(label, value, subText, opts) {
  const o = opts || {};
  const box = tile(label, o);
  const size = 104, r = 42, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pctv = value == null ? 0 : Math.max(0, Math.min(1, value));
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, class: 'dash-gauge', role: 'img',
    'aria-label': `${label} ${rate(value)}` });
  svg.appendChild(svgEl('title', {})).textContent = `${label} — ${rate(value)} (${subText})`;
  svg.appendChild(svgEl('circle', { cx, cy, r, fill: 'none', class: 'dash-gauge__track', 'stroke-width': 9 }));
  const arc = svgEl('circle', { cx, cy, r, fill: 'none', 'stroke-width': 9, 'stroke-linecap': 'round',
    class: 'dash-gauge__value', transform: `rotate(-90 ${cx} ${cy})`,
    'stroke-dasharray': `${(circ * pctv).toFixed(2)} ${circ.toFixed(2)}` });
  svg.appendChild(arc);
  const t = svgEl('text', { x: cx, y: cy + 1, class: 'dash-gauge__text', 'text-anchor': 'middle',
    'dominant-baseline': 'middle' });
  t.textContent = rate(value);
  svg.appendChild(t);
  box.appendChild(svg);
  sub(box, subText);
  if (o.flag) box.appendChild(el('p', 'dash-flag', o.flag));
  return box;
}

// ② 스파크라인 — 추세가 있는 규모
export function spark(label, value, unit, series, subText, opts) {
  const box = tile(label, opts);
  const v = el('p', 'dash-tile__value', num(value));
  if (unit) v.appendChild(el('span', 'dash-tile__unit', unit));
  box.appendChild(v);
  if (series && series.length > 1) {
    const w = 132, h = 34, pad = 2;
    const ys = series.map((d) => d[1]);
    const min = Math.min(...ys), max = Math.max(...ys), span = (max - min) || 1;
    const pt = (d, i) => [
      pad + (i * (w - pad * 2)) / (series.length - 1),
      h - pad - ((d[1] - min) / span) * (h - pad * 2),
    ];
    const pts = series.map(pt);
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'dash-spark', role: 'img',
      'aria-label': `${label} 추이 — ${series[0][0]} ${num(series[0][1])} → ${series[series.length - 1][0]} ${num(value)}` });
    svg.appendChild(svgEl('title', {})).textContent =
      `${series[0][0]} ${num(series[0][1])} → ${series[series.length - 1][0]} ${num(value)}`;
    svg.appendChild(svgEl('path', { class: 'dash-spark__area',
      d: `M ${pts.map((p) => p.join(' ')).join(' L ')} L ${pts[pts.length - 1][0]} ${h} L ${pts[0][0]} ${h} Z` }));
    svg.appendChild(svgEl('path', { class: 'dash-spark__line', fill: 'none', 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      d: `M ${pts.map((p) => p.join(' ')).join(' L ')}` }));
    const last = pts[pts.length - 1];
    svg.appendChild(svgEl('circle', { cx: last[0], cy: last[1], r: 3, class: 'dash-spark__dot' }));
    box.appendChild(svg);
  }
  sub(box, subText);
  return box;
}

// ③ 쌍 막대 — 같은 척도로 비교 가능한 두 값 (별 합계는 축 밖 값으로 병기)
export function pairBars(label, rows, subText, opts) {
  const box = tile(label, opts);
  const max = Math.max(...rows.map((r) => r.v)) || 1;
  const wrap = el('div', 'dash-bars');
  rows.forEach((r) => {
    const row = el('div', 'dash-bars__row');
    row.appendChild(el('span', 'dash-bars__name', r.name));
    const track = el('span', 'dash-bars__track');
    const fill = el('span', 'dash-bars__fill');
    fill.style.width = `${Math.max(4, (r.v / max) * 100)}%`;
    track.appendChild(fill);
    track.title = `${r.name} ${num(r.v)}개 · 스타 ${num(r.stars)}`;
    row.appendChild(track);
    row.appendChild(el('span', 'dash-bars__val', `${num(r.v)}개`));
    row.appendChild(el('span', 'dash-bars__star', `★${num(r.stars)}`));
    wrap.appendChild(row);
  });
  box.appendChild(wrap);
  sub(box, subText);
  return box;
}
