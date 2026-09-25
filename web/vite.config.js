import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Dev: `npm run dev` proxies scene/session/events to the addon server running in Blender.
const BLENDER = process.env.IZV_BLENDER ?? 'http://localhost:8090';

export default defineConfig({
  base: './',
  plugins: [preact()],
  // dracoWorker.js uses importScripts() for the legacy asm.js Draco encoder, which only
  // works in a classic (non-module) worker — bundle it as a self-contained IIFE.
  worker: {
    format: 'iife',
  },
  server: {
    host: true,
    proxy: {
      '/api': BLENDER,
      '/session': BLENDER,
    },
  },
  build: {
    outDir: '../addon/web_dist',
    emptyOutDir: true,
  },
});
