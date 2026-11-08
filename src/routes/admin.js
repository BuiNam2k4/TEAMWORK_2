import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { parseId } from '../http.js';
import { withItems } from './orders.js';

const STATUSES = ['pending', 'confirmed', 'shipping', 'done', 'cancelled'];
const ORDER_COLUMNS =
  'id, user_id, customer_name, phone, address, note, payment_method, status, total, created_at';

export function createAdminRouter({ pool }) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/orders', async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
    }

    const values = [];
    const where = status ? ' WHERE status = $1' : '';
    if (status) values.push(status);

    const { rows } = await pool.query(
      `SELECT ${ORDER_COLUMNS} FROM orders${where} ORDER BY id DESC`,
      values,
    );
    res.json({ data: await withItems(pool, rows) });
  });

  router.patch('/orders/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid order id' });

    const status = req.body?.status;
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
    }

    const { rows } = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING id, status',
      [status, id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    res.json({ data: rows[0] });
  });

  return router;
}
