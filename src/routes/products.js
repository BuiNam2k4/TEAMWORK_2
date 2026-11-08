import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { PRODUCT_COLUMNS, parseProduct, serializeProduct } from '../products.js';
import { parseId, parsePositiveInt, parseNonNegativeInt } from '../http.js';

const DEFAULT_LIMIT = 12;
const SIZE_PATTERN = /^[A-Za-z0-9 .+/-]{1,10}$/;

export function createProductsRouter({ pool }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const brand = typeof req.query.brand === 'string' ? req.query.brand.trim() : '';
    const size = typeof req.query.size === 'string' ? req.query.size.trim() : '';
    const minPrice = parseNonNegativeInt(req.query.minPrice);
    const maxPrice = parseNonNegativeInt(req.query.maxPrice);
    const page = parsePositiveInt(req.query.page, 1, 1_000_000);
    const limit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT, 60);

    if (size && !SIZE_PATTERN.test(size)) {
      return res.status(400).json({ error: 'Invalid size' });
    }
    if (minPrice === null || maxPrice === null) {
      return res.status(400).json({ error: 'minPrice and maxPrice must be non-negative integers' });
    }
    if (page === null || limit === null) {
      return res.status(400).json({ error: 'page must be >= 1 and limit between 1 and 60' });
    }

    const clauses = [];
    const values = [];
    if (q) {
      values.push(`%${q}%`);
      clauses.push(`LOWER(name) LIKE LOWER($${values.length})`);
    }
    if (brand) {
      values.push(`%${brand}%`);
      clauses.push(`LOWER(brand) LIKE LOWER($${values.length})`);
    }
    if (size) {
      values.push(`%,${size},%`);
      clauses.push(`sizes LIKE $${values.length}`);
    }
    if (minPrice !== undefined) {
      values.push(minPrice);
      clauses.push(`price >= $${values.length}`);
    }
    if (maxPrice !== undefined) {
      values.push(maxPrice);
      clauses.push(`price <= $${values.length}`);
    }

    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM products${where}`,
      values,
    );
    const total = Number(countResult.rows[0].total);
    const offset = (page - 1) * limit;
    const { rows } = await pool.query(
      `SELECT ${PRODUCT_COLUMNS} FROM products${where}
       ORDER BY id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );

    res.json({
      data: rows.map(serializeProduct),
      page,
      limit,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / limit),
    });
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid product id' });

    const { rows } = await pool.query(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1`,
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json({ data: serializeProduct(rows[0]) });
  });

  router.post('/', requireAdmin, async (req, res) => {
    const { errors, value } = parseProduct(req.body ?? {});
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const { rows } = await pool.query(
      `INSERT INTO products (name, brand, price, image_url, description, sizes, colors)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${PRODUCT_COLUMNS}`,
      [value.name, value.brand, value.price, value.imageUrl, value.description, value.sizes, value.colors],
    );
    res.status(201).location(`/api/products/${rows[0].id}`).json({ data: serializeProduct(rows[0]) });
  });

  router.put('/:id', requireAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid product id' });

    const { errors, value } = parseProduct(req.body ?? {});
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const { rows } = await pool.query(
      `UPDATE products
       SET name = $1, brand = $2, price = $3, image_url = $4, description = $5, sizes = $6, colors = $7
       WHERE id = $8
       RETURNING ${PRODUCT_COLUMNS}`,
      [
        value.name,
        value.brand,
        value.price,
        value.imageUrl,
        value.description,
        value.sizes,
        value.colors,
        id,
      ],
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json({ data: serializeProduct(rows[0]) });
  });

  router.delete('/:id', requireAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid product id' });

    const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Product not found' });
    res.status(204).end();
  });

  return router;
}
