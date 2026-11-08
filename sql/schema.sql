CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  brand       TEXT NOT NULL,
  price       INTEGER NOT NULL CHECK (price >= 0),
  image_url   TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
