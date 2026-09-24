import { createStore } from './state/store.js';
import { Viewer } from './viewer/Viewer.js';

const status = document.getElementById('status');
const panel = document.getElementById('panel');
const ar = document.getElementById('ar');

async function loadScene() {
  // ?model=foo.glb lets the viewer run standalone, without Blender.
  const params = new URLSearchParams(location.search);
  if (params.has('model')) return { model: params.get('model') };
  const res = await fetch('./api/scene', { cache: 'no-store' });
  if (!res.ok) throw new Error(`scene.json: ${res.status}`);
  return res.json();
}

function bindPanel(store) {
  panel.addEventListener('input', (e) => {
    const { name, value, type } = e.target;
    store.set({ [name]: type === 'range' ? Number(value) : value });
  });
  store.subscribe((s) => {
    for (const el of panel.elements) if (el.name in s) el.value = s[el.name];
  });
}

async function main() {
  const viewer = new Viewer(document.getElementById('view'));
  const store = createStore(await loadScene());
  bindPanel(store);

  const s = store.get();
  status.textContent = 'Загрузка…';
  await Promise.all([viewer.loadModel(s.model), viewer.setEnvironment(s.environment, s.environmentRotation)]);
  viewer.frameCamera(s.camera);
  store.subscribe((state, prev) => viewer.apply(state, prev));
  status.textContent = '';

  if (s.usdz) {
    ar.href = s.usdz;
    ar.hidden = false;
  }
}

main().catch((e) => {
  status.textContent = e.message;
  console.error(e);
});
