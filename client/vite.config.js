// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const banner = '/*! GRIT Interview Scheduling | (c) 2026 Nishant | Proprietary. Evaluation use only. See LICENSE. */';

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_AUTHOR__: JSON.stringify('Nishant'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: { banner },
    },
  },
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
});
