import { useRef, useState } from 'preact/hooks';

import { FIELDS, GROUPS, NEUTRAL_TEXTURES } from '../../materials/schema.js';
import { download } from '../io.js';
import { NEUTRAL_PREFIX } from '../model.js';
import { blackbodyLinear, KELVIN_PRESETS } from '../blackbody.js';
import { ColorPicker } from './ColorPicker.jsx';
import { textureFileName, textureLabel, textureURL } from './textures.js';
import { formatBytes, linearToHex, Row, Section, Select, Slider, useDoc } from './widgets.jsx';

// Base colors of all materials: quick picks in the color picker.
function documentSwatches(model) {
  return [...new Set(model.materials().map((m) => linearToHex(m.getBaseColorFactor().slice(0, 3))))];
}

function FieldControl({ model, index, field, material }) {
  useDoc(model);
  const value = model.readField(material, field.key) ?? field.default;
  const set = (v) => {
    // A hand-picked emissive color means the temperature no longer drives it.
    if (field.key === 'emissive' && model.getBlackbody(index) !== null) model.setBlackbody(index, null);
    model.setField(index, field.key, v);
  };
  switch (field.type) {
    case 'color':
      return <ColorPicker value={value} onInput={set} swatches={documentSwatches(model)} />;
    case 'bool':
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.currentTarget.checked)} />;
    case 'select':
      return <Select value={value} options={field.options} onChange={set} />;
    default:
      return <Slider value={value} min={field.min} max={field.max} step={field.step} onInput={set} />;
  }
}

// Emissive color from a blackbody temperature, like Blender's Blackbody node (strength stays separate).
function BlackbodyRow({ model, index }) {
  useDoc(model);
  const kelvin = model.getBlackbody(index);
  const on = kelvin !== null;
  // Last used K stays on the slider while the checkbox is off.
  const [lastK, setLastK] = useState(kelvin ?? 6500);
  const apply = (k) => {
    setLastK(k);
    model.setBlackbody(index, k);
  };
  return (
    <>
      <div class="row" title="Цвет излучения по температуре (как нода Blackbody); сила — Strength">
        <label class="row-label check-label">
          <input type="checkbox" checked={on} onChange={(e) => model.setBlackbody(index, e.currentTarget.checked ? lastK : null)} />
          Blackbody, K
        </label>
        <span class="row-control">
          <Slider value={kelvin ?? lastK} min={1000} max={12000} step={50} disabled={!on} onInput={apply} />
        </span>
      </div>
      <div class={`presets ${on ? '' : 'off'}`}>
        {KELVIN_PRESETS.map((p) => (
          <button
            class={kelvin === p.k ? 'active' : ''} title={`${p.k} K`} onClick={() => apply(p.k)}
            style={{ '--c': linearToHex(blackbodyLinear(p.k)) }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </>
  );
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const NEUTRAL_NAMES = { white: 'белая', normal: 'плоская нормаль', anisotropy: 'нейтральное направление' };

function TextureSlot({ model, index, group, slot, material, fields = [] }) {
  useDoc(model);
  const input = useRef();
  const [dragOver, setDragOver] = useState(false);
  const { texture, info } = model.getSlot(index, group, slot);
  const textures = model.root.listTextures();
  const url = textureURL(texture);
  const size = texture?.getSize();
  const neutral = Boolean(texture?.getName().startsWith(NEUTRAL_PREFIX));
  const neutralKind = slot.neutral ?? 'white';

  const upload = () => input.current.click();
  const useFile = (file) => file && IMAGE_TYPES.includes(file.type) && model.replaceSlotImage(index, group, slot, file);

  // One list for "what's in this slot": existing textures + the neutral 1×1.
  const options = [
    ...(texture ? [] : [{ value: '', label: `По умолчанию — ${NEUTRAL_NAMES[neutralKind]} (без текстуры)` }]),
    { value: 'neutral', label: `Нейтральная 1×1 (${neutralKind})` },
    ...textures
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => !t.getName().startsWith(NEUTRAL_PREFIX))
      .map(({ t, i }) => ({ value: String(i), label: textureLabel(t, i) })),
  ];
  const current = !texture ? '' : neutral ? 'neutral' : String(textures.indexOf(texture));
  const choose = (v) => {
    if (v === 'neutral') model.clearSlot(index, group, slot);
    else if (v !== '') model.setSlotTexture(index, group, slot, textures[Number(v)]);
  };

  return (
    <div
      class={`slot ${dragOver ? 'drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); useFile(e.dataTransfer.files[0]); }}
    >
      {(!texture || neutral) && slot.factor ? (
        <ColorPicker
          variant="thumb" title="Карты нет — клик меняет цвет (фактор)"
          value={model.readField(material, slot.factor)} swatches={documentSwatches(model)}
          onInput={(v) => model.setField(index, slot.factor, v)}
        />
      ) : (
        <div class="slot-thumb" onClick={upload} title="Загрузить изображение (или перетащите файл на слот)">
          {texture && !neutral
            ? (url ? <img src={url} /> : <span>{texture.getMimeType().split('/')[1]}</span>)
            : <span class="slot-default" style={{ background: `rgb(${NEUTRAL_TEXTURES[neutralKind].slice(0, 3).join(',')})` }}>+</span>}
        </div>
      )}
      <div class="slot-body">
        <div class="slot-title">
          <span>{slot.label}</span>
          <span class="muted">
            {!texture || neutral
              ? 'только фактор'
              : `${size ? `${size[0]}×${size[1]}` : '?'} · ${texture.getMimeType().replace('image/', '')} · ${formatBytes(texture.getImage()?.byteLength ?? 0)}`}
          </span>
        </div>
        <Select value={current} options={options} onChange={choose} />
        <div class="slot-actions">
          <label class="slot-uv" title="UV-канал (TEXCOORD_n)">
            UV
            <Select
              value={String(info?.getTexCoord() ?? 0)}
              options={['0', '1', '2', '3']}
              onChange={(v) => model.setSlotTexCoord(index, group, slot, Number(v))}
            />
          </label>
          <button onClick={upload}>Загрузить…</button>
          <button
            disabled={!texture || neutral} title="Скачать изображение"
            onClick={() => download(texture.getImage(), textureFileName(texture, textures.indexOf(texture)), texture.getMimeType())}
          >⤓</button>
          <button
            disabled={!texture || neutral}
            title="Заменить нейтральной 1×1: фактор остаётся множителем"
            onClick={() => model.clearSlot(index, group, slot)}
          >Убрать</button>
        </div>
        {fields.map((field) => (
          <Row label={field.label}>
            <FieldControl model={model} index={index} field={field} material={material} />
          </Row>
        ))}
      </div>
      <input
        ref={input} type="file" accept={IMAGE_TYPES.join(',')} hidden
        onChange={(e) => {
          const file = e.currentTarget.files[0];
          e.currentTarget.value = '';
          useFile(file);
        }}
      />
    </div>
  );
}

function MaterialInspector({ model, index }) {
  useDoc(model);
  const material = model.materials()[index];
  if (!material) return null;
  const isUnlit = model.hasExtension(index, 'KHR_materials_unlit');

  return (
    <div class="inspector">
      <div class="sticky-head">
        <Row label="Материал">
          <input type="text" value={material.getName()} onChange={(e) => model.renameMaterial(index, e.currentTarget.value)} />
        </Row>
      </div>
      {GROUPS.map((group) => {
        if (group.inline) return null;
        const enabled = !group.ext || model.hasExtension(index, group.ext);
        const inlined = GROUPS.filter((g) => g.inline === group.id).flatMap((g) => g.fields);
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
                {[...group.fields, ...inlined].filter((f) => !f.slot && (!f.visible || f.visible(material))).map((field) => (
                  <Row label={field.label}>
                    <FieldControl model={model} index={index} field={field} material={material} />
                  </Row>
                ))}
                {group.id === 'emissive' && <BlackbodyRow key={index} model={model} index={index} />}
                {group.textures?.map((slot) => (
                  <TextureSlot
                    model={model} index={index} group={group} slot={slot} material={material}
                    fields={group.fields.filter((f) => f.slot === slot.prop).map((f) => FIELDS.get(f.key))}
                  />
                ))}
              </>
            )}
          </Section>
        );
      })}
    </div>
  );
}

function NodeInspector({ model, node }) {
  useDoc(model);
  const mesh = node.getMesh();
  const prims = mesh?.listPrimitives() ?? [];
  const verts = prims.reduce((n, p) => n + (p.getAttribute('POSITION')?.getCount() ?? 0), 0);
  const tris = prims.reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')?.getCount() ?? 0) / 3, 0);
  const fmt = (v) => v.map((x) => Number(x.toFixed(4))).join(', ');
  const num = (x) => Number(x.toFixed(3));
  const deg = (rad) => `${Number(((rad * 180) / Math.PI).toFixed(1))}°`;
  const all = model.materials();
  const light = node.getExtension('KHR_lights_punctual');
  const camera = node.getCamera();

  return (
    <div class="inspector">
      <Row label="Узел"><span>{node.getName() || '(без имени)'}</span></Row>
      <Row label="Translation"><span class="mono">{fmt(node.getTranslation())}</span></Row>
      <Row label="Rotation"><span class="mono">{fmt(node.getRotation())}</span></Row>
      <Row label="Scale"><span class="mono">{fmt(node.getScale())}</span></Row>
      {light && (
        <Section title={`Свет: ${light.getName() || light.getType()}`}>
          <Row label="Тип"><span>{light.getType()}</span></Row>
          <Row label="Цвет">
            <span class="cp-field">
              <span class="swatch" style={{ background: linearToHex(light.getColor()) }} />
              <span class="mono muted">{linearToHex(light.getColor())}</span>
            </span>
          </Row>
          <Row label="Интенсивность" title="point/spot — кд, directional — лк"><span>{num(light.getIntensity())}</span></Row>
          {light.getType() !== 'directional' && <Row label="Range"><span>{light.getRange() ?? '∞'}</span></Row>}
          {light.getType() === 'spot' && (
            <Row label="Конус"><span>{deg(light.getInnerConeAngle())} … {deg(light.getOuterConeAngle())}</span></Row>
          )}
          <p class="muted">model-viewer не рендерит punctual-свет: во вьювере он скрыт, показать — «Свет из GLB» во вкладке «Сцена».</p>
        </Section>
      )}
      {camera && (
        <Section title={`Камера: ${camera.getName() || camera.getType()}`}>
          <Row label="Тип"><span>{camera.getType()}</span></Row>
          {camera.getType() === 'perspective'
            ? <Row label="FOV (Y)"><span>{deg(camera.getYFov())}</span></Row>
            : <Row label="Mag X/Y"><span>{num(camera.getXMag())} / {num(camera.getYMag())}</span></Row>}
          <Row label="Near / Far"><span>{num(camera.getZNear())} / {camera.getZFar() ?? '∞'}</span></Row>
        </Section>
      )}
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
