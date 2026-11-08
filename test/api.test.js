import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { newDb } from 'pg-mem';
import { createApp } from '../src/app.js';
import { initDb } from '../src/db.js';

function createMemPool() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

async function startServer(pool, { init = true } = {}) {
  if (init) await initDb(pool);

  const server = createApp({ pool }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      if (typeof pool.end === 'function') {
        try {
          await pool.end();
        } catch {
          // pg-mem pools do not always implement end()
        }
      }
    },
  };
}

async function request(base, path, options) {
  const res = await fetch(base + path, options);
  const body = res.status === 204 ? null : await res.json();
  return { status: res.status, body, headers: res.headers };
}

function postJson(base, path, payload) {
  return request(base, path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

const sample = { name: 'Air Runner', brand: 'Nike', price: 2500000 };

describe('health endpoints', () => {
  it('liveness is 200 even when the database is down', async () => {
    const pool = { query: async () => { throw new Error('db down'); } };
    const server = await startServer(pool, { init: false });
    try {
      const res = await request(server.base, '/health/live');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
    } finally {
      await server.close();
    }
  });

  it('readiness is 503 when the database is down', async () => {
    const pool = { query: async () => { throw new Error('db down'); } };
    const server = await startServer(pool, { init: false });
    try {
      const res = await request(server.base, '/health/ready');
      assert.equal(res.status, 503);
      assert.deepEqual(res.body.checks, { database: 'down' });
    } finally {
      await server.close();
    }
  });

  it('readiness is 200 when the database is reachable', async () => {
    const server = await startServer(createMemPool());
    try {
      const res = await request(server.base, '/health/ready');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.checks, { database: 'up' });
    } finally {
      await server.close();
    }
  });
});

describe('products API', () => {
  let server;

  beforeEach(async () => {
    server = await startServer(createMemPool());
  });

  afterEach(async () => {
    await server.close();
  });

  it('lists an empty table, creates a product and shows it afterwards', async () => {
    const before = await request(server.base, '/api/products');
    assert.equal(before.status, 200);
    assert.deepEqual(before.body.data, []);

    const created = await postJson(server.base, '/api/products', sample);
    assert.equal(created.status, 201);
    assert.equal(created.body.data.name, sample.name);
    assert.equal(created.headers.get('location'), `/api/products/${created.body.data.id}`);

    const after = await request(server.base, '/api/products');
    assert.equal(after.status, 200);
    assert.equal(after.body.data.length, 1);
    assert.equal(after.body.data[0].price, sample.price);
  });

  it('rejects invalid payloads and does not write anything', async () => {
    const res = await postJson(server.base, '/api/products', {
      name: '',
      brand: 'Nike',
      price: -5,
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.details.length >= 2);

    const list = await request(server.base, '/api/products');
    assert.deepEqual(list.body.data, []);
  });

  it('reads, updates and deletes a product', async () => {
    const created = await postJson(server.base, '/api/products', sample);
    const id = created.body.data.id;

    const got = await request(server.base, `/api/products/${id}`);
    assert.equal(got.status, 200);
    assert.equal(got.body.data.brand, 'Nike');

    const updated = await request(server.base, `/api/products/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...sample, name: 'Air Runner 2', price: 3000000 }),
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.name, 'Air Runner 2');
    assert.equal(updated.body.data.price, 3000000);

    const deleted = await request(server.base, `/api/products/${id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 204);

    const missing = await request(server.base, `/api/products/${id}`);
    assert.equal(missing.status, 404);
  });

  it('filters by search term, brand and both combined', async () => {
    await postJson(server.base, '/api/products', sample);
    await postJson(server.base, '/api/products', { name: 'Ultra Boost', brand: 'Adidas', price: 3000000 });
    await postJson(server.base, '/api/products', { name: 'Runner Lite', brand: 'Adidas', price: 1500000 });

    const byName = await request(server.base, '/api/products?q=runner');
    assert.equal(byName.body.data.length, 2);

    const byBrand = await request(server.base, '/api/products?brand=adidas');
    assert.equal(byBrand.body.data.length, 2);

    const combined = await request(server.base, '/api/products?q=runner&brand=adidas');
    assert.equal(combined.body.data.length, 1);
    assert.equal(combined.body.data[0].name, 'Runner Lite');
  });

  it('returns 400 for malformed ids and 404 for unknown products', async () => {
    const bad = await request(server.base, '/api/products/abc');
    assert.equal(bad.status, 400);

    const missing = await request(server.base, '/api/products/999');
    assert.equal(missing.status, 404);
  });
});

describe('web UI', () => {
  it('serves the product page at /', async () => {
    const server = await startServer(createMemPool());
    try {
      const res = await fetch(`${server.base}/`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      assert.match(await res.text(), /Danh sách giày/);
    } finally {
      await server.close();
    }
  });
});
