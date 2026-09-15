import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
    plugins: [tailwindcss(), react()],
    server: {
        host: '0.0.0.0',
        port: 3001,
        allowedHosts: true,
        hmr: false,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
    resolve: {
        alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
});
