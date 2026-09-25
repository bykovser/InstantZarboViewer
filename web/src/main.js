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
    const { name, value, type, checked } = e.target;
    if (!name) return;
    store.set({ [name]: type === 'checkbox' ? checked : type === 'range' ? Number(value) : value });
  });
  store.subscribe((s) => {
    for (const el of panel.elements) {
      if (!(el.name in s)) continue;
      if (el.type === 'checkbox') el.checked = Boolean(s[el.name]);
      else el.value = s[el.name];
    }
  });
}

function showUsdz(url) {
  ar.hidden = !url;
  if (url) ar.href = url;
}

const USD_EXT = ['usdz', 'usda', 'usdc', 'usd'];

function fileKind(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'glb' || ext === 'gltf') return 'gltf';
  return USD_EXT.includes(ext) ? 'usd' : null;
}

// Files dropped anywhere on the page. Only the drag with files counts (not text or links).
function bindDrop(onFile) {
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    depth++;
    document.body.classList.add('dropping');
  });
  addEventListener('dragleave', () => {
    if (--depth <= 0) { depth = 0; document.body.classList.remove('dropping'); }
  });
  addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  addEventListener('drop', (e) => {
    depth = 0;
    document.body.classList.remove('dropping');
    // Texture slots handle their own drops.
    if (!hasFiles(e) || e.defaultPrevented) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  });
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

  // What the viewport shows now: the Blender session file, or a dropped file.
  let current = { url: s.model, name: undefined, kind: 'gltf' };

  // Editor: separate chunk, desktop only (button hidden on narrow screens by CSS).
  let editor = null;
  const openEditor = async () => {
    if (editor) return;
    if (current.kind === 'usd') {
      flash('USDZ — только просмотр: редактор работает с GLB');
      return;
    }
    editButton.disabled = true;
    const { mountEditor } = await import('./editor/index.jsx');
    editor = await mountEditor({ viewer, store, modelUrl: current.url, modelName: current.name, onClose: closeEditor });
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
  let queue = Promise.resolve();
  bindDrop((file) => {
    const kind = fileKind(file.name);
    if (!kind) {
      flash(`${file.name}: нужен .glb или .usdz`);
      return;
    }
    queue = queue.then(async () => {
      status.textContent = `Загрузка ${file.name}…`;
      const url = URL.createObjectURL(file);
      if (kind === 'usd') closeEditor();
      await viewer.loadModel(url, kind);
      viewer.frameCamera(null);
      if (editor) await editor.model.load(url, file.name);
      if (current.url.startsWith('blob:')) URL.revokeObjectURL(current.url);
      current = { url, name: file.name, kind };
      showUsdz(kind === 'usd' && file.name.toLowerCase().endsWith('.usdz') ? url : null);
      flash(kind === 'usd' ? `${file.name}: только просмотр` : file.name);
    }).catch((e) => flash(`${file.name}: ${e.message}`));
  });

  const params = new URLSearchParams(location.search);
  if (params.has('debug')) window.izv = { viewer, store, get editor() { return editor; } };
  if (params.has('edit')) await openEditor();

  if (s.standalone) return;

  connectLive({
    // Re-export: new file, same tab, camera stays where the user left it.
    scene: (next) => {
      queue = queue.then(async () => {
        status.textContent = 'Обновление…';
        await Promise.all([viewer.loadModel(next.model), viewer.setEnvironment(next.environment, next.environmentRotation)]);
        if (current.url.startsWith('blob:')) URL.revokeObjectURL(current.url);
        current = { url: next.model, name: undefined, kind: 'gltf' };
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
