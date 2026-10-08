// 건물 표시 예산 — 시점 둘레에서 가까운 순(높은 건물은 가산점)으로 고르고 InstancedMesh에 쓴다.
// 독립 페이지(world.js)와 3D PAX(pax3d-city.js)가 같은 규칙을 쓴다.
import * as THREE from 'three';
import { buildingColor } from './layers.js?v=a697c85d';

/** O(N) 히스토그램 선택 — 점수 = 거리 − min(높이, 300m)×15. 전부 들어가면 전부. */
export function selectBuildings(b, tx, tn, budget, prev) {
  const n = b.n;
  const cap = Math.min(n, budget);
  if (cap === n) return prev && prev.length === n ? prev : Uint32Array.from({ length: n }, (_, i) => i);
  const score = new Float32Array(n);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const s = Math.hypot(b.x[i] - tx, b.y[i] - tn) - Math.min(b.h[i], 300) * 15;
    score[i] = s;
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  const BINS = 2048;
  const hist = new Uint32Array(BINS);
  const k = (BINS - 1) / (hi - lo || 1);
  for (let i = 0; i < n; i++) hist[Math.floor((score[i] - lo) * k)]++;
  let acc = 0;
  let cut = 0;
  while (cut < BINS && acc + hist[cut] <= cap) acc += hist[cut++];
  const chosen = new Uint32Array(cap);
  let j = 0;
  for (let i = 0; i < n && j < cap; i++) if (Math.floor((score[i] - lo) * k) < cut) chosen[j++] = i;
  for (let i = 0; i < n && j < cap; i++) if (Math.floor((score[i] - lo) * k) === cut) chosen[j++] = i;
  return chosen;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();
const tmpC = new THREE.Color();

/** 고른 건물을 지면 표고(× 지형 배율) 위에 원본 높이로 세운다 — 좌표는 도시 로컬 미터 */
export function writeBuildingInstances(mesh, b, visible, frame, vscale, markEstimated) {
  for (let j = 0; j < visible.length; j++) {
    const i = visible[j];
    const ground = Math.max(frame.elev(b.x[i], b.y[i]), 0) * vscale;
    q.setFromAxisAngle(up, b.ang[i]);
    m4.compose(pos.set(frame.X(b.x[i]), ground + b.h0[i], frame.Z(b.y[i])), q, scl.set(b.w[i], Math.max(b.h[i] - b.h0[i], 1), b.d[i]));
    mesh.setMatrixAt(j, m4);
    mesh.setColorAt(j, buildingColor(b, i, markEstimated, tmpC));
  }
  mesh.count = visible.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}
