import { connectLive } from './live.js';
import { createStore } from './state/store.js';
import { Viewer } from './viewer/Viewer.js';

const status = document.getElementById('status');
const liveDot = document.getElementById('live');
const panel = document.getElementById('panel');
const ar = document.getElementById('ar');
const editButton = document.getElementById('edit');

async function loadScene() {
  // ?model=foo.glb lets the viewer run standalone, without Blender.
  const params = new URLSearchParams(location.search);
  if (params.has('model')) return { model: params.get('model'), standalone: true };
  const res = await fetch('./api/scene', { cache: 'no-store' });
  if (!res.ok) throw new Error(`scene.json: ${res.status}`);
  return res.json();
}

function bindPanel(store) {
  panel.addEventListener('input', (e) => {
    const { name, value, type } = e.target;
    if (!name) return;
    store.set({ [name]: type === 'range' ? Number(value) : value });
  });
  store.subscribe((s) => {
    for (const el of panel.elements) if (el.name in s) el.value = s[el.name];
  });
}

function showUsdz(url) {
  ar.hidden = !url;
  if (url) ar.href = url;
}

function flash(text) {
  status.textContent = text;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => (status.textContent = ''), 4000);
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
  showUsdz(s.usdz);

  // Editor: separate chunk, desktop only (button hidden on narrow screens by CSS).
  let editor = null;
  const openEditor = async () => {
    if (editor) return;
    editButton.disabled = true;
    const { mountEditor } = await import('./editor/index.jsx');
    editor = await mountEditor({ viewer, store, modelUrl: store.get().model, onClose: closeEditor });
  };
  const closeEditor = () => {
    editor?.unmount();
    editor = null;
    editButton.disabled = false;
  };
  editButton.addEventListener('click', (e) => {
    e.preventDefault();
    openEditor().catch((err) => flash(err.message));
  });
  const params = new URLSearchParams(location.search);
  if (params.has('debug')) window.izv = { viewer, store, get editor() { return editor; } };
  if (params.has('edit')) await openEditor();

  if (s.standalone) return;

  let queue = Promise.resolve();
  connectLive({
    // Re-export: new file, same tab, camera stays where the user left it.
    scene: (next) => {
      queue = queue.then(async () => {
        status.textContent = 'Обновление…';
        await Promise.all([viewer.loadModel(next.model), viewer.setEnvironment(next.environment, next.environmentRotation)]);
        store.set(next);
        showUsdz(next.usdz);
        if (editor) await editor.model.load(next.model);
        flash(editor ? 'Модель обновлена из Blender, правки в редакторе сброшены' : 'Модель обновлена');
      }).catch((e) => flash(e.message));
    },
    material: (patches) => {
      queue.then(() => {
        if (editor) {
          const missing = editor.model.applyBlenderPatches(patches);
          if (missing.length) flash(`Нет в модели: ${missing.join(', ')} — нужен переэкспорт`);
          return;
        }
        const { missing, skipped } = viewer.patchMaterials(patches);
        if (skipped.length) flash(`Нужен переэкспорт для: ${skipped.join(', ')}`);
        else if (missing.length) flash(`Нет в модели: ${missing.join(', ')} — нужен переэкспорт`);
      });
    },
    viewer: (patch) => store.set(patch),
  }, (ok) => liveDot.classList.toggle('on', ok));
}

main().catch((e) => {
  status.textContent = e.message;
  console.error(e);
});
