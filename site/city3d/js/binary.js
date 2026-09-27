// C3D1 바이너리 읽기 — 헤더의 레코드 수·본문 길이·CRC32를 모두 확인한 뒤에만 자료를 넘긴다.
// 형식(build/common.py와 같음): 32바이트 헤더 [magic 'C3D1'][kind 4][version u32][count u32][stride u32][length u32][crc32 u32][extra u32]

const HEADER = 32;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {ArrayBuffer} buf
 * @param {string} kind 기대하는 종류(BLDG·LINE·MESH·DEMG)
 * @param {{bytes:number, crc32:number}} expected meta.json에 적힌 파일 크기·CRC
 * @returns {{count:number, stride:number, extra:number, body:DataView, bytes:Uint8Array, checks:object}}
 */
export function readC3D(buf, kind, expected) {
  if (buf.byteLength < HEADER) throw new Error(`${kind}: 파일이 헤더보다 짧습니다 (${buf.byteLength}B)`);
  const v = new DataView(buf);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  const k = String.fromCharCode(...new Uint8Array(buf, 4, 4));
  const version = v.getUint32(8, true);
  const count = v.getUint32(12, true);
  const stride = v.getUint32(16, true);
  const length = v.getUint32(20, true);
  const crc = v.getUint32(24, true);
  const extra = v.getUint32(28, true);
  if (magic !== 'C3D1' || version !== 1) throw new Error(`${kind}: 형식이 다릅니다 (${magic} v${version})`);
  if (k !== kind) throw new Error(`${kind}: 종류가 다릅니다 (${k})`);
  if (buf.byteLength !== HEADER + length) throw new Error(`${kind}: 본문 길이 불일치 — 헤더 ${length}B, 실제 ${buf.byteLength - HEADER}B`);
  if (stride && count * stride !== length) throw new Error(`${kind}: 레코드 수 불일치 — ${count}×${stride}B ≠ ${length}B`);
  if (expected && expected.bytes !== buf.byteLength) throw new Error(`${kind}: 파일 크기가 meta.json(${expected.bytes}B)과 다릅니다`);
  const bytes = new Uint8Array(buf, HEADER, length);
  const actual = crc32(bytes);
  if (actual !== crc) throw new Error(`${kind}: CRC32 불일치 (헤더 ${crc.toString(16)}, 계산 ${actual.toString(16)})`);
  if (expected && expected.crc32 !== crc) throw new Error(`${kind}: CRC32가 meta.json과 다릅니다`);
  return {
    count, stride, extra, bytes,
    body: new DataView(buf, HEADER, length),
    checks: { magic: true, count, length, crc32: crc.toString(16).padStart(8, '0') },
  };
}

/** 건물 16바이트 레코드 → 열 배열(Float32/Uint8) */
export function decodeBuildings(r) {
  const n = r.count;
  const out = {
    n,
    x: new Float32Array(n), y: new Float32Array(n), w: new Float32Array(n), d: new Float32Array(n),
    ang: new Float32Array(n), h: new Float32Array(n), h0: new Float32Array(n), area: new Float32Array(n),
    flags: new Uint8Array(n),
  };
  const v = r.body;
  for (let i = 0, o = 0; i < n; i++, o += 16) {
    out.x[i] = v.getUint16(o, true);
    out.y[i] = v.getUint16(o + 2, true);
    out.w[i] = v.getUint16(o + 4, true) / 10;
    out.d[i] = v.getUint16(o + 6, true) / 10;
    out.ang[i] = (v.getUint8(o + 8) / 255) * Math.PI;
    out.flags[i] = v.getUint8(o + 9);
    out.h[i] = v.getUint16(o + 10, true) / 10;
    out.h0[i] = v.getUint16(o + 12, true) / 10;
    out.area[i] = v.getUint16(o + 14, true);
  }
  return out;
}

/** 가변 길이 폴리라인 [class u8][flags u8][n u16][x,n u16 × n] */
export function decodeLines(r) {
  const lines = [];
  const v = r.body;
  let o = 0;
  for (let i = 0; i < r.count; i++) {
    const cls = v.getUint8(o);
    const flags = v.getUint8(o + 1);
    const n = v.getUint16(o + 2, true);
    o += 4;
    const pts = new Float32Array(n * 2);
    for (let k = 0; k < n; k++, o += 4) {
      pts[k * 2] = v.getUint16(o, true);
      pts[k * 2 + 1] = v.getUint16(o + 2, true);
    }
    lines.push({ cls, flags, pts });
  }
  if (o !== r.body.byteLength) throw new Error(`LINE: 끝까지 읽은 길이(${o})가 본문(${r.body.byteLength})과 다릅니다`);
  let points = 0;
  for (const l of lines) points += l.pts.length / 2;
  if (points !== r.extra) throw new Error(`LINE: 점 수 불일치 (${points} ≠ ${r.extra})`);
  return lines;
}

/** 삼각형 메시 [정점 수 u32][삼각형 수 u32][x,n u16…][class u8…(선택)+정렬][색인 u32…] */
export function decodeMesh(r) {
  const v = r.body;
  const nv = v.getUint32(0, true);
  const nt = v.getUint32(4, true);
  if (nt !== r.count) throw new Error(`MESH: 삼각형 수 불일치 (${nt} ≠ ${r.count})`);
  let o = 8;
  const xy = new Uint16Array(r.bytes.buffer.slice(r.bytes.byteOffset + o, r.bytes.byteOffset + o + nv * 4));
  o += nv * 4;
  let cls = null;
  if (r.extra === 1) {
    cls = r.bytes.slice(o, o + nv);
    o += nv + ((4 - (nv % 4)) % 4);
  }
  const idx = new Uint32Array(r.bytes.buffer.slice(r.bytes.byteOffset + o, r.bytes.byteOffset + o + nt * 12));
  o += nt * 12;
  if (o !== r.body.byteLength) throw new Error(`MESH: 끝까지 읽은 길이(${o})가 본문(${r.body.byteLength})과 다릅니다`);
  for (let i = 0; i < idx.length; i++) if (idx[i] >= nv) throw new Error('MESH: 색인이 정점 범위를 벗어났습니다');
  return { nv, nt, xy, cls, idx };
}

/** 표고 격자 int16(0.25m) — 행 0이 북쪽 */
export function decodeDem(r, meta) {
  const cols = r.extra;
  const rows = r.count / cols;
  if (!Number.isInteger(rows) || cols !== meta.cols || rows !== meta.rows) throw new Error('DEMG: 격자 크기가 meta.json과 다릅니다');
  const q = new Int16Array(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.count * 2));
  const h = new Float32Array(q.length);
  const void_ = new Uint8Array(q.length); // 표고 자료 없음(도시 경계 밖, 타일을 받지 않은 곳)
  for (let i = 0; i < q.length; i++) {
    if (q[i] === -32768) { void_[i] = 1; h[i] = 0; } else h[i] = q[i] * meta.unit_m;
  }
  return { cols, rows, cell: meta.cell, h, void: void_ };
}
