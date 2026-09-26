// 3D PAX 소품 — 사례 건물, 산, 나무, 구름, 선택 핀, 독도.
// 전부 기본 도형을 합쳐 만든다(모델 파일 없음). 건물은 정점색으로 지붕을 한 톤 어둡게 구워 두고,
// 인스턴스 색(업무 유형)이 그 위에 곱해진다 — 한 색으로 벽과 지붕이 구분된다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, signSprite } from './pax3d-look.js?v=af667c9a';

function tinted(geo, shade) {
  const n = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(shade), 3));
  return geo;
}

export function buildingGeometries() {
  const G = THREE;
  return {
    house: mergeGeometries([
      tinted(new G.BoxGeometry(0.8, 0.6, 0.8).translate(0, 0.3, 0), 1),
      tinted(new G.ConeGeometry(0.64, 0.42, 4).rotateY(Math.PI / 4).translate(0, 0.81, 0), 0.6),
    ]),
    pavilion: mergeGeometries([
      tinted(new G.CylinderGeometry(0.42, 0.46, 0.45, 8).translate(0, 0.225, 0), 1),
      tinted(new G.ConeGeometry(0.68, 0.42, 8).translate(0, 0.66, 0), 0.6),
    ]),
    tower: mergeGeometries([
      tinted(new G.BoxGeometry(0.78, 1.5, 0.78).translate(0, 0.75, 0), 1),
      tinted(new G.BoxGeometry(0.84, 0.08, 0.84).translate(0, 1.02, 0), 0.7),
      tinted(new G.BoxGeometry(0.5, 0.22, 0.5).translate(0, 1.61, 0), 0.68),
    ]),
    shop: mergeGeometries([
      tinted(new G.BoxGeometry(1.0, 0.5, 0.72).translate(0, 0.25, 0), 1),
      tinted(new G.BoxGeometry(1.08, 0.07, 0.34).translate(0, 0.47, 0.42), 0.58),
      tinted(new G.BoxGeometry(1.04, 0.06, 0.76).translate(0, 0.53, 0), 0.7),
    ]),
  };
}

// 백두대간 줄기를 따라 몇 봉우리만 — 지형이 아니라 "여기가 산"이라는 표지다.
const MOUNTAINS = [
  [128.46, 38.12, 0.55, 0.42], [128.54, 37.79, 0.45, 0.4], [128.06, 37.37, 0.3, 0.28],
  [128.92, 37.1, 0.42, 0.38], [128.48, 36.96, 0.4, 0.36], [128.1, 36.88, 0.3, 0.26],
  [127.83, 36.54, 0.34, 0.3], [128.7, 36.02, 0.28, 0.26], [127.75, 35.86, 0.38, 0.34],
  [128.12, 35.82, 0.32, 0.28], [127.73, 35.34, 0.48, 0.4], [126.99, 35.13, 0.24, 0.2],
  [126.53, 33.36, 0.5, 0.42],
];

export function mountains({ project, grad, landH }) {
  const group = new THREE.Group();
  const blocked = [];
  const body = toon('#8fae72', grad);
  const shade = toon('#7a9a63', grad);
  for (const [lon, lat, h, r] of MOUNTAINS) {
    const p = project(lon, lat);
    const main = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), body);
    main.position.set(p.x, landH + h / 2, -p.y);
    const side = new THREE.Mesh(new THREE.ConeGeometry(r * 0.7, h * 0.66, 6), shade);
    side.position.set(p.x + r * 0.55, landH + h * 0.33, -p.y + r * 0.2);
    for (const m of [main, side]) {
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    blocked.push({ p, r: r * 0.95 });
  }
  return { group, blocked };
}

/** 시도마다 넓이에 비례해 나무를 심는다 — 건물·산 자리는 피한다. */
export function trees({ placePolys, grad, landH, rng, randomIn, avoid }) {
  const spots = [];
  for (const [place, polys] of placePolys) {
    const rand = rng(`trees-${place}`);
    const area = polys.reduce((s, [o]) => s + Math.abs(o.reduce((a, v, i) => {
      const w = o[(i + 1) % o.length];
      return a + v.x * w.y - w.x * v.y;
    }, 0)) / 2, 0);
    const n = Math.min(110, Math.round(area * 9));
    for (let i = 0; i < n; i++) {
      const p = randomIn(polys, rand);
      if (!p || avoid.some((b) => p.distanceTo(b.p) < b.r)) continue;
      spots.push({ p, s: 0.7 + rand() * 0.6, g: rand() });
    }
  }
  const geo = new THREE.ConeGeometry(0.045, 0.12, 6).translate(0, 0.06, 0);
  const mesh = new THREE.InstancedMesh(geo, toon('#ffffff', grad), spots.length);
  const m4 = new THREE.Matrix4();
  const greens = [new THREE.Color('#5f8f55'), new THREE.Color('#739f5b'), new THREE.Color('#4f7f52')];
  spots.forEach((t, i) => {
    m4.makeScale(t.s, t.s, t.s).setPosition(t.p.x, landH, -t.p.y);
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, greens[Math.floor(t.g * greens.length)]);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function clouds(grad, rng) {
  const group = new THREE.Group();
  const rand = rng('clouds');
  const mat = toon('#ffffff', grad);
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 2);
    for (let k = 0; k < puffs; k++) {
      const r = 0.28 + rand() * 0.22;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
      m.position.set(k * 0.34 - puffs * 0.17, rand() * 0.12, (rand() - 0.5) * 0.3);
      m.scale.y = 0.72;
      c.add(m);
    }
    c.userData = { x0: rand() * 48, v: 0.12 + rand() * 0.1, y0: 2.5 + rand() * 0.9 };
    c.position.set(0, c.userData.y0, (rand() - 0.5) * 16);
    group.add(c);
  }
  return group;
}

export function pin(grad) {
  const g = new THREE.Group();
  const mat = toon('#c9473f', grad);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.17, 12).rotateX(Math.PI), mat);
  tip.position.y = 0.085;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), mat);
  head.position.y = 0.2;
  g.add(tip, head);
  return g;
}

export function dokdo(p, grad, landH) {
  const g = new THREE.Group();
  const rock = toon('#9a9486', grad);
  const a = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), rock);
  a.position.set(p.x, 0.06, -p.y);
  const b = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 5), rock);
  b.position.set(p.x + 0.09, 0.04, -p.y + 0.03);
  const sign = signSprite(['독도'], { scale: 0.16 });
  sign.position.set(p.x + 0.04, landH, -p.y);
  g.add(a, b, sign);
  return g;
}
