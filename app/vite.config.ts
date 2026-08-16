import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative base so the built bundle works when Tauri serves it from disk.
  base: './',
  // Tauri expects a fixed dev server port and its own terminal output.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as never);
