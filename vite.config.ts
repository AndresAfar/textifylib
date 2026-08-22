import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'TextifyLib',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'textifylib.js' : 'textifylib.cjs'),
    },
    sourcemap: true,
    target: 'es2020',
  },
});
