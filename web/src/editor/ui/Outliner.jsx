import { useState } from 'preact/hooks';

import { GROUPS } from '../../materials/schema.js';
import { download } from '../io.js';
import { NEUTRAL_PREFIX } from '../model.js';
import { textureFileName, textureLabel, textureURL } from './textures.js';
import { formatBytes, linearToHex, Tabs, useDoc } from './widgets.jsx';

// role: obj (scene object), data (mesh data), mat, tex — colors follow Blender's outliner.
export const Icon = ({ type, role }) => <i class={`ico ico-${type} ${role}`} aria-hidden="true" />;

const ids = new WeakMap();
let nextId = 0;
const uid = (o) => {
  if (!ids.has(o)) ids.set(o, ++nextId);
  return ids.get(o);
};
const nodeKey = (node) => `n${uid(node)}`;
const meshKey = (node) => `m${uid(node)}`;
const matKey = (node, m) => `m${uid(node)}:${uid(m)}`;

function nodeKind(node) {
  if (node.getExtension('KHR_lights_punctual')) return 'light';
  if (node.getCamera()) return 'camera';
  if (node.getMesh()) return 'mesh';
  return 'empty';
}

const meshMaterials = (mesh) => [...new Set(mesh.listPrimitives().map((p) => p.getMaterial()).filter(Boolean))];

function meshTriangles(mesh) {
  let n = 0;
  for (const p of mesh.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')?.getCount() ?? 0) / 3;
  return Math.round(n);
}

// Real (non-neutral) textures of a material, one row per slot.
function materialTextures(model, index) {
  const rows = [];
  for (const group of GROUPS) {
    for (const slot of group.textures ?? []) {
      const { texture } = model.getSlot(index, group, slot);
      if (texture && !texture.getName().startsWith(NEUTRAL_PREFIX)) rows.push({ slot, texture });
    }
  }
  return rows;
}

function subtreeKeys(node, acc) {
  acc.push(nodeKey(node));
  const mesh = node.getMesh();
  if (mesh) {
    acc.push(meshKey(node));
    for (const m of meshMaterials(mesh)) acc.push(matKey(node, m));
  }
  for (const c of node.listChildren()) subtreeKeys(c, acc);
}

const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

function TreeRow({ depth, icon, role, label, extra, expandable, open, onToggle, selected, onSelect, title }) {
  return (
    <div class={`tree-row ${selected ? 'selected' : ''}`} style={{ paddingLeft: `${depth * 14 + 2}px` }} onClick={onSelect} title={title}>
      <button
        class={`twisty ${expandable ? (open ? 'open' : 'closed') : 'leaf'}`} disabled={!expandable}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
      />
      <Icon type={icon} role={role} />
      <span class="tree-name">{label}</span>
      {extra}
    </div>
  );
}

function MaterialItem({ model, node, material, depth, tree }) {
  const index = model.materials().indexOf(material);
  const textures = materialTextures(model, index);
  const all = model.root.listTextures();
  const sel = model.selection.value;
  const key = matKey(node, material);
  const open = tree.open.has(key);
  const select = () => (model.selection.value = { kind: 'material', index });
  return (
    <li>
      <TreeRow
        depth={depth} icon="material" role="mat" label={material.getName() || `Material ${index}`}
        extra={<span class="swatch" style={{ background: linearToHex(material.getBaseColorFactor().slice(0, 3)) }} />}
        expandable={textures.length > 0} open={open} onToggle={() => tree.toggle(key)}
        selected={sel?.kind === 'material' && sel.index === index} onSelect={select}
      />
      {open && (
        <ul>
          {textures.map(({ slot, texture }) => (
            <li>
              <TreeRow
                depth={depth + 1} icon="texture" role="tex" label={textureLabel(texture, all.indexOf(texture))}
                extra={<span class="muted tree-extra">{slot.label}</span>}
                title={`${slot.label} — клик выбирает материал`} onSelect={select}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function MeshItem({ model, node, mesh, depth, tree }) {
  const materials = meshMaterials(mesh);
  const key = meshKey(node);
  const open = tree.open.has(key);
  return (
    <li>
      <TreeRow
        depth={depth} icon="mesh" role="data" label={mesh.getName() || 'mesh'}
        extra={<span class="muted tree-extra">{compact(meshTriangles(mesh))} ▲</span>}
        expandable={materials.length > 0} open={open} onToggle={() => tree.toggle(key)}
        onSelect={() => (model.selection.value = { kind: 'node', node })}
      />
      {open && (
        <ul>
          {materials.map((m) => <MaterialItem model={model} node={node} material={m} depth={depth + 1} tree={tree} />)}
        </ul>
      )}
    </li>
  );
}

function NodeItem({ model, node, depth, tree }) {
  useDoc(model);
  const children = node.listChildren();
  const mesh = node.getMesh();
  const light = node.getExtension('KHR_lights_punctual');
  const camera = node.getCamera();
  const sel = model.selection.value;
  const key = nodeKey(node);
  const open = tree.open.has(key);
  const info = light ? `${light.getType()} · ${Number(light.getIntensity().toFixed(2))}` : camera ? camera.getType() : null;

  return (
    <li>
      <TreeRow
        depth={depth} icon={nodeKind(node)} role="obj" label={node.getName() || '(node)'}
        extra={info && <span class="muted tree-extra">{info}</span>}
        expandable={Boolean(mesh || children.length)} open={open} onToggle={() => tree.toggle(key)}
        selected={sel?.kind === 'node' && sel.node === node} onSelect={() => (model.selection.value = { kind: 'node', node })}
      />
      {open && (
        <ul>
          {mesh && <MeshItem model={model} node={node} mesh={mesh} depth={depth + 1} tree={tree} />}
          {children.map((c) => <NodeItem model={model} node={c} depth={depth + 1} tree={tree} />)}
        </ul>
      )}
    </li>
  );
}

// Starts fully collapsed with Expand/Collapse-all controls, like the old addon's scene explorer.
function SceneTree({ model }) {
  useDoc(model);
  const [open, setOpen] = useState(() => new Set());
  const scene = model.root.getDefaultScene() ?? model.root.listScenes()[0];
  if (!scene) return <p class="muted pad">Нет сцены</p>;
  const roots = scene.listChildren();
  const tree = {
    open,
    toggle: (key) => setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    }),
  };
  const expandAll = () => {
    const keys = [];
    for (const n of roots) subtreeKeys(n, keys);
    setOpen(new Set(keys));
  };
  return (
    <>
      <div class="tree-controls">
        <button title="Развернуть всё" onClick={expandAll}><i class="ico ico-arrow-down" /> Развернуть всё</button>
        <button title="Свернуть всё" onClick={() => setOpen(new Set())}><i class="ico ico-arrow-right" /> Свернуть всё</button>
      </div>
      <ul class="tree">{roots.map((n) => <NodeItem model={model} node={n} depth={0} tree={tree} />)}</ul>
    </>
  );
}

function MaterialList({ model }) {
  useDoc(model);
  const sel = model.selection.value;
  return (
    <ul class="list">
      {model.materials().map((m, index) => (
        <li
          class={sel?.kind === 'material' && sel.index === index ? 'selected' : ''}
          onClick={() => (model.selection.value = { kind: 'material', index })}
        >
          <Icon type="material" role="mat" />
          <span class="swatch" style={{ background: linearToHex(m.getBaseColorFactor().slice(0, 3)) }} />
          <span class="grow">{m.getName() || `Material ${index}`}</span>
          <span class="muted">{m.getAlphaMode() !== 'OPAQUE' ? m.getAlphaMode() : ''}</span>
        </li>
      ))}
    </ul>
  );
}

function TextureList({ model }) {
  useDoc(model);
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
