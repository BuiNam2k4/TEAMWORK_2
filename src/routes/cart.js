import { Router } from 'express';
import { cartKey, loadCart } from '../cart.js';
import { PRODUCT_COLUMNS, serializeProduct } from '../products.js';
import { parseId } from '../http.js';

const SIZE_PATTERN = /^[A-Za-z0-9 .+/-]*$/;

export function createCartRouter({ pool }) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json({ data: await loadCart(pool, req.session) });
  });

  router.post('/', async (req, res) => {
    const productId = parseId(req.body?.productId);
    const qty = parseQty(req.body?.qty, { allowZero: false });
    const size = normalizeSize(req.body?.size);

    if (productId === null || qty === null || size === undefined) {
      return res.status(400).json({ error: 'productId, size and qty (1-99) are required' });
    }

    const { rows } = await pool.query(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1`,
      [productId],
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });

    const product = serializeProduct(rows[0]);
    if (product.sizes.length && !product.sizes.includes(size)) {
      return res.status(400).json({ error: 'Invalid size for this product' });
    }

    req.session.cart ??= {};
    const key = cartKey(productId, size);
    const current = req.session.cart[key]?.qty ?? 0;
    const next = current + qty;
    if (next > 99) {
      return res.status(400).json({ error: 'Quantity per item is limited to 99' });
    }
    req.session.cart[key] = { productId, size, qty: next };

    res.status(201).json({ data: await loadCart(pool, req.session) });
  });

  router.patch('/', async (req, res) => {
    const productId = parseId(req.body?.productId);
    const qty = parseQty(req.body?.qty, { allowZero: true });
    const size = normalizeSize(req.body?.size);

    if (productId === null || qty === null || size === undefined) {
      return res.status(400).json({ error: 'productId, size and qty (0-99) are required' });
    }

    const key = cartKey(productId, size);
    if (!req.session.cart?.[key]) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    if (qty === 0) delete req.session.cart[key];
    else req.session.cart[key].qty = qty;

    res.json({ data: await loadCart(pool, req.session) });
  });

  router.delete('/', async (req, res) => {
    const productId = parseId(req.query.productId);
    const size = normalizeSize(req.query.size);
    if (productId === null || size === undefined) {
      return res.status(400).json({ error: 'productId and size are required' });
    }

    const key = cartKey(productId, size);
    if (req.session.cart) delete req.session.cart[key];
    res.json({ data: await loadCart(pool, req.session) });
  });

  router.delete('/all', (req, res) => {
    req.session.cart = {};
    res.json({ data: { items: [], total: 0, count: 0 } });
  });

  return router;
}

function parseQty(value, { allowZero }) {
  let qty = Number.NaN;
  if (typeof value === 'number') qty = value;
  else if (typeof value === 'string' && /^\d+$/.test(value.trim())) qty = Number(value.trim());
  if (!Number.isInteger(qty) || qty < (allowZero ? 0 : 1) || qty > 99) return null;
  return qty;
}

function normalizeSize(value) {
  if (value == null) return '';
  const size = String(value).trim();
  if (size.length > 10 || !SIZE_PATTERN.test(size)) return undefined;
  return size;
}
