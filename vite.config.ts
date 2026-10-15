import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react(), { name: 'production-headers', configurePreviewServer(server) {
 const headers = readFileSync(new URL('./public/_headers', import.meta.url), 'utf8').split('/assets/*')[0].split(/\r?\n/).filter(line => line.startsWith('  ')).map(line => {const colon=line.indexOf(':');return [line.slice(0,colon).trim(),line.slice(colon+1).trim()];});
 server.middlewares.use((_req,res,next)=>{for(const [key,value] of headers)res.setHeader(key,value);next();});
} }], build: { target: 'es2022', chunkSizeWarningLimit: 1800 }, worker: { format: 'es' }, test: { include: ['src/**/*.test.{ts,tsx}'], testTimeout: 30000 } });
