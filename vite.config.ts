import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev:api` serves the Worker on :8787; /api/ai is forwarded there during local development.
export default defineConfig({ plugins: [react()], base: './', server: { proxy: { '/api/ai': 'http://127.0.0.1:8787', '/api/stripe': 'http://127.0.0.1:8787' } } });
