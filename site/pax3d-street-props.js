// 3D PAX 거리 소품 — 한국 동네 거리의 표지들. 단위는 미터.
// 전봇대와 늘어진 전선, 은행나무, 횡단보도, 파란 도로명판, 버스 정류장, 옥상 물탱크, 에어컨 실외기, 빨간 우체통,
// 그리고 한글 간판. 간판 글씨는 모두 실행 중에 Canvas2D로 그린다(이미지 자산 없음 — sakura-crossing과 같은 방식).
import * as THREE from 'three';
import { toon } from './pax3d-look.js?v=a66df86b';

const FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function fitText(g, text, maxW, size, weight = 800) {
  let s = size;
  do {
    g.font = `${weight} ${s}px ${FONT}`;
    s -= 2;
  } while (g.measureText(text).width > maxW && s > 12);
}

/**
 * 상점 간판(평판) — 한국 상가 간판처럼 바탕색 판에 굵은 한글 한 줄, 아래 작은 줄.
 * @returns {THREE.Mesh} 앞면이 +z를 향하는 판(폭 w m)
 */
export function shopSign(title, sub, { bg = '#1f5aa6', fg = '#ffffff', w = 5, h = 1.1 } = {}) {
  const px = 128;
  const tex = canvasTexture(Math.round(w * px), Math.round(h * px), (g, W, H) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(0,0,0,.55)';
    g.lineWidth = 8;
    g.strokeRect(4, 4, W - 8, H - 8);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, title, W - 40, Math.round(H * (sub ? 0.5 : 0.62)));
    g.fillText(title, W / 2, sub ? H * 0.4 : H / 2);
    if (sub) {
      fitText(g, sub, W - 60, Math.round(H * 0.2), 600);
      g.globalAlpha = 0.85;
      g.fillText(sub, W / 2, H * 0.78);
    }
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12),
    [...Array(4).fill(new THREE.MeshLambertMaterial({ color: '#2b2b2b' })),
      new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshLambertMaterial({ color: '#2b2b2b' })]);
  return mesh;
}

/** 파란 도로명판 — 흰 글씨, 영문 병기 칸. 기둥 포함, 원점은 땅. */
export function roadNameSign(name, sub, grad) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), toon('#8a9097', grad));
  pole.position.y = 1.6;
  const tex = canvasTexture(640, 200, (c, W, H) => {
    c.fillStyle = '#1b4f9c';
    c.beginPath();
    c.roundRect(0, 0, W, H, 18);
    c.fill();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 6;
    c.beginPath();
    c.roundRect(10, 10, W - 20, H - 20, 12);
    c.stroke();
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, name, W - 70, 86);
    c.fillText(name, W / 2, sub ? H * 0.42 : H / 2);
    if (sub) {
      fitText(c, sub, W - 90, 34, 600);
      c.fillText(sub, W / 2, H * 0.78);
    }
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  plate.position.set(0, 3.0, 0.06);
  g.add(pole, plate);
  return g;
}

/** 전봇대 — 원점 땅, 꼭대기 전선 걸이 높이를 돌려준다. */
export function utilityPole(grad) {
  const g = new THREE.Group();
  const conc = toon('#b9b5ab', grad);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 10, 10), conc);
  pole.position.y = 5;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), toon('#5b5b5b', grad));
  arm.position.y = 9.2;
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 10), toon('#8d9296', grad));
  tr.position.set(0.35, 7.6, 0);
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.02), toon('#e8e2cf', grad));
  tag.position.set(0, 2.1, 0.2);
  g.add(pole, arm, tr, tag);
  for (const m of g.children) m.castShadow = true;
  g.userData.hang = [[-0.8, 9.25], [0, 9.25], [0.8, 9.25]]; // (좌우 오프셋, 높이)
  return g;
}

/** 두 전봇대 사이 늘어진 전선 — 현수선 근사 */
export function wires(a, b, yaw, sag = 0.9) {
  const pts = [];
  const hangs = [[-0.8, 9.25], [0, 9.25], [0.8, 9.25], [-0.3, 8.6]];
  const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  for (const [off, h] of hangs) {
    const p0 = a.clone().addScaledVector(side, off).setY(h);
    const p1 = b.clone().addScaledVector(side, off).setY(h);
    for (let i = 0; i < 10; i++) {
      const t0 = i / 10;
      const t1 = (i + 1) / 10;
      const q0 = p0.clone().lerp(p1, t0);
      const q1 = p0.clone().lerp(p1, t1);
      q0.y -= sag * 4 * t0 * (1 - t0);
      q1.y -= sag * 4 * t1 * (1 - t1);
      pts.push(q0, q1);
    }
  }
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x2a2724 }));
}

/** 은행나무 — 가을이라 노랗게. 원점 땅. */
export function ginkgo(grad, rand) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3.2, 7), toon('#6b5540', grad));
  trunk.position.y = 1.6;
  g.add(trunk);
  const yel = [toon('#e7c33d', grad), toon('#d9b02c', grad), toon('#c9c24a', grad)];
  const n = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const r = 0.9 + rand() * 0.5;
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), yel[i % yel.length]);
    blob.position.set((rand() - 0.5) * 1.1, 3.4 + i * 0.75, (rand() - 0.5) * 1.1);
    blob.scale.y = 1.25;
    g.add(blob);
  }
  for (const m of g.children) m.castShadow = true;
  return g;
}

export function streetLamp(grad) {
  const g = new THREE.Group();
  const mat = toon('#51565c', grad);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 7, 8), mat);
  pole.position.y = 3.5;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), mat);
  arm.position.set(0, 6.9, 0.75);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.6), toon('#f3eed8', grad));
  head.position.set(0, 6.82, 1.45);
  g.add(pole, arm, head);
  return g;
}

/** 횡단보도 — 도로 방향 dir(단위벡터) 위, 폭 width m */
export function crosswalk(center, dir, width) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: '#f4f2ea' });
  const across = new THREE.Vector3(-dir.z, 0, dir.x);
  const n = Math.max(3, Math.floor(width / 1.0));
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 1.0;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 3.2), mat);
    bar.position.copy(center).addScaledVector(across, off).setY(0.06);
    bar.rotation.y = Math.atan2(dir.x, dir.z);
    g.add(bar);
  }
  return g;
}

export function busStop(name, grad) {
  const g = new THREE.Group();
  const frame = toon('#4b6f8f', grad);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 1.6), frame);
  roof.position.y = 2.6;
  const back = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 0.05),
    new THREE.MeshLambertMaterial({ color: '#bfe0ea', transparent: true, opacity: 0.45 }));
  back.position.set(0, 1.35, -0.7);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.4), toon('#b58a5a', grad));
  bench.position.set(0, 0.5, -0.45);
  for (const x of [-1.9, 1.9]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.08), frame);
    post.position.set(x, 1.3, -0.7);
    g.add(post);
  }
  const sign = shopSign(name, '정류장', { bg: '#2f6b3a', w: 2.4, h: 0.6 });
  sign.position.set(0, 2.95, 0.2);
  g.add(roof, back, bench, sign);
  return g;
}

export function mailbox(grad) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.45), toon('#d2322d', grad));
  body.position.y = 0.6;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), toon('#d2322d', grad));
  cap.position.y = 1.1;
  g.add(body, cap);
  return g;
}

/** 옥상 초록 물탱크 — 한국 옥상의 표지 */
export function waterTank(grad) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 14), toon('#3f8f5a', grad));
  m.position.y = 0.7;
  m.castShadow = true;
  return m;
}

export function acUnit(grad) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.35), toon('#e6e3da', grad));
  m.castShadow = true;
  return m;
}

/** 사례 표지 — 가게 지붕 위에서 도는 노란 마름모(지도 화면의 표지와 같은 모양) */
export function caseBeacon(grad) {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0),
    new THREE.MeshToonMaterial({ color: 0xf4d35e, gradientMap: grad, emissive: 0x6b4d00 }));
  m.scale.y = 1.4;
  return m;
}

// 채울 가게 이름 — 실제 상호가 없을 때 쓰는 흔한 업종명
export const FILLER_SHOPS = [
  ['편의점', '#2d6fb7'], ['분식', '#d9482b'], ['세탁소', '#3a8fb7'], ['약국', '#2e8b57'], ['부동산', '#8a5a2b'],
  ['미용실', '#b04a8a'], ['카페', '#6b4a36'], ['치킨', '#e0892a'], ['문구점', '#4a7fb0'], ['철물점', '#5b6770'],
  ['꽃집', '#d05a7a'], ['떡집', '#9b6a3a'], ['정육점', '#b3322e'], ['반찬가게', '#6d8f3a'], ['안경원', '#34495e'],
  ['수선집', '#7a5c8f'], ['PC방', '#2b2b6b'], ['국밥', '#a33c2a'], ['빵집', '#c07a3a'], ['통신사 대리점', '#c0392b'],
];

/**
 * 창문 있는 벽 — 셰이더가 수직면에 층마다 창 격자를, 1층에는 유리 가게 앞면 띠를 그린다.
 * 벽을 따라가는 좌표를 법선에서 구하므로 비스듬한 실제 건물 윤곽에도 창이 벽을 따라 선다.
 */
export function windowedToon(grad, { color = 0xffffff, vertexColors = false } = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: grad, vertexColors });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (abs(vWNorm.y) < 0.3) {
          vec2 t = normalize(vec2(-vWNorm.z, vWNorm.x));
          float along = dot(vWPos.xz, t);
          if (vWPos.y > 3.5) {
            vec2 cell = vec2(fract(along / 3.0), fract((vWPos.y - 0.3) / 3.2));
            float win = step(0.22, cell.x) * step(cell.x, 0.78) * step(0.32, cell.y) * step(cell.y, 0.82);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.40, 0.52, 0.60), win * 0.8);
          } else if (vWPos.y > 0.35 && vWPos.y < 2.75) {
            float mull = step(0.06, fract(along / 2.4));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.69, 0.74), mull * 0.75);
          }
        }`);
  };
  return m;
}

export const BUILDING_TONES = ['#e9dcc3', '#dfe3dc', '#f0e2cf', '#d8d2c4', '#e7d4c3', '#d4dbde', '#efe7d2', '#e3d6cf'];
