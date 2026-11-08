import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hex] = String(stored).split(':');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const derived = await scryptAsync(password, salt, expected.length || 64);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

export async function ensureAdmin(pool, email, password) {
  const normalized = email.trim().toLowerCase();
  const existing = await pool.query('SELECT id, role FROM users WHERE email = $1', [normalized]);

  if (existing.rows.length) {
    if (existing.rows[0].role !== 'admin') {
      await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [existing.rows[0].id]);
    }
    return;
  }

  const hash = await hashPassword(password);
  await pool.query(
    "INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Admin', 'admin')",
    [normalized, hash],
  );
}
