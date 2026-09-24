import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

let ioPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src, onload: resolve, onerror: reject });
    document.head.append(s);
  });
}

// Same Draco decoder files the viewer ships (web/public/draco): works offline in LAN.
async function dracoDecoder() {
  await loadScript('./draco/draco_wasm_wrapper.js');
  const wasmBinary = await fetch('./draco/draco_decoder.wasm').then((r) => r.arrayBuffer());
  return new Promise((resolve) => {
    globalThis.DracoDecoderModule({ wasmBinary, onModuleLoaded: resolve });
  });
}

export function getIO() {
  ioPromise ??= (async () => {
    const [draco] = await Promise.all([dracoDecoder(), MeshoptDecoder.ready, MeshoptEncoder.ready]);
    return new WebIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({
        'draco3d.decoder': draco,
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
      });
  })();
  return ioPromise;
}

// Geometry compression is decoded once on load and chosen again on export; internal reloads stay fast.
const DECODE_ONCE = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression'];

export async function readDocument(url) {
  const io = await getIO();
  const doc = await io.read(url);
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (DECODE_ONCE.includes(ext.extensionName)) ext.dispose();
  }
  return doc;
}

export async function writeGLB(doc) {
  const io = await getIO();
  return io.writeBinary(doc);
}

export function download(bytes, filename, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
