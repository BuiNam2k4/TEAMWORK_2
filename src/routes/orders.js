import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { loadCart } from '../cart.js';
import { parseId } from '../http.js';

const PAYMENTS = new Set(['cod', 'bank']);
const ORDER_COLUMNS =
  'id, user_id, customer_name, phone, address, note, payment_method, status, total, created_at';

export function createOrdersRouter({ pool }) {
  const router = Router();
  router.use(requireAuth);

  router.post('/', async (req, res) => {
    const { errors, value } = parseOrder(req.body ?? {});
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const cart = await loadCart(pool, req.session);
    if (!cart.items.length) return res.status(400).json({ error: 'Cart is empty' });

    const client = await pool.connect();
    let orderId;
    try {
      await client.query('BEGIN');
      const orderResult = await client.query(
        `INSERT INTO orders (user_id, customer_name, phone, address, note, payment_method, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          req.session.user.id,
          value.customerName,
          value.phone,
          value.address,
          value.note,
          value.paymentMethod,
          cart.total,
        ],
      );
      orderId = orderResult.rows[0].id;

      for (const item of cart.items) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, name, size, price, qty)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, item.productId, item.name, item.size, item.price, item.qty],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    req.session.cart = {};
    res.status(201).location(`/api/orders/${orderId}`).json({ data: await findOrder(pool, orderId) });
  });

  router.get('/', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${ORDER_COLUMNS} FROM orders WHERE user_id = $1 ORDER BY id DESC`,
      [req.session.user.id],
    );
    res.json({ data: await withItems(pool, rows) });
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid order id' });

    const order = await findOrder(pool, id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.user_id !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ data: order });
  });

  return router;
}

export async function findOrder(pool, id) {
  const { rows } = await pool.query(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1`, [id]);
  if (!rows.length) return null;
  const [order] = await withItems(pool, rows);
  return order;
}

export async function withItems(pool, orders) {
  if (!orders.length) return [];

  const ids = orders.map((order) => order.id);
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
  const { rows: items } = await pool.query(
    `SELECT order_id, product_id, name, size, price, qty
     FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`,
    ids,
  );

  const itemsByOrder = new Map();
  for (const item of items) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id).push(item);
  }

  return orders.map((order) => ({
    ...order,
    total: Number(order.total),
    items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
      ...item,
      price: Number(item.price),
      qty: Number(item.qty),
    })),
  }));
}

function parseOrder(body) {
  const errors = [];

  const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
  if (!customerName || customerName.length > 120) {
    errors.push('customer_name is required (1-120 chars)');
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!/^[0-9+() .-]{8,20}$/.test(phone)) errors.push('phone is invalid');

  const address = typeof body.address === 'string' ? body.address.trim() : '';
  if (address.length < 5 || address.length > 300) errors.push('address must be 5-300 chars');

  const note = body.note == null || body.note === '' ? null : String(body.note).trim();
  if (note && note.length > 500) errors.push('note must be at most 500 chars');

  const paymentMethod = body.payment_method;
  if (!PAYMENTS.has(paymentMethod)) errors.push('payment_method must be cod or bank');

  return { errors, value: { customerName, phone, address, note, paymentMethod } };
}
