import express from 'express';
import { fileURLToPath } from 'node:url';

const PRODUCT_COLUMNS = 'id, name, brand, price, image_url, description, created_at';
const MAX_PRICE = 1_000_000_000_000;
const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export function createApp({ pool }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(PUBLIC_DIR));

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  app.get('/health/ready', wrap(async (_req, res) => {
    const ok = await isDbUp(pool);
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'unavailable',
      checks: { database: ok ? 'up' : 'down' },
    });
  }));

  app.get('/health', wrap(async (_req, res) => {
    const ok = await isDbUp(pool);
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'unavailable',
      checks: { liveness: 'up', database: ok ? 'up' : 'down' },
    });
  }));

  app.get('/api/products', wrap(async (req, res) => {
    const clauses = [];
    const values = [];
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const brand = typeof req.query.brand === 'string' ? req.query.brand.trim() : '';

    if (q) {
      values.push(`%${q}%`);
      clauses.push(`LOWER(name) LIKE LOWER($${values.length})`);
    }
    if (brand) {
      values.push(`%${brand}%`);
      clauses.push(`LOWER(brand) LIKE LOWER($${values.length})`);
    }

    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT ${PRODUCT_COLUMNS} FROM products${where} ORDER BY id DESC`,
      values,
    );
    res.json({ data: rows });
  }));

  app.post('/api/products', wrap(async (req, res) => {
    const { errors, value } = parseProduct(req.body ?? {});
    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { rows } = await pool.query(
      `INSERT INTO products (name, brand, price, image_url, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${PRODUCT_COLUMNS}`,
      [value.name, value.brand, value.price, value.imageUrl, value.description],
    );
    res.status(201).location(`/api/products/${rows[0].id}`).json({ data: rows[0] });
  }));

  app.get('/api/products/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid product id' });

    const { rows } = await pool.query(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1`,
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json({ data: rows[0] });
  }));

  app.put('/api/products/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid product id' });

    const { errors, value } = parseProduct(req.body ?? {});
    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { rows } = await pool.query(
      `UPDATE products
       SET name = $1, brand = $2, price = $3, image_url = $4, description = $5
       WHERE id = $6
       RETURNING ${PRODUCT_COLUMNS}`,
      [value.name, value.brand, value.price, value.imageUrl, value.description, id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json({ data: rows[0] });
  }));

  app.delete('/api/products/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid product id' });

    const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Product not found' });
    res.status(204).end();
  }));

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

function parseId(raw) {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseProduct(body) {
  const errors = [];

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 120) errors.push('name is required (1-120 chars)');

  const brand = typeof body.brand === 'string' ? body.brand.trim() : '';
  if (!brand || brand.length > 80) errors.push('brand is required (1-80 chars)');

  let price = Number.NaN;
  if (typeof body.price === 'number') {
    price = body.price;
  } else if (typeof body.price === 'string' && /^\d+$/.test(body.price.trim())) {
    price = Number(body.price.trim());
  }
  if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
    errors.push(`price must be an integer between 0 and ${MAX_PRICE}`);
  }

  const imageUrl = body.image_url == null || body.image_url === ''
    ? null
    : String(body.image_url).trim();
  if (imageUrl && !/^https?:\/\/\S+$/i.test(imageUrl)) {
    errors.push('image_url must be an http(s) URL');
  }

  const description = body.description == null || body.description === ''
    ? null
    : String(body.description).trim();
  if (description && description.length > 2000) {
    errors.push('description must be at most 2000 chars');
  }

  return { errors, value: { name, brand, price, imageUrl, description } };
}
