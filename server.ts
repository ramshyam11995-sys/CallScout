import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

import authRoutes from './backend/routes/authRoutes.js';
import callRoutes from './backend/routes/callRoutes.js';
import { initDb, normalizeDatabaseUrl } from './backend/services/dbService.js';

dotenv.config();

// Normalize DATABASE_URL in process.env if present
const cleanDbUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
if (cleanDbUrl) {
  process.env.DATABASE_URL = cleanDbUrl;
}

// Clean up any misleading VITE_API_URL pointing to localhost so Vite dev server doesn't inject it into client builds
if (process.env.VITE_API_URL && (process.env.VITE_API_URL.includes('localhost') || process.env.VITE_API_URL.includes('127.0.0.1'))) {
  console.log('[server] Unsetting localhost VITE_API_URL to ensure client uses same-origin /api proxy');
  delete process.env.VITE_API_URL;
}

const PORT = 3000;
const HOST = '0.0.0.0';

async function startServer() {
  const app = express();

  // Basic middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Initialize Neon PostgreSQL with Prisma
  try {
    await initDb();
  } catch (err: any) {
    console.error('[server] Database init error:', err.message);
  }

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'CallScout AI',
      timestamp: new Date().toISOString()
    });
  });

  // Mount API routes
  app.use('/api/auth', authRoutes);
  app.use('/api', callRoutes);
  // Direct route aliases in case client requests without /api prefix
  app.use('/auth', authRoutes);

  // Vite middleware in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[server] Vite dev server middleware attached.');
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[server] CallScout AI backend is running on http://${HOST}:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[server] Fatal server startup failure:', err);
  process.exit(1);
});
