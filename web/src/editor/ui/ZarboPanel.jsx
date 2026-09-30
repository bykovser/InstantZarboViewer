import { useEffect, useRef, useState } from 'preact/hooks';

import { ADDITIONAL, cameraOrbit, zarbo } from '../../zarbo/api.js';
import { Row, Section, Select } from './widgets.jsx';

// crypto.randomUUID есть только в защищённом контексте (https или localhost). Вьювер же
// открывают и по LAN-http (http://192.168.x.x:8090) — там метод undefined и панель падала
// на первом же рендере. crypto.getRandomValues доступен всегда.
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// navigator.clipboard есть только в защищённом контексте (https/localhost): по LAN-http
// (http://192.168.x.x:8090) его нет, и кнопка молча ничего не делала. Запасной путь —
// скрытый textarea + execCommand.
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* нет разрешения — пробуем старый путь */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

// Lists refresh on open (dropdown) and after every create: no "refresh" buttons.
function useZarboLists() {
  const [config, setConfig] = useState(null);
  const [collections, setCollections] = useState([]);
  const [error, setError] = useState('');
  const load = async (opts) => {
    try {
      const cfg = await zarbo.config();
      setConfig(cfg);
      if (cfg.configured) setCollections(await zarbo.collections(opts));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  // Один раз при открытии вкладки. Дальше — только по делу (раскрыли дропдаун, создали
  // сущность): перезапрос на каждый фокус окна дёргал API без причины.
  useEffect(() => {
    load();
  }, []);
  const reload = () => load({ fresh: true });
  return { config, collections, error, reload };
}

export function ZarboPanel({ actions }) {
  const { config, collections, error, reload } = useZarboLists();
  const [collectionId, setCollectionId] = useState('');
  const [newCollection, setNewCollection] = useState('Instant Zarbo Viewer');
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('new');
  const [fields, setFields] = useState({ name: '', guid: uuid(), description: '', tags: '' });
  const [glbTab, setGlbTab] = useState(String(actions.activeId()));
  const [usdzFrom, setUsdzFrom] = useState('auto');
  const [useCamera, setUseCamera] = useState(true);
  const [log, setLog] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const hideLog = useRef(null);
  useEffect(() => () => clearTimeout(hideLog.current), []);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (patch) => setFields({ ...fields, ...patch });

  // Вкладку закрыли после публикации — аддон помнит ссылку и отдаёт её заново.
  useEffect(() => {
    if (config && config.last_publish && config.last_publish.url) setResult({ url: config.last_publish.url });
  }, [config && config.last_publish && config.last_publish.url]);

  // 'new' = коллекцию создаём в момент публикации; иначе выбранная, а если ничего не выбрано — первая.
  const isNewCollection = collectionId === 'new';
  const collection = isNewCollection ? null : (collections.find((c) => String(c.id) === collectionId) ?? collections[0]);
  useEffect(() => {
    if (!collection) return;
    setCollectionId(String(collection.id));
    zarbo.products(collection).then(setProducts, () => setProducts([]));
  }, [collection?.id, collections]);
  useEffect(() => {
    if (isNewCollection) setProducts([]);
  }, [isNewCollection]);

  const loadProducts = () => {
    if (collection) zarbo.products(collection).then(setProducts, () => setProducts([]));
  };
  // Дропдаун зовёт onOpen и на mousedown, и на focus — второй вызов в пределах 800 мс глушим.
  const openedAt = useRef(0);
  const once = (fn) => () => {
    const now = Date.now();
    if (now - openedAt.current < 800) return;
    openedAt.current = now;
    fn();
  };

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
    clearTimeout(hideLog.current);
    const say = (line) => setLog((l) => [...l, line]);
    setLog([]);
    try {
      let col = collection;
      if (!col) {
        say('Коллекция…');
        col = await zarbo.createCollection(newCollection.trim() || 'Instant Zarbo Viewer');
        setCollectionId(String(col.id));
      }
      let product = products.find((p) => String(p.id) === productId);
      if (!product) {
        say('Продукт…');
        product = await zarbo.createProduct(col.id, { ...fields, name: fields.name || source.name, preview });
        if (fields.tags) await zarbo.setTags(product.id, fields.tags);
      } else {
        say('Старые модели продукта снимаются с показа…');
        await zarbo.retireModels(product.id);
      }
      if (!isNew && preview) {
        say('Превью…');
        await zarbo.setPreview(product.id, preview);
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
      zarbo.publishResult(url, product.name).catch(() => {});   // чтобы ссылка не потерялась с вкладкой
      say('Готово');
      // «Готово» — подтверждение, а не сообщение: прячем через 5 с. Ошибку оставляем на экране.
      hideLog.current = setTimeout(() => setLog([]), 5000);
      setFields({ name: '', guid: uuid(), description: '', tags: '' });
      reload();
      zarbo.products(col).then(setProducts, () => {});
    } catch (e) {
      say(`Ошибка: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  // Кадр текущего вида -> картинка продукта в Zarbo. Для уже созданного продукта
  // заливаем сразу, для нового — держим и отправим вместе с продуктом.
  const makePreview = async () => {
    setBusy(true);
    try {
      const blob = await actions.snapshot();
      if (!blob) throw new Error('кадр не получился');
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreview(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      const existing = products.find((p) => String(p.id) === productId);
      if (existing) {
        await zarbo.setPreview(existing.id, blob);
        setLog(['Превью 900×900 загружено в продукт']);
      } else {
        setLog(['Превью 900×900 снято — уйдёт вместе с новым продуктом']);
      }
    } catch (e) {
      setLog([`Ошибка: ${e.message}`]);
    } finally {
      setBusy(false);
    }
  };

  const isNew = productId === 'new';
  return (
    <Section title="Zarbo">
      {error && <p class="muted">{error}</p>}
      <p class="muted">Стенд: {config.host}</p>
      <Row label="Коллекция">
        <Select
          value={collectionId}
          options={[{ value: 'new', label: '＋ Новая коллекция' }, ...collections.map((c) => ({ value: String(c.id), label: c.name }))]}
          onChange={(v) => { setCollectionId(v); setProductId('new'); }}
          onOpen={once(reload)}
        />
      </Row>
      {isNewCollection && (
        <Row label="Имя коллекции">
          <input type="text" value={newCollection} placeholder="Instant Zarbo Viewer" onInput={(e) => setNewCollection(e.currentTarget.value)} />
        </Row>
      )}
      <Row label="Продукт">
        <Select
          value={productId}
          options={[{ value: 'new', label: '+ Новый продукт' }, ...products.map((p) => ({ value: String(p.id), label: p.name || p.guid }))]}
          onChange={setProductId}
          onOpen={once(loadProducts)}
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
      <Row label="Превью продукта" title="Картинка продукта в Zarbo — кадр текущего вида во вьюпорте">
        <button onClick={makePreview} disabled={busy || !actions.snapshot}>Создать превью</button>
        {previewUrl && <img class="preview-thumb" src={previewUrl} alt="превью" />}
      </Row>
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
          <button
            title={copied ? 'Скопировано' : 'Скопировать'}
            onClick={async () => {
              if (await copyText(result.url)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
          >{copied ? '✓' : '⧉'}</button>
          <button title="Открыть" onClick={() => open(result.url, '_blank', 'noopener')}>↗</button>
        </div>
      )}
    </Section>
  );
}
