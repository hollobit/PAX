// 장면 층 — 지형, 물, 숲·공원, 도로·철도, 하천, 건물(InstancedMesh).
// 좌표: 도시 로컬 (x 동쪽 m, n 북쪽 m) → 월드 (X = x - W/2, Z = H/2 - n, Y = 표고 × 지형 배율).
import * as THREE from 'three';

export const ROAD_STYLE = {
  1: { name: '고속도로', w: 24, color: '#e38a3a', lift: 1.0 },
  2: { name: '도시고속·간선', w: 20, color: '#ee9f47', lift: 0.9 },
  3: { name: '주간선도로', w: 16, color: '#f1bf5a', lift: 0.8 },
  4: { name: '보조간선도로', w: 12, color: '#f5d68b', lift: 0.7 },
  5: { name: '집산도로', w: 10, color: '#f8e6b8', lift: 0.6 },
  6: { name: '국지도로', w: 6.5, color: '#f3efe6', lift: 0.5 },
  7: { name: '진입로', w: 4, color: '#e6e0d4', lift: 0.4 },
  8: { name: '철도', w: 4, color: '#5d6270', lift: 1.1 },
  9: { name: '도시철도', w: 3.5, color: '#7b6ea6', lift: 1.1 },
};
const WATERWAY_W = { 1: 34, 2: 16, 3: 5, 4: 2.5 };
const GREEN_COLOR = { 1: '#557f47', 2: '#86b366', 3: '#a4c585' };
export const WATER_COLOR = '#3a7bbf';

export function makeFrame(meta, dem) {
  const W = meta.frame.width;
  const H = meta.frame.height;
  const { cols, rows, cell, h } = dem;
  /** 로컬 (x, n) 표고(m) — 쌍선형 */
  function elev(x, n) {
    const fc = x / cell;
    const fr = rows - 1 - n / cell;
    if (fc < 0 || fr < 0 || fc > cols - 1 || fr > rows - 1) return 0;
    const c = Math.min(cols - 2, Math.floor(fc));
    const r = Math.min(rows - 2, Math.floor(fr));
    const tx = fc - c;
    const ty = fr - r;
    const i = r * cols + c;
    return h[i] * (1 - tx) * (1 - ty) + h[i + 1] * tx * (1 - ty) + h[i + cols] * (1 - tx) * ty + h[i + cols + 1] * tx * ty;
  }
  return {
    W, H, elev,
    X: (x) => x - W / 2,
    Z: (n) => H / 2 - n,
    local: (X, Z) => [X + W / 2, H / 2 - Z],
  };
}

// ---- 지형 ------------------------------------------------------------------------
const RAMP = [
  [-50, '#6f8aa0'], [0, '#c9c4b2'], [25, '#d3d0bd'], [80, '#bcc99c'], [200, '#94ae78'],
  [450, '#77945e'], [800, '#8c8a72'], [1200, '#b3ab98'], [2000, '#dcd8cf'],
].map(([m, c]) => [m, new THREE.Color(c)]);

function rampColor(m, out) {
  for (let i = 1; i < RAMP.length; i++) {
    if (m <= RAMP[i][0]) {
      const [m0, c0] = RAMP[i - 1];
      const [m1, c1] = RAMP[i];
      return out.copy(c0).lerp(c1, Math.max(0, (m - m0) / (m1 - m0)));
    }
  }
  return out.copy(RAMP[RAMP.length - 1][1]);
}

/**
 * 물 밑 지형 깎기 — 수면 삼각형은 강둑 꼭짓점 높이만 가져 강 가운데의 30m 표고가 수면보다 높으면 땅이 물을 덮는다.
 * 수면 삼각형을 표고 격자에 래스터화해 그 칸의 땅을 수면보다 WATER_DEPTH 아래로 내린다(원본 표고는 건드리지 않고 사본).
 * @returns {{h: Float32Array, mask: Uint8Array, cells: number}} 깎은 표고 사본, 수면 밑 칸 표시, 깎인 칸 수
 */
export const WATER_DEPTH = 2.5;
export function carveWater(frame, dem, water) {
  const { cols, rows, cell } = dem;
  const h = Float32Array.from(dem.h);
  const mask = new Uint8Array(h.length); // 물 밑으로 깎인 칸
  const { xy, idx } = water;
  const level = new Float32Array(water.nv); // buildArea(flatWater)와 같은 규칙의 수면 높이(띄우기 전)
  for (let i = 0; i < water.nv; i++) {
    const e = frame.elev(xy[i * 2], xy[i * 2 + 1]);
    level[i] = e < 5 ? 0 : Math.max(e, 0);
  }
  let cells = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]; const b = idx[t + 1]; const c = idx[t + 2];
    const ax = xy[a * 2]; const an = xy[a * 2 + 1];
    const bx = xy[b * 2]; const bn = xy[b * 2 + 1];
    const cx = xy[c * 2]; const cn = xy[c * 2 + 1];
    const den = (bn - cn) * (ax - cx) + (cx - bx) * (an - cn);
    if (Math.abs(den) < 1e-6) continue;
    // 격자 칸(열 c = x/cell, 행 r = rows−1−n/cell) 범위
    const c0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) / cell));
    const c1 = Math.min(cols - 1, Math.ceil(Math.max(ax, bx, cx) / cell));
    const r0 = Math.max(0, Math.floor(rows - 1 - Math.max(an, bn, cn) / cell));
    const r1 = Math.min(rows - 1, Math.ceil(rows - 1 - Math.min(an, bn, cn) / cell));
    for (let r = r0; r <= r1; r++) {
      const n = (rows - 1 - r) * cell;
      for (let k = c0; k <= c1; k++) {
        const x = k * cell;
        const w1 = ((bn - cn) * (x - cx) + (cx - bx) * (n - cn)) / den;
        const w2 = ((cn - an) * (x - cx) + (ax - cx) * (n - cn)) / den;
        const w3 = 1 - w1 - w2;
        if (w1 < -1e-4 || w2 < -1e-4 || w3 < -1e-4) continue;
        const i = r * cols + k;
        if (dem.void[i]) continue;
        const wl = w1 * level[a] + w2 * level[b] + w3 * level[c];
        if (h[i] > wl - WATER_DEPTH) { h[i] = wl - WATER_DEPTH; cells++; }
        mask[i] = 1;
      }
    }
  }
  return { h, mask, cells };
}

/**
 * @param carved carveWater 결과(없으면 원본 표고). 지형을 step칸마다 성기게 뽑을 때 좁은 물길이 꼭짓점 사이로 빠져
 *        다시 땅에 덮이지 않도록, 꼭짓점 둘레(step칸)에 물 칸이 있으면 그 물 칸의 가장 낮은 높이를 쓴다.
 */
/**
 * 숲·공원을 지형 색으로 칠하기 — 큰 숲 다각형은 earcut 삼각형이 수 km짜리 평면이 되어 산등성이를 뚫거나 덮는다
 * (봉우리 둘레에 부채꼴 판이 생기는 문제). 변 하나라도 maxEdge(m)보다 긴 삼각형은 표고 격자에 래스터화해 그 칸의
 * 지형 색으로 칠하고(지형을 그대로 따른다), 작은 삼각형(도심 공원 등)만 얹는 면으로 남긴다.
 * @returns {{cls: Uint8Array, small: Uint32Array, painted: number, dropped: number}}
 */
export function paintGreen(frame, dem, green, maxEdge = 150) {
  const { cols, rows, cell } = dem;
  const cls = new Uint8Array(cols * rows);
  const { xy, idx } = green;
  const keep = [];
  let painted = 0;
  let dropped = 0;
  const m2 = maxEdge * maxEdge;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]; const b = idx[t + 1]; const c = idx[t + 2];
    const ax = xy[a * 2]; const an = xy[a * 2 + 1];
    const bx = xy[b * 2]; const bn = xy[b * 2 + 1];
    const cx = xy[c * 2]; const cn = xy[c * 2 + 1];
    const long = (ax - bx) ** 2 + (an - bn) ** 2 > m2 || (bx - cx) ** 2 + (bn - cn) ** 2 > m2 || (cx - ax) ** 2 + (cn - an) ** 2 > m2;
    if (!long) { keep.push(a, b, c); continue; }
    dropped++;
    const k = green.cls ? green.cls[a] : 3;
    const den = (bn - cn) * (ax - cx) + (cx - bx) * (an - cn);
    if (Math.abs(den) < 1e-6) continue;
    const c0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) / cell));
    const c1 = Math.min(cols - 1, Math.ceil(Math.max(ax, bx, cx) / cell));
    const r0 = Math.max(0, Math.floor(rows - 1 - Math.max(an, bn, cn) / cell));
    const r1 = Math.min(rows - 1, Math.ceil(rows - 1 - Math.min(an, bn, cn) / cell));
    for (let r = r0; r <= r1; r++) {
      const n = (rows - 1 - r) * cell;
      for (let q = c0; q <= c1; q++) {
        const x = q * cell;
        const w1 = ((bn - cn) * (x - cx) + (cx - bx) * (n - cn)) / den;
        const w2 = ((cn - an) * (x - cx) + (ax - cx) * (n - cn)) / den;
        if (w1 < -1e-4 || w2 < -1e-4 || 1 - w1 - w2 < -1e-4) continue;
        const i = r * cols + q;
        if (!cls[i]) painted++;
        cls[i] = k || 3;
      }
    }
  }
  return { cls, small: Uint32Array.from(keep), painted, dropped };
}

export function buildTerrain(frame, dem, vscale, step, carved = null, green = null) {
  const { cols, rows, cell } = dem;
  const h = carved ? carved.h : dem.h;
  const half = Math.floor(step / 2);
  const sample = (r0, k0) => {
    const i = r0 * cols + k0;
    if (!carved || step < 2) return h[i];
    let low = Infinity;
    for (let r = Math.max(0, r0 - half); r <= Math.min(rows - 1, r0 + half); r++) {
      for (let k = Math.max(0, k0 - half); k <= Math.min(cols - 1, k0 + half); k++) {
        const j = r * cols + k;
        if (carved.mask[j] && h[j] < low) low = h[j];
      }
    }
    return low < Infinity ? Math.min(low, h[i]) : h[i];
  };
  const nc = Math.floor((cols - 1) / step) + 1;
  const nr = Math.floor((rows - 1) / step) + 1;
  const pos = new Float32Array(nc * nr * 3);
  const col = new Float32Array(nc * nr * 3);
  const c = new THREE.Color();
  for (let r = 0; r < nr; r++) {
    for (let k = 0; k < nc; k++) {
      const i = (r * step) * cols + k * step;
      const m = sample(r * step, k * step);
      const x = k * step * cell;
      const n = (rows - 1 - r * step) * cell;
      const o = (r * nc + k) * 3;
      pos[o] = frame.X(x);
      const empty = dem.void[i];
      pos[o + 1] = empty ? -25 : Math.max(m, -3) * vscale;
      pos[o + 2] = frame.Z(n);
      (empty ? c.set('#56606b') : green && green.cls[i] ? c.set(GREEN_COLOR[green.cls[i]] || GREEN_COLOR[3]) : rampColor(m, c)).toArray(col, o);
    }
  }
  const idx = new Uint32Array((nc - 1) * (nr - 1) * 6);
  let t = 0;
  for (let r = 0; r < nr - 1; r++) {
    for (let k = 0; k < nc - 1; k++) {
      const a = r * nc + k;
      idx.set([a, a + nc, a + 1, a + 1, a + nc, a + nc + 1], t);
      t += 6;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** 도시 경계선 — 지형 위 3m에 */
export function buildOutline(frame, outline, vscale) {
  const pts = [];
  for (const ring of outline) {
    for (let i = 0; i < ring.length - 1; i++) {
      for (const [x, n] of [ring[i], ring[i + 1]]) pts.push(frame.X(x), Math.max(frame.elev(x, n), 0) * vscale + 6, frame.Z(n));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#f0a950', transparent: true, opacity: 0.85 }));
  line.name = 'outline';
  return line;
}

/** 구·군 경계 — 지형을 따라 50m마다 표고를 다시 읽어 선을 땅에 붙인다(경계선이 산을 뚫지 않게) */
export function buildDistrictLines(frame, districts, vscale) {
  const pts = [];
  const at = (x, n) => [frame.X(x), Math.max(frame.elev(x, n), 0) * vscale + 5, frame.Z(n)];
  for (const d of districts) {
    for (const ring of d.polys) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [x0, n0] = ring[i];
        const [x1, n1] = ring[i + 1];
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, n1 - n0) / 50));
        for (let k = 0; k < steps; k++) {
          pts.push(...at(x0 + ((x1 - x0) * k) / steps, n0 + ((n1 - n0) * k) / steps));
          pts.push(...at(x0 + ((x1 - x0) * (k + 1)) / steps, n0 + ((n1 - n0) * (k + 1)) / steps));
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#b48cff', transparent: true, opacity: 0.8 }));
  line.name = 'districts';
  return line;
}

// ---- 면(물·숲·공원) — 지형에 얹는다 ---------------------------------------------------------
export function buildArea(frame, mesh, vscale, lift, material, colorOf, flatWater = false) {
  const pos = new Float32Array(mesh.nv * 3);
  const col = colorOf ? new Float32Array(mesh.nv * 3) : null;
  const tmp = new THREE.Color();
  for (let i = 0; i < mesh.nv; i++) {
    const x = mesh.xy[i * 2];
    const n = mesh.xy[i * 2 + 1];
    pos[i * 3] = frame.X(x);
    const e = frame.elev(x, n);
    // 바다·해안 수면은 평평하게(해발 5m 미만은 0) — 해안 꼭짓점의 지형 높이로 큰 삼각형이 기울면 빛줄기가 생긴다
    pos[i * 3 + 1] = (flatWater && e < 5 ? 0 : Math.max(e, 0)) * vscale + lift;
    pos[i * 3 + 2] = frame.Z(n);
    if (col) tmp.set(colorOf(mesh.cls[i])).toArray(col, i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(mesh.idx, 1));
  if (flatWater) {
    // 수면은 모두 위를 향한 법선 — 잔잔한 물처럼 고르게 비친다
    const nrm = new Float32Array(mesh.nv * 3);
    for (let i = 0; i < mesh.nv; i++) nrm[i * 3 + 1] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  } else geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  return m;
}

export function buildWater(frame, mesh, vscale) {
  const mat = new THREE.MeshPhongMaterial({
    color: WATER_COLOR, specular: '#cfe6ff', shininess: 70,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const m = buildArea(frame, mesh, vscale, 1.2, mat, null, true);
  m.name = 'water';
  return m;
}

/** @param painted paintGreen 결과 — 있으면 작은 삼각형만 얹는다(큰 것은 지형 색으로 칠해졌다) */
export function buildGreen(frame, mesh, vscale, painted = null) {
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  const m = buildArea(frame, painted ? { ...mesh, idx: painted.small } : mesh, vscale, 0.8, mat, (k) => GREEN_COLOR[k] || GREEN_COLOR[3]);
  m.name = 'green';
  return m;
}

// ---- 띠(도로·철도·하천) ------------------------------------------------------------------
/** 폴리라인을 지형 위 리본으로. 긴 구간은 40m마다 나눠 높이를 다시 잰다. 다리는 양끝 높이 + 8m로 띄운다. */
export function buildRibbons(frame, lines, vscale, styleOf) {
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  for (const line of lines) {
    const st = styleOf(line.cls);
    if (!st) continue;
    const p = line.pts;
    const pts = [];
    for (let k = 0; k < p.length / 2 - 1; k++) {
      const ax = p[k * 2];
      const an = p[k * 2 + 1];
      const bx = p[k * 2 + 2];
      const bn = p[k * 2 + 3];
      const len = Math.hypot(bx - ax, bn - an);
      const segs = Math.max(1, Math.ceil(len / 40));
      for (let s = 0; s < segs; s++) pts.push([ax + ((bx - ax) * s) / segs, an + ((bn - an) * s) / segs]);
    }
    pts.push([p[p.length - 2], p[p.length - 1]]);
    if (pts.length < 2) continue;
    let bridgeY = null;
    if (line.flags & 1) {
      const e0 = frame.elev(...pts[0]);
      const e1 = frame.elev(...pts[pts.length - 1]);
      bridgeY = Math.max(e0, e1, 0) * vscale + 8;
    }
    c.set(st.color);
    const half = st.w / 2;
    let prev = null;
    for (let k = 0; k < pts.length; k++) {
      const [x, n] = pts[k];
      const a = pts[Math.max(0, k - 1)];
      const b = pts[Math.min(pts.length - 1, k + 1)];
      const dx = b[0] - a[0];
      const dn = b[1] - a[1];
      const len = Math.hypot(dx, dn) || 1;
      const ox = (-dn / len) * half;
      const on = (dx / len) * half;
      const y = (bridgeY ?? Math.max(frame.elev(x, n), 0) * vscale) + 1.4 + st.lift;
      const L = [frame.X(x + ox), y, frame.Z(n + on)];
      const R = [frame.X(x - ox), y, frame.Z(n - on)];
      if (prev) {
        pos.push(...prev[0], ...L, ...prev[1], ...prev[1], ...L, ...R);
        for (let q = 0; q < 6; q++) col.push(c.r, c.g, c.b);
      }
      prev = [L, R];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

export function roadStyle(cls) {
  return ROAD_STYLE[cls];
}

export function waterwayStyle(cls) {
  const w = WATERWAY_W[cls];
  return w ? { w, color: WATER_COLOR, lift: 0.2 } : null;
}

// ---- 건물 --------------------------------------------------------------------------
const LOW = new THREE.Color('#efe8dc');
const HIGH = new THREE.Color('#8fa9c6');
const EST = new THREE.Color('#b9b3a8');

export function buildingColor(b, i, markEstimated, out) {
  if (markEstimated && b.flags[i]) return out.copy(EST);
  const t = Math.min(1, Math.log1p(b.h[i]) / Math.log1p(180));
  return out.copy(LOW).lerp(HIGH, t * t);
}

/**
 * 공유 상자 지오메트리 하나 + InstancedMesh. 밤에는 셰이더가 벽면에 층·칸 격자를 그리고
 * 인스턴스 번호로 칸마다 불 켜짐을 정한다(무작위지만 고정).
 */
export function createBuildingMesh(capacity, uniforms) {
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = uniforms.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;\nflat varying float vId;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vWN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);
        vId = float(gl_InstanceID);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec3 vWP;\nvarying vec3 vWN;\nflat varying float vId;\nfloat hsh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uNight > 0.0 && abs(vWN.y) < 0.5) {
          vec2 t = normalize(vec2(-vWN.z, vWN.x));
          float along = dot(vWP.xz, t);
          vec2 cell = vec2(floor(along / 3.2), floor((vWP.y + 200.0) / 3.4));
          vec2 f = vec2(fract(along / 3.2), fract((vWP.y + 200.0) / 3.4));
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.8);
          float lit = step(0.5, hsh(vec3(cell, vId)));
          totalEmissiveRadiance += vec3(1.0, 0.8, 0.5) * win * lit * uNight * 0.9;
        }`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'buildings';
  mesh.frustumCulled = false; // 행렬을 예산에 따라 다시 채우므로 경계구를 믿지 않는다
  return mesh;
}
