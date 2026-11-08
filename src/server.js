import { randomBytes } from 'node:crypto';
import { loadConfig } from './config.js';
import { createPool, createMemoryPool, initDb, seedDemoProducts } from './db.js';
import { createApp } from './app.js';
import { ensureAdmin } from './auth.js';

const config = loadConfig();
const pool = config.databaseUrl ? createPool(config.databaseUrl) : await createMemoryPool();

if (!config.databaseUrl) {
  console.warn('DATABASE_URL not set: using in-memory PostgreSQL for development (data lost on restart).');
}
if (!config.sessionSecret) {
  console.warn('SESSION_SECRET not set: using a random development secret (sessions reset on restart).');
}

try {
  await initDb(pool);
} catch (error) {
  console.error(`Database init failed, /health/ready will report down: ${error.message}`);
}

try {
  if (config.adminEmail && config.adminPassword) {
    await ensureAdmin(pool, config.adminEmail, config.adminPassword);
    console.log(`Admin ensured for ${config.adminEmail}`);
  } else if (config.adminEmail) {
    console.warn('ADMIN_EMAIL set but ADMIN_PASSWORD missing: admin not seeded.');
  } else if (!config.databaseUrl) {
    const devPassword = randomBytes(9).toString('base64url');
    await ensureAdmin(pool, 'admin@shoe.local', devPassword);
    console.log(`Dev admin: admin@shoe.local / ${devPassword}`);
  }

  await seedDemoProducts(pool);
} catch (error) {
  console.error(`Seeding failed: ${error.message}`);
}

const app = createApp({ pool, sessionSecret: config.sessionSecret ?? undefined });
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`shoe-store listening on http://0.0.0.0:${config.port} (${config.nodeEnv})`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    try {
      await pool.end?.();
    } finally {
      process.exit(0);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
