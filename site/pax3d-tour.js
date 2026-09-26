// 3D PAX 자동 투어 — 지금 목록(검색·축 선택 결과)의 사례를 차례로 찾아가며 카드를 띄운다.
// 사용자가 지도를 만지거나 Esc·버튼을 누르면 바로 멈춘다 — 투어가 손을 빼앗지 않게.
const STEP_MS = 7000;

/**
 * @param {{getIds:()=>string[], show:(id:string)=>void, world:object|null, button:HTMLElement}} opts
 */
export function createTour({ getIds, show, world, button }) {
  let ids = [];
  let i = 0;
  let timer = null;

  function label() {
    button.textContent = timer ? `■ 투어 멈춤 ${i}/${ids.length}` : '▶ 자동 투어';
    button.setAttribute('aria-pressed', String(Boolean(timer)));
  }
  function step() {
    if (i >= ids.length) {
      stop();
      return;
    }
    const id = ids[i++];
    if (world) world.setAutoRotate(false);
    show(id);
    // 날아가 앉은 뒤에는 천천히 둘러본다
    setTimeout(() => { if (timer && world) world.setAutoRotate(true); }, 1300);
    label();
    timer = setTimeout(step, STEP_MS);
  }
  function start() {
    ids = getIds();
    if (!ids.length) return;
    i = 0;
    timer = setTimeout(() => {}, 0);
    step();
  }
  function stop() {
    clearTimeout(timer);
    timer = null;
    if (world) world.setAutoRotate(false);
    label();
  }
  button.addEventListener('click', () => (timer ? stop() : start()));
  if (world) world.onUserInteract(() => { if (timer) stop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && timer) stop(); });
  label();
  return { stop, get running() { return Boolean(timer); } };
}
