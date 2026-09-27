// 로컬 좌표(x 동쪽·n 북쪽 m) ↔ 경위도, 그리고 "여기가 어디인가"(구·군, 가까운 동네) 찾기.
// 3D 장면·2D 지도·이름표가 모두 meta.json의 같은 frame을 쓰므로 이 함수들이 둘을 잇는 유일한 변환이다.

export function toLonLat(frame, x, n) {
  return [frame.lon0 + x / frame.m_lon, frame.lat0 + n / frame.m_lat];
}

export function toLocal(frame, lon, lat) {
  return [(lon - frame.lon0) * frame.m_lon, (lat - frame.lat0) * frame.m_lat];
}

function inRing(ring, x, n) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, ni] = ring[i];
    const [xj, nj] = ring[j];
    if ((ni > n) !== (nj > n) && x < ((xj - xi) * (n - ni)) / (nj - ni) + xi) inside = !inside;
  }
  return inside;
}

/** mapinfo → 조회기. 구 경계는 바깥 고리만 있으므로(12m 단순화) 경계선 근처 수십 m는 이웃 구로 나올 수 있다. */
export function createLocator(mapinfo) {
  const districts = mapinfo.districts.map((d) => {
    let x0 = Infinity; let x1 = -Infinity; let n0 = Infinity; let n1 = -Infinity;
    for (const ring of d.polys) for (const [x, n] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); n0 = Math.min(n0, n); n1 = Math.max(n1, n); }
    return { ...d, box: [x0, n0, x1, n1] };
  });
  const quarters = mapinfo.labels.filter((l) => l.k === 'quarter');
  return {
    district(x, n) {
      for (const d of districts) {
        const [x0, n0, x1, n1] = d.box;
        if (x < x0 || x > x1 || n < n0 || n > n1) continue;
        if (d.polys.some((r) => inRing(r, x, n))) return d.name;
      }
      return null;
    },
    /** 가장 가까운 동네 이름표(OSM place)와 거리 — 행정동 경계가 아니라 이름 점까지의 거리다 */
    nearestQuarter(x, n, maxDist = 2500) {
      let best = null;
      let bd = maxDist * maxDist;
      for (const q of quarters) {
        const d = (q.x - x) ** 2 + (q.n - n) ** 2;
        if (d < bd) { bd = d; best = q; }
      }
      return best && { name: best.name, dist: Math.sqrt(bd) };
    },
  };
}

/** 외부 지도에서 같은 지점 열기(새 창). 좌표만 넘기고 다른 정보는 보내지 않는다. */
export function externalLinks(lat, lon, name = '선택한 지점', zoom = 17) {
  const la = lat.toFixed(6);
  const lo = lon.toFixed(6);
  return [
    ['OpenStreetMap', `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=${zoom}/${la}/${lo}`],
    ['카카오맵', `https://map.kakao.com/link/map/${encodeURIComponent(name)},${la},${lo}`],
    ['네이버 지도', `https://map.naver.com/p?c=${lo},${la},${zoom},0,0,0,dh`],
  ];
}
