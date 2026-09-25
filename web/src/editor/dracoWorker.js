import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';

// Legacy asm.js Draco encoder (three.js ships it at examples/jsm/libs/draco/gltf/draco_encoder.js,
// copied to public/draco/). It's a self-contained emscripten build with no companion .wasm and it
// collides with the Draco *decoder* when loaded in the same window scope as io.js's getIO(), so it
// runs here instead, in its own worker (this file is built as a classic/iife worker — see
// vite.config.js `worker.format` — so `importScripts` is available).
let encoderPromise = null;
function loadEncoder() {
  encoderPromise ??= new Promise((resolve) => {
    // public/ files are copied to the site root; this worker's own script lives one level down,
    // in the build's assets dir, so resolve the encoder relative to that.
    importScripts(new URL('../draco/draco_encoder.js', self.location.href).href);
    // The emscripten module has its own `then`: resolving with it directly never settles.
    self.DracoEncoderModule({ onModuleLoaded: (module) => resolve({ module }) });
  });
  return encoderPromise;
}

self.onmessage = async (e) => {
  const { glb, options } = e.data;
  try {
    const { module: encoderModule } = await loadEncoder();
    const io = new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.encoder': encoderModule });
    const doc = await io.readBinary(new Uint8Array(glb));
    await doc.transform(draco(options));
    const out = await io.writeBinary(doc);
    self.postMessage({ glb: out.buffer }, [out.buffer]);
  } catch (err) {
    self.postMessage({ error: err?.message || String(err) });
  }
};
