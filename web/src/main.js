import { connectLive } from './live.js';
import { createStore } from './state/store.js';
import { ALL_CLIPS, Viewer } from './viewer/Viewer.js';

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
  await Promise.all([viewer.loadModel(s.model, 'gltf', { keep: true }), viewer.setEnvironment(s.environment, s.environmentRotation)]);
  viewer.frameCamera(s.camera);
  store.subscribe((state, prev) => viewer.apply(state, prev));
  status.textContent = '';
  showUsdz(s.usdz);

  // Tabs: the Blender session (or ?model=) plus dropped files. Switching keeps the camera for A/B comparison.
  let seq = 0;
  const baseName = (url) => decodeURIComponent(url.split('/').pop().split('?')[0]);
  const tabs = [{
    id: ++seq, url: s.model, kind: 'gltf', usdz: s.usdz ?? null,
    blender: !s.standalone, name: s.standalone ? baseName(s.model) : 'Blender',
  }];
  let active = tabs[0];
  // Latest Blender export, kept even while sync is off so "revert" can pull it.
  let blenderScene = s.standalone ? null : s;
  const syncing = () => !editor || store.get().syncBlender;

  const tabBar = Object.assign(document.createElement('nav'), { id: 'tabs' });
  document.body.append(tabBar);
  const renderTabs = () => {
    tabBar.hidden = tabs.length < 2;
    tabBar.replaceChildren(...tabs.map((tab, i) => {
      const el = document.createElement('button');
      el.className = `tab ${tab === active ? 'active' : ''} ${tab === compareTab ? 'b' : ''} ${tab.fresh ? 'fresh' : ''}`;
      el.title = `${tab.name}${i < 9 ? ` — клавиша ${i + 1}, Shift+${i + 1} — сравнить (B)` : ''}`;
      el.append(Object.assign(document.createElement('span'), { className: 'tab-name', textContent: `${i + 1} · ${tab.name}` }));
      if (tab.kind === 'usd') el.append(Object.assign(document.createElement('span'), { className: 'tab-kind', textContent: 'USD' }));
      if (!tab.blender && tabs.length > 1) {
        const x = Object.assign(document.createElement('span'), { className: 'tab-close', textContent: '×', title: 'Закрыть вкладку' });
        x.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab); });
        el.append(x);
      }
      el.addEventListener('click', (e) => (e.shiftKey ? chooseB(tab) : switchTab(tab)));
      return el;
    }), compareButton);
    compareButton.classList.toggle('active', Boolean(compareTab));
  };
  const compareButton = Object.assign(document.createElement('button'), {
    className: 'tab compare', textContent: '⇆', title: 'Сравнение шторкой: активная вкладка (A) против другой (B)',
  });
  compareButton.addEventListener('click', () => toggleCompare());

  // Editor: separate chunk, desktop only (button hidden on narrow screens by CSS).
  let editor = null;
  const openEditor = async () => {
    if (editor) return;
    if (active.kind === 'usd') {
      flash('USDZ — только просмотр: редактор работает с GLB');
      return;
    }
    editButton.disabled = true;
    const { mountEditor } = await import('./editor/index.jsx');
    editor = await mountEditor({
      viewer, store, modelUrl: active.url, modelName: active.blender ? undefined : active.name, onClose: closeEditor,
      actions: { revert: () => revert(), hasBlender: Boolean(blenderScene) },
    });
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

  const editorTouched = () => Boolean(editor && (editor.model.history.value.undo || editor.model.history.value.redo));

  // Show a tab. Editor edits die with the switch: live patches changed the cached scene, so it's dropped.
  const activate = async (tab, { frame = false } = {}) => {
    if (editorTouched()) viewer.forget(active.url);
    if (tab.kind === 'usd') closeEditor();
    status.textContent = `Загрузка ${tab.name}…`;
    await viewer.loadModel(tab.url, tab.kind, { keep: true });
    if (frame) viewer.frameCamera(null);
    const leaving = active;
    if (leaving !== tab) prevTab = leaving;
    active = tab;
    tab.fresh = false;
    // A took B's model: the old A becomes B.
    if (compareTab === tab) await setCompareTab(tabs.includes(leaving) && leaving !== tab ? leaving : null);
    if (editor) await editor.model.load(tab.url, tab.blender ? undefined : tab.name);
    showUsdz(tab.usdz);
    status.textContent = '';
    renderTabs();
    renderCompareUI();
  };

  const confirmDropEdits = (what) => {
    const edits = editor?.model.history.value.undo ?? 0;
    return !edits || confirm(`${what}: правки редактора (${edits}) будут сброшены. Продолжить?`);
  };

  const switchTab = (tab) => {
    if (tab === active || !confirmDropEdits('Переключение вкладки')) return;
    queue = queue.then(() => activate(tab)).catch((e) => flash(e.message));
  };

  const closeTab = (tab) => {
    if (tab.blender) return;
    if (tab === active && !confirmDropEdits('Закрытие вкладки')) return;
    queue = queue.then(async () => {
      const i = tabs.indexOf(tab);
      if (tab === active) await activate(tabs[i + 1] ?? tabs[i - 1]);
      if (tab === compareTab) await setCompareTab(tabs.find((t) => t !== tab && t !== active) ?? null);
      tabs.splice(tabs.indexOf(tab), 1);
      viewer.forget(tab.url);
      if (tab.url.startsWith('blob:')) URL.revokeObjectURL(tab.url);
      renderTabs();
    }).catch((e) => flash(e.message));
  };

  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, select, textarea')) return;
    const digit = /^Digit([1-9])$/.exec(e.code);
    const tab = digit && tabs[digit[1] - 1];
    if (!tab) return;
    if (e.shiftKey) chooseB(tab);
    else switchTab(tab);
  });

  // New Blender export: the Blender tab gets the new file; loaded now only if it's the one on screen.
  const loadBlenderScene = async (next) => {
    const tab = tabs.find((t) => t.blender);
    if (tab.url !== next.model) viewer.forget(tab.url);
    Object.assign(tab, { url: next.model, usdz: next.usdz ?? null });
    store.set(next);
    if (active === tab) {
      await Promise.all([viewer.loadModel(next.model, 'gltf', { keep: true }), viewer.setEnvironment(next.environment, next.environmentRotation)]);
      showUsdz(tab.usdz);
      if (editor) await editor.model.load(next.model);
    } else {
      await viewer.setEnvironment(next.environment, next.environmentRotation);
      tab.fresh = true;
    }
    if (compareTab === tab) await setCompareTab(tab);
    renderTabs();
  };

  // Drop the editor's changes on the active tab: latest Blender export, or the file as opened/dropped.
  const revert = () => {
    if (!confirmDropEdits('Откат')) return;
    queue = queue.then(async () => {
      status.textContent = 'Откат…';
      viewer.forget(active.url);
      if (active.blender && blenderScene) {
        await loadBlenderScene(blenderScene);
      } else {
        await viewer.loadModel(active.url, active.kind, { keep: true });
        if (editor) await editor.model.load(active.url, active.blender ? undefined : active.name);
      }
      flash('Откат: правки редактора сброшены');
    }).catch((e) => flash(e.message));
  };

  // --- compare: wipe between the active tab (A) and another one (B) ---------------
  let compareTab = null;
  let prevTab = null;
  const overlay = Object.assign(document.createElement('div'), { id: 'compare', hidden: true });
  overlay.innerHTML = `
    <div class="cmp-line" title="Потяните; двойной клик — по центру"><span class="cmp-handle"></span></div>
    <span class="cmp-label a"></span><span class="cmp-label b"></span>
    <div class="cmp-bar">
      <span class="cmp-hint">Alt + мышь — своя камера у стороны · Shift+клик по вкладке — сторона B</span>
      <button class="cmp-reset" hidden>Сбросить смещения камер</button>
    </div>`;
  document.body.append(overlay);
  const canvas = viewer.renderer.domElement;
  const line = overlay.querySelector('.cmp-line');
  const placeOverlay = () => {
    const r = canvas.getBoundingClientRect();
    Object.assign(overlay.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  };
  const renderCompareUI = () => {
    overlay.hidden = !compareTab;
    if (!compareTab) return;
    placeOverlay();
    line.style.left = `${viewer.compare.split * 100}%`;
    overlay.querySelector('.cmp-label.a').textContent = `A · ${active.name}`;
    overlay.querySelector('.cmp-label.b').textContent = `B · ${compareTab.name}`;
    overlay.querySelector('.cmp-reset').hidden = !viewer.hasOffsets();
  };
  new ResizeObserver(() => compareTab && placeOverlay()).observe(canvas);
  line.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    line.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = canvas.getBoundingClientRect();
      viewer.setSplit((ev.clientX - r.left) / r.width);
      renderCompareUI();
    };
    line.addEventListener('pointermove', move);
    line.addEventListener('pointerup', () => line.removeEventListener('pointermove', move), { once: true });
  });
  line.addEventListener('dblclick', () => { viewer.setSplit(0.5); renderCompareUI(); });
  overlay.querySelector('.cmp-reset').addEventListener('click', () => { viewer.resetOffsets(); renderCompareUI(); });
  // Offsets are set while Alt is held: show "reset" once it's released.
  addEventListener('keyup', (e) => { if (e.key === 'Alt') setTimeout(renderCompareUI); });

  async function setCompareTab(tab) {
    compareTab = tab;
    viewer.setCompare(tab ? await viewer.getModel(tab.url, tab.kind) : null);
    renderTabs();
    renderCompareUI();
  }
  function toggleCompare() {
    queue = queue.then(() => {
      if (compareTab) return setCompareTab(null);
      const b = prevTab && tabs.includes(prevTab) && prevTab !== active ? prevTab : tabs.find((t) => t !== active);
      return b ? setCompareTab(b) : flash('Для сравнения нужна вторая вкладка: перетащите файл');
    }).catch((e) => flash(e.message));
  }
  function chooseB(tab) {
    if (tab === active || tab === compareTab) return;
    queue = queue.then(() => setCompareTab(tab)).catch((e) => flash(e.message));
  }

  // --- animation: which clip, pause ---------------------------------------------
  const anim = Object.assign(document.createElement('div'), { id: 'anim', hidden: true });
  anim.innerHTML = `
    <button class="anim-play" title="Пауза / воспроизведение (пробел)"></button>
    <select class="anim-clip" title="Клип анимации (при сравнении B играет клип с тем же именем)"></select>`;
  document.body.append(anim);
  const playButton = anim.querySelector('.anim-play');
  const clipSelect = anim.querySelector('.anim-clip');
  const placeAnim = () => {
    const r = canvas.getBoundingClientRect();
    Object.assign(anim.style, { left: `${r.left + 10}px`, top: `${r.bottom - 38}px` });
  };
  const renderAnim = () => {
    const clips = viewer.gltf?.animations ?? [];
    anim.hidden = !clips.length;
    if (!clips.length) return;
    placeAnim();
    clipSelect.replaceChildren(
      ...clips.map((c, i) => new Option(c.name || `Клип ${i + 1}`, c.name)),
      ...(clips.length > 1 ? [new Option('Все клипы вместе', ALL_CLIPS)] : []),
    );
    clipSelect.value = viewer.currentClip();
    playButton.textContent = viewer.paused ? '▶' : '❚❚';
  };
  clipSelect.addEventListener('change', () => {
    viewer.setClip(clipSelect.value);
    renderAnim();
  });
  const togglePause = () => {
    viewer.paused = !viewer.paused;
    renderAnim();
  };
  playButton.addEventListener('click', togglePause);
  addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || anim.hidden || e.target.closest?.('input, select, textarea, button')) return;
    e.preventDefault();
    togglePause();
  });
  viewer.modelListeners.add(() => renderAnim());
  new ResizeObserver(() => !anim.hidden && placeAnim()).observe(canvas);
  addEventListener('resize', () => !anim.hidden && placeAnim());
  renderAnim();

  bindDrop((file) => {
    const kind = fileKind(file.name);
    if (!kind) {
      flash(`${file.name}: нужен .glb или .usdz`);
      return;
    }
    if (!confirmDropEdits('Новая вкладка')) return;
    const url = URL.createObjectURL(file);
    const tab = { id: ++seq, url, kind, name: file.name, usdz: kind === 'usd' && /\.usdz$/i.test(file.name) ? url : null };
    queue = queue.then(async () => {
      await activate(tab, { frame: true });
      tabs.push(tab);
      renderTabs();
      flash(kind === 'usd' ? `${file.name}: только просмотр` : file.name);
    }).catch((e) => {
      URL.revokeObjectURL(url);
      flash(`${file.name}: ${e.message}`);
    });
  });
  renderTabs();

  const params = new URLSearchParams(location.search);
  if (params.has('debug')) {
    window.izv = { viewer, store, tabs, get active() { return active; }, get compareTab() { return compareTab; }, get editor() { return editor; } };
  }
  if (params.has('edit')) await openEditor();

  if (s.standalone) return;

  connectLive({
    // Re-export: new file for the Blender tab, camera stays where the user left it.
    scene: (next) => {
      blenderScene = next;
      if (!syncing()) {
        flash('Blender переэкспортировал модель — синк выключен, «Откат» подтянет её');
        return;
      }
      queue = queue.then(async () => {
        const onScreen = active.blender;
        if (onScreen) status.textContent = 'Обновление…';
        await loadBlenderScene(next);
        status.textContent = '';
        flash(!onScreen ? 'Blender обновил модель — во вкладке «Blender»'
          : editor ? 'Модель обновлена из Blender, правки в редакторе сброшены' : 'Модель обновлена');
      }).catch((e) => flash(e.message));
    },
    // Material patches only make sense for the Blender tab.
    material: (patches) => {
      if (!syncing() || !active.blender) return;
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
    viewer: (patch) => syncing() && store.set(patch),
  }, (ok) => liveDot.classList.toggle('on', ok));
}

main().catch((e) => {
  status.textContent = e.message;
  console.error(e);
});
