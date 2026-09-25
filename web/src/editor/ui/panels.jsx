import { useEffect, useState } from 'preact/hooks';

import { EXPORT_DEFAULTS, exportGLB } from '../export.js';
import { download } from '../io.js';
import { ColorPicker } from './ColorPicker.jsx';
import { formatBytes, Row, Section, Select, Slider } from './widgets.jsx';

export function useStore(store) {
  const [state, setState] = useState(store.get());
  useEffect(() => store.subscribe((s) => setState(s)), [store]);
  return state;
}

export function ScenePanel({ store }) {
  const s = useStore(store);
  return (
    <div class="inspector">
      <Row label="Tone mapping">
        <Select
          value={s.toneMapping}
          options={[{ value: 'neutral', label: 'Neutral (MV)' }, { value: 'aces', label: 'ACES' }, { value: 'agx', label: 'AgX' }]}
          onChange={(v) => store.set({ toneMapping: v })}
        />
      </Row>
      <Row label="Exposure"><Slider value={s.exposure} min={0} max={3} onInput={(v) => store.set({ exposure: v })} /></Row>
      <Row label="Env rotation"><Slider value={s.environmentRotation} min={-180} max={180} step={1} onInput={(v) => store.set({ environmentRotation: v })} /></Row>
      <Row label="Прозрачность">
        <Select
          value={s.transparency}
          options={[
            { value: 'origin', label: 'По origin (iOS)' }, { value: 'mv', label: 'model-viewer' },
            { value: 'hashed', label: 'Hashed' }, { value: 'prepass', label: 'Depth prepass' },
          ]}
          onChange={(v) => store.set({ transparency: v })}
        />
      </Row>
      <Row label="Свет из GLB" title="Источники KHR_lights_punctual. model-viewer их не рендерит, поэтому по умолчанию скрыты">
        <input type="checkbox" checked={s.showLights} onChange={(e) => store.set({ showLights: e.currentTarget.checked })} />
      </Row>
      <Section title="Bloom" open={s.bloom} header={<input type="checkbox" checked={s.bloom} onChange={(e) => store.set({ bloom: e.currentTarget.checked })} />}>
        <Row label="Сила"><Slider value={s.bloomStrength} min={0} max={3} disabled={!s.bloom} onInput={(v) => store.set({ bloomStrength: v })} /></Row>
        <Row label="Радиус"><Slider value={s.bloomRadius} min={0} max={1} disabled={!s.bloom} onInput={(v) => store.set({ bloomRadius: v })} /></Row>
        <Row label="Порог" title="Яркость (линейная, до тонмаппинга), выше которой начинается свечение">
          <Slider value={s.bloomThreshold} min={0} max={10} step={0.05} disabled={!s.bloom} onInput={(v) => store.set({ bloomThreshold: v })} />
        </Row>
        <p class="muted">Model-viewer bloom не показывает — это превью свечения emission.</p>
      </Section>
      <Row label="Фон">
        <ColorPicker space="srgb" value={s.background} onInput={(rgb) => store.set({ background: rgb })} swatches={['#ffffff', '#f2f2f2', '#808080', '#1e1f22', '#000000']} />
      </Row>
    </div>
  );
}

export function ExportPanel({ model }) {
  const [opts, setOpts] = useState(EXPORT_DEFAULTS);
  const [result, setResult] = useState('');
  const set = (patch) => setOpts({ ...opts, ...patch });

  const run = async () => {
    model.busy.value = 'Экспорт…';
    try {
      const glb = await exportGLB(model, opts);
      const name = model.fileName.replace(/\.(glb|gltf)$/i, '') + '_edited.glb';
      download(glb, name, 'model/gltf-binary');
      setResult(`${name}: ${formatBytes(glb.byteLength)}`);
    } catch (e) {
      setResult(`Ошибка: ${e.message}`);
      console.error(e);
    } finally {
      model.busy.value = '';
    }
  };

  return (
    <div class="inspector">
      <Section title="Экспорт GLB">
        <Row label="Геометрия">
          <Select
            value={opts.geometry}
            options={[
              { value: 'none', label: 'Без сжатия' },
              { value: 'meshopt', label: 'Meshopt (EXT_meshopt)' },
              { value: 'draco', label: 'Draco (KHR_draco_mesh_compression)' },
            ]}
            onChange={(v) => set({ geometry: v })}
          />
        </Row>
        <Row label="Текстуры">
          <Select
            value={opts.textureFormat}
            options={[{ value: 'keep', label: 'Как есть' }, { value: 'webp', label: 'WebP' }, { value: 'jpeg', label: 'JPEG (PNG если альфа)' }]}
            onChange={(v) => set({ textureFormat: v })}
          />
        </Row>
        <Row label="Макс. размер">
          <Select
            value={String(opts.maxSize)}
            options={[{ value: '0', label: 'Как есть' }, '4096', '2048', '1024', '512'].map((o) => (typeof o === 'string' ? { value: o, label: o } : o))}
            onChange={(v) => set({ maxSize: Number(v) })}
          />
        </Row>
        {opts.textureFormat !== 'keep' && (
          <Row label="Качество"><Slider value={opts.quality} min={0.5} max={1} step={0.01} onInput={(v) => set({ quality: v })} /></Row>
        )}
        <button class="primary" onClick={run} disabled={Boolean(model.busy.value)}>Скачать GLB</button>
        {result && <p class="muted">{result}</p>}
        <p class="muted">Неиспользуемые текстуры и дубликаты удаляются при экспорте.</p>
      </Section>
    </div>
  );
}
