// 3D PAX 화풍 — 셀 셰이딩 + 깊이 2차 차분 먹선 + 틸트시프트.
// sakura-crossing이 쓰는 방식(3D 장면을 손그림 배경처럼 보이게)을 작은 규모로 옮겼다.
// 이미지 자산은 하나도 없다: 하늘·간판은 모두 실행 중에 Canvas2D로 그린다.
import * as THREE from 'three';

// 3단 계조 — 빛/중간/그늘이 뚝 끊기는 셀 애니메이션 면.
export function toonGradient() {
  const tex = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export function toon(color, gradientMap, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
}

export function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#9cc9e8');
  grad.addColorStop(0.55, '#d8ecf2');
  grad.addColorStop(1, '#f6ecd8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 관공서 게시판 같은 종이 간판. lines[0]은 굵게, 나머지는 작게. */
export function signSprite(lines, { scale = 0.42, accent = '#8c2b23', dim = false } = {}) {
  const pad = 22;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const big = '700 44px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
  const small = '500 30px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
  g.font = big;
  let w = g.measureText(lines[0]).width;
  g.font = small;
  for (const l of lines.slice(1)) w = Math.max(w, g.measureText(l).width);
  c.width = Math.ceil(w + pad * 2 + 12);
  c.height = 64 + (lines.length - 1) * 40 + pad;
  const W = c.width;
  const H = c.height;
  g.fillStyle = dim ? '#e9e3d6' : '#fbf6ea';
  g.strokeStyle = '#221d16';
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(3, 3, W - 6, H - 6, 12);
  g.fill();
  g.stroke();
  g.fillStyle = accent;
  g.fillRect(3 + 6, 10, 7, H - 20);
  g.fillStyle = dim ? '#8a8272' : '#221d16';
  g.textBaseline = 'top';
  g.font = big;
  g.fillText(lines[0], pad + 8, pad - 4);
  g.font = small;
  g.fillStyle = dim ? '#9a917f' : '#6b6153';
  lines.slice(1).forEach((l, i) => g.fillText(l, pad + 8, pad + 48 + i * 40));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set((W / H) * scale, scale, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  return sprite;
}

const POST_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 먹선: 선형화한 깊이의 2차 차분(라플라시안)이 크면 윤곽. 엣지 필터가 아니라 기하의 불연속에서 나온다.
// 틸트시프트: 화면 위아래를 흐려 초점 띠만 또렷하게 — 미니어처 사진 느낌.
const POST_FRAG = `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float near;
uniform float far;
uniform float inkOn;
uniform float focusY;
varying vec2 vUv;
float lin(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float z = d * 2.0 - 1.0;
  return 2.0 * near * far / (far + near - z * (far - near));
}
void main() {
  vec2 px = 1.0 / resolution;
  float d0 = lin(vUv);
  float lap = abs(4.0 * d0 - lin(vUv + vec2(px.x, 0.0)) - lin(vUv - vec2(px.x, 0.0))
                           - lin(vUv + vec2(0.0, px.y)) - lin(vUv - vec2(0.0, px.y)));
  float ink = smoothstep(0.012, 0.045, lap / d0) * inkOn;

  vec3 sharp = texture2D(tColor, vUv).rgb;
  float blur = smoothstep(0.16, 0.52, abs(vUv.y - focusY));
  vec3 soft = vec3(0.0);
  float r = 3.2 * blur;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    soft += texture2D(tColor, vUv + vec2(cos(a), sin(a)) * px * r).rgb;
  }
  vec3 col = mix(sharp, soft / 8.0, blur);
  col = mix(col, vec3(0.13, 0.11, 0.09), ink * (1.0 - blur * 0.6) * 0.85);

  // 색 보정: 그늘을 살짝 따뜻하게, 채도 약간 올림, 가장자리 비네트
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.08);
  col += vec3(0.018, 0.008, -0.01) * (1.0 - l);
  float v = smoothstep(0.95, 0.35, length(vUv - 0.5));
  col *= mix(0.86, 1.0, v);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;

/** 장면을 깊이와 함께 렌더 타깃에 그린 뒤 먹선·틸트시프트를 입혀 화면에 낸다. */
export function createPostPass(renderer) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    depthTexture: new THREE.DepthTexture(size.x, size.y),
    type: THREE.HalfFloatType,
  });
  const material = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
    uniforms: {
      tColor: { value: target.texture },
      tDepth: { value: target.depthTexture },
      resolution: { value: size.clone() },
      near: { value: 0.1 },
      far: { value: 100 },
      inkOn: { value: 1 },
      focusY: { value: 0.5 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    uniforms: material.uniforms,
    setSize() {
      renderer.getDrawingBufferSize(size);
      target.setSize(size.x, size.y);
      material.uniforms.resolution.value.copy(size);
    },
    render(scene, camera) {
      material.uniforms.near.value = camera.near;
      material.uniforms.far.value = camera.far;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCam);
    },
  };
}
