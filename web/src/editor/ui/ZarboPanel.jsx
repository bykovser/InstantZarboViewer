import { useEffect, useState } from 'preact/hooks';

import { ADDITIONAL, cameraOrbit, zarbo } from '../../zarbo/api.js';
import { Row, Section, Select } from './widgets.jsx';

const uuid = () => crypto.randomUUID();

// Lists refresh themselves (open, after every create, window focus): no "refresh" buttons.
function useZarboLists() {
  const [config, setConfig] = useState(null);
  const [collections, setCollections] = useState([]);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const cfg = await zarbo.config();
      setConfig(cfg);
      if (cfg.configured) setCollections(await zarbo.collections());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
    addEventListener('focus', load);
    return () => removeEventListener('focus', load);
  }, []);
  return { config, collections, error, reload: load };
}

export function ZarboPanel({ actions }) {
  const { config, collections, error, reload } = useZarboLists();
  const [collectionId, setCollectionId] = useState('');
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('new');
  const [fields, setFields] = useState({ name: '', guid: uuid(), description: '', tags: '' });
  const [glbTab, setGlbTab] = useState(String(actions.activeId()));
  const [usdzFrom, setUsdzFrom] = useState('auto');
  const [useCamera, setUseCamera] = useState(true);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (patch) => setFields({ ...fields, ...patch });

  const collection = collections.find((c) => String(c.id) === collectionId) ?? collections[0];
  useEffect(() => {
    if (!collection) return;
    setCollectionId(String(collection.id));
    zarbo.products(collection).then(setProducts, () => setProducts([]));
  }, [collection?.id, collections]);

  const sources = actions.sources();
  const glbSources = sources.filter((t) => t.kind === 'gltf');
  const source = glbSources.find((t) => String(t.id) === glbTab) ?? glbSources[0];
  // USDZ options: let Zarbo convert, Blender's export of this tab (unless edited since), or a USD tab.
  const usdzOptions = [
    { value: 'auto', label: 'Zarbo сконвертирует из GLB' },
    ...(source?.usdz && !source.edited ? [{ value: 'blender', label: 'USDZ из Blender' }] : []),
    ...sources.filter((t) => t.kind === 'usd').map((t) => ({ value: `tab:${t.id}`, label: `Вкладка: ${t.name}` })),
  ];
  const usdzChoice = usdzOptions.some((o) => o.value === usdzFrom) ? usdzFrom : 'auto';

  if (!config) return <Section title="Zarbo"><p class="muted">{error || 'Подключение…'}</p></Section>;
  if (!config.configured) {
    return <Section title="Zarbo"><p class="muted">Нет API-ключа: Blender → Preferences → Add-ons → Instant Zarbo Viewer.</p></Section>;
  }

  const publish = async () => {
    setBusy(true);
    setResult(null);
    const say = (line) => setLog((l) => [...l, line]);
    setLog([]);
    try {
      let col = collection;
      if (!col) {
        say('Коллекция…');
        col = await zarbo.createCollection('Instant Zarbo Viewer');
      }
      let product = products.find((p) => String(p.id) === productId);
      if (!product) {
        say('Продукт…');
        product = await zarbo.createProduct(col.id, { ...fields, name: fields.name || source.name });
        if (fields.tags) await zarbo.setTags(product.id, fields.tags);
      } else {
        say('Старые модели продукта снимаются с показа…');
        await zarbo.retireModels(product.id);
      }
      const base = (fields.name || source.name).replace(/\.(glb|gltf|usdz)$/i, '');
      say('GLB…');
      const glb = await actions.bytes(source.id);
      const usdz = usdzChoice === 'blender' ? await actions.usdzOf(source.id)
        : usdzChoice.startsWith('tab:') ? await actions.bytes(Number(usdzChoice.slice(4))) : null;
      await zarbo.uploadModel(product.id, glb, `${base}.glb`, usdz ? ADDITIONAL.glb : ADDITIONAL.glbOnly);
      if (usdz) {
        say('USDZ…');
        await zarbo.uploadModel(product.id, usdz, `${base}.usdz`, ADDITIONAL.usdz);
      }
      say('Виджет…');
      const widget = await zarbo.ensureWidget(product.id);
      if (useCamera) await zarbo.updateWidget(widget.id, { camera_orbit: cameraOrbit(actions.viewer) });
      const url = zarbo.embedUrl({ ...widget, product: widget.product?.uuid ? widget.product : product });
      setResult({ url, product });
      say('Готово');
      setFields({ name: '', guid: uuid(), description: '', tags: '' });
      reload();
      zarbo.products(col).then(setProducts, () => {});
    } catch (e) {
      say(`Ошибка: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const isNew = productId === 'new';
  return (
    <Section title="Zarbo">
      {error && <p class="muted">{error}</p>}
      <Row label="Коллекция">
        <Select
          value={collectionId}
          options={collections.length ? collections.map((c) => ({ value: String(c.id), label: c.name })) : [{ value: '', label: '— создастся —' }]}
          onChange={(v) => { setCollectionId(v); setProductId('new'); }}
        />
      </Row>
      <Row label="Продукт">
        <Select
          value={productId}
          options={[{ value: 'new', label: '+ Новый продукт' }, ...products.map((p) => ({ value: String(p.id), label: p.name || p.guid }))]}
          onChange={setProductId}
        />
      </Row>
      {isNew && (
        <>
          <Row label="Имя"><input type="text" value={fields.name} placeholder={source?.name} onInput={(e) => set({ name: e.currentTarget.value })} /></Row>
          <Row label="Артикул (guid)"><input type="text" value={fields.guid} onInput={(e) => set({ guid: e.currentTarget.value })} /></Row>
          <Row label="Описание"><input type="text" value={fields.description} onInput={(e) => set({ description: e.currentTarget.value })} /></Row>
          <Row label="Теги"><input type="text" value={fields.tags} placeholder="через запятую" onInput={(e) => set({ tags: e.currentTarget.value })} /></Row>
        </>
      )}
      <Row label="GLB из вкладки">
        <Select value={String(source?.id ?? '')} options={glbSources.map((t) => ({ value: String(t.id), label: t.name + (t.edited ? ' ✎' : '') }))} onChange={setGlbTab} />
      </Row>
      <Row label="USDZ (iOS)"><Select value={usdzChoice} options={usdzOptions} onChange={setUsdzFrom} /></Row>
      <Row label="Камера виджета" title="camera_orbit виджета = текущий вид во вьюпорте">
        <input type="checkbox" checked={useCamera} onChange={(e) => setUseCamera(e.currentTarget.checked)} />
      </Row>
      <button class="primary" disabled={busy || !source} onClick={publish}>
        {busy ? 'Публикация…' : isNew ? 'Опубликовать' : 'Обновить модель продукта'}
      </button>
      {log.length > 0 && <p class="muted">{log.join(' · ')}</p>}
      {result && (
        <div class="row-control">
          <input type="text" readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} />
          <button title="Скопировать" onClick={() => navigator.clipboard?.writeText(result.url)}>⧉</button>
          <button title="Открыть" onClick={() => open(result.url, '_blank', 'noopener')}>↗</button>
        </div>
      )}
    </Section>
  );
}
