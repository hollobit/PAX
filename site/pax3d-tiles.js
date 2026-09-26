// 3D PAX 실제 지도 층 — 가까이 다가가면 시도 땅 위에 OpenStreetMap 타일을 깐다(사용자 지시 2026-09-27).
//
// 멀리서는 미니어처 그대로, 확대하면 실제 지도가 서서히 떠오른다. 타일은 시도 윗면이 스텐실에 1을
// 써 둔 곳에만 그려져 바다와 가상의 섬(정부·커뮤니티 섬 등)에는 번지지 않는다.
// OSM 타일 이용 정책: 화면에 보이는 것만 필요할 때 불러오고(미리 받지 않음) 출처를 항상 표시한다.
import * as THREE from 'three';

const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const FADE_FAR = 6.5;   // 이보다 멀면 타일 없음
const FADE_NEAR = 4.3;  // 이보다 가까우면 완전히 보임
const RADIUS = 3;       // 중심 타일에서 사방 3칸 — 최대 7×7장
const CACHE_MAX = 160;
const KOREA = { w: 124.4, e: 132.0, s: 32.9, n: 38.8 };

const lon2x = (lon, n) => Math.floor(((lon + 180) / 360) * n);
const lat2y = (lat, n) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
};
const x2lon = (x, n) => (x / n) * 360 - 180;
const y2lat = (y, n) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

/** 시도 윗면 재질에 붙여 스텐실 1을 쓰게 한다. */
export function markLandStencil(material) {
  Object.assign(material, {
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
}

/**
 * @param {{scene:THREE.Scene, project:(lon:number,lat:number)=>THREE.Vector2,
 *          unproject:(x:number,z:number)=>number[], y:number, onActive:(on:boolean)=>void}} opts
 */
export function createTileLayer({ scene, project, unproject, y, onActive, heightAt = () => 0, landMask = null }) {
  const group = new THREE.Group();
  group.renderOrder = 1;
  scene.add(group);
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const cache = new Map(); // key → {mesh, used}
  let enabled = true;
  let active = false;
  let lastKey = '';
  let opacity = 0;

  function tileMesh(z, x, yy) {
    const n = 2 ** z;
    const nw = project(x2lon(x, n), y2lat(yy, n));
    const se = project(x2lon(x + 1, n), y2lat(yy + 1, n));
    const material = new THREE.MeshBasicMaterial({
      color: 0xfff6ea, transparent: true, opacity: 0, depthWrite: false,
      // 지형 위에서는 폴리곤 오프셋으로 한 겹 앞으로 — 격자가 달라 봉우리가 타일을 뚫고 나오지 않게
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16,
    });
    if (landMask) {
      // 실제 지형이 있으면 육지 가림막으로 바다·가상 섬을 잘라낸다
      material.onBeforeCompile = (sh) => {
        sh.uniforms.landMask = { value: landMask.texture };
        sh.uniforms.maskGrid = { value: landMask.grid };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vW;\nuniform sampler2D landMask;\nuniform vec4 maskGrid;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            vec2 muv = vec2((vW.x - maskGrid.x) / maskGrid.z, (maskGrid.y + vW.z) / maskGrid.w);
            if (texture2D(landMask, muv).r < 0.5) discard;`);
      };
    } else {
      // 평평한 판: 시도 윗면이 스텐실에 써 둔 1 위에만
      Object.assign(material, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc });
    }
    // 타일을 지형에 입힌다 — 24×24로 잘게 나눠 꼭짓점마다 그 자리 높이
    const geo = new THREE.PlaneGeometry(1, 1, 24, 24).rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const wx = (nw.x + se.x) / 2 + p.getX(i) * (se.x - nw.x);
      const wz = -(nw.y + se.y) / 2 + p.getZ(i) * (nw.y - se.y);
      p.setXYZ(i, wx, y + heightAt(wx, wz), wz);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.visible = false;
    mesh.renderOrder = 1;
    loader.load(TILE_URL(z, x, yy), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      material.map = tex;
      material.needsUpdate = true;
      mesh.userData.ready = true;
    }, undefined, () => { mesh.userData.failed = true; });
    group.add(mesh);
    return mesh;
  }

  function evict(keep) {
    if (cache.size <= CACHE_MAX) return;
    const old = [...cache].filter(([k]) => !keep.has(k)).sort((a, b) => a[1].used - b[1].used);
    for (const [k, v] of old.slice(0, cache.size - CACHE_MAX)) {
      group.remove(v.mesh);
      v.mesh.geometry.dispose();
      if (v.mesh.material.map) v.mesh.material.map.dispose();
      v.mesh.material.dispose();
      cache.delete(k);
    }
  }

  function setActive(on) {
    if (on === active) return;
    active = on;
    onActive(on);
  }

  return {
    stats: () => ({ enabled, active, lastKey, opacity, cached: cache.size,
      ready: [...cache.values()].filter((v) => v.mesh.userData.ready).length,
      failed: [...cache.values()].filter((v) => v.mesh.userData.failed).length }),
    setEnabled(on) {
      enabled = on;
      lastKey = '';
    },
    /** 매 프레임 호출 — 카메라 거리로 타일 줌과 투명도를 정한다. */
    update(camera, target) {
      const d = camera.position.distanceTo(target);
      opacity = enabled ? 1 - THREE.MathUtils.smoothstep(d, FADE_NEAR, FADE_FAR) : 0;
      setActive(opacity > 0.02);
      if (!active) {
        group.visible = false;
        return;
      }
      group.visible = true;
      const z = THREE.MathUtils.clamp(Math.round(Math.log2(3458 / d)), 8, 13);
      const [lon, lat] = unproject(target.x, target.z);
      const n = 2 ** z;
      const cx = lon2x(lon, n);
      const cy = lat2y(lat, n);
      const key = `${z}/${cx}/${cy}`;
      if (key !== lastKey) {
        lastKey = key;
        const want = new Set();
        const [x0, x1] = [lon2x(KOREA.w, n), lon2x(KOREA.e, n)];
        const [y0, y1] = [lat2y(KOREA.n, n), lat2y(KOREA.s, n)];
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          for (let dy = -RADIUS; dy <= RADIUS; dy++) {
            const tx = cx + dx;
            const ty = cy + dy;
            if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue;
            want.add(`${z}/${tx}/${ty}`);
          }
        }
        const now = performance.now();
        for (const k of want) {
          if (!cache.has(k)) {
            const [zz, xx, yy] = k.split('/').map(Number);
            cache.set(k, { mesh: tileMesh(zz, xx, yy), used: now });
          } else cache.get(k).used = now;
        }
        for (const [k, v] of cache) v.mesh.userData.wanted = want.has(k);
        evict(want);
      }
      for (const { mesh } of cache.values()) {
        mesh.visible = Boolean(mesh.userData.wanted && mesh.userData.ready);
        if (mesh.visible) mesh.material.opacity = opacity;
      }
    },
  };
}
