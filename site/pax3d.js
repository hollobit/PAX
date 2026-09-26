// 3D PAX — 미니어처 대한민국에서 공공AX 사례를 탐험하는 화면.
// 3D는 덧입힌 층이다: WebGL이 없어도 오른쪽 목록(축 → 값 → 사례 → 상세 링크)만으로 전부 쓸 수 있다.
import { buildAxes, TASK_COLORS, SHAPES, caseTargetUrl } from './pax3d-data.js?v=7715f3cd';

const $ = (sel) => document.querySelector(sel);
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

const RESULT_PAGE = 120;

async function main() {
  let casesDoc;
  let champDoc;
  let geo;
  try {
    [casesDoc, champDoc, geo] = await Promise.all([
      loadJson('data/cases.json'), loadJson('data/champions.json'), loadJson('data/korea-geo.json'),
    ]);
  } catch (err) {
    $('#pax3d-status').textContent = `자료를 불러오지 못했습니다 (${err.message}). 잠시 뒤 새로고침해 주세요.`;
    return;
  }
  const cases = (casesDoc.cases || casesDoc).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const byId = new Map(cases.map((c) => [c.id, c]));
  const model = buildAxes(cases, champDoc);
  const champsOf = new Map();
  for (const ch of champDoc.champions || []) {
    for (const id of ch.cases || []) champsOf.set(id, [...(champsOf.get(id) || []), ch]);
  }

  const params = new URLSearchParams(location.search);
  const state = {
    axis: model.axes.some((a) => a.key === params.get('axis')) ? params.get('axis') : 'region',
    value: params.get('v'),
    caseId: byId.has(params.get('case')) ? params.get('case') : null,
    query: '',
    shown: RESULT_PAGE,
  };

  renderSummary(cases, model);
  renderLegend();

  // ---- 3D (실패하면 목록만으로 계속) ----------------------------------------------
  let world = null;
  const tip = $('#pax3d-tip');
  try {
    const { createWorld } = await import('./pax3d-world.js?v=63d1489e');
    world = createWorld($('#pax3d-canvas'), {
      geo,
      cases,
      places: model.places,
      onHover(id, x, y) {
        if (!id) {
          tip.hidden = true;
          return;
        }
        const c = byId.get(id);
        const rect = $('#pax3d-stage').getBoundingClientRect();
        tip.replaceChildren(el('strong', null, c.title), el('span', null, `${c.org} · ${placeLabel(c.id)}`));
        tip.style.left = `${x - rect.left + 14}px`;
        tip.style.top = `${y - rect.top + 14}px`;
        tip.hidden = false;
      },
      onPickCase: (id) => selectCase(id, { fly: true }),
      onPickPlace: (place) => selectValue('region', place),
    });
  } catch (err) {
    $('#pax3d-stage').classList.add('pax3d-stage--fallback');
    $('#pax3d-fallback').hidden = false;
  }
  $('#pax3d-status').remove();

  function placeLabel(id) {
    const loc = model.located.get(id);
    if (!loc) return '';
    return loc.basis === 'affiliation' ? `${loc.place} (만든 사람 소속 기준)` : loc.place;
  }

  function currentAxis() {
    return model.axes.find((a) => a.key === state.axis);
  }
  function currentValue() {
    return state.value ? currentAxis().values.find((v) => v.value === state.value) : null;
  }

  function syncUrl() {
    const p = new URLSearchParams();
    p.set('axis', state.axis);
    if (state.value) p.set('v', state.value);
    if (state.caseId) p.set('case', state.caseId);
    history.replaceState(null, '', `${location.pathname}?${p}`);
  }

  // ---- 축 탭 --------------------------------------------------------------------
  function renderTabs() {
    const bar = $('#pax3d-tabs');
    bar.replaceChildren(...model.axes.map((axis) => {
      const b = el('button', 'pax3d-tab', axis.label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(axis.key === state.axis));
      b.addEventListener('click', () => {
        state.axis = axis.key;
        state.value = null;
        state.query = '';
        applyFilter({ fly: false });
      });
      return b;
    }));
  }

  // ---- 값 칩 ---------------------------------------------------------------------
  function renderValues() {
    const axis = currentAxis();
    const box = $('#pax3d-values');
    const search = $('#pax3d-search');
    search.hidden = !axis.searchable;
    if (axis.searchable && search.value !== state.query) search.value = state.query;
    let values = axis.values;
    if (axis.searchable && state.query) {
      const q = state.query.toLowerCase();
      values = values.filter((v) => `${v.label} ${v.sub}`.toLowerCase().includes(q));
    }
    if (axis.searchable) values = values.slice(0, 90);
    const groups = new Map();
    for (const v of values) {
      const g = v.group || '';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(v);
    }
    const nodes = [];
    for (const [g, list] of groups) {
      if (g) nodes.push(el('p', 'pax3d-values__group', g));
      const wrap = el('div', 'pax3d-values__chips');
      for (const v of list) wrap.appendChild(chip(v));
      nodes.push(wrap);
    }
    if (!values.length) nodes.push(el('p', 'pax3d-empty', '맞는 값이 없습니다.'));
    box.replaceChildren(...nodes);
  }

  function chip(v) {
    const b = el('button', 'pax3d-chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(v.value === state.value));
    if (v.color) {
      const dot = el('span', 'pax3d-dot');
      dot.style.background = v.color;
      b.appendChild(dot);
    }
    b.appendChild(el('span', 'pax3d-chip__label', v.label));
    if (v.tier) b.appendChild(el('span', 'pax3d-chip__tier', v.tier));
    b.appendChild(el('span', 'pax3d-chip__n', String(v.ids.size)));
    const subBits = [v.sub, v.region && state.axis === 'champion' ? `📍${v.region}` : null].filter(Boolean);
    if (subBits.length) b.title = subBits.join(' · ');
    b.addEventListener('click', () => selectValue(state.axis, v.value === state.value ? null : v.value));
    return b;
  }

  function selectValue(axisKey, value) {
    state.axis = axisKey;
    state.value = value;
    state.shown = RESULT_PAGE;
    applyFilter({ fly: true });
  }

  // ---- 결과 목록 --------------------------------------------------------------------
  function matchedIds() {
    const v = currentValue();
    return v ? v.ids : null;
  }

  function renderResults() {
    const ids = matchedIds();
    const list = ids ? cases.filter((c) => ids.has(c.id)) : cases;
    const v = currentValue();
    const head = $('#pax3d-results-head');
    head.replaceChildren(el('strong', null, v ? `${currentAxis().label} · ${v.label}` : '전체 사례'),
      el('span', null, ` ${list.length}건`));
    if (v && v.sub) head.appendChild(el('p', 'pax3d-results__sub', v.sub));
    if (v && v.href) {
      const a = el('a', 'pax3d-results__link', '챔피언 페이지 →');
      a.href = v.href;
      head.appendChild(a);
    }
    const ul = $('#pax3d-results');
    ul.replaceChildren(...list.slice(0, state.shown).map((c) => {
      const li = el('li');
      const b = el('button', 'pax3d-result');
      b.type = 'button';
      if (c.id === state.caseId) b.setAttribute('aria-current', 'true');
      const dot = el('span', 'pax3d-dot');
      dot.style.background = TASK_COLORS[c.task_category] || '#b9ae9a';
      b.append(dot, el('span', 'pax3d-result__title', c.title),
        el('span', 'pax3d-result__meta', `${c.org} · ${placeLabel(c.id)}`));
      b.addEventListener('click', () => selectCase(c.id, { fly: true }));
      li.appendChild(b);
      return li;
    }));
    const more = $('#pax3d-more');
    more.hidden = list.length <= state.shown;
    more.textContent = `더 보기 (${list.length - state.shown}건 남음)`;
  }

  // ---- 사례 상세 ---------------------------------------------------------------------
  function renderCase() {
    const card = $('#pax3d-case');
    const c = state.caseId && byId.get(state.caseId);
    card.hidden = !c;
    if (!c) return;
    const chips = el('div', 'pax3d-case__chips');
    const task = el('span', 'pax3d-tag', c.task_category || '업무 미분류');
    task.style.setProperty('--tag', TASK_COLORS[c.task_category] || '#b9ae9a');
    chips.append(task, el('span', 'pax3d-tag', c.org_type), el('span', 'pax3d-tag', placeLabel(c.id)));
    if (c.date) chips.appendChild(el('span', 'pax3d-tag', c.date));
    const actions = el('div', 'pax3d-case__actions');
    const detail = el('a', 'pax3d-btn pax3d-btn--primary', '사례 상세 보기');
    detail.href = `case/${encodeURIComponent(c.id)}.html`;
    actions.appendChild(detail);
    const target = caseTargetUrl(c);
    if (target) {
      const go = el('a', 'pax3d-btn', '바로 가기 ↗');
      go.href = target;
      go.target = '_blank';
      go.rel = 'noopener';
      actions.appendChild(go);
    }
    const nodes = [
      el('p', 'pax3d-case__org', c.org),
      el('h2', 'pax3d-case__title', c.title),
      chips,
      el('p', 'pax3d-case__summary', c.summary),
    ];
    const champs = champsOf.get(c.id) || [];
    if (champs.length) {
      const who = el('p', 'pax3d-case__champs');
      who.appendChild(el('span', null, '만든 사람 '));
      champs.forEach((ch) => {
        const a = el('button', 'pax3d-linkish', ch.name);
        a.type = 'button';
        const aff = ch.affiliation && ch.affiliation.value;
        if (aff) a.title = aff;
        a.addEventListener('click', () => selectValue('champion', ch.id));
        who.appendChild(a);
      });
      nodes.push(who);
    }
    nodes.push(actions);
    const close = el('button', 'pax3d-case__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '사례 닫기');
    close.addEventListener('click', () => selectCase(null));
    card.replaceChildren(close, ...nodes);
  }

  function selectCase(id, { fly = false } = {}) {
    state.caseId = id;
    if (world) {
      if (id) world.focusCase(id, { fly });
      else world.clearFocus();
    }
    renderCase();
    renderResults();
    syncUrl();
    if (id) {
      const panel = $('.pax3d-panel');
      if (window.matchMedia('(max-width: 1099px)').matches) {
        $('#pax3d-case').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        panel.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }

  function applyFilter({ fly }) {
    renderTabs();
    renderValues();
    renderResults();
    const ids = matchedIds();
    if (world) {
      world.setHighlight(ids);
      if (fly) {
        if (ids && state.axis === 'region') world.flyToPlace(state.value);
        else if (ids) world.flyToIds(ids);
        else world.flyHome();
      }
      if (state.caseId) world.focusCase(state.caseId, { fly: false });
    }
    syncUrl();
  }

  $('#pax3d-search').addEventListener('input', (e) => {
    state.query = e.target.value.trim();
    renderValues();
  });
  $('#pax3d-more').addEventListener('click', () => {
    state.shown += RESULT_PAGE;
    renderResults();
  });
  $('#pax3d-home').addEventListener('click', () => {
    state.value = null;
    selectCase(null);
    applyFilter({ fly: true });
  });
  $('#pax3d-ink').addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(on));
    if (world) world.setInk(on);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.caseId) selectCase(null);
  });

  applyFilter({ fly: Boolean(state.value) });
  if (state.caseId) selectCase(state.caseId, { fly: true });
}

function renderSummary(cases, model) {
  const located = [...model.located.values()];
  const onLand = located.filter((l) => l.basis !== 'island').length;
  const byAff = located.filter((l) => l.basis === 'affiliation').length;
  $('#pax3d-summary').textContent =
    `사례 ${cases.length}건 · 시도 위 ${onLand}건(그중 만든 사람 소속으로 자리 잡은 ${byAff}건) · 지역 밖 섬 ${cases.length - onLand}건`;
}

function renderLegend() {
  const colors = $('#pax3d-legend-colors');
  colors.replaceChildren(...Object.entries(TASK_COLORS).map(([name, color]) => {
    const li = el('li');
    const dot = el('span', 'pax3d-dot');
    dot.style.background = color;
    li.append(dot, document.createTextNode(name));
    return li;
  }));
  $('#pax3d-legend-shapes').replaceChildren(...Object.values(SHAPES).map((t) => el('li', null, t)));
}

main();
