import { loadConfig } from './config.js';
import { createPool, createMemoryPool, initDb } from './db.js';
import { createApp } from './app.js';

const config = loadConfig();
const pool = config.databaseUrl ? createPool(config.databaseUrl) : await createMemoryPool();

if (!config.databaseUrl) {
  console.warn('DATABASE_URL not set: using in-memory PostgreSQL for development (data lost on restart).');
}

try {
  await initDb(pool);
} catch (error) {
  console.error(`Database init failed, /health/ready will report down: ${error.message}`);
}

const app = createApp({ pool });
const server = app.listen(config.port, () => {
  console.log(`shoe-store listening on http://127.0.0.1:${config.port} (${config.nodeEnv})`);
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
