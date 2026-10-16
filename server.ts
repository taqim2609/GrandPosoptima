import path from 'path';
import express from 'express';

// @ts-ignore
const app = require('./api-server.js');
const PORT = 3000;
const HOST = '0.0.0.0';

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Grand Aceh Kuliner POS running on http://${HOST}:${PORT}`);
  });

  server.on('error', (err: any) => {
    console.error('[Server Listen Error]:', err);
  });
}

startServer().catch((err) => {
  console.error('[Server Error]:', err);
});
