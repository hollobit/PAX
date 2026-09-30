// 시간대(주간·일몰·야간) — 하늘·안개·빛·해 방향과 도시 재질(물·도로·물길·야간 창문). 독립 페이지와 3D PAX가 함께 쓴다.
import * as THREE from 'three';
import { WATER_COLOR } from './layers.js?v=c8c8545d';

export const MODES = {
  day: { label: '주간', sky: ['#6fa6e0', '#d9e9f6'], fog: '#cfe0ec', sunEl: 55, sunAz: 135, sun: '#fff3dd', sunI: 2.4, hemi: ['#dcebfb', '#8c917c', 1.0], night: 0 },
  sunset: { label: '일몰', sky: ['#33406e', '#f39064'], fog: '#e3a07d', sunEl: 7, sunAz: 255, sun: '#ffab6b', sunI: 2.1, hemi: ['#f3b48c', '#4d3b4e', 0.7], night: 0.12 },
  night: { label: '야간', sky: ['#04070f', '#16213a'], fog: '#0c1424', sunEl: 38, sunAz: 200, sun: '#9eb4ff', sunI: 0.35, hemi: ['#2a3a58', '#0b0f18', 0.4], night: 1 },
};

const skyCache = new Map();
/** 세로 그라데이션 하늘 — 시간대마다 한 장만 만든다 */
export function skyTexture(M) {
  const key = M.sky.join();
  if (skyCache.has(key)) return skyCache.get(key);
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, M.sky[0]);
  grad.addColorStop(1, M.sky[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  skyCache.set(key, t);
  return t;
}

/** 해 방향(단위 벡터) — 고도·방위각에서 */
export function sunDirection(M, out = new THREE.Vector3()) {
  const el = THREE.MathUtils.degToRad(M.sunEl);
  const az = THREE.MathUtils.degToRad(M.sunAz);
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/**
 * 도시 장면의 물·도로·물길 재질을 시간대에 맞춘다(이름이 roads·water·waterways인 메시).
 * 밤에는 수면에 약한 자체 발광을 준다 — 어두운 땅과 섞여 강이 사라지지 않게(사용자 지시: 강이 가려지지 않게).
 */
export function styleCityMaterials(root, M) {
  const rd = root.getObjectByName('roads');
  if (rd) rd.material.emissive.set(M.night > 0.5 ? '#6b4a1c' : M.night > 0 ? '#2a1c0c' : '#000000');
  const w = root.getObjectByName('water');
  if (w) {
    w.material.color.set(M.night > 0.5 ? '#1d3a5e' : WATER_COLOR);
    w.material.emissive.set(M.night > 0.5 ? '#0f2a4a' : M.night > 0 ? '#1a1830' : '#000000');
    w.material.specular.set(M.night > 0.5 ? '#2a3e5a' : M.night > 0 ? '#ffc9a0' : '#cfe6ff');
  }
  const ww = root.getObjectByName('waterways');
  if (ww) {
    ww.material.color.set(M.night > 0.5 ? '#7f96b4' : '#ffffff');
    ww.material.emissive.set(M.night > 0.5 ? '#0f2a4a' : '#000000');
  }
}
