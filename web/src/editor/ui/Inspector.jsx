import { useRef } from 'preact/hooks';

import { GROUPS } from '../../materials/schema.js';
import { download } from '../io.js';
import { NEUTRAL_PREFIX } from '../model.js';
import { textureFileName, textureLabel, textureURL } from './textures.js';
import { ColorInput, formatBytes, Row, Section, Select, Slider } from './widgets.jsx';

function FieldControl({ model, index, field, material }) {
  const value = model.readField(material, field.key);
  const set = (v) => model.setField(index, field.key, v);
  switch (field.type) {
    case 'color':
      return <ColorInput value={value} onInput={set} />;
    case 'bool':
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.currentTarget.checked)} />;
    case 'select':
      return <Select value={value} options={field.options} onChange={set} />;
    default:
      return <Slider value={value} min={field.min} max={field.max} step={field.step} onInput={set} />;
  }
}

function TextureSlot({ model, index, group, slot }) {
  const input = useRef();
  const { texture, info } = model.getSlot(index, group, slot);
  const textures = model.root.listTextures();
  const url = textureURL(texture);
  const size = texture?.getSize();
  const neutral = texture?.getName().startsWith(NEUTRAL_PREFIX);

  return (
    <div class="slot">
      <div class="slot-thumb" onClick={() => input.current.click()} title="Заменить изображение">
        {texture ? (url ? <img src={url} /> : <span>{texture.getMimeType().split('/')[1]}</span>) : <span>+</span>}
      </div>
      <div class="slot-body">
        <div class="slot-title">{slot.label}</div>
        {texture ? (
          <>
            <div class="muted">
              {neutral
                ? `нейтральная 1×1 (${slot.neutral ?? 'white'}) — работает только фактор`
                : `${textureLabel(texture, textures.indexOf(texture))} · ${size ? `${size[0]}×${size[1]}` : '?'} · ${formatBytes(texture.getImage()?.byteLength ?? 0)}`}
            </div>
            <div class="slot-actions">
              <label title="UV-канал (TEXCOORD_n)">
                UV <Select
                  value={String(info?.getTexCoord() ?? 0)}
                  options={['0', '1', '2', '3']}
                  onChange={(v) => model.setSlotTexCoord(index, group, slot, Number(v))}
                />
              </label>
              <button onClick={() => download(texture.getImage(), textureFileName(texture, textures.indexOf(texture)), texture.getMimeType())}>Скачать</button>
              {!neutral && (
                <button onClick={() => model.clearSlot(index, group, slot)} title="Заменить нейтральной 1×1: фактор остаётся множителем">Убрать</button>
              )}
            </div>
          </>
        ) : (
          <Select
            value=""
            options={[{ value: '', label: 'Нет — выбрать существующую…' }, ...textures.map((t, i) => ({ value: String(i), label: textureLabel(t, i) }))]}
            onChange={(v) => v !== '' && model.setSlotTexture(index, group, slot, textures[Number(v)])}
          />
        )}
      </div>
      <input
        ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden
        onChange={(e) => {
          const file = e.currentTarget.files[0];
          e.currentTarget.value = '';
          if (file) model.replaceSlotImage(index, group, slot, file);
        }}
      />
    </div>
  );
}

function MaterialInspector({ model, index }) {
  const material = model.materials()[index];
  if (!material) return null;
  const isUnlit = model.hasExtension(index, 'KHR_materials_unlit');

  return (
    <div class="inspector">
      <Row label="Имя">
        <input type="text" value={material.getName()} onChange={(e) => model.renameMaterial(index, e.currentTarget.value)} />
      </Row>
      {GROUPS.map((group) => {
        const enabled = !group.ext || model.hasExtension(index, group.ext);
        if (isUnlit && group.id !== 'base' && group.id !== 'unlit') return null;
        const toggle = group.ext && (
          <input
            type="checkbox" checked={enabled} title={group.ext}
            onChange={(e) => model.setExtensionEnabled(index, group, e.currentTarget.checked)}
          />
        );
        return (
          <Section title={group.title} open={enabled && !group.ext} header={toggle}>
            {!enabled ? (
              <p class="muted">{group.ext} — не используется. Включите галочкой.</p>
            ) : (
              <>
                {group.fields.map((field) => (
                  <Row label={field.label}>
                    <FieldControl model={model} index={index} field={field} material={material} />
                  </Row>
                ))}
                {group.textures?.map((slot) => <TextureSlot model={model} index={index} group={group} slot={slot} />)}
              </>
            )}
          </Section>
        );
      })}
    </div>
  );
}

function NodeInspector({ model, node }) {
  const mesh = node.getMesh();
  const prims = mesh?.listPrimitives() ?? [];
  const verts = prims.reduce((n, p) => n + (p.getAttribute('POSITION')?.getCount() ?? 0), 0);
  const tris = prims.reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')?.getCount() ?? 0) / 3, 0);
  const fmt = (v) => v.map((x) => Number(x.toFixed(4))).join(', ');
  const all = model.materials();

  return (
    <div class="inspector">
      <Row label="Узел"><span>{node.getName() || '(без имени)'}</span></Row>
      <Row label="Translation"><span class="mono">{fmt(node.getTranslation())}</span></Row>
      <Row label="Rotation"><span class="mono">{fmt(node.getRotation())}</span></Row>
      <Row label="Scale"><span class="mono">{fmt(node.getScale())}</span></Row>
      {mesh && (
        <Section title={`Mesh: ${mesh.getName() || '—'}`}>
          <Row label="Примитивы"><span>{prims.length}</span></Row>
          <Row label="Вершины"><span>{verts.toLocaleString('ru')}</span></Row>
          <Row label="Треугольники"><span>{Math.round(tris).toLocaleString('ru')}</span></Row>
          <Row label="UV-каналы">
            <span>{Math.max(0, ...prims.map((p) => p.listSemantics().filter((s) => s.startsWith('TEXCOORD_')).length))}</span>
          </Row>
          {prims.map((p, i) => {
            const m = p.getMaterial();
            return (
              <Row label={`Примитив ${i}`}>
                {m ? <a href="#" onClick={(e) => { e.preventDefault(); model.selection.value = { kind: 'material', index: all.indexOf(m) }; }}>{m.getName() || 'материал'}</a> : <span class="muted">без материала</span>}
              </Row>
            );
          })}
        </Section>
      )}
    </div>
  );
}

export function Inspector({ model }) {
  model.version.value;
  const sel = model.selection.value;
  if (sel?.kind === 'material') return <MaterialInspector model={model} index={sel.index} />;
  if (sel?.kind === 'node') return <NodeInspector model={model} node={sel.node} />;
  return <p class="muted pad">Выберите материал или узел: в дереве слева или кликом по модели.</p>;
}
