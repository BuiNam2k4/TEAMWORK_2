import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { createAuthRouter } from './routes/auth.js';
import { createProductsRouter } from './routes/products.js';
import { createCartRouter } from './routes/cart.js';
import { createOrdersRouter } from './routes/orders.js';
import { createAdminRouter } from './routes/admin.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

export function createApp({
  pool,
  sessionSecret = randomBytes(32).toString('hex'),
}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '32kb' }));
  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));
  app.use(express.static(PUBLIC_DIR));

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  app.get('/health/ready', async (_req, res) => {
    const ok = await isDbUp(pool);
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'unavailable',
      checks: { database: ok ? 'up' : 'down' },
    });
  });

  app.get('/health', async (_req, res) => {
    const ok = await isDbUp(pool);
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'unavailable',
      checks: { liveness: 'up', database: ok ? 'up' : 'down' },
    });
  });

  app.use('/api/auth', createAuthRouter({ pool }));
  app.use('/api/products', createProductsRouter({ pool }));
  app.use('/api/cart', createCartRouter({ pool }));
  app.use('/api/orders', createOrdersRouter({ pool }));
  app.use('/api/admin', createAdminRouter({ pool }));

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((err, _req, res, _next) => {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500
      ? err.status
      : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Internal server error' : 'Bad request' });
  });

  return app;
}

async function isDbUp(pool) {
  try {
    await pool.query('SELECT 1 FROM products LIMIT 1');
    return true;
  } catch {
    return false;
  }
}
