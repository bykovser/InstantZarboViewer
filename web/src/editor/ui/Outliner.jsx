import { useState } from 'preact/hooks';

import { download } from '../io.js';
import { textureFileName, textureLabel, textureURL } from './textures.js';
import { formatBytes, linearToHex, Tabs } from './widgets.jsx';

function NodeItem({ model, node, depth }) {
  const [open, setOpen] = useState(depth < 2);
  const children = node.listChildren();
  const mesh = node.getMesh();
  const materials = mesh ? [...new Set(mesh.listPrimitives().map((p) => p.getMaterial()).filter(Boolean))] : [];
  const all = model.materials();
  const sel = model.selection.value;

  return (
    <li>
      <div class={`tree-row ${sel?.kind === 'node' && sel.node === node ? 'selected' : ''}`} style={{ paddingLeft: `${depth * 12 + 4}px` }}>
        <button class="twisty" onClick={() => setOpen(!open)} disabled={!children.length && !materials.length}>
          {children.length || materials.length ? (open ? '▾' : '▸') : '·'}
        </button>
        <span class="tree-name" onClick={() => (model.selection.value = { kind: 'node', node })}>
          {node.getName() || '(node)'}
          {mesh && <span class="muted"> ▲ {mesh.getName() || 'mesh'}</span>}
        </span>
      </div>
      {open && (
        <ul>
          {materials.map((m) => {
            const index = all.indexOf(m);
            return (
              <li>
                <div
                  class={`tree-row material ${sel?.kind === 'material' && sel.index === index ? 'selected' : ''}`}
                  style={{ paddingLeft: `${(depth + 1) * 12 + 18}px` }}
                  onClick={() => (model.selection.value = { kind: 'material', index })}
                >
                  <span class="swatch" style={{ background: linearToHex(m.getBaseColorFactor().slice(0, 3)) }} />
                  {m.getName() || `Material ${index}`}
                </div>
              </li>
            );
          })}
          {children.map((c) => <NodeItem model={model} node={c} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
}

function SceneTree({ model }) {
  const scene = model.root.getDefaultScene() ?? model.root.listScenes()[0];
  if (!scene) return <p class="muted pad">Нет сцены</p>;
  return <ul class="tree">{scene.listChildren().map((n) => <NodeItem model={model} node={n} depth={0} />)}</ul>;
}

function MaterialList({ model }) {
  const sel = model.selection.value;
  return (
    <ul class="list">
      {model.materials().map((m, index) => (
        <li
          class={sel?.kind === 'material' && sel.index === index ? 'selected' : ''}
          onClick={() => (model.selection.value = { kind: 'material', index })}
        >
          <span class="swatch" style={{ background: linearToHex(m.getBaseColorFactor().slice(0, 3)) }} />
          <span class="grow">{m.getName() || `Material ${index}`}</span>
          <span class="muted">{m.getAlphaMode() !== 'OPAQUE' ? m.getAlphaMode() : ''}</span>
        </li>
      ))}
    </ul>
  );
}

function TextureList({ model }) {
  return (
    <ul class="list textures">
      {model.root.listTextures().map((t, i) => {
        const size = t.getSize();
        const url = textureURL(t);
        return (
          <li>
            {url ? <img src={url} /> : <span class="thumb-placeholder">{t.getMimeType().split('/')[1]}</span>}
            <span class="grow">
              <div>{textureLabel(t, i)}</div>
              <div class="muted">
                {size ? `${size[0]}×${size[1]}` : '?'} · {t.getMimeType().replace('image/', '')} · {formatBytes(t.getImage()?.byteLength ?? 0)}
                {' · '}{model.textureUsers(t)} исп.
              </div>
            </span>
            <button title="Скачать" onClick={() => download(t.getImage(), textureFileName(t, i), t.getMimeType())}>⤓</button>
          </li>
        );
      })}
    </ul>
  );
}

export function Outliner({ model }) {
  const [tab, setTab] = useState('scene');
  model.version.value; // re-render on document changes
  return (
    <div class="outliner">
      <Tabs
        tabs={[{ id: 'scene', label: 'Сцена' }, { id: 'materials', label: 'Материалы' }, { id: 'textures', label: 'Текстуры' }]}
        value={tab} onChange={setTab}
      />
      <div class="scroll">
        {tab === 'scene' && <SceneTree model={model} />}
        {tab === 'materials' && <MaterialList model={model} />}
        {tab === 'textures' && <TextureList model={model} />}
      </div>
    </div>
  );
}
