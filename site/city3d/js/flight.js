// 랜드마크 자동 비행 — 주요 랜드마크를 차례로 날아가(높이 솟았다 내려앉는 호) 둘레를 한 바퀴 반쯤 돌며 보여 준다.
// 독립 페이지(city3d)와 3D PAX가 같은 비행을 쓴다. 좌표계는 호출하는 쪽이 toWorld·unit(월드 단위/미터)으로 넘긴다.
import * as THREE from 'three';

const ORBIT_M = 800;          // 둘레 비행 반지름(m)
const ORBIT_S = 7;            // 한 곳에 머무는 시간(초)
const ORBIT_TURN = Math.PI * 0.55;
const POLAR = 0.95;           // 내려다보는 각(라디안, 0 = 바로 위)
const LIFT_M = 30;            // 목표점을 땅에서 띄우는 높이

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const offsetAt = (r, polar, az, out = new THREE.Vector3()) => out.set(Math.sin(az) * Math.sin(polar), Math.cos(polar), Math.cos(az) * Math.sin(polar)).multiplyScalar(r);

/**
 * @param {{camera: THREE.Camera, controls: {target: THREE.Vector3},
 *          toWorld: (x:number, n:number, liftM:number) => THREE.Vector3, unit: number,
 *          onStop?: (i:number, stop:object, total:number) => void, onEnd?: (finished:boolean) => void}} opts
 */
export function createLandmarkFlight({ camera, controls, toWorld, unit, onStop = () => {}, onEnd = () => {} }) {
  let plan = null;
  const tmp = new THREE.Vector3();

  function leg(now) {
    const s = plan.stops[plan.i];
    const toT = toWorld(s.x, s.n, LIFT_M);
    const fromT = controls.target.clone();
    const fromOff = camera.position.clone().sub(fromT);
    const meters = fromT.distanceTo(toT) / unit;
    plan.leg = {
      fromT, toT, fromOff,
      az: Math.atan2(fromOff.x, fromOff.z),
      r: ORBIT_M * unit,
      dur: THREE.MathUtils.clamp(2.5 + meters / 1800, 3, 9) * 1000,
      rise: Math.min(meters * 0.3, 2500) * unit, // 먼 곳일수록 높이 솟았다 내려앉는다
      t0: now,
      phase: 'fly',
    };
    onStop(plan.i, s, plan.stops.length);
  }

  function stop(finished = false) {
    if (!plan) return;
    plan = null;
    onEnd(finished);
  }

  return {
    get active() { return Boolean(plan); },
    /** stops: [{name, x, n}] 도시 로컬 미터 — 비었으면 false */
    start(stops) {
      if (!stops.length) return false;
      plan = { stops, i: 0 };
      leg(performance.now());
      return true;
    },
    stop,
    /** 매 프레임(컨트롤 update 전에) — 비행 중이면 카메라·목표점을 정하고 true */
    update(now = performance.now()) {
      if (!plan) return false;
      const L = plan.leg;
      if (L.phase === 'fly') {
        const k = Math.min(1, (now - L.t0) / L.dur);
        const e = ease(k);
        controls.target.lerpVectors(L.fromT, L.toT, e);
        const to = offsetAt(L.r, POLAR, L.az, tmp);
        const off = L.fromOff.clone().lerp(to, e);
        off.y += Math.sin(Math.PI * k) * L.rise;
        camera.position.copy(controls.target).add(off);
        if (k >= 1) { L.phase = 'orbit'; L.t0 = now; }
      } else {
        const k = (now - L.t0) / (ORBIT_S * 1000);
        controls.target.copy(L.toT);
        camera.position.copy(L.toT).add(offsetAt(L.r, POLAR, L.az + ease(Math.min(k, 1)) * ORBIT_TURN, tmp));
        if (k >= 1) {
          plan.i++;
          if (plan.i >= plan.stops.length) stop(true);
          else leg(now);
        }
      }
      camera.lookAt(controls.target);
      return true;
    },
  };
}

/** 비행할 랜드마크 — OSM에서 확인된 지점만(대략 좌표로 둔 곳은 뺀다), 가까운 곳끼리 이어지게 순서를 정한다 */
export function flightStops(landmarks) {
  const verified = landmarks.filter((l) => l.source === 'OSM POI');
  if (verified.length < 3) return verified;
  const left = verified.slice(1);
  const order = [verified[0]];
  while (left.length) {
    const last = order[order.length - 1];
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (Math.hypot(left[i].x - last.x, left[i].n - last.n) < Math.hypot(left[best].x - last.x, left[best].n - last.n)) best = i;
    }
    order.push(left.splice(best, 1)[0]);
  }
  return order;
}
