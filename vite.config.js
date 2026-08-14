import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
    root: './frontend',
    plugins: [tailwindcss(), react()],
    build: {
        outDir: '../dist',
        emptyOutDir: true,
    },
    server: {
        host: '0.0.0.0',
        port: 3000,
        allowedHosts: true,
        hmr: false,
    },
    resolve: {
        alias: { '@': path.resolve(import.meta.dirname, './frontend/src') },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/__tests__/setup.js'],
        include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
    },
});
