// 3D PAX 실제 지형 — 대한민국 수치표고(korea-dem, AWS Terrain Tiles·SRTM)를 지도 위 땅으로 세운다.
// 격자는 지도와 같은 투영이라(scripts/build_korea_dem.py) 좌표 변환 없이 칸 번호만 계산하면 된다.
// 높이는 약 10배 과장했다 — 미니어처 디오라마에서 백두대간·지리산·한라산이 읽히도록.
import * as THREE from 'three';

export const VERT = 0.00022; // 월드 단위/미터 (수평 1단위 ≈ 43km)
const LIFT = 0.004;          // 평평한 시도 판 윗면과 겹쳐 깜빡이지 않게 살짝 띄운다

export async function loadTerrain() {
  const [meta, buf] = await Promise.all([
    fetch('data/korea-dem.json').then((r) => { if (!r.ok) throw new Error(`dem ${r.status}`); return r.json(); }),
    fetch('data/korea-dem.bin').then((r) => { if (!r.ok) throw new Error(`dem ${r.status}`); return r.arrayBuffer(); }),
  ]);
  const n = meta.rows * meta.cols;
  const bytes = new Uint8Array(buf);
  if (bytes.length !== n * 2) throw new Error('dem 크기 불일치');
  return makeTerrain(meta, bytes.subarray(0, n), bytes.subarray(n));
}

/** @returns {{heightAt:(x:number,z:number)=>number, regionAt:(x:number,z:number)=>string|null, buildMesh:Function, attribution:string}} */
export function makeTerrain(meta, code, region) {
  const { cols, rows, cell, x0, north0, max_m: maxM } = meta;
  const meters = new Float32Array(code.length);
  for (let i = 0; i < code.length; i++) meters[i] = code[i] ? ((code[i] - 1) / 254) ** 2 * maxM : 0;

  const at = (c, r) => meters[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
  /** 월드 (x, z) — z는 남쪽이 + — 의 땅 높이(월드 단위, 바다 0) */
  function heightAt(x, z) {
    const fc = (x - x0) / cell;
    const fr = (north0 + z) / cell;
    if (fc < 0 || fr < 0 || fc > cols - 1 || fr > rows - 1) return 0;
    const c = Math.floor(fc);
    const r = Math.floor(fr);
    const tx = fc - c;
    const ty = fr - r;
    const h = at(c, r) * (1 - tx) * (1 - ty) + at(c + 1, r) * tx * (1 - ty)
      + at(c, r + 1) * (1 - tx) * ty + at(c + 1, r + 1) * tx * ty;
    return h * VERT;
  }
  function regionAt(x, z) {
    const c = Math.round((x - x0) / cell);
    const r = Math.round((north0 + z) / cell);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
    const k = region[r * cols + c];
    return k ? meta.regions[k - 1] : null;
  }

  /** 육지 칸만 삼각형으로 — 시도 색(tints)에 높을수록 밝게 */
  function buildMesh(tints, landH, material) {
    const pos = new Float32Array(cols * rows * 3);
    const col = new Float32Array(cols * rows * 3);
    const tmp = new THREE.Color();
    const hi = new THREE.Color('#e9e1c8');
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const m = meters[i];
        pos.set([x0 + c * cell, landH + LIFT + m * VERT, -north0 + r * cell], i * 3);
        const name = region[i] ? meta.regions[region[i] - 1] : null;
        tmp.set(tints[name] || '#b9d49a').lerp(hi, Math.min(1, m / 1600) * 0.45);
        tmp.toArray(col, i * 3);
      }
    }
    const idx = [];
    const land = (i) => region[i] > 0;
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        if (land(a) && land(d) && land(b)) idx.push(a, d, b);
        if (land(b) && land(d) && land(e)) idx.push(b, d, e);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.userData.terrain = true;
    return mesh;
  }

  /** 육지 가림막 — 실제 지도 타일이 바다·가상의 섬에 번지지 않게 타일 셰이더가 읽는다 */
  function landMask() {
    const data = new Uint8Array(region.length);
    for (let i = 0; i < region.length; i++) data[i] = region[i] ? 255 : 0;
    const tex = new THREE.DataTexture(data, cols, rows, THREE.RedFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.unpackAlignment = 1; // 한 줄 338바이트 — 기본 4바이트 정렬이면 가림막이 비스듬히 밀린다
    tex.needsUpdate = true;
    return { texture: tex, grid: new THREE.Vector4(x0, north0, cell * cols, cell * rows) };
  }

  return { heightAt, regionAt, buildMesh, landMask, attribution: meta.attribution };
}
