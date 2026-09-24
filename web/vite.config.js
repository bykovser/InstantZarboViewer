import { defineConfig } from 'vite';

// Dev: `npm run dev` proxies scene/session to the addon server running in Blender.
const BLENDER = process.env.IZV_BLENDER ?? 'http://localhost:8080';

export default defineConfig({
  base: './',
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
