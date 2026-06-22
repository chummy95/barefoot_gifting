-- Barefoot Gifting — database schema (Postgres / Vercel Postgres / Neon)
-- Run once via `npm run db:init`, or paste into your DB's SQL console.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer', -- 'admin' | 'customer'
  phone         TEXT,
  address       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,         -- Greeting Cards | Barefoot Bits | Little Luxes | Stationery | ...
  price       INTEGER NOT NULL,      -- price in Naira (kobo = price*100 when sent to Paystack)
  description TEXT,
  stock       INTEGER NOT NULL DEFAULT 0,
  customizable BOOLEAN NOT NULL DEFAULT false, -- Little Luxes: allow text/upload customization
  badge       TEXT,                  -- 'New' | 'Bestseller' | 'Fan Fave' | null
  status      TEXT NOT NULL DEFAULT 'published', -- 'published' | 'draft'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_images (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  alt        TEXT,
  position   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS posts (
  id         SERIAL PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,
  title      TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'Keepsake Edit',
  excerpt    TEXT,
  body_html  TEXT NOT NULL DEFAULT '',
  author     TEXT NOT NULL DEFAULT 'Barefoot Gifting Team',
  read_time  TEXT,
  status     TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_images (
  id       SERIAL PRIMARY KEY,
  post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url      TEXT NOT NULL,
  alt      TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

-- Media library (all uploaded images: product photos, blog images, etc.)
CREATE TABLE IF NOT EXISTS media (
  id         SERIAL PRIMARY KEY,
  url        TEXT NOT NULL,
  filename   TEXT NOT NULL,
  mime_type  TEXT,
  size_bytes INTEGER,
  alt        TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id),
  email        TEXT NOT NULL,
  name         TEXT NOT NULL,
  phone        TEXT,
  address      TEXT,
  city         TEXT,
  state        TEXT,
  country      TEXT,
  subtotal     INTEGER NOT NULL,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'NGN',
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | paid | processing | shipped | delivered | cancelled | failed
  payment_ref  TEXT UNIQUE,                     -- Paystack transaction reference
  payment_status TEXT NOT NULL DEFAULT 'unpaid',-- unpaid | paid | failed
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER REFERENCES products(id),
  name          TEXT NOT NULL,
  price         INTEGER NOT NULL,
  qty           INTEGER NOT NULL DEFAULT 1,
  image         TEXT,
  customization JSONB -- { "text": "...", "uploadUrl": "..." } for Little Luxes
);

CREATE TABLE IF NOT EXISTS comments (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  post_id    TEXT,                  -- for Keepsake Edit blog post comments
  user_id    INTEGER REFERENCES users(id),
  name       TEXT NOT NULL,
  email      TEXT,
  rating     INTEGER,               -- 1-5, product reviews only
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | approved | spam | trash
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Generic key/value settings: Paystack public key, store info, API toggles, etc.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

INSERT INTO settings (key, value) VALUES
  ('paystack_public_key', ''),
  ('paystack_enabled', 'false'),
  ('free_delivery_threshold', '45000'),
  ('delivery_fee', '2500'),
  ('store_name', 'Barefoot Gifting')
ON CONFLICT (key) DO NOTHING;
