import { Router } from 'express';
import { hashPassword, publicUser, verifyPassword } from '../auth.js';

export function createAuthRouter({ pool }) {
  const router = Router();

  router.post('/register', async (req, res) => {
    const { name, email, password } = req.body ?? {};
    const errors = [];

    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName || cleanName.length > 80) errors.push('name is required (1-80 chars)');

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 160) {
      errors.push('email is invalid');
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      errors.push('password must be 8-128 chars');
    }

    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const exists = await pool.query('SELECT 1 FROM users WHERE email = $1', [cleanEmail]);
    if (exists.rowCount) return res.status(409).json({ error: 'Email already registered' });

    const hash = await hashPassword(password);

    try {
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
         RETURNING id, email, name, role`,
        [cleanEmail, hash, cleanName],
      );
      req.session.user = publicUser(rows[0]);
      res.status(201).json({ data: req.session.user });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Email already registered' });
      throw error;
    }
  });

  router.post('/login', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!rows.length || !(await verifyPassword(password, rows[0].password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.session.user = publicUser(rows[0]);
    res.json({ data: req.session.user });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.status(204).end();
    });
  });

  router.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ data: req.session.user });
  });

  return router;
}
