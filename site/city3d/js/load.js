// 도시 자료 불러오기 — 독립 페이지(city3d/)와 3D PAX(pax3d-city.js)가 함께 쓴다.
// 파일마다 헤더의 레코드 수·본문 길이·CRC32와 meta.json의 크기·CRC를 확인한 뒤에만 넘긴다.
import { readC3D, decodeBuildings, decodeLines, decodeMesh, decodeDem } from './binary.js';

export async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}을(를) 받지 못했습니다 (${r.status})`);
  return r.json();
}

/**
 * 바이너리 받기 — 배포처(Claude sites)가 임의 바이너리를 내보내지 않아 gzip+base64 텍스트로 싣는다(GitHub Pages도 같은 전송본).
 * base64를 풀고 gzip을 되돌린 원래 .bin 바이트를 돌려준다(검증은 그 바이트로 readC3D가 한다).
 */
export async function getBin(path) {
  const r = await fetch(`${path}.gz.b64.txt`);
  if (!r.ok) throw new Error(`${path}을(를) 받지 못했습니다 (${r.status})`);
  const b64 = (await r.text()).trim();
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 gzip 풀기(DecompressionStream)를 지원하지 않습니다');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

const FILES = { 'buildings.bin': 'BLDG', 'roads.bin': 'LINE', 'waterways.bin': 'LINE', 'water.bin': 'MESH', 'green.bin': 'MESH', 'terrain.bin': 'DEMG' };

/**
 * @param {string} base 도시 자료 폴더(예: 'data' 또는 'city3d/data')
 * @param {(msg:string)=>void} [onStep] 진행 문구
 * @returns 검증을 통과한 도시 자료 {meta, mapinfo, b, roads, waterways, water, green, dem, bytes}
 */
export async function loadCity(base, key, onStep = () => {}) {
  const [meta, mapinfo] = await Promise.all([getJSON(`${base}/${key}/meta.json`), getJSON(`${base}/${key}/mapinfo.json`)]);
  if (mapinfo.key !== key || mapinfo.snapshot !== meta.snapshot) throw new Error('mapinfo.json이 meta.json과 다른 도시·스냅샷입니다');
  const names = Object.keys(FILES);
  const bufs = await Promise.all(names.map((n) => getBin(`${base}/${key}/${n}`)));
  onStep('레코드 수·길이·CRC32를 확인하는 중…');
  await new Promise((r) => setTimeout(r, 10));
  const [B, R, WW, W, G, D] = names.map((n, i) => readC3D(bufs[i], FILES[n], meta.files[n]));
  if (B.count !== meta.counts.buildings) throw new Error(`건물 레코드 수가 meta.json(${meta.counts.buildings})과 다릅니다 (${B.count})`);
  return {
    meta,
    mapinfo,
    b: decodeBuildings(B),
    roads: decodeLines(R),
    waterways: decodeLines(WW),
    water: decodeMesh(W),
    green: decodeMesh(G),
    dem: decodeDem(D, meta.terrain),
    bytes: bufs.reduce((s, b) => s + b.byteLength, 0),
    files: names.length,
  };
}
