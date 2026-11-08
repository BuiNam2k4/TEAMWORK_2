import { loadConfig } from '../src/config.js';
import { createPool, initDb } from '../src/db.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

await initDb(pool);

const before = await pool.query('SELECT id, name, brand, price FROM products ORDER BY id');
console.log(`\nBEFORE (${before.rowCount} sản phẩm):`);
console.table(before.rows);

const inserted = await pool.query(
  `INSERT INTO products (name, brand, price, description)
   VALUES ($1, $2, $3, $4)
   RETURNING id, name, brand, price`,
  ['Demo Runner', 'DemoBrand', 990000, 'Sản phẩm tạo bởi scripts/demo.mjs'],
);
console.log('\nINSERTED:');
console.table(inserted.rows);

const after = await pool.query('SELECT id, name, brand, price FROM products ORDER BY id');
console.log(`\nAFTER (${after.rowCount} sản phẩm):`);
console.table(after.rows);

await pool.end();
