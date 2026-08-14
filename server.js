import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { app } from './backend/server.js';
const __dirname = process.cwd();
const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';
async function startServer() {
    try {
        if (!isProd) {
            const vite = await createViteServer({
                root: path.resolve(__dirname, 'frontend'),
                server: { middlewareMode: true, hmr: false },
                appType: 'spa'
            });
            app.use(vite.middlewares);
        }
        else {
            const distPath = path.join(process.cwd(), 'dist');
            app.use(express.static(distPath));
            app.get('*', (req, res) => {
                res.sendFile(path.join(distPath, 'index.html'));
            });
        }
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`[Combined Server] TPM Fulcrum listening on http://0.0.0.0:${PORT}`);
        });
    }
    catch (err) {
        console.error('Failed to start server:', err);
    }
}
startServer();
