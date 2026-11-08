import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;

export function createPool(connectionString) {
  return new Pool({ connectionString, max: 10 });
}

export async function createMemoryPool() {
  const { newDb } = await import('pg-mem');
  const db = newDb();
  const { Pool: MemoryPool } = db.adapters.createPg();
  return new MemoryPool();
}

export async function initDb(pool) {
  const schema = await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
}

export async function seedDemoProducts(pool) {
  const { rows } = await pool.query('SELECT COUNT(*) AS total FROM products');
  if (Number(rows[0].total) > 0) return;

  const demo = [
    {
      name: 'Air Runner',
      brand: 'Nike',
      price: 2500000,
      image_url: '/images/air-runner.svg',
      description: 'Giày chạy bộ nhẹ, đệm êm cho mọi cung đường.',
      sizes: ['40', '41', '42'],
      colors: ['Đen', 'Trắng'],
    },
    {
      name: 'Ultra Boost',
      brand: 'Adidas',
      price: 3200000,
      image_url: '/images/ultra-boost.svg',
      description: 'Đệm Boost đàn hồi, phù hợp chạy dài.',
      sizes: ['39', '40', '41', '42'],
      colors: ['Đen', 'Xám'],
    },
    {
      name: 'Classic Canvas',
      brand: 'Converse',
      price: 1200000,
      image_url: '/images/classic-canvas.svg',
      description: 'Giày vải cổ điển, dễ phối đồ.',
      sizes: ['38', '39', '40', '41'],
      colors: ['Trắng', 'Đen'],
    },
    {
      name: 'Samba OG',
      brand: 'Adidas',
      price: 2800000,
      image_url: '/images/samba-og.svg',
      description: 'Thiết kế retro, phù hợp đi hằng ngày.',
      sizes: ['40', '41', '42'],
      colors: ['Trắng', 'Xanh'],
    },
    {
      name: 'Chuck 70',
      brand: 'Converse',
      price: 1800000,
      image_url: '/images/chuck-70.svg',
      description: 'Cổ cao, chất liệu canvas dày.',
      sizes: ['39', '40', '41'],
      colors: ['Đen', 'Kem'],
    },
    {
      name: 'Running Pro',
      brand: 'Bitis',
      price: 990000,
      image_url: '/images/running-pro.svg',
      description: 'Giày thể thao trong nước, giá tốt.',
      sizes: ['39', '40', '41', '42'],
      colors: ['Xanh', 'Đen'],
    },
  ];

  for (const item of demo) {
    await pool.query(
      `INSERT INTO products (name, brand, price, image_url, description, sizes, colors)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        item.name,
        item.brand,
        item.price,
        item.image_url,
        item.description,
        `,${item.sizes.join(',')},`,
        `,${item.colors.join(',')},`,
      ],
    );
  }
}
