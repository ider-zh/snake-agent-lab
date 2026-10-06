import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], build: { target: 'es2022', chunkSizeWarningLimit: 1800 }, worker: { format: 'es' }, test: { include: ['src/**/*.test.{ts,tsx}'], testTimeout: 30000 } });
