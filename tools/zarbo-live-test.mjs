// Live contract test for the addon's Zarbo client: runs the REAL web/src/zarbo/api.js
// Usage:  $env:IZV_ZARBO_KEY='<Api-Key>'; node tools/zarbo-live-test.mjs
//         $env:IZV_ZARBO_HOST='https://api-sergkey.zarbo.works' — прогон против стенда
// It creates a throwaway collection, walks the whole publish flow (product, tags, GLB,
// widget, camera_orbit, retire, embed) and deletes the collection at the end.
// in Node with a fetch shim that redirects './api/zarbo/*' to the live API + Api-Key.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const KEY = process.env.IZV_ZARBO_KEY;
const HOST = (process.env.IZV_ZARBO_HOST || 'https://api.zarbo.tech').replace(/\/+$/, '');
const LIVE = HOST + '/api/v1';
// Same rule as the addon proxy: api-<stand> -> embed-<stand>.
const EMBED = HOST.replace('api.', 'embed.').replace('api-', 'embed-');
const ROOT = 'C:/Users/bykov_sy/Documents/Zarbo/_dev/ZarboViewer/InstantZarboViewer';
const GLB = 'C:/Users/bykov_sy/Documents/Zarbo/_dev/ZarboViewer/TESTmodels/plane.glb';
if (!KEY) { console.error('IZV_ZARBO_KEY not set'); process.exit(2); }

const realFetch = globalThis.fetch;
const trace = [];
globalThis.fetch = async (url, init = {}) => {
  // /config живёт только в прокси аддона: отдаём его здесь, чтобы embedUrl() взял хост стенда.
  if (url === './api/zarbo/config') {
    return new Response(JSON.stringify({ host: HOST, input: HOST, embed_host: EMBED, configured: true }),
      { headers: { 'Content-Type': 'application/json' } });
  }
  if (typeof url === 'string' && url.startsWith('./api/zarbo')) {
    const real = LIVE + url.slice('./api/zarbo'.length);
    init.headers = Object.assign({}, init.headers, { Authorization: 'Api-Key ' + KEY, Accept: 'application/json' });
    const res = await realFetch(real, init);
    trace.push((init.method || 'GET') + ' ' + url.slice('./api/zarbo'.length) + ' -> ' + res.status);
    return res;
  }
  return realFetch(url, init);
};

async function raw(method, path, body, ctype) {
  const headers = { Authorization: 'Api-Key ' + KEY, Accept: 'application/json' };
  if (ctype) headers['Content-Type'] = ctype;
  const res = await realFetch(LIVE + path, { method, headers, body });
  const text = await res.text();
  trace.push('RAW ' + method + ' ' + path + ' -> ' + res.status);
  return { status: res.status, text };
}

const say = (s) => console.log(s);
const box = {};
try {
  const mod = await import(pathToFileURL(ROOT + '/web/src/zarbo/api.js').href);
  const zarbo = mod.zarbo, ADDITIONAL = mod.ADDITIONAL, cameraOrbit = mod.cameraOrbit, WIDGET_DEFAULTS = mod.WIDGET_DEFAULTS;
  say('ADDITIONAL=' + JSON.stringify(ADDITIONAL));
  say('WIDGET_DEFAULTS=' + JSON.stringify(WIDGET_DEFAULTS));

  const collections = await zarbo.collections();
  say('1 collections() -> ' + collections.length + ' first=' + collections[0].name + ' key=' + collections[0].key);

  const col = await zarbo.createCollection('Instant Zarbo Viewer smoke');
  box.collection = col;
  say('2 createCollection -> id=' + col.id + ' key=' + col.key + ' name=' + col.name);

  const guid = crypto.randomUUID();
  const product = await zarbo.createProduct(col.id, { guid, name: 'IZV smoke plane', description: 'contract test' });
  box.product = product;
  say('3 createProduct -> id=' + product.id + ' uuid=' + product.uuid);

  await zarbo.setTags(product.id, 'izv-smoke');
  say('4 setTags ok');

  const glb = new Blob([readFileSync(GLB)]);
  const model = await zarbo.uploadModel(product.id, glb, 'plane.glb', ADDITIONAL.glbOnly);
  box.model = model;
  say('5 uploadModel -> id=' + model.id + ' format=' + model.format + ' additional_data=' + JSON.stringify(model.additional_data));

  const models = await zarbo.models(product.id);
  say('6 models() -> ' + models.length + ' ids=' + models.map(m => m.id).join(','));

  const widget = await zarbo.ensureWidget(product.id);
  box.widget = widget;
  say('7 ensureWidget -> id=' + widget.id + ' product.uuid=' + (widget.product && widget.product.uuid) + ' ar_mode=' + widget.ar_mode);

  const viewer = {
    camera: { position: { clone: () => ({ sub: () => ({ x: 1.5, y: 2.0, z: 3.5, length: () => Math.hypot(1.5, 2.0, 3.5) }) }) } },
    controls: { target: {} },
  };
  const orbit = cameraOrbit(viewer);
  say('8 cameraOrbit(viewer) = ' + orbit);
  await zarbo.updateWidget(widget.id, { camera_orbit: orbit });
  const back = JSON.parse((await raw('GET', '/widgets/?product=' + product.id)).text).results[0];
  say('9 updateWidget camera_orbit -> stored=' + back.camera_orbit);

  const jsonPatch = await raw('PATCH', '/widgets/' + widget.id + '/', JSON.stringify({ shadow_intensity: 1.0, shadow_softness: 0.55, camera_orbit: '33deg 77deg 105%' }), 'application/json');
  say('10 PATCH widget as JSON -> ' + jsonPatch.status + ' ' + jsonPatch.text.slice(0, 120));
  const back2 = JSON.parse((await raw('GET', '/widgets/?product=' + product.id)).text).results[0];
  say('11 stored after JSON patch: orbit=' + back2.camera_orbit + ' shadow=' + back2.shadow_intensity + '/' + back2.shadow_softness);

  await zarbo.retireModels(product.id);
  const after = JSON.parse((await raw('GET', '/models/?product=' + product.id)).text).results;
  say('12 retireModels -> ' + after.map(m => m.id + ':' + JSON.stringify(m.additional_data)).join(' '));

  const cfg = await zarbo.config();
  say('config -> host=' + cfg.host + ' embed_host=' + cfg.embed_host);
  const embed = zarbo.embedUrl(widget);
  const embedRes = await realFetch(embed, { redirect: 'follow' });
  say('13 embedUrl = ' + embed + ' -> ' + embedRes.status);

  try {
    await zarbo.createProduct('', { guid: 'x', name: 'x', description: '' });
    say('14 bad createProduct -> did not throw');
  } catch (e) {
    say('14 bad createProduct error text: ' + e.message.slice(0, 240));
  }

  const del = await raw('DELETE', '/collections/' + col.id + '/');
  say('14 cleanup DELETE collection -> ' + del.status + ' ' + del.text.slice(0, 160));
} catch (e) {
  say('FAILED: ' + e.message);
  say((e.stack || '').split('\n').slice(0, 4).join(' | '));
}
say('--- trace');
trace.forEach((t) => say('  ' + t));
say('BOX ' + JSON.stringify({ collection: box.collection && box.collection.id, product: box.product && box.product.id, model: box.model && box.model.id, widget: box.widget && box.widget.id }));