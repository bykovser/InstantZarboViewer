/*
 * Zarbo API through the addon's local proxy (/api/zarbo/* → {host}/api/v1/*, Api-Key added there).
 * Gotchas kept from the API docs:
 *  - additional_data is required on model upload, otherwise the model shows nowhere;
 *  - widgets are created explicitly, auto-creation is unreliable;
 *  - embed URL = embed.zarbo.tech/{widget.product.uuid}/{widget.id}/ (not /widgets/render/).
 */
// embed-хост идёт за стендом: api-sergkey.zarbo.works → embed-sergkey.zarbo.works.
// Приходит из /config (прокси аддона выводит его из хоста в preferences).
const EMBED_DEFAULT = 'https://embed.zarbo.tech';
let embedHost = EMBED_DEFAULT;

export const WIDGET_DEFAULTS = {
  loading_type: 'auto',
  ar: true,
  ar_scale: true,
  ar_mode: 'webxr quick-look scene-viewer',
  camera_controls: true,
  disable_zoom: false,
  change_material: true,
};

// Which model a platform shows: glb for web + Android, usdz for iOS.
export const ADDITIONAL = { glbOnly: '3d ar_android ar_ios', glb: '3d ar_android', usdz: 'ar_ios' };

// Zarbo answers validation errors with a JSON array:
//   [{"status_code": 400, "detail": "...", "code": "validation_error", "extra_data": {"product_id": ["..."]}}]
// so a bare data.detail is undefined there; field errors live in extra_data.
function errorText(method, path, status, data) {
  const item = Array.isArray(data) ? data[0] : data;
  const detail = item?.detail ?? (typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data));
  const fields = item?.extra_data
    ? Object.entries(item.extra_data).map(([k, v]) => `${k}: ${[].concat(v).join(', ')}`).join('; ')
    : '';
  return `${method} ${path}: ${status} ${detail}${fields ? ` — ${fields}` : ''}`;
}

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(`./api/zarbo${path}`, { method, body });
  } catch {
    // fetch бросает только на сетевой ошибке: сервер аддона не поднят (или вкладка осталась
    // от прошлого запуска Blender). «Failed to fetch» ничего не объясняет, поэтому говорим прямо.
    throw new Error(`${method} ${path}: аддон не отвечает — сервер в Blender не запущен. Нажмите «Export and View» и обновите страницу`);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(errorText(method, path, res.status, data));
  return data;
}

const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) f.append(k, v[0], v[1]);
    else f.append(k, typeof v === 'boolean' ? String(v) : v);
  }
  return f;
};

const results = (data) => (Array.isArray(data) ? data : data?.results ?? []);

export const zarbo = {
  config: async () => {
    const cfg = await call('GET', '/config');
    embedHost = cfg.embed_host || EMBED_DEFAULT;
    return cfg;
  },

  // Без opts берём то, что аддон уже прогрел при старте сервера (кеш ~60 с);
  // {fresh: true} — принудительный запрос в Zarbo (раскрытие дропдауна, обновление после создания).
  // Память аддона: ссылку на виджет показываем заново, даже если вкладку закрыли.
  publishResult: (url, name) => call('POST', '/publish', JSON.stringify({ url, name: name || '' })),

  collections: async (opts) => results(await call('GET', '/collections/' + (opts && opts.fresh ? '?refresh=1' : ''))),
  createCollection: (name) => call('POST', '/collections/', form({ name })),

  products: async (collection) => results(await call('GET', `/products/?limit=1000&offset=0&collections=${encodeURIComponent(collection.key ?? collection.id)}`)),
  createProduct: (collectionId, { guid, name, description }) => call('POST', '/products/', form({
    collection_id: collectionId, guid, name, description,
  })),
  setTags: (productId, tags) => call('PATCH', `/products/${productId}/`, form({ tags })),

  models: async (productId) => results(await call('GET', `/models/?limit=1000&offset=0&product=${productId}`)),
  uploadModel: (productId, blob, filename, additional) => call('POST', '/models/', form({
    product_id: productId, additional_data: additional, file: [blob, filename],
  })),
  // Old models of the product stop being shown, so the new upload is the one the widget picks.
  async retireModels(productId) {
    for (const m of await zarbo.models(productId)) {
      if (m.additional_data) await call('PATCH', `/models/${m.id}/`, form({ additional_data: '' }));
    }
  },

  async ensureWidget(productId) {
    const found = results(await call('GET', `/widgets/?limit=1000&offset=0&product=${productId}`))[0];
    return found ?? call('POST', '/widgets/', form({ product_id: productId, ...WIDGET_DEFAULTS }));
  },
  updateWidget: (widgetId, fields) => call('PATCH', `/widgets/${widgetId}/`, form(fields)),

  embedUrl: (widget) => `${embedHost}/${widget.product.uuid}/${widget.id}/`,
};

// Current view as model-viewer's camera-orbit (what the widget opens with).
export function cameraOrbit(viewer) {
  const offset = viewer.camera.position.clone().sub(viewer.controls.target);
  const radius = offset.length();
  const theta = (Math.atan2(offset.x, offset.z) * 180) / Math.PI;
  const phi = (Math.acos(offset.y / radius) * 180) / Math.PI;
  return `${theta.toFixed(1)}deg ${phi.toFixed(1)}deg ${radius.toFixed(3)}m`;
}
