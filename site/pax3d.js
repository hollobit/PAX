// 3D PAX — 미니어처 대한민국에서 공공AX 사례를 탐험하는 화면.
// 3D는 덧입힌 층이다: WebGL이 없어도 오른쪽 목록(검색·축 → 값 → 사례 → 상세 링크)만으로 전부 쓸 수 있다.
import { buildAxes, placeText, TASK_COLORS, SHAPES, caseTargetUrl } from './pax3d-data.js?v=24c96a86';
import { createTour } from './pax3d-tour.js?v=9e8d6421';

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

/** 검색어를 <mark>로 감싼 노드 목록 — innerHTML 없이 텍스트만 다룬다. */
function marked(text, terms) {
  if (!terms.length) return [document.createTextNode(text)];
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? el('mark', null, part) : document.createTextNode(part)));
}

function thumb(c, cls) {
  const img = el('img', cls);
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = `thumbs/${encodeURIComponent(c.id)}.jpg${c.thumb_v ? `?v=${c.thumb_v}` : ''}`;
  img.addEventListener('error', () => img.remove(), { once: true });
  return img;
}

async function main() {
  let docs;
  try {
    docs = await Promise.all(['cases', 'champions', 'korea-geo', 'korea-sgg', 'org-locations']
      .map((n) => loadJson(`data/${n}.json`)));
  } catch (err) {
    $('#pax3d-status').textContent = `자료를 불러오지 못했습니다 (${err.message}). 잠시 뒤 새로고침해 주세요.`;
    return;
  }
  const [casesDoc, champDoc, geo, sggDoc, orgDoc] = docs;
  const cases = (casesDoc.cases || casesDoc).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const byId = new Map(cases.map((c) => [c.id, c]));
  const model = buildAxes(cases, champDoc, sggDoc, orgDoc);
  const champsOf = new Map();
  for (const ch of champDoc.champions || []) {
    for (const id of ch.cases || []) champsOf.set(id, [...(champsOf.get(id) || []), ch]);
  }
  // 검색 대상 문자열 — 제목·기관·요약·태그·업무·자리·만든 사람과 소속·기관 주소
  const haystack = new Map(cases.map((c) => {
    const loc = model.located.get(c.id);
    const who = (champsOf.get(c.id) || []).map((ch) => `${ch.name} ${(ch.affiliation && ch.affiliation.value) || ''}`);
    return [c.id, [c.title, c.org, c.summary, (c.tags || []).join(' '), c.task_category, c.org_type,
      placeText(loc), loc.inst ? loc.inst.address : '', ...who].join(' ').toLowerCase()];
  }));

  const params = new URLSearchParams(location.search);
  const state = {
    axis: model.axes.some((a) => a.key === params.get('axis')) ? params.get('axis') : 'region',
    value: params.get('v'),
    caseId: byId.has(params.get('case')) ? params.get('case') : null,
    q: params.get('q') || '',
    champQuery: '',
    shown: RESULT_PAGE,
  };
  $('#pax3d-q').value = state.q;

  renderSummary(cases, model);
  renderLegend();

  // ---- 3D (실패하면 목록만으로 계속) ----------------------------------------------
  let world = null;
  const tip = $('#pax3d-tip');
  try {
    const { createWorld } = await import('./pax3d-world.js?v=5e037c68');
    world = createWorld($('#pax3d-canvas'), {
      geo,
      sggDoc,
      cases,
      located: model.located,
      onHover(id, x, y) {
        if (!id) {
          tip.hidden = true;
          return;
        }
        const c = byId.get(id);
        const rect = $('#pax3d-stage').getBoundingClientRect();
        tip.replaceChildren(thumb(c, 'pax3d-tip__thumb'), el('strong', null, c.title),
          el('span', null, `${c.org} · ${placeText(model.located.get(c.id))}`));
        tip.style.left = `${Math.min(x - rect.left + 14, rect.width - 290)}px`;
        tip.style.top = `${Math.min(y - rect.top + 14, rect.height - 200)}px`;
        tip.hidden = false;
      },
      onPickCase: (id) => selectCase(id, { fly: true }),
      onPickPlace(place) {
        const axis = model.axes.find((a) => a.key === 'region');
        const known = axis.values.some((v) => v.value === place);
        selectValue('region', known ? place : place.split('/')[0]);
      },
      onTiles: (on) => { $('#pax3d-attrib').hidden = !on; },
    });
  } catch (err) {
    $('#pax3d-stage').classList.add('pax3d-stage--fallback');
    $('#pax3d-fallback').hidden = false;
  }
  if (params.has('debug')) window.pax3d = world;
  $('#pax3d-status').remove();

  const currentAxis = () => model.axes.find((a) => a.key === state.axis);
  const currentValue = () => (state.value ? currentAxis().values.find((v) => v.value === state.value) : null);
  const terms = () => state.q.toLowerCase().split(/\s+/).filter(Boolean);

  /** 축 선택과 검색을 함께 만족하는 사례 id 집합 (둘 다 없으면 null = 전체) */
  function matchedIds() {
    const v = currentValue();
    const t = terms();
    if (!v && !t.length) return null;
    const ids = new Set();
    for (const c of cases) {
      if (v && !v.ids.has(c.id)) continue;
      const hay = haystack.get(c.id);
      if (t.every((w) => hay.includes(w))) ids.add(c.id);
    }
    return ids;
  }

  function syncUrl() {
    const p = new URLSearchParams();
    p.set('axis', state.axis);
    if (state.value) p.set('v', state.value);
    if (state.q) p.set('q', state.q);
    if (state.caseId) p.set('case', state.caseId);
    history.replaceState(null, '', `${location.pathname}?${p}`);
  }

  // ---- 축 탭 --------------------------------------------------------------------
  function renderTabs() {
    $('#pax3d-tabs').replaceChildren(...model.axes.map((axis) => {
      const b = el('button', 'pax3d-tab', axis.label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(axis.key === state.axis));
      b.addEventListener('click', () => {
        state.axis = axis.key;
        state.value = null;
        state.champQuery = '';
        applyFilter({ fly: false });
      });
      return b;
    }));
  }

  // ---- 값 칩 ---------------------------------------------------------------------
  function renderValues() {
    const axis = currentAxis();
    const search = $('#pax3d-search');
    search.hidden = !axis.searchable;
    if (axis.searchable && search.value !== state.champQuery) search.value = state.champQuery;
    const selected = currentValue();
    const openRegion = selected ? (selected.parent || selected.value) : null;
    let values = axis.values.filter((v) => !v.parent || v.parent === openRegion);
    if (axis.searchable && state.champQuery) {
      const q = state.champQuery.toLowerCase();
      values = values.filter((v) => `${v.label} ${v.sub} ${v.region || ''}`.toLowerCase().includes(q));
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
    $('#pax3d-values').replaceChildren(...nodes);
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
    const subBits = [v.sub, v.region ? `📍${v.region}` : null].filter(Boolean);
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
  function resultList() {
    const ids = matchedIds();
    return ids ? cases.filter((c) => ids.has(c.id)) : cases;
  }

  function renderResults() {
    const list = resultList();
    const v = currentValue();
    const t = terms();
    const bits = [];
    if (v) bits.push(`${currentAxis().label} · ${v.label}`);
    if (t.length) bits.push(`검색 '${state.q}'`);
    const head = $('#pax3d-results-head');
    head.replaceChildren(el('strong', null, bits.length ? bits.join(' + ') : '전체 사례'), el('span', null, ` ${list.length}건`));
    if (v && v.sub) head.appendChild(el('p', 'pax3d-results__sub', v.sub));
    if (v && v.href) {
      const a = el('a', 'pax3d-results__link', '챔피언 페이지 →');
      a.href = v.href;
      head.appendChild(a);
    }
    $('#pax3d-results').replaceChildren(...list.slice(0, state.shown).map((c) => {
      const li = el('li');
      const b = el('button', 'pax3d-result');
      b.type = 'button';
      if (c.id === state.caseId) b.setAttribute('aria-current', 'true');
      const dot = el('span', 'pax3d-dot');
      dot.style.background = TASK_COLORS[c.task_category] || '#b9ae9a';
      const title = el('span', 'pax3d-result__title');
      title.append(dot, ...marked(c.title, t));
      const meta = el('span', 'pax3d-result__meta');
      meta.append(...marked(`${c.org} · ${placeText(model.located.get(c.id))}`, t));
      b.append(thumb(c, 'pax3d-result__thumb'), title, meta);
      b.addEventListener('click', () => selectCase(c.id, { fly: true }));
      li.appendChild(b);
      return li;
    }));
    const more = $('#pax3d-more');
    more.hidden = list.length <= state.shown;
    more.textContent = `더 보기 (${list.length - state.shown}건 남음)`;
  }

  // ---- 사례 상세 ---------------------------------------------------------------------
  function mapLinks(loc) {
    const query = loc.inst ? (loc.inst.address || loc.inst.name)
      : loc.sgg ? `${loc.place} ${loc.sgg.name}` : loc.basis === 'island' ? null : loc.place;
    if (!query) return null;
    const wrap = el('p', 'pax3d-case__maps');
    wrap.appendChild(el('span', null, '지도에서 보기 '));
    const pt = loc.inst ? [loc.inst.lat, loc.inst.lon] : loc.sgg ? [loc.sgg.center[1], loc.sgg.center[0]] : null;
    const links = [
      ['카카오맵', `https://map.kakao.com/?q=${encodeURIComponent(query)}`],
      ['네이버지도', `https://map.naver.com/p/search/${encodeURIComponent(query)}`],
      ['OSM', pt ? `https://www.openstreetmap.org/?mlat=${pt[0]}&mlon=${pt[1]}#map=${loc.inst ? 16 : 12}/${pt[0]}/${pt[1]}`
        : `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`],
    ];
    for (const [name, href] of links) {
      const a = el('a', null, `${name} ↗`);
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      wrap.appendChild(a);
    }
    return wrap;
  }

  function renderCase() {
    const card = $('#pax3d-case');
    const c = state.caseId && byId.get(state.caseId);
    card.hidden = !c;
    if (!c) return;
    const loc = model.located.get(c.id);
    const chips = el('div', 'pax3d-case__chips');
    const task = el('span', 'pax3d-tag', c.task_category || '업무 미분류');
    task.style.setProperty('--tag', TASK_COLORS[c.task_category] || '#b9ae9a');
    chips.append(task, el('span', 'pax3d-tag', c.org_type));
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
      thumb(c, 'pax3d-case__thumb'),
      el('p', 'pax3d-case__org', c.org),
      el('h2', 'pax3d-case__title', c.title),
      chips,
      el('p', 'pax3d-case__place', `📍 ${placeText(loc)}${loc.inst && loc.inst.address ? ` — ${loc.inst.address}` : ''}`),
    ];
    const maps = mapLinks(loc);
    if (maps) nodes.push(maps);
    nodes.push(el('p', 'pax3d-case__summary', c.summary));
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
      if (window.matchMedia('(max-width: 1099px)').matches && !tour.running) {
        $('#pax3d-case').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        $('.pax3d-panel').scrollTo({ top: 0, behavior: 'smooth' });
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
        if (ids && state.axis === 'region' && state.value && !terms().length) world.flyToPlace(state.value);
        else if (ids && ids.size) world.flyToIds(ids);
        else if (!ids) world.flyHome();
      }
      if (state.caseId) world.focusCase(state.caseId, { fly: false });
    }
    syncUrl();
  }

  const tour = createTour({
    getIds: () => resultList().map((c) => c.id),
    show: (id) => selectCase(id, { fly: true }),
    world,
    button: $('#pax3d-tour'),
  });

  let qTimer = null;
  $('#pax3d-q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      state.shown = RESULT_PAGE;
      applyFilter({ fly: true });
    }, 350);
  });
  $('#pax3d-q-form').addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(qTimer);
    state.q = $('#pax3d-q').value.trim();
    applyFilter({ fly: true });
  });
  $('#pax3d-search').addEventListener('input', (e) => {
    state.champQuery = e.target.value.trim();
    renderValues();
  });
  $('#pax3d-more').addEventListener('click', () => {
    state.shown += RESULT_PAGE;
    renderResults();
  });
  $('#pax3d-home').addEventListener('click', () => {
    tour.stop();
    state.value = null;
    state.q = '';
    $('#pax3d-q').value = '';
    selectCase(null);
    applyFilter({ fly: true });
  });
  for (const [btn, fn] of [['#pax3d-ink', 'setInk'], ['#pax3d-tiles', 'setTiles']]) {
    $(btn).addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(on));
      if (world) world[fn](on);
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.caseId && !tour.running) selectCase(null);
  });

  applyFilter({ fly: Boolean(state.value || state.q) });
  if (state.caseId) selectCase(state.caseId, { fly: true });
}

function renderSummary(cases, model) {
  const located = [...model.located.values()];
  const onLand = located.filter((l) => l.basis !== 'island').length;
  const byInst = located.filter((l) => l.basis === 'institution').length;
  const bySgg = located.filter((l) => l.sgg).length;
  $('#pax3d-summary').textContent = `사례 ${cases.length}건 · 지도 위 ${onLand}건(기관 소재지 ${byInst} · 시군구까지 ${bySgg}) · 섬 ${cases.length - onLand}건`;
}

function renderLegend() {
  $('#pax3d-legend-colors').replaceChildren(...Object.entries(TASK_COLORS).map(([name, color]) => {
    const li = el('li');
    const dot = el('span', 'pax3d-dot');
    dot.style.background = color;
    li.append(dot, document.createTextNode(name));
    return li;
  }));
  $('#pax3d-legend-shapes').replaceChildren(...Object.values(SHAPES).map((t) => el('li', null, t)));
}

main();
