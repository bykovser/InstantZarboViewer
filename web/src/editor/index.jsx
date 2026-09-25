import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import './editor.css';
import { writeGLB } from './io.js';
import { EditorModel } from './model.js';
import { Inspector } from './ui/Inspector.jsx';
import { Outliner } from './ui/Outliner.jsx';
import { ExportPanel, ScenePanel, useStore } from './ui/panels.jsx';
import { Tabs } from './ui/widgets.jsx';
import { ZarboPanel } from './ui/ZarboPanel.jsx';

const WIDTHS = { left: [180, 600, 280], right: [260, 700, 340] };
const widthKey = (side) => `izv.panel.${side}`;

function setWidth(side, px) {
  const [min, max] = WIDTHS[side];
  const w = Math.round(Math.min(max, Math.max(min, px)));
  document.body.style.setProperty(`--ed-${side}`, `${w}px`);
  return w;
}

function restoreWidths() {
  for (const side of Object.keys(WIDTHS)) {
    let saved = null;
    try { saved = Number(localStorage.getItem(widthKey(side))); } catch { /* storage blocked */ }
    setWidth(side, saved || WIDTHS[side][2]);
  }
}

// Drag handle on the inner edge of a side panel; double click resets the width.
function Splitter({ side }) {
  const onDown = (e) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    el.classList.add('active');
    let w;
    const move = (ev) => { w = setWidth(side, side === 'left' ? ev.clientX : innerWidth - ev.clientX); };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.classList.remove('active');
      try { if (w) localStorage.setItem(widthKey(side), String(w)); } catch { /* storage blocked */ }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up, { once: true });
  };
  const reset = () => {
    setWidth(side, WIDTHS[side][2]);
    try { localStorage.removeItem(widthKey(side)); } catch { /* storage blocked */ }
  };
  return <div class={`ed-split ${side}`} onPointerDown={onDown} onDblClick={reset} title="Потяните, чтобы изменить ширину; двойной клик — сброс" />;
}

function App({ model, store, onClose, actions }) {
  const [tab, setTab] = useState('props');
  const { syncBlender } = useStore(store);
  const h = model.history.value;
  const busy = model.busy.value;

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.target.matches('input[type=text], input[type=number]')) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) model.undo();
      else if (key === 'y' || (key === 'z' && e.shiftKey)) model.redo();
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [model]);

  useEffect(() => {
    if (model.selection.value) setTab('props');
  }, [model.selection.value]);

  return (
    <>
      <aside class="ed-left">
        <header class="ed-header">
          <strong title={model.fileName}>{model.fileName}</strong>
          <span class="grow" />
          {actions.hasBlender && (
            <button
              class={`sync ${syncBlender ? 'on' : ''}`} onClick={() => store.set({ syncBlender: !syncBlender })}
              title={syncBlender ? 'Синк с Blender включён: правки материалов и переэкспорт приходят сюда' : 'Синк с Blender выключен: изменения из Blender не трогают редактор'}
            >Blender</button>
          )}
          <button onClick={actions.revert} title={actions.hasBlender ? 'Откатить к последнему экспорту из Blender' : 'Откатить к исходному файлу'}>⟲</button>
          <button onClick={() => model.undo()} disabled={!h.undo} title="Отменить (Ctrl+Z)">↶</button>
          <button onClick={() => model.redo()} disabled={!h.redo} title="Повторить (Ctrl+Y)">↷</button>
          <button onClick={onClose} title="Закрыть редактор">✕</button>
        </header>
        <Outliner model={model} />
      </aside>
      <aside class="ed-right">
        <Tabs
          tabs={[{ id: 'props', label: 'Свойства' }, { id: 'scene', label: 'Сцена' }, { id: 'export', label: 'Экспорт' }]}
          value={tab} onChange={setTab}
        />
        <div class="scroll">
          {tab === 'props' && <Inspector model={model} />}
          {tab === 'scene' && <ScenePanel store={store} />}
          {tab === 'export' && <><ExportPanel model={model} />{actions.zarbo && <div class="inspector"><ZarboPanel actions={actions.zarbo} /></div>}</>}
        </div>
      </aside>
      <Splitter side="left" />
      <Splitter side="right" />
      {busy && <div class="ed-busy">{busy}</div>}
    </>
  );
}

// Click (not drag) on the viewport selects the material under the cursor.
function bindPicking(viewer, model) {
  const canvas = viewer.renderer.domElement;
  let down = null;
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
    const hit = viewer.pick(e.clientX, e.clientY);
    const index = hit && model.threeToIndex?.get(hit.material);
    model.selection.value = index === undefined || index === null ? null : { kind: 'material', index };
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
  };
}

export async function mountEditor({ viewer, store, modelUrl, modelName, onClose, actions }) {
  const root = document.getElementById('editor-root');
  const model = new EditorModel(viewer);
  restoreWidths();
  document.body.classList.add('editing');
  const unbind = bindPicking(viewer, model);

  const unmount = () => {
    unbind();
    model.dispose();
    render(null, root);
    document.body.classList.remove('editing');
  };

  render(<p class="ed-busy">Загрузка редактора…</p>, root);
  await model.load(modelUrl, modelName);
  render(<App model={model} store={store} onClose={onClose} actions={actions} />, root);
  // GLB of the document as edited: pinned copies and tab switches keep edits this way.
  const bake = () => writeGLB(model.doc);
  return { model, unmount, bake };
}
