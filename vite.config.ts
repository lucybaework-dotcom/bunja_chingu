import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { pwaPlugin } from './pwa-plugin';
export default defineConfig({ base: './', plugins: [react(), viteSingleFile(), pwaPlugin()], test: { globals: true } });
