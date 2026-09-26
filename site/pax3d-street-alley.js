// 3D PAX 가상의 동네 거리 — 실제 지도 자료가 없거나(섬) 받지 못했을 때 짓는 한국 상가 거리.
// 두 차로 큰길 양옆으로 2~5층 상가주택이 늘어서고, 가운데 사거리에 횡단보도와 골목이 있다.
// 사례는 사거리에서 가까운 가게부터 간판을 달고, 나머지는 흔한 동네 가게로 채운다.
import * as THREE from 'three';
import { toon } from './pax3d-look.js?v=a66df86b';
import {
  shopSign, roadNameSign, utilityPole, wires, ginkgo, streetLamp, crosswalk, busStop, mailbox, waterTank, acUnit,
  caseBeacon, windowedToon, BUILDING_TONES, FILLER_SHOPS,
} from './pax3d-street-props.js?v=d69f2782';

const ROAD = 8;
const WALK = 3;
const EDGE = ROAD / 2 + WALK; // 건물 앞면까지 거리

export function buildAlleyStreet({ cases, grad, rng, placeName, colorOf, shortTitle }) {
  const group = new THREE.Group();
  const rand = rng(`alley-${placeName}`);
  const perSide = Math.max(8, Math.ceil(cases.length / 2) + 4);
  const len = perSide * 11.5 + 20;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(len + 120, 160).rotateX(-Math.PI / 2), toon('#c9c6bf', grad));
  ground.receiveShadow = true;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(len + 120, ROAD).rotateX(-Math.PI / 2), toon('#6f7278', grad));
  road.position.y = 0.04;
  road.receiveShadow = true;
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(6, 160).rotateX(-Math.PI / 2), toon('#7a7c82', grad));
  cross.position.y = 0.035;
  const centre = new THREE.Mesh(new THREE.PlaneGeometry(len + 120, 0.3).rotateX(-Math.PI / 2), toon('#e8c33a', grad));
  centre.position.y = 0.05;
  group.add(ground, road, cross, centre);
  const dir = new THREE.Vector3(0, 0, 1);
  for (const x of [-6.5, 6.5]) group.add(crosswalk(new THREE.Vector3(x, 0, 0), new THREE.Vector3(1, 0, 0), ROAD));
  for (const z of [-7, 7]) group.add(crosswalk(new THREE.Vector3(0, 0, z), dir, 6));

  // ---- 상가주택 줄 -------------------------------------------------------------------
  const colliders = [];
  const shops = [];
  const slots = [];
  for (const side of [1, -1]) {
    let x = 5;
    while (x < len / 2) {
      for (const sx of [x, -x]) slots.push({ side, x: sx });
      x += 11.5;
    }
  }
  slots.sort((a, b) => Math.abs(a.x) - Math.abs(b.x) || a.side - b.side);
  let caseIdx = 0;
  for (const slot of slots) {
    const w = 8.5 + rand() * 2.5;
    const depth = 9 + rand() * 4;
    const floors = 2 + Math.floor(rand() * 4);
    const h = floors * 3.1;
    const zFront = slot.side * EDGE;
    const zc = zFront + slot.side * (depth / 2);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), windowedToon(grad, { color: BUILDING_TONES[Math.floor(rand() * BUILDING_TONES.length)] }));
    body.position.set(slot.x, h / 2, zc);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    colliders.push([[slot.x - w / 2, zc - depth / 2], [slot.x + w / 2, zc - depth / 2], [slot.x + w / 2, zc + depth / 2], [slot.x - w / 2, zc + depth / 2]]);
    // 1층 유리 가게 앞면
    const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 2.3, 0.05), new THREE.MeshLambertMaterial({ color: '#9fc3cf' }));
    glass.position.set(slot.x, 1.25, zFront - slot.side * 0.02);
    group.add(glass);
    // 옥상 물탱크·옥탑방, 옆벽 에어컨 실외기
    if (rand() < 0.6) {
      const t = waterTank(grad);
      t.position.set(slot.x + (rand() - 0.5) * w * 0.5, h, zc + slot.side * depth * 0.2);
      group.add(t);
    }
    if (rand() < 0.35) {
      const room = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 3), toon('#e9e4d6', grad));
      room.position.set(slot.x - w * 0.2, h + 1.2, zc);
      room.castShadow = true;
      group.add(room);
    }
    for (let f = 1; f < floors; f++) {
      if (rand() < 0.5) continue;
      const ac = acUnit(grad);
      ac.position.set(slot.x + (rand() < 0.5 ? -1 : 1) * (w / 2 + 0.2), f * 3.1 + 0.6, zc);
      ac.rotation.y = Math.PI / 2;
      group.add(ac);
    }
    // 간판: 사례가 남아 있으면 사례, 아니면 동네 가게
    const c = cases[caseIdx];
    const signY = 3.0;
    let sign;
    if (c) {
      sign = shopSign(shortTitle(c), c.task_category || '', { bg: colorOf(c), w: w * 0.9, h: 1.0 });
      sign.userData.caseId = c.id;
      const beacon = caseBeacon(grad);
      beacon.position.set(slot.x, h + 3, zc);
      beacon.userData.spin = true;
      group.add(beacon);
      caseIdx++;
      shops.push({
        caseId: c.id, sign, beacon,
        stand: new THREE.Vector3(slot.x, 1.6, zFront - slot.side * 6),
        look: new THREE.Vector3(slot.x, signY, zFront),
      });
    } else {
      const [name, color] = FILLER_SHOPS[Math.floor(rand() * FILLER_SHOPS.length)];
      sign = shopSign(name, '', { bg: color, w: w * 0.8, h: 0.9 });
    }
    sign.position.set(slot.x, signY, zFront - slot.side * 0.08);
    sign.rotation.y = slot.side > 0 ? Math.PI : 0;
    group.add(sign);
  }

  // ---- 길 소품 ------------------------------------------------------------------
  let prev = null;
  for (let x = -len / 2 + 6; x <= len / 2; x += 24) {
    if (Math.abs(x) < 6) continue;
    const pole = utilityPole(grad);
    pole.position.set(x, 0, ROAD / 2 + 0.7);
    pole.rotation.y = Math.PI / 2; // 큰길이 x축 — 가로대는 z축으로
    group.add(pole);
    const here = new THREE.Vector3(x, 0, ROAD / 2 + 0.7);
    if (prev) group.add(wires(prev, here, Math.PI / 2));
    prev = here;
  }
  for (let x = -len / 2 + 10; x <= len / 2; x += 13) {
    if (Math.abs(x) < 8) continue;
    const t = ginkgo(grad, rand);
    t.position.set(x, 0, -(ROAD / 2 + 1.4));
    group.add(t);
  }
  for (let x = -len / 2 + 18; x <= len / 2; x += 34) {
    const l = streetLamp(grad);
    l.position.set(x, 0, ROAD / 2 + 0.5);
    l.rotation.y = Math.PI;
    group.add(l);
  }
  const stop = busStop(`${placeName} 입구`, grad);
  stop.position.set(22, 0, -(ROAD / 2 + 1.6));
  stop.rotation.y = 0;
  group.add(stop);
  const mb = mailbox(grad);
  mb.position.set(-9, 0, ROAD / 2 + 1.2);
  group.add(mb);
  for (const [x, z, name, sub] of [[-4.5, ROAD / 2 + 1.2, '공공AX로', '가상의 거리'], [4.5, -(ROAD / 2 + 1.2), `${placeName}길`, '가상의 거리']]) {
    const s = roadNameSign(name, sub, grad);
    s.position.set(x, 0, z);
    s.rotation.y = z > 0 ? Math.PI : 0;
    group.add(s);
  }

  const first = shops[0];
  const spawn = first
    ? { pos: first.stand.clone(), look: first.look.clone() }
    : { pos: new THREE.Vector3(0, 1.6, 0), look: new THREE.Vector3(10, 1.6, 0) };
  return { group, colliders, shops, spawn, radius: len / 2 + 30, attribution: '가상의 거리 — 실제 지도 자료가 없는 자리(섬)이거나 지도 자료를 받지 못해 지은 동네입니다' };
}
