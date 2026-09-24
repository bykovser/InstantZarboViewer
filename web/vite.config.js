import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Dev: `npm run dev` proxies scene/session/events to the addon server running in Blender.
const BLENDER = process.env.IZV_BLENDER ?? 'http://localhost:8080';

export default defineConfig({
  base: './',
  plugins: [preact()],
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
