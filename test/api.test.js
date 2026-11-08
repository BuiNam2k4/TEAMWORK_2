import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { newDb } from 'pg-mem';
import { createApp } from '../src/app.js';
import { initDb } from '../src/db.js';
import { hashPassword } from '../src/auth.js';

const sampleProduct = {
  name: 'Air Runner',
  brand: 'Nike',
  price: 2500000,
  image_url: '/images/air-runner.svg',
  sizes: ['40', '41', '42'],
  colors: ['Đen', 'Trắng'],
};

function createMemPool() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

async function startServer(pool, { init = true } = {}) {
  if (init) await initDb(pool);

  const server = createApp({ pool, sessionSecret: 'test-secret' }).listen(0, '127.0.0.1');
  await once(server, 'listening');

  return {
    base: `http://127.0.0.1:${server.address().port}`,
    pool,
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

function cookieFrom(headers) {
  const raw = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()[0]
    : headers.get('set-cookie');
  return raw ? raw.split(';')[0] : null;
}

async function call(base, path, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;

  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, body: data, headers: res.headers, cookie: cookieFrom(res.headers) };
}

async function seedAdmin(server) {
  const password = 'admin12345';
  const hash = await hashPassword(password);
  await server.pool.query(
    "INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Admin', 'admin')",
    ['admin@test.local', hash],
  );
  const login = await call(server.base, '/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@test.local', password },
  });
  assert.equal(login.status, 200);
  return login.cookie;
}

function createProduct(server, cookie, overrides = {}) {
  return call(server.base, '/api/products', {
    method: 'POST',
    cookie,
    body: { ...sampleProduct, ...overrides },
  });
}

async function registerCustomer(server, email = 'an@test.local') {
  const res = await call(server.base, '/api/auth/register', {
    method: 'POST',
    body: { name: 'An', email, password: 'secret123' },
  });
  assert.equal(res.status, 201);
  return res.cookie;
}

describe('health endpoints', () => {
  it('liveness is 200 even when the database is down', async () => {
    const pool = { query: async () => { throw new Error('db down'); } };
    const server = await startServer(pool, { init: false });
    try {
      const res = await call(server.base, '/health/live');
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
      const res = await call(server.base, '/health/ready');
      assert.equal(res.status, 503);
      assert.deepEqual(res.body.checks, { database: 'down' });
    } finally {
      await server.close();
    }
  });

  it('readiness is 200 when the database is reachable', async () => {
    const server = await startServer(createMemPool());
    try {
      const res = await call(server.base, '/health/ready');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.checks, { database: 'up' });
    } finally {
      await server.close();
    }
  });
});

describe('auth', () => {
  let server;
  beforeEach(async () => { server = await startServer(createMemPool()); });
  afterEach(async () => { await server.close(); });

  it('registers, exposes me, and logs out', async () => {
    const reg = await call(server.base, '/api/auth/register', {
      method: 'POST',
      body: { name: 'An', email: 'an@test.local', password: 'secret123' },
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.data.email, 'an@test.local');
    assert.ok(reg.cookie);

    const me = await call(server.base, '/api/auth/me', { cookie: reg.cookie });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.name, 'An');

    const logout = await call(server.base, '/api/auth/logout', { method: 'POST', cookie: reg.cookie });
    assert.equal(logout.status, 204);

    const after = await call(server.base, '/api/auth/me', { cookie: reg.cookie });
    assert.equal(after.status, 401);
  });

  it('rejects duplicate emails and wrong passwords', async () => {
    const body = { name: 'An', email: 'an@test.local', password: 'secret123' };
    await call(server.base, '/api/auth/register', { method: 'POST', body });

    const duplicate = await call(server.base, '/api/auth/register', { method: 'POST', body });
    assert.equal(duplicate.status, 409);

    const wrong = await call(server.base, '/api/auth/login', {
      method: 'POST',
      body: { email: 'an@test.local', password: 'wrong-password' },
    });
    assert.equal(wrong.status, 401);
  });

  it('validates registration input', async () => {
    const res = await call(server.base, '/api/auth/register', {
      method: 'POST',
      body: { name: '', email: 'not-an-email', password: '123' },
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.details.length >= 3);
  });
});

describe('products API', () => {
  let server;
  let admin;
  beforeEach(async () => {
    server = await startServer(createMemPool());
    admin = await seedAdmin(server);
  });
  afterEach(async () => { await server.close(); });

  it('blocks guests from modifying products', async () => {
    const create = await call(server.base, '/api/products', { method: 'POST', body: sampleProduct });
    assert.equal(create.status, 401);

    const update = await call(server.base, '/api/products/1', { method: 'PUT', body: sampleProduct });
    assert.equal(update.status, 401);

    const remove = await call(server.base, '/api/products/1', { method: 'DELETE' });
    assert.equal(remove.status, 401);
  });

  it('lets admin create a product and shows it in the public list afterwards', async () => {
    const before = await call(server.base, '/api/products');
    assert.deepEqual(before.body.data, []);

    const created = await createProduct(server, admin);
    assert.equal(created.status, 201);
    assert.equal(created.body.data.name, 'Air Runner');
    assert.equal(created.body.data.image_url, '/images/air-runner.svg');
    assert.deepEqual(created.body.data.sizes, ['40', '41', '42']);

    const after = await call(server.base, '/api/products');
    assert.equal(after.body.data.length, 1);
    assert.equal(after.body.data[0].price, 2500000);
  });

  it('rejects invalid payloads without writing data', async () => {
    const res = await createProduct(server, admin, { name: '', brand: 'Nike', price: -5 });
    assert.equal(res.status, 400);
    assert.ok(res.body.details.length >= 2);

    const list = await call(server.base, '/api/products');
    assert.deepEqual(list.body.data, []);
  });

  it('reads, updates and deletes a product', async () => {
    const created = await createProduct(server, admin);
    const id = created.body.data.id;

    const got = await call(server.base, `/api/products/${id}`);
    assert.equal(got.status, 200);
    assert.equal(got.body.data.brand, 'Nike');

    const updated = await call(server.base, `/api/products/${id}`, {
      method: 'PUT',
      cookie: admin,
      body: { ...sampleProduct, name: 'Air Runner 2', price: 3000000, sizes: ['40'] },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.name, 'Air Runner 2');
    assert.deepEqual(updated.body.data.sizes, ['40']);

    const deleted = await call(server.base, `/api/products/${id}`, { method: 'DELETE', cookie: admin });
    assert.equal(deleted.status, 204);

    const missing = await call(server.base, `/api/products/${id}`);
    assert.equal(missing.status, 404);
  });

  it('filters by name, brand, size, price and paginates', async () => {
    await createProduct(server, admin, { name: 'Air Runner', brand: 'Nike', price: 2500000, sizes: ['40', '41'] });
    await createProduct(server, admin, { name: 'Ultra Boost', brand: 'Adidas', price: 3000000, sizes: ['42'] });
    await createProduct(server, admin, { name: 'Runner Lite', brand: 'Adidas', price: 1500000, sizes: ['40'] });

    const byName = await call(server.base, '/api/products?q=runner');
    assert.equal(byName.body.data.length, 2);

    const byBrand = await call(server.base, '/api/products?brand=adidas');
    assert.equal(byBrand.body.data.length, 2);

    const bySize = await call(server.base, '/api/products?size=40');
    assert.equal(bySize.body.data.length, 2);

    const byPrice = await call(server.base, '/api/products?minPrice=2000000&maxPrice=2600000');
    assert.equal(byPrice.body.data.length, 1);
    assert.equal(byPrice.body.data[0].name, 'Air Runner');

    const paged = await call(server.base, '/api/products?limit=2&page=2');
    assert.equal(paged.body.data.length, 1);
    assert.equal(paged.body.total, 3);
    assert.equal(paged.body.pages, 2);
  });

  it('returns 400 for malformed ids and invalid query values', async () => {
    assert.equal((await call(server.base, '/api/products/abc')).status, 400);
    assert.equal((await call(server.base, '/api/products/999')).status, 404);
    assert.equal((await call(server.base, '/api/products?page=0')).status, 400);
    assert.equal((await call(server.base, '/api/products?minPrice=abc')).status, 400);
  });
});

describe('cart API', () => {
  let server;
  let admin;
  beforeEach(async () => {
    server = await startServer(createMemPool());
    admin = await seedAdmin(server);
  });
  afterEach(async () => { await server.close(); });

  it('adds, updates and removes cart items with correct totals', async () => {
    const product = await createProduct(server, admin, { price: 100000, sizes: ['40', '41'] });
    const id = product.body.data.id;

    const added = await call(server.base, '/api/cart', {
      method: 'POST',
      body: { productId: id, size: '40', qty: 2 },
    });
    assert.equal(added.status, 201);
    assert.equal(added.body.data.total, 200000);
    const cookie = added.cookie;

    const addedAgain = await call(server.base, '/api/cart', {
      method: 'POST',
      cookie,
      body: { productId: id, size: '40', qty: 1 },
    });
    assert.equal(addedAgain.body.data.count, 3);

    const patched = await call(server.base, '/api/cart', {
      method: 'PATCH',
      cookie,
      body: { productId: id, size: '40', qty: 5 },
    });
    assert.equal(patched.body.data.total, 500000);

    const removed = await call(server.base, `/api/cart?productId=${id}&size=40`, {
      method: 'DELETE',
      cookie,
    });
    assert.equal(removed.body.data.count, 0);
  });

  it('rejects sizes that the product does not offer and invalid quantities', async () => {
    const product = await createProduct(server, admin, { sizes: ['40'] });
    const id = product.body.data.id;

    const badSize = await call(server.base, '/api/cart', {
      method: 'POST',
      body: { productId: id, size: '99', qty: 1 },
    });
    assert.equal(badSize.status, 400);

    const badQty = await call(server.base, '/api/cart', {
      method: 'POST',
      body: { productId: id, size: '40', qty: 0 },
    });
    assert.equal(badQty.status, 400);
  });
});

describe('orders API', () => {
  let server;
  let admin;
  beforeEach(async () => {
    server = await startServer(createMemPool());
    admin = await seedAdmin(server);
  });
  afterEach(async () => { await server.close(); });

  async function placeOrder() {
    const product = await createProduct(server, admin, { price: 100000, sizes: ['40'] });
    const customer = await registerCustomer(server);
    const added = await call(server.base, '/api/cart', {
      method: 'POST',
      cookie: customer,
      body: { productId: product.body.data.id, size: '40', qty: 2 },
    });
    assert.equal(added.status, 201);

    const order = await call(server.base, '/api/orders', {
      method: 'POST',
      cookie: customer,
      body: {
        customer_name: 'An',
        phone: '0901234567',
        address: '123 Đường ABC',
        payment_method: 'cod',
      },
    });
    return { customer, order };
  }

  it('checks out the cart, clears it and lists the order', async () => {
    const { customer, order } = await placeOrder();

    assert.equal(order.status, 201);
    assert.equal(order.body.data.total, 200000);
    assert.equal(order.body.data.items.length, 1);
    assert.equal(order.body.data.items[0].qty, 2);

    const cart = await call(server.base, '/api/cart', { cookie: customer });
    assert.equal(cart.body.data.count, 0);

    const list = await call(server.base, '/api/orders', { cookie: customer });
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].id, order.body.data.id);
    assert.equal(list.body.data[0].items.length, 1);
  });

  it('requires login and a non-empty cart', async () => {
    const guest = await call(server.base, '/api/orders', { method: 'POST', body: {} });
    assert.equal(guest.status, 401);

    const customer = await registerCustomer(server);
    const empty = await call(server.base, '/api/orders', {
      method: 'POST',
      cookie: customer,
      body: {
        customer_name: 'An',
        phone: '0901234567',
        address: '123 Đường ABC',
        payment_method: 'cod',
      },
    });
    assert.equal(empty.status, 400);
  });

  it('lets admin list and update orders, but not customers', async () => {
    const { customer } = await placeOrder();

    const forbidden = await call(server.base, '/api/admin/orders', { cookie: customer });
    assert.equal(forbidden.status, 403);

    const list = await call(server.base, '/api/admin/orders', { cookie: admin });
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);

    const id = list.body.data[0].id;
    const patched = await call(server.base, `/api/admin/orders/${id}`, {
      method: 'PATCH',
      cookie: admin,
      body: { status: 'confirmed' },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.status, 'confirmed');

    const bad = await call(server.base, `/api/admin/orders/${id}`, {
      method: 'PATCH',
      cookie: admin,
      body: { status: 'unknown' },
    });
    assert.equal(bad.status, 400);
  });
});

describe('web UI', () => {
  it('serves the app shell at /', async () => {
    const server = await startServer(createMemPool());
    try {
      const res = await fetch(`${server.base}/`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      assert.match(await res.text(), /Giày<span>Store<\/span>/);
    } finally {
      await server.close();
    }
  });
});
