import { PRODUCT_COLUMNS, serializeProduct } from './products.js';

export function cartKey(productId, size) {
  return `${productId}:${size ?? ''}`;
}

export async function loadCart(pool, session) {
  const cart = session.cart ?? {};
  const entries = Object.entries(cart);
  if (!entries.length) return { items: [], total: 0, count: 0 };

  const ids = [...new Set(entries.map(([, entry]) => entry.productId))];
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
  const { rows } = await pool.query(
    `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id IN (${placeholders})`,
    ids,
  );
  const byId = new Map(rows.map((row) => [row.id, serializeProduct(row)]));

  const items = [];
  let changed = false;
  for (const [key, entry] of entries) {
    const product = byId.get(entry.productId);
    if (!product) {
      delete cart[key];
      changed = true;
      continue;
    }
    items.push({
      key,
      productId: product.id,
      name: product.name,
      brand: product.brand,
      price: product.price,
      image_url: product.image_url,
      size: entry.size,
      qty: entry.qty,
      subtotal: product.price * entry.qty,
    });
  }
  if (changed) session.cart = cart;

  items.sort((a, b) => a.productId - b.productId || String(a.size).localeCompare(String(b.size)));
  return {
    items,
    total: items.reduce((sum, item) => sum + item.subtotal, 0),
    count: items.reduce((sum, item) => sum + item.qty, 0),
  };
}
