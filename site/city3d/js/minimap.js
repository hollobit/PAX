// 2D 지도(북쪽 위) — 3D와 같은 자료·같은 로컬 좌표로 그린 평면 지도에 지금 보고 있는 범위를 겹친다.
// 바탕은 도시를 바꿀 때 한 번만 그리고(오프스크린 캔버스), 매 프레임에는 시야 사각형·카메라만 다시 그린다.
import { toLonLat } from './geo.js?v=00345fad';

const BASE = 1024; // 바탕 해상도(px, 긴 변)
const MAP_ROAD = { 1: ['#d9772d', 2.2], 2: ['#e08b3a', 1.9], 3: ['#e0ac4a', 1.5], 4: ['#d8bf7f', 1.1], 5: ['#cfc6ae', 0.7] };

export function createMinimap(canvas, { onJump }) {
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');
  let city = null;
  let s = 1; // 바탕 px / m
  let footprint = null;
  let cameraXY = null;
  let target = null;

  function setCity(c) {
    city = c;
    const { W, H } = c.frame;
    s = BASE / Math.max(W, H);
    base.width = Math.ceil(W * s);
    base.height = Math.ceil(H * s);
    const g = base.getContext('2d');
    const px = (x) => x * s;
    const py = (n) => (H - n) * s;
    g.fillStyle = '#e9e6dc';
    g.fillRect(0, 0, base.width, base.height);
    // 경계 밖을 어둡게
    g.save();
    g.fillStyle = 'rgba(20,28,38,0.55)';
    g.beginPath();
    g.rect(0, 0, base.width, base.height);
    for (const ring of c.meta.outline) { ring.forEach(([x, n], i) => (i ? g.lineTo(px(x), py(n)) : g.moveTo(px(x), py(n)))); g.closePath(); }
    g.fill('evenodd');
    g.restore();
    const tri = (mesh, color) => {
      g.fillStyle = color;
      g.beginPath();
      const { xy, idx } = mesh;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 2; const b = idx[t + 1] * 2; const d = idx[t + 2] * 2;
        g.moveTo(px(xy[a]), py(xy[a + 1])); g.lineTo(px(xy[b]), py(xy[b + 1])); g.lineTo(px(xy[d]), py(xy[d + 1]));
      }
      g.fill();
    };
    tri(c.green, '#b7cf9c');
    tri(c.water, '#7fb0dd');
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const cls of [5, 4, 3, 2, 1]) {
      const [color, w] = MAP_ROAD[cls];
      g.strokeStyle = color;
      g.lineWidth = w;
      g.beginPath();
      for (const r of c.roads) {
        if (r.cls !== cls) continue;
        const p = r.pts;
        g.moveTo(px(p[0]), py(p[1]));
        for (let i = 2; i < p.length; i += 2) g.lineTo(px(p[i]), py(p[i + 1]));
      }
      g.stroke();
    }
    // 구·군 경계와 이름
    g.strokeStyle = 'rgba(90,70,120,0.75)';
    g.lineWidth = 1.2;
    g.setLineDash([5, 3]);
    for (const d of c.mapinfo.districts) {
      g.beginPath();
      for (const ring of d.polys) { ring.forEach(([x, n], i) => (i ? g.lineTo(px(x), py(n)) : g.moveTo(px(x), py(n)))); g.closePath(); }
      g.stroke();
    }
    g.setLineDash([]);
    g.font = '600 15px "IBM Plex Sans KR", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const d of c.mapinfo.districts) {
      g.lineWidth = 3.5;
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.strokeText(d.name, px(d.x), py(d.n));
      g.fillStyle = '#3c2f55';
      g.fillText(d.name, px(d.x), py(d.n));
    }
    g.strokeStyle = '#d07a1c';
    g.lineWidth = 2;
    for (const ring of c.meta.outline) { g.beginPath(); ring.forEach(([x, n], i) => (i ? g.lineTo(px(x), py(n)) : g.moveTo(px(x), py(n)))); g.closePath(); g.stroke(); }
    draw();
  }

  /** 캔버스 안 지도 배치(가운데 맞춤) */
  function layout() {
    const cw = canvas.width;
    const ch = canvas.height;
    const k = Math.min(cw / base.width, ch / base.height);
    return { k, ox: (cw - base.width * k) / 2, oy: (ch - base.height * k) / 2 };
  }

  function toCanvas(x, n) {
    const { k, ox, oy } = layout();
    return [ox + x * s * k, oy + (city.frame.H - n) * s * k];
  }

  function draw() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cw = Math.round(canvas.clientWidth * dpr);
    const ch = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.fillStyle = '#10161f';
    ctx.fillRect(0, 0, cw, ch);
    if (!city) return;
    const { k, ox, oy } = layout();
    ctx.drawImage(base, ox, oy, base.width * k, base.height * k);
    // 경위도 눈금(0.05°)
    const f = city.meta.frame;
    ctx.strokeStyle = 'rgba(40,60,90,0.18)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(40,55,75,0.8)';
    ctx.font = `${10 * dpr}px "IBM Plex Mono", monospace`;
    // 눈금 글자는 서로 60px 이상 떨어질 때만(작은 지도에서 겹치지 않게)
    let lastText = -Infinity;
    for (let lon = Math.ceil(f.lon0 / 0.05) * 0.05; lon < f.lon1; lon += 0.05) {
      const [x] = toCanvas((lon - f.lon0) * f.m_lon, 0);
      ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + base.height * k); ctx.stroke();
      if (x - lastText > 60 * dpr) { ctx.fillText(`${lon.toFixed(2)}°E`, x + 2 * dpr, oy + base.height * k - 4 * dpr); lastText = x; }
    }
    lastText = Infinity;
    for (let lat = Math.ceil(f.lat0 / 0.05) * 0.05; lat < f.lat1; lat += 0.05) {
      const [, y] = toCanvas(0, (lat - f.lat0) * f.m_lat);
      ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + base.width * k, y); ctx.stroke();
      if (lastText - y > 30 * dpr) { ctx.fillText(`${lat.toFixed(2)}°N`, ox + 3 * dpr, y - 3 * dpr); lastText = y; }
    }
    // 지금 3D 화면에 보이는 땅(화면 네 모서리 광선이 지면에 닿는 곳)
    if (footprint) {
      ctx.fillStyle = 'rgba(240,169,80,0.22)';
      ctx.strokeStyle = '#f0a950';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      footprint.forEach(([x, n], i) => { const [a, b] = toCanvas(x, n); if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    if (cameraXY && target) {
      const [cx, cy] = toCanvas(...cameraXY);
      const [tx, ty] = toCanvas(...target);
      ctx.strokeStyle = '#1b2533';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = '#1b2533';
      ctx.beginPath(); ctx.arc(cx, cy, 4 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0a950';
      ctx.beginPath(); ctx.arc(tx, ty, 3.5 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    // 축척 막대
    const meters = niceLength(city.frame.W / 5);
    const len = meters * s * k;
    const x0 = cw - len - 12 * dpr;
    const y0 = ch - 12 * dpr;
    ctx.fillStyle = 'rgba(16,22,31,0.8)';
    ctx.fillRect(x0 - 6 * dpr, y0 - 18 * dpr, len + 12 * dpr, 24 * dpr);
    ctx.fillStyle = '#e8edf2';
    ctx.fillRect(x0, y0 - 3 * dpr, len, 3 * dpr);
    ctx.fillText(meters >= 1000 ? `${meters / 1000} km` : `${meters} m`, x0, y0 - 7 * dpr);
    // 북쪽
    ctx.font = `700 ${12 * dpr}px "IBM Plex Sans KR", sans-serif`;
    ctx.fillStyle = '#1b2533';
    ctx.fillText('N ↑', 8 * dpr, 16 * dpr);
  }

  function niceLength(m) {
    const p = 10 ** Math.floor(Math.log10(m));
    return [1, 2, 5, 10].map((v) => v * p).reverse().find((v) => v <= m) || p;
  }

  function localAt(e) {
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    const { k, ox, oy } = layout();
    const x = ((e.clientX - r.left) * dpr - ox) / (s * k);
    const n = city.frame.H - ((e.clientY - r.top) * dpr - oy) / (s * k);
    return [x, n];
  }

  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (!city) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    onJump(...localAt(e), false);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!city) return;
    const [x, n] = localAt(e);
    const [lon, lat] = toLonLat(city.meta.frame, x, n);
    canvas.title = `${lat.toFixed(5)}, ${lon.toFixed(5)} — 누르거나 끌어서 3D 시점을 옮깁니다`;
    if (dragging) onJump(x, n, true);
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });

  return {
    setCity,
    /** 3D 쪽에서 매 프레임: 시야 네 모서리(로컬 m)·카메라·목표 */
    setView(fp, cam, tgt) { footprint = fp; cameraXY = cam; target = tgt; draw(); },
    redraw: draw,
  };
}
