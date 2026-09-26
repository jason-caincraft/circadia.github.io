import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_API_BASE_URL');
  return {
    plugins: [react()],
    // Disable automatic VITE_* exposure; only this explicit public value is bundled.
    envPrefix: [],
    define: {
      __API_BASE_URL__: JSON.stringify(
        env.VITE_API_BASE_URL || 'http://localhost:5080',
      ),
    },
    server: { host: 'localhost', port: 5173, strictPort: true },
    test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
  };
});
