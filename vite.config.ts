import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the same build works on GitHub Pages (/EarthLive/) or any host.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        codeSplitting: { groups: [{ name: "maplibre", test: /maplibre-gl/ }] },
      },
    },
  },
});
