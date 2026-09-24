import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import './editor.css';
import { EditorModel } from './model.js';
import { Inspector } from './ui/Inspector.jsx';
import { Outliner } from './ui/Outliner.jsx';
import { ExportPanel, ScenePanel } from './ui/panels.jsx';
import { Tabs } from './ui/widgets.jsx';

function App({ model, store, onClose }) {
  const [tab, setTab] = useState('props');
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
          {tab === 'export' && <ExportPanel model={model} />}
        </div>
      </aside>
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

export async function mountEditor({ viewer, store, modelUrl, onClose }) {
  const root = document.getElementById('editor-root');
  const model = new EditorModel(viewer);
  document.body.classList.add('editing');
  const unbind = bindPicking(viewer, model);

  const unmount = () => {
    unbind();
    model.dispose();
    render(null, root);
    document.body.classList.remove('editing');
  };

  render(<p class="ed-busy">Загрузка редактора…</p>, root);
  await model.load(modelUrl);
  render(<App model={model} store={store} onClose={onClose} />, root);
  return { model, unmount };
}
