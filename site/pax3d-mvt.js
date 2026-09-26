// 3D PAX 거리 자료 — OpenFreeMap 벡터 타일(OpenMapTiles 스키마, © OpenStreetMap contributors)을 읽는다.
// 라이브러리 없이 필요한 만큼만 해석한다: protobuf 가변정수 → Mapbox Vector Tile 레이어·지오메트리.
// 사용하는 레이어: building(render_height), transportation(class), transportation_name(name), poi(name·class).

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const Z = 14;
let templatePromise = null;
const tileCache = new Map();

// ---- protobuf ------------------------------------------------------------------------
class Reader {
  constructor(buf) {
    this.b = buf;
    this.p = 0;
  }
  varint() {
    let v = 0;
    let shift = 0;
    let byte;
    do {
      byte = this.b[this.p++];
      v += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return v;
  }
  bytes() {
    const len = this.varint();
    const out = this.b.subarray(this.p, this.p + len);
    this.p += len;
    return out;
  }
  skip(wire) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.p += 8;
    else if (wire === 2) this.p += this.varint();
    else if (wire === 5) this.p += 4;
  }
  /** 필드마다 cb(tag, wire, reader)를 부른다. cb가 false를 돌려주면 건너뛴다. */
  each(cb) {
    while (this.p < this.b.length) {
      const key = this.varint();
      const tag = Math.floor(key / 8);
      const wire = key & 7;
      if (cb(tag, wire) === false) this.skip(wire);
    }
  }
}

const utf8 = new TextDecoder();

function readValue(buf) {
  const r = new Reader(buf);
  let v = null;
  r.each((tag, wire) => {
    if (tag === 1) v = utf8.decode(r.bytes());
    else if (tag === 2) { v = new DataView(buf.buffer, buf.byteOffset + r.p, 4).getFloat32(0, true); r.p += 4; }
    else if (tag === 3) { v = new DataView(buf.buffer, buf.byteOffset + r.p, 8).getFloat64(0, true); r.p += 8; }
    else if (tag === 4 || tag === 5) v = r.varint();
    else if (tag === 6) { const n = r.varint(); v = n % 2 ? -(n + 1) / 2 : n / 2; }
    else if (tag === 7) v = Boolean(r.varint());
    else return false;
    return true;
  });
  return v;
}

function packed(buf) {
  const r = new Reader(buf);
  const out = [];
  while (r.p < buf.length) out.push(r.varint());
  return out;
}

/** 지오메트리 명령열 → 고리/선 목록 (타일 좌표) */
function decodeGeometry(cmds) {
  const parts = [];
  let cur = null;
  let x = 0;
  let y = 0;
  const zz = (n) => (n % 2 ? -(n + 1) / 2 : n / 2);
  for (let i = 0; i < cmds.length;) {
    const c = cmds[i++];
    const id = c & 7;
    const count = c >> 3;
    if (id === 7) {
      if (cur && cur.length) cur.push(cur[0]);
      continue;
    }
    for (let k = 0; k < count; k++) {
      x += zz(cmds[i++]);
      y += zz(cmds[i++]);
      if (id === 1) {
        cur = [];
        parts.push(cur);
      }
      cur.push([x, y]);
    }
  }
  return parts;
}

export function decodeTile(buf, wanted) {
  const layers = {};
  const r = new Reader(buf);
  while (r.p < buf.length) {
    const key = r.varint();
    if ((key >> 3) !== 3) {
      r.skip(key & 7);
      continue;
    }
    const layerBuf = r.bytes();
    const lr = new Reader(layerBuf);
    let name = '';
    let extent = 4096;
    const keys = [];
    const values = [];
    const feats = [];
    lr.each((tag) => {
      if (tag === 1) name = utf8.decode(lr.bytes());
      else if (tag === 2) feats.push(lr.bytes());
      else if (tag === 3) keys.push(utf8.decode(lr.bytes()));
      else if (tag === 4) values.push(readValue(lr.bytes()));
      else if (tag === 5) extent = lr.varint();
      else return false;
      return true;
    });
    if (!wanted.includes(name)) continue;
    layers[name] = {
      extent,
      features: feats.map((fb) => {
        const fr = new Reader(fb);
        let type = 0;
        let tags = [];
        let geom = [];
        fr.each((tag) => {
          if (tag === 2) tags = packed(fr.bytes());
          else if (tag === 3) type = fr.varint();
          else if (tag === 4) geom = packed(fr.bytes());
          else return false;
          return true;
        });
        const props = {};
        for (let i = 0; i < tags.length; i += 2) props[keys[tags[i]]] = values[tags[i + 1]];
        return { type, props, parts: decodeGeometry(geom) }; // type 1 점, 2 선, 3 면
      }),
    };
  }
  return layers;
}

// ---- 타일 받기 -------------------------------------------------------------------------
async function tileTemplate() {
  if (!templatePromise) {
    templatePromise = fetch(TILEJSON).then((r) => {
      if (!r.ok) throw new Error(`TileJSON ${r.status}`);
      return r.json();
    }).then((j) => j.tiles[0]);
  }
  return templatePromise;
}

async function fetchTile(x, y, signal) {
  const key = `${x}/${y}`;
  if (!tileCache.has(key)) {
    tileCache.set(key, (async () => {
      const url = (await tileTemplate()).replace('{z}', Z).replace('{x}', x).replace('{y}', y);
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`tile ${res.status}`);
      return decodeTile(new Uint8Array(await res.arrayBuffer()),
        ['building', 'transportation', 'transportation_name', 'poi']);
    })().catch((e) => { tileCache.delete(key); throw e; }));
  }
  return tileCache.get(key);
}

/**
 * 중심(경위도) 둘레 radius m 안의 거리 자료를 로컬 미터 좌표(x 동쪽, z 남쪽)로 돌려준다.
 * @returns {Promise<{buildings, roads, names, pois}>}
 */
export async function loadStreetData(lon, lat, radius = 280, { timeoutMs = 12000 } = {}) {
  const n = 2 ** Z;
  const fx = ((lon + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const tileMeters = (40075016.7 * Math.cos(rad)) / n;
  const pad = radius / tileMeters;
  const xs = [...new Set([Math.floor(fx - pad), Math.floor(fx + pad)])];
  const ys = [...new Set([Math.floor(fy - pad), Math.floor(fy + pad)])];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const tiles = await Promise.all(xs.flatMap((x) => ys.map((y) => fetchTile(x, y, ctrl.signal).then((t) => ({ x, y, t })))));
    const mLon = 111320 * Math.cos(rad);
    const toLocal = (tx, ty, extent, px, py) => {
      const gx = (tx + px / extent) / n;
      const gy = (ty + py / extent) / n;
      const lo = gx * 360 - 180;
      const la = (Math.atan(Math.sinh(Math.PI * (1 - 2 * gy))) * 180) / Math.PI;
      return [(lo - lon) * mLon, -(la - lat) * 110540];
    };
    const out = { buildings: [], roads: [], names: [], pois: [] };
    const near = (pts) => pts.some(([x, z]) => x * x + z * z < radius * radius);
    // 타일 가장자리의 여백(buffer) 때문에 경계에 걸친 건물·상호는 이웃 타일에도 한 번 더 들어 있다.
    // 겹친 벽은 깜빡이는 줄무늬를 만들므로, 무게중심이 든 타일의 것만 쓴다.
    const ownTile = (part, extent) => {
      const cx = part.reduce((s, p) => s + p[0], 0) / part.length;
      const cy = part.reduce((s, p) => s + p[1], 0) / part.length;
      return cx >= 0 && cx < extent && cy >= 0 && cy < extent;
    };
    for (const { x, y, t } of tiles) {
      const conv = (layer, f) => f.parts.map((part) => part.map(([px, py]) => toLocal(x, y, layer.extent, px, py)));
      const B = t.building;
      for (const f of (B && B.features) || []) {
        if (!f.parts.length || !ownTile(f.parts[0], B.extent)) continue;
        for (const ring of conv(B, f)) {
          if (ring.length >= 4 && near(ring)) {
            out.buildings.push({ ring: ring.slice(0, -1), h: Number(f.props.render_height) || 9, h0: Number(f.props.render_min_height) || 0 });
          }
        }
      }
      const T = t.transportation;
      for (const f of (T && T.features) || []) {
        for (const line of conv(T, f)) if (near(line)) out.roads.push({ line, cls: f.props.class, sub: f.props.subclass, area: f.type === 3, brunnel: f.props.brunnel });
      }
      const N = t.transportation_name;
      for (const f of (N && N.features) || []) {
        const name = f.props['name:ko'] || f.props.name;
        if (!name) continue;
        for (const line of conv(N, f)) if (near(line)) out.names.push({ line, name, cls: f.props.class });
      }
      const P = t.poi;
      for (const f of (P && P.features) || []) {
        if (!f.parts.length || !ownTile(f.parts[0], P.extent)) continue;
        const name = f.props['name:ko'] || f.props.name;
        const [pt] = conv(P, f)[0] || [];
        if (name && pt && near([pt])) out.pois.push({ at: pt, name, cls: f.props.class, sub: f.props.subclass });
      }
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}
