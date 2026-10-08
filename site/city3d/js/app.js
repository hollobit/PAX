// 여섯 도시 입체지도 — 화면 구성과 도시 불러오기(파일마다 레코드 수·길이·CRC32 검증).
import { getJSON, loadCity as fetchCity } from './load.js?v=62517a49';
import { createWorld, MODES } from './world.js?v=a6e284f3';
import { ROAD_STYLE } from './layers.js?v=a697c85d';
import { createLabelLayer, LABEL_GROUPS, LABEL_KINDS } from './maplabels.js?v=107a28bb';
import { createMinimap } from './minimap.js?v=33146097';
import { createLocator, externalLinks, seatOf, toLonLat, toLocal } from './geo.js?v=00345fad';

const $ = (s) => document.querySelector(s);
const fmt = new Intl.NumberFormat('ko-KR');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// 단추 순서(나머지는 목록 순). 묶음(group)이 있는 도시 — 경기 시·군 — 는 단추 대신 고르기 상자 하나로.
const BUTTON_ORDER = ['seoul', 'busan', 'daegu', 'daejeon', 'incheon', 'sejong', 'gwangyang', 'jeju'];

/** 주소 인자 검사 — 도시 키는 목록 안에서만, 좌표는 한국 범위의 숫자만, 이름표는 60자까지 */
function parseFocus(params, keys) {
  const city = params.get('city');
  if (!keys.includes(city)) return null;
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  const ok = params.has('lat') && params.has('lon') && lat > 33 && lat < 39 && lon > 124 && lon < 132;
  const clean = (v, n) => (v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  // place = 시군구 이름(사례 자리를 시군구까지만 알 때) — 좌표 대신 그 시군구 청사(없으면 구 이름표 자리)로 맞춘다
  return { city, lat: ok ? lat : null, lon: ok ? lon : null, label: clean(params.get('label'), 60), place: clean(params.get('place'), 20), done: false };
}

/** 3D PAX로 돌아가는 링크 — GitHub Pages(같은 사이트)에서는 상대 경로, 다른 곳(Claude 아티팩트 등)에서는 공개 주소 */
function setupBackLink(caseId) {
  const a = document.querySelector('#back');
  if (!a) return;
  const sameSite = /github\.io$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);
  const base = sameSite ? '../pax3d.html' : 'https://hollobit.github.io/PAX/pax3d.html';
  a.href = caseId && /^[a-f0-9]{8,64}$/.test(caseId) ? `${base}?case=${encodeURIComponent(caseId)}` : base;
}

function snapshotText(s) {
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/.exec(s || '');
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} UTC` : s;
}

async function main() {
  const index = await getJSON('data/cities.json');
  const state = { key: null, mode: 'day', vscale: 1, mark: true, city: null };
  // 바깥에서 여는 주소: ?city=busan&lat=35.16&lon=129.16&label=기관명&case=사례id (3D PAX가 이렇게 연다)
  const params = new URLSearchParams(location.search);
  const want = parseFocus(params, Object.keys(index.cities));
  setupBackLink(params.get('case'));
  const stats = { visible: 0, total: 0, fps: null, calls: 0, tris: 0 };

  let locator = null;
  const labels = createLabelLayer($('#labels'), { onClick: (it) => world.flyToLocal(it.x, it.n, it.k === 'district' || it.k === 'city' ? 7000 : 1800) });
  const minimap = createMinimap($('#minimap'), { onJump: (x, n, instant) => world.jumpToLocal(x, n, instant) });
  let lastView = '';
  const world = createWorld($('#map'), {
    onPick: (i, e) => (i == null ? showPoint(world.pickGround(e.clientX, e.clientY)) : showBuilding(i)),
    onStats: (s) => { Object.assign(stats, s); renderStats(); },
    onTour: (t) => renderTour(t),
    // 매 프레임: 이름표 재투영(카메라가 움직였을 때만) + 2D 지도 시야 사각형
    onFrame: (w) => {
      const [width, height] = w.size;
      labels.update(w.camera, w.vscale, width, height);
      const v = w.view();
      const key = `${v.cam.map(Math.round)}|${v.target.map(Math.round)}|${w.camera.quaternion.toArray().map((q) => q.toFixed(3))}`;
      if (key !== lastView) { lastView = key; minimap.setView(w.footprint(), v.cam, v.target); }
    },
  });
  if (location.hash === '#bench') window.__city3d = world; // 측정용(주소 끝 #bench일 때만)
  $('#budget').textContent = `${world.budget.label} 예산 · 픽셀 비율 ${world.budget.dpr.toFixed(2)} · 그림자 ${world.budget.shadow}px · 건물 최대 ${fmt.format(world.budget.buildings)}채 · 지형 ${30 * world.budget.terrainStep}m 격자`;
  $('#snapshot').textContent = snapshotText(index.snapshot);

  // 도시 단추
  const keys = Object.keys(index.cities);
  const singles = [...BUTTON_ORDER.filter((k) => index.cities[k]), ...keys.filter((k) => !BUTTON_ORDER.includes(k) && !index.cities[k].group)];
  const groups = [...new Set(keys.map((k) => index.cities[k].group).filter(Boolean))];
  $('#cities').replaceChildren(
    ...singles.map((k) => {
      const b = el('button', 'seg', index.cities[k].name);
      b.type = 'button';
      b.dataset.key = k;
      b.addEventListener('click', () => loadCity(k));
      return b;
    }),
    ...groups.map((g) => {
      const sel = el('select', 'seg seg--select');
      sel.dataset.group = g;
      sel.setAttribute('aria-label', `${g} 시·군 고르기`);
      const first = el('option', null, `${g} 시·군 ▾`);
      first.value = '';
      sel.append(first, ...keys.filter((k) => index.cities[k].group === g)
        .sort((a, b) => index.cities[a].name.localeCompare(index.cities[b].name, 'ko'))
        .map((k) => { const o = el('option', null, index.cities[k].name); o.value = k; return o; }));
      sel.addEventListener('change', () => { if (sel.value) loadCity(sel.value); });
      return sel;
    }),
  );
  // 시간대
  $('#modes').replaceChildren(...Object.entries(MODES).map(([k, m]) => {
    const b = el('button', 'seg', m.label);
    b.type = 'button';
    b.dataset.key = k;
    b.setAttribute('aria-pressed', String(k === state.mode));
    b.addEventListener('click', () => {
      state.mode = k;
      world.setMode(k);
      for (const x of $('#modes').children) x.setAttribute('aria-pressed', String(x.dataset.key === k));
    });
    return b;
  }));
  // 지형 배율
  for (const b of document.querySelectorAll('#vscale .seg')) {
    b.addEventListener('click', () => {
      state.vscale = Number(b.dataset.v);
      for (const x of document.querySelectorAll('#vscale .seg')) x.setAttribute('aria-pressed', String(x === b));
      $('#vscale-note').textContent = state.vscale === 1
        ? '1× — 실제 축척입니다. 수평·수직 모두 같은 미터 단위이고 과장하지 않았습니다.'
        : '2× — 지형 표고만 2배로 과장했습니다. 완만한 구릉과 하천 골짜기를 읽기 쉽게 하려는 것이며, 건물 높이는 과장하지 않습니다.';
      if (state.city) setBusy('지형 배율을 바꾸는 중…', () => world.setVScale(state.vscale));
    });
  }
  $('#tour-btn').addEventListener('click', () => {
    if (world.touring) world.stopTour();
    else if (!world.startTour()) renderTour({ phase: 'empty' });
  });
  $('#mark').addEventListener('change', (e) => { state.mark = e.target.checked; world.setMarkEstimated(state.mark); });
  $('#panel-toggle').addEventListener('click', () => {
    const open = $('#panel').classList.toggle('panel--open');
    $('#panel-toggle').setAttribute('aria-expanded', String(open));
  });

  renderLegend();
  renderLabelToggles();
  $('#minimap-size').addEventListener('click', () => {
    const big = $('#minimap-card').classList.toggle('mini--big');
    $('#minimap-size').setAttribute('aria-pressed', String(big));
    $('#minimap-size').textContent = big ? '작게' : '크게';
    requestAnimationFrame(() => { lastView = ''; minimap.redraw(); });
  });
  // 커서 아래 지점: 위도·경도·표고·구·가까운 동네(마우스일 때만, 한 프레임에 한 번)
  let hoverEv = null;
  $('#map').addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (!hoverEv) requestAnimationFrame(() => { renderCursor(world.pickGround(hoverEv.clientX, hoverEv.clientY)); hoverEv = null; });
    hoverEv = e;
  });
  $('#map').addEventListener('pointerleave', () => renderCursor(null));

  function setBusy(text, fn) {
    $('#busy').textContent = text;
    $('#busy').hidden = false;
    requestAnimationFrame(() => setTimeout(() => {
      try { fn(); } finally { $('#busy').hidden = true; }
    }, 20));
  }

  async function loadCity(key) {
    if (state.key === key) return;
    state.key = key;
    for (const x of $('#cities').children) {
      if (x.tagName === 'SELECT') {
        const mine = index.cities[key].group === x.dataset.group;
        x.value = mine ? key : '';
        x.setAttribute('aria-pressed', String(mine));
      } else x.setAttribute('aria-pressed', String(x.dataset.key === key));
    }
    $('#busy').hidden = false;
    $('#busy').textContent = `${index.cities[key].name} 자료를 받는 중…`;
    $('#error').hidden = true;
    const t0 = performance.now();
    try {
      const city = await fetchCity('data', key, (msg) => { $('#busy').textContent = msg; });
      const { meta, mapinfo } = city;
      $('#verify').textContent = `검증 통과 — 파일 ${city.files}개 · ${fmt.format(Math.round(city.bytes / 1024))}KB · 레코드 수·본문 길이·CRC32 일치`;
      $('#busy').textContent = '장면을 짓는 중…';
      await new Promise((r) => setTimeout(r, 10));
      world.setCity(city);
      state.city = city;
      locator = createLocator(mapinfo);
      minimap.setCity({ ...city, frame: world.frame });
      lastView = '';
      renderLabelCounts(mapinfo);
      renderCity(meta);
      $('#loadtime').textContent = `불러오기·검증·장면 구성 ${((performance.now() - t0) / 1000).toFixed(1)}초`;
      showBuilding(null);
      applyFocus(key, meta, mapinfo);
      syncUrl(key);
    } catch (err) {
      $('#error').textContent = `불러오지 못했습니다: ${err.message}`;
      $('#error').hidden = false;
      state.key = null;
    } finally {
      $('#busy').hidden = true;
    }
  }

  function renderCity(meta) {
    const c = meta.counts;
    const rows = [
      ['건물', c.buildings], ['높이 추정(기본 5m)', c.estimated_height], ['도로·철도 선', c.roads],
      ['하천 중심선', c.waterways], ['수면 삼각형', c.water_triangles], ['숲·공원 삼각형', c.green_triangles],
      ['표고 격자', meta.terrain.cols * meta.terrain.rows],
    ];
    $('#counts').replaceChildren(...rows.map(([k, v]) => {
      const d = el('div', 'kv');
      d.append(el('span', null, k), el('b', 'num', fmt.format(v)));
      return d;
    }));
    const est = ((c.estimated_height / c.buildings) * 100).toFixed(0);
    $('#est-note').textContent = meta.building_source === 'molit-gis'
      ? `${meta.name} 건물은 국토교통부 GIS건물통합정보(건축물대장 높이·지상층수)로 세웠습니다. ${est}%는 높이·층수가 모두 없어 기본값 5m로 세운 추정 높이입니다(회색).`
      : `${meta.name} 건물의 ${est}%는 OSM에 높이·층수가 없어 OpenMapTiles 기본값 5m로 세운 추정 높이입니다(회색).`;
    $('#city-note').textContent = meta.note ? `경계: ${meta.note}` : '';
    $('#landmarks').replaceChildren(...meta.landmarks.map((l) => {
      const b = el('button', 'chip', l.name);
      b.type = 'button';
      b.title = l.source === 'OSM POI' ? `OSM 지점: ${l.osm_name}` : '대략 좌표(추정)';
      if (l.source !== 'OSM POI') b.classList.add('chip--est');
      b.addEventListener('click', () => world.flyToLocal(l.x, l.n, 2400));
      return b;
    }));
    $('#terrain-range').textContent = `표고 ${fmt.format(Math.round(meta.terrain.min_m))}~${fmt.format(Math.round(meta.terrain.max_m))}m · AWS Terrain Tiles z${meta.terrain.source_zoom} → 30m 격자`;
  }

  function renderStats() {
    $('#stat-fps').textContent = stats.fps ? stats.fps.toFixed(0) : '–';
    $('#stat-vis').textContent = stats.total ? `${fmt.format(stats.visible)} / ${fmt.format(stats.total)}` : '–';
    $('#stat-calls').textContent = fmt.format(stats.calls);
    $('#stat-tris').textContent = fmt.format(stats.tris);
  }

  function showBuilding(i) {
    const box = $('#building');
    if (i == null || !state.city) {
      box.replaceChildren(el('p', 'muted', '건물을 누르면 원본 높이·바닥면적·지면 표고가 여기에 나옵니다.'));
      return;
    }
    const b = state.city.b;
    const f = state.city.meta.frame;
    const fl = b.flags[i];
    const est = fl & 1;
    const lon = f.lon0 + b.x[i] / f.m_lon;
    const lat = f.lat0 + b.y[i] / f.m_lat;
    const rows = [
      ['높이', fl & 2 ? `${fmt.format(b.h[i])} m — 추정(보정)` : est ? '5 m — 추정' : fl & 8 ? `${fmt.format(b.h[i])} m — 지상층수 × 3m` : `${fmt.format(b.h[i])} m`],
      ['자료', fl & 4 ? '국토교통부 GIS건물통합정보' : 'OpenStreetMap'],
      ...(b.h0[i] > 0 ? [['시작 높이', `${fmt.format(b.h0[i])} m`]] : []),
      ['바닥면적(원본 윤곽)', b.area[i] >= 65535 ? '65,535 ㎡ 이상' : `${fmt.format(b.area[i])} ㎡`],
      ['표시 상자', `${b.w[i].toFixed(1)} × ${b.d[i].toFixed(1)} m`],
      ['지면 표고', `${world.groundAt(b.x[i], b.y[i]).toFixed(1)} m`],
      ...placeRows(b.x[i], b.y[i]).rows,
    ];
    box.replaceChildren(
      ...rows.map(([k, v]) => { const d = el('div', 'kv'); d.append(el('span', null, k), el('b', 'num', v)); return d; }),
      el('p', 'muted small', buildingNote(fl)),
      linksNode(lat, lon, placeRows(b.x[i], b.y[i]).label),
    );
  }

  /** 높이를 어디서 정했는지 — 플래그 1 추정·2 보정·4 건물통합정보·8 층수 환산 */
  function buildingNote(fl) {
    if (fl & 4) {
      if (fl & 1) return '건물통합정보에 높이·층수가 없고 같은 자리 OSM 건물에도 높이가 없어 기본값 5m로 세운 추정값입니다.';
      if (fl & 8) return '건물통합정보의 지상층수에 층고 3m를 곱한 값입니다. 실제 높이와 다를 수 있습니다.';
      return '건물통합정보의 건축물대장 높이입니다(없으면 같은 자리 OSM 건물의 실제 높이). 윤곽·면적은 건물통합정보입니다.';
    }
    if (fl & 2) return 'OSM에 시작 높이(min_height)만 있고 높이가 없어 기본값 5m가 시작 높이보다 낮았습니다. 시작 높이 + 3m로 세운 추정값입니다.';
    if (fl & 1) return 'OSM에 height·building:levels가 없어 OpenMapTiles가 넣는 기본값입니다. 실제 높이와 다를 수 있습니다.';
    return 'OSM height 태그(없으면 building:levels × 3.66m)를 OpenMapTiles가 정수로 반올림한 값입니다.';
  }

  function placeRows(x, n) {
    const [lon, lat] = toLonLat(state.city.meta.frame, x, n);
    const gu = locator.district(x, n);
    const q = locator.nearestQuarter(x, n);
    return {
      lat, lon,
      rows: [
        ['구·군', gu || '경계 밖'],
        ['가까운 동네', q ? `${q.name} (이름 점에서 ${fmt.format(Math.round(q.dist))}m)` : '2.5km 안에 없음'],
        ['위도·경도', `${lat.toFixed(5)}, ${lon.toFixed(5)}`],
      ],
      label: [gu, q?.name].filter(Boolean).join(' ') || state.city.meta.name,
    };
  }

  function linksNode(lat, lon, name) {
    const p = el('p', 'links small');
    p.append(document.createTextNode('실제 지도에서 보기: '));
    externalLinks(lat, lon, name).forEach(([t, href], i) => {
      if (i) p.append(document.createTextNode(' · '));
      const a = el('a', null, t);
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      p.append(a);
    });
    return p;
  }

  function kvRows(rows) {
    return rows.map(([k, v]) => { const d = el('div', 'kv'); d.append(el('span', null, k), el('b', 'num', v)); return d; });
  }

  /** 건물이 아닌 땅을 눌렀을 때 — 그 지점의 실제 위치 정보 */
  function showPoint(p, title) {
    if (!p || !state.city) { showBuilding(null); return; }
    const info = placeRows(p.x, p.n);
    $('#building').replaceChildren(
      el('p', 'muted small', title ? `📍 ${title}` : '누른 지점(건물 아님)'),
      ...kvRows([...info.rows, ['지면 표고', `${p.elev.toFixed(1)} m`]]),
      linksNode(info.lat, info.lon, info.label),
    );
  }

  function renderCursor(p) {
    const box = $('#cursor');
    if (!p || !state.city) { box.textContent = '지도 위에 마우스를 올리면 그 지점의 위도·경도·표고·구가 나옵니다.'; return; }
    const [lon, lat] = toLonLat(state.city.meta.frame, p.x, p.n);
    const gu = locator.district(p.x, p.n);
    const q = locator.nearestQuarter(p.x, p.n, 1500);
    box.textContent = `${lat.toFixed(5)}°N ${lon.toFixed(5)}°E · 표고 ${p.elev.toFixed(0)}m · ${gu || '경계 밖'}${q ? ` · ${q.name} 근처` : ''}`;
  }

  function renderLabelToggles() {
    $('#label-groups').replaceChildren(...Object.entries(LABEL_GROUPS).map(([g, t]) => {
      const lab = el('label', 'check');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.addEventListener('change', () => labels.setGroup(g, cb.checked));
      const count = el('span', 'num muted', '');
      count.dataset.group = g;
      lab.append(cb, document.createTextNode(t), count);
      return lab;
    }));
  }

  function renderLabelCounts(mapinfo) {
    const byGroup = {};
    for (const [k, n] of Object.entries(mapinfo.counts)) {
      if (k === 'city' && mapinfo.districts.length > 1) continue; // 구가 있는 도시는 시 이름표를 띄우지 않는다
      const g = LABEL_KINDS[k]?.group;
      if (g) byGroup[g] = (byGroup[g] || 0) + n;
    }
    for (const s of document.querySelectorAll('#label-groups [data-group]')) s.textContent = fmt.format(byGroup[s.dataset.group] || 0);
  }

  /** 비행 상태 — 지금 날아가는 랜드마크 이름과 순번 */
  function renderTour(t) {
    const cap = $('#tour-caption');
    const on = t.phase === 'stop';
    $('#tour-btn').setAttribute('aria-pressed', String(on));
    $('#tour-btn').textContent = on ? '■ 비행 멈추기' : '✈ 랜드마크 비행';
    cap.hidden = t.phase === 'end' && !t.finished;
    cap.textContent = on ? `✈ ${t.i + 1}/${t.total} · ${t.name}`
      : t.phase === 'empty' ? 'OSM에서 확인된 랜드마크가 없어 비행할 수 없습니다.'
        : '비행을 마쳤습니다.';
  }

  function renderLegend() {
    const items = [
      ['swatch--water', '물(바다·강·호수)'], ['swatch--wood', '숲'], ['swatch--park', '공원·녹지'],
      ['swatch--low', '낮은 건물'], ['swatch--high', '높은 건물(180m+)'], ['swatch--est', '추정 높이 건물'],
    ];
    const roadItems = [1, 3, 5, 6, 8].map((k) => [ROAD_STYLE[k].color, ROAD_STYLE[k].name]);
    $('#legend').replaceChildren(
      ...items.map(([cls, t]) => { const li = el('li'); li.append(el('i', `swatch ${cls}`), document.createTextNode(t)); return li; }),
      ...roadItems.map(([c, t]) => { const li = el('li'); const i = el('i', 'swatch swatch--road'); i.style.background = c; li.append(i, document.createTextNode(t)); return li; }),
    );
  }

  /** 넘겨받은 지점을 이 도시 좌표로 옮겨 표시하고 그곳으로 날아간다. 도시 범위 밖이면 알리고 무시한다. */
  function applyFocus(key, meta, mapinfo) {
    const seat = want && want.city === key && want.place ? seatOf(mapinfo, want.place, createLocator(mapinfo)) : null;
    const focus = seat ? { x: seat.x, n: seat.n, label: `${want.label || want.place} · ${seat.name}` }
      : want && want.city === key && want.lat != null ? (() => {
      const [x, n] = toLocal(meta.frame, want.lon, want.lat);
      return x >= 0 && n >= 0 && x <= meta.frame.width && n <= meta.frame.height ? { x, n, label: want.label || '넘겨받은 지점' } : null;
    })() : null;
    labels.setLabels(mapinfo, world.frame, focus);
    world.setFocus(focus);
    if (want && want.city === key && want.lat != null && !focus) $('#cursor').textContent = `넘겨받은 좌표(${want.lat}, ${want.lon})가 ${meta.name} 지도 범위 밖입니다.`;
    if (focus && !want.done) {
      want.done = true;
      world.flyToLocal(focus.x, focus.n, 1600);
      showPoint({ x: focus.x, n: focus.n, elev: world.groundAt(focus.x, focus.n) }, focus.label);
    }
  }

  function syncUrl(key) {
    const q = new URLSearchParams(location.search);
    q.set('city', key);
    if (!want || want.city !== key) { q.delete('lat'); q.delete('lon'); q.delete('label'); q.delete('place'); }
    try { history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`); } catch { /* 샌드박스 등에서 막히면 주소만 그대로 */ }
  }

  loadCity(want ? want.city : 'seoul');
}

main().catch((e) => {
  const n = document.querySelector('#error');
  n.textContent = `시작하지 못했습니다: ${e.message}`;
  n.hidden = false;
});
