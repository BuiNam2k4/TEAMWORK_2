export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const port = Number.parseInt(env.PORT ?? '3000', 10);
  const databaseUrl = env.DATABASE_URL?.trim() || null;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  if (!databaseUrl && nodeEnv === 'production') {
    throw new Error('DATABASE_URL is required in production (see .env.example)');
  }

  return { port, databaseUrl, nodeEnv };
}
