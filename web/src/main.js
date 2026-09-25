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
  // url: what the tab shows now (a baked GLB once edited); source: what "revert" goes back to.
  // snap: the editor session (document + undo history) kept while another tab is on screen.
  const tabs = [{
    id: ++seq, url: s.model, source: s.model, kind: 'gltf', usdz: s.usdz ?? null,
    blender: !s.standalone, name: s.standalone ? baseName(s.model) : 'Blender',
  }];
  let active = tabs[0];
  // Latest Blender export, kept even while sync is off so "revert" can pull it.
  let blenderScene = s.standalone ? null : s;
  const syncing = () => !editor || store.get().syncBlender;

  const tabBar = Object.assign(document.createElement('nav'), { id: 'tabs' });
  document.body.append(tabBar);
  const renderTabs = () => {
    tabBar.replaceChildren(...tabs.map((tab, i) => {
      const el = document.createElement('button');
      el.className = `tab ${tab === active ? 'active' : ''} ${tab === compareTab ? 'b' : ''} ${tab.fresh ? 'fresh' : ''} ${tab.edited ? 'edited' : ''}`;
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
    }), pinButton, compareButton);
    compareButton.classList.toggle('active', Boolean(compareTab));
    compareButton.disabled = tabs.length < 2;
  };
  const pinButton = Object.assign(document.createElement('button'), {
    className: 'tab pin', textContent: '⧉',
    title: 'Закрепить копию: текущая модель со всеми правками — в новую вкладку (например, вариант под USDZ)',
  });
  pinButton.addEventListener('click', () => pinCurrent());
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
      viewer, store, modelUrl: active.url, modelName: active.blender ? undefined : active.name,
      onClose: () => { queue = queue.then(closeEditor).catch((e) => flash(e.message)); },
      actions: { revert: () => revert(), hasBlender: Boolean(blenderScene) },
    });
    if (active.snap) editor.model.restore(active.snap);
  };
  const unmountEditor = () => {
    editor?.unmount();
    editor = null;
    editButton.disabled = false;
  };
  const closeEditor = async () => {
    await stash();
    unmountEditor();
  };
  editButton.addEventListener('click', (e) => {
    e.preventDefault();
    openEditor().catch((err) => flash(err.message));
  });
  let queue = Promise.resolve();

  const revokeBlob = (url, keep = []) => {
    if (url?.startsWith('blob:') && !keep.includes(url) && !tabs.some((t) => t.url === url || t.source === url)) {
      URL.revokeObjectURL(url);
    }
  };

  // Leaving a tab with editor changes: bake them into the tab's own GLB and keep the session.
  const stash = async () => {
    if (!editor?.model.dirty) return;
    const tab = active;
    const glb = await editor.bake();
    const old = tab.url;
    viewer.forget(old);
    tab.url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
    revokeBlob(old);
    tab.snap = editor.model.snapshot();
    tab.edited = true;
  };

  const activate = async (tab, { frame = false } = {}) => {
    if (tab !== active) await stash();
    if (tab.kind === 'usd') unmountEditor();
    status.textContent = `Загрузка ${tab.name}…`;
    await viewer.loadModel(tab.url, tab.kind, { keep: true });
    if (frame) viewer.frameCamera(null);
    const leaving = active;
    if (leaving !== tab) prevTab = leaving;
    active = tab;
    tab.fresh = false;
    // A took B's model: the old A becomes B.
    if (compareTab === tab) await setCompareTab(tabs.includes(leaving) && leaving !== tab ? leaving : null);
    if (editor) {
      if (tab.snap) editor.model.restore(tab.snap);
      else await editor.model.load(tab.url, tab.blender ? undefined : tab.name);
    }
    showUsdz(tab.usdz);
    status.textContent = '';
    renderTabs();
    renderCompareUI();
  };

  const hasEdits = (tab) => tab.edited || (tab === active && editor?.model.dirty);
  const confirmDropEdits = (tab, what) => !hasEdits(tab) || confirm(`${what}: правки редактора в «${tab.name}» пропадут. Продолжить?`);

  const switchTab = (tab) => {
    if (tab === active) return;
    queue = queue.then(() => activate(tab)).catch((e) => flash(e.message));
  };

  // A copy of what's on screen (edits included) as a new tab: e.g. a USDZ-only variant of the same model.
  const pinCurrent = () => {
    queue = queue.then(async () => {
      const bytes = editor ? await editor.bake() : await (await fetch(active.url)).arrayBuffer();
      const type = active.kind === 'usd' ? 'model/vnd.usdz+zip' : 'model/gltf-binary';
      const url = URL.createObjectURL(new Blob([bytes], { type }));
      const tab = {
        id: ++seq, url, source: url, kind: active.kind, name: `${active.name} · копия`,
        usdz: active.kind === 'usd' ? url : null,
      };
      tabs.push(tab);
      await activate(tab);
      flash(`Закреплена копия: ${tab.name}`);
    }).catch((e) => flash(e.message));
  };

  const closeTab = (tab) => {
    if (tab.blender || !confirmDropEdits(tab, 'Закрытие вкладки')) return;
    queue = queue.then(async () => {
      const i = tabs.indexOf(tab);
      if (tab === active) {
        editor?.model.undoStack.splice(0);
        editor?.model.redoStack.splice(0);
        await activate(tabs[i + 1] ?? tabs[i - 1]);
      }
      if (tab === compareTab) await setCompareTab(tabs.find((t) => t !== tab && t !== active) ?? null);
      tabs.splice(tabs.indexOf(tab), 1);
      viewer.forget(tab.url);
      revokeBlob(tab.url);
      revokeBlob(tab.source);
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
    const old = tab.url;
    if (old !== next.model) viewer.forget(old);
    Object.assign(tab, { url: next.model, source: next.model, usdz: next.usdz ?? null, snap: null, edited: false });
    revokeBlob(old);
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
    if (!confirmDropEdits(active, 'Откат')) return;
    queue = queue.then(async () => {
      status.textContent = 'Откат…';
      const tab = active;
      const old = tab.url;
      viewer.forget(old);
      Object.assign(tab, { url: tab.source, snap: null, edited: false });
      revokeBlob(old);
      if (tab.blender && blenderScene) {
        await loadBlenderScene(blenderScene);
      } else {
        await viewer.loadModel(tab.url, tab.kind, { keep: true });
        if (editor) await editor.model.load(tab.url, tab.blender ? undefined : tab.name);
      }
      renderTabs();
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
      <span class="cmp-modes">
        <button class="cmp-mode wipe active" title="Шторка">Шторка</button>
        <button class="cmp-mode side" title="Рядом">Рядом</button>
      </span>
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
  const modeButtons = overlay.querySelectorAll('.cmp-mode');
  const renderCompareUI = () => {
    overlay.hidden = !compareTab;
    if (!compareTab) return;
    placeOverlay();
    const side = viewer.compare.mode === 'side';
    overlay.classList.toggle('side', side);
    line.style.left = `${viewer.compare.split * 100}%`;
    overlay.querySelector('.cmp-label.a').textContent = `A · ${active.name}`;
    overlay.querySelector('.cmp-label.b').textContent = `B · ${compareTab.name}`;
    overlay.querySelector('.cmp-reset').hidden = side || !viewer.hasOffsets();
    for (const b of modeButtons) b.classList.toggle('active', b.classList.contains(side ? 'side' : 'wipe'));
  };
  for (const b of modeButtons) {
    b.addEventListener('click', () => { viewer.setCompareMode(b.classList.contains('side') ? 'side' : 'wipe'); renderCompareUI(); });
  }
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
    <input class="anim-scrub" type="range" min="0" max="1000" value="0" title="Перемотка">
    <span class="anim-time" title="Клик — секунды / кадры"></span>
    <select class="anim-speed" title="Скорость">
      <option value="0.1">×0.1</option><option value="0.25">×0.25</option><option value="0.5">×0.5</option>
      <option value="1" selected>×1</option><option value="2">×2</option>
    </select>
    <label class="anim-pingpong" title="Туда и обратно"><input type="checkbox"> ⇄</label>
    <select class="anim-clip" title="Клип анимации (при сравнении B играет клип с тем же именем)"></select>`;
  document.body.append(anim);
  const playButton = anim.querySelector('.anim-play');
  const clipSelect = anim.querySelector('.anim-clip');
  const scrub = anim.querySelector('.anim-scrub');
  const timeLabel = anim.querySelector('.anim-time');
  const speedSelect = anim.querySelector('.anim-speed');
  const pingPong = anim.querySelector('.anim-pingpong input');
  let scrubbing = false;

  // Blender frame numbers: clip times are absolute (frame 1 = 1/fps), so frame = time × fps.
  let inFrames = false;
  try { inFrames = localStorage.getItem('izv.anim.frames') === '1'; } catch { /* storage blocked */ }
  const showTime = () => {
    const { time, period } = viewer.animPosition();
    if (!scrubbing) scrub.value = period ? Math.round((time / period) * 1000) : 0;
    const fps = store.get().fps || 24;
    timeLabel.textContent = inFrames
      ? `кадр ${Math.round(time * fps)} / ${Math.round(period * fps)}`
      : `${time.toFixed(2)} / ${period.toFixed(2)} с`;
  };
  timeLabel.addEventListener('click', () => {
    inFrames = !inFrames;
    try { localStorage.setItem('izv.anim.frames', inFrames ? '1' : '0'); } catch { /* storage blocked */ }
    showTime();
  });
  const tick = () => {
    if (!anim.hidden) showTime();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Dragging the timeline holds the animation; it resumes (if it was playing) on release.
  scrub.addEventListener('pointerdown', () => {
    scrubbing = { wasPaused: viewer.paused };
    viewer.paused = true;
  });
  scrub.addEventListener('input', () => {
    viewer.seek((Number(scrub.value) / 1000) * viewer.animPeriod());
    showTime();
  });
  const endScrub = () => {
    if (!scrubbing) return;
    viewer.paused = scrubbing.wasPaused;
    scrubbing = false;
    renderAnim();
  };
  scrub.addEventListener('pointerup', endScrub);
  scrub.addEventListener('change', endScrub);
  speedSelect.addEventListener('change', () => { viewer.speed = Number(speedSelect.value); });
  pingPong.addEventListener('change', () => {
    const { time } = viewer.animPosition();
    viewer.pingPong = pingPong.checked;
    viewer.seek(time);
  });
  const renderAnim = () => {
    const clips = viewer.gltf?.animations ?? [];
    anim.hidden = !clips.length;
    if (!clips.length) return;
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
  renderAnim();

  bindDrop((file) => {
    const kind = fileKind(file.name);
    if (!kind) {
      flash(`${file.name}: нужен .glb или .usdz`);
      return;
    }
    const url = URL.createObjectURL(file);
    const tab = { id: ++seq, url, source: url, kind, name: file.name, usdz: kind === 'usd' && /\.usdz$/i.test(file.name) ? url : null };
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
