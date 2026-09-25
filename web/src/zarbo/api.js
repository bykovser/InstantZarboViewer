/*
 * Zarbo API through the addon's local proxy (/api/zarbo/* → {host}/api/v1/*, Api-Key added there).
 * Gotchas kept from the API docs:
 *  - additional_data is required on model upload, otherwise the model shows nowhere;
 *  - widgets are created explicitly, auto-creation is unreliable;
 *  - embed URL = embed.zarbo.tech/{widget.product.uuid}/{widget.id}/ (not /widgets/render/).
 */
const EMBED_HOST = 'https://embed.zarbo.tech';

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

async function call(method, path, body) {
  const res = await fetch(`./api/zarbo${path}`, { method, body });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = data?.detail ?? (typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data));
    throw new Error(`${method} ${path}: ${res.status} ${detail}`);
  }
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
  config: () => call('GET', '/config'),

  collections: async () => results(await call('GET', '/collections/')),
  createCollection: (name) => call('POST', '/collections/', form({ name })),

  products: async (collection) => results(await call('GET', `/products/?limit=1000&offset=0&collections=${encodeURIComponent(collection.key ?? collection.id)}`)),
  createProduct: (collectionId, { guid, name, description }) => call('POST', '/products/', form({
    collection_id: collectionId, guid, name, description,
  })),
  setTags: (productId, tags) => call('PATCH', `/products/${productId}/`, form({ tags })),

  models: async (productId) => results(await call('GET', `/models/?product=${productId}`)),
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
    const found = results(await call('GET', `/widgets/?product=${productId}`))[0];
    return found ?? call('POST', '/widgets/', form({ product_id: productId, ...WIDGET_DEFAULTS }));
  },
  updateWidget: (widgetId, fields) => call('PATCH', `/widgets/${widgetId}/`, form(fields)),

  embedUrl: (widget) => `${EMBED_HOST}/${widget.product.uuid}/${widget.id}/`,
};

// Current view as model-viewer's camera-orbit (what the widget opens with).
export function cameraOrbit(viewer) {
  const offset = viewer.camera.position.clone().sub(viewer.controls.target);
  const radius = offset.length();
  const theta = (Math.atan2(offset.x, offset.z) * 180) / Math.PI;
  const phi = (Math.acos(offset.y / radius) * 180) / Math.PI;
  return `${theta.toFixed(1)}deg ${phi.toFixed(1)}deg ${radius.toFixed(3)}m`;
}
