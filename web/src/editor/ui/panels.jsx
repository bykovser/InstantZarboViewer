import { useEffect, useState } from 'preact/hooks';

import { EXPORT_DEFAULTS, exportGLB } from '../export.js';
import { download } from '../io.js';
import { formatBytes, Row, Section, Select, Slider } from './widgets.jsx';

function useStore(store) {
  const [state, setState] = useState(store.get());
  useEffect(() => store.subscribe((s) => setState(s)), [store]);
  return state;
}

export function ScenePanel({ store }) {
  const s = useStore(store);
  // Background in the store is already sRGB 0..1.
  const bgHex = `#${s.background.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
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
      <Row label="Фон">
        <input
          type="color" value={bgHex}
          onInput={(e) => {
            const hex = e.currentTarget.value.slice(1);
            store.set({ background: [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) });
          }}
        />
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
            options={[{ value: 'none', label: 'Без сжатия' }, { value: 'meshopt', label: 'Meshopt (EXT_meshopt)' }]}
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
        <p class="muted">Неиспользуемые текстуры и дубликаты удаляются при экспорте. Draco — позже.</p>
      </Section>
    </div>
  );
}
