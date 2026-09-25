import { cloneDocument, dedup, meshopt, prune } from '@gltf-transform/functions';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';

import { writeGLB } from './io.js';

export const EXPORT_DEFAULTS = {
  geometry: 'none', // none | meshopt | draco
  textureFormat: 'keep', // keep | webp | jpeg
  maxSize: 0, // 0 = keep
  quality: 0.9,
};

// The Draco *encoder* (legacy asm.js build, see web/public/draco/draco_encoder.js) collides with
// the Draco *decoder* already initialized on the main thread by io.js's getIO() when loaded into
// the same window scope, so it's encoded off-thread in a dedicated worker instead.
let dracoWorker = null;
function encodeDraco(glb) {
  dracoWorker ??= new Worker(new URL('./dracoWorker.js', import.meta.url));
  return new Promise((resolve, reject) => {
    const onMessage = (e) => {
      dracoWorker.removeEventListener('message', onMessage);
      dracoWorker.removeEventListener('error', onError);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(new Uint8Array(e.data.glb));
    };
    const onError = (e) => {
      dracoWorker.removeEventListener('message', onMessage);
      dracoWorker.removeEventListener('error', onError);
      reject(new Error(e.message || 'Draco worker error'));
    };
    dracoWorker.addEventListener('message', onMessage);
    dracoWorker.addEventListener('error', onError);
    dracoWorker.postMessage({ glb: glb.buffer }, [glb.buffer]);
  });
}

const CANVAS_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

async function hasAlpha(bitmap) {
  const c = new OffscreenCanvas(Math.min(bitmap.width, 256), Math.min(bitmap.height, 256));
  const ctx = c.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 255) return true;
  return false;
}

// Resize / re-encode with the browser's own encoders. Keeps the original if the result is bigger.
async function processTextures(doc, { textureFormat, maxSize, quality }) {
  let usedWebP = false;
  for (const texture of doc.getRoot().listTextures()) {
    const mime = texture.getMimeType();
    const image = texture.getImage();
    if (!image || !CANVAS_TYPES.has(mime)) continue;

    const bitmap = await createImageBitmap(new Blob([image], { type: mime }));
    const k = maxSize && Math.max(bitmap.width, bitmap.height) > maxSize ? maxSize / Math.max(bitmap.width, bitmap.height) : 1;
    let type = textureFormat === 'keep' ? mime : `image/${textureFormat}`;
    if (type === 'image/jpeg' && (await hasAlpha(bitmap))) type = 'image/png';
    if (k === 1 && type === mime) continue;

    const canvas = new OffscreenCanvas(Math.round(bitmap.width * k), Math.round(bitmap.height * k));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type, quality });
    if (k === 1 && blob.size >= image.byteLength) continue;

    const ext = type.split('/')[1].replace('jpeg', 'jpg');
    texture.setImage(new Uint8Array(await blob.arrayBuffer())).setMimeType(type);
    if (texture.getURI()) texture.setURI(texture.getURI().replace(/\.[^.]+$/, `.${ext}`));
    usedWebP ||= type === 'image/webp';
  }
  if (usedWebP) doc.createExtension(EXTTextureWebP).setRequired(true);
}

export async function exportGLB(model, options) {
  const doc = cloneDocument(model.doc);
  await doc.transform(prune(), dedup());
  await processTextures(doc, options);
  if (options.geometry === 'meshopt') {
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  }
  const glb = await writeGLB(doc);
  return options.geometry === 'draco' ? encodeDraco(glb) : glb;
}
