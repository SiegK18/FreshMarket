const path = require('path');
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');

let db;

function getDb() {
  if (!db) throw new Error('DB_NOT_INITIALIZED');
  return db;
}

function resolveDbPath() {
  const configured = process.env.DB_PATH || './data/marketfresh.sqlite';
  if (path.isAbsolute(configured)) return configured;
  return path.join(process.cwd(), configured);
}

function migrate() {
  const database = getDb();
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('veg','meat')),
      name TEXT NOT NULL,
      description TEXT,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      unit TEXT NOT NULL,
      origin TEXT NOT NULL,
      freshness_date TEXT NOT NULL, -- YYYY-MM-DD (récolte / découpe)
      stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meat_details (
      product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
      storage_min_c REAL NOT NULL,
      storage_max_c REAL NOT NULL,
      max_hours_outside_cold_chain INTEGER NOT NULL,
      cold_chain_required INTEGER NOT NULL DEFAULT 1 CHECK (cold_chain_required IN (0,1))
    );

    CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('open','checked_out','cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      PRIMARY KEY (cart_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      cart_id TEXT NOT NULL REFERENCES carts(id),
      status TEXT NOT NULL CHECK (status IN ('pending_payment','paid','cancelled')),
      total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      delivery_address TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
      PRIMARY KEY (order_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS payment_intents (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('requires_confirmation','succeeded','failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_products_type_active ON products(type, is_active);
    CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  `);
}

function seedIfEmpty() {
  const database = getDb();
  const count = database.prepare('SELECT COUNT(1) AS n FROM products').get().n;
  if (count > 0) return;

  const insertProduct = database.prepare(`
    INSERT INTO products (id, type, name, description, price_cents, unit, origin, freshness_date, stock_qty, is_active)
    VALUES (@id, @type, @name, @description, @price_cents, @unit, @origin, @freshness_date, @stock_qty, 1)
  `);

  const insertMeat = database.prepare(`
    INSERT INTO meat_details (product_id, storage_min_c, storage_max_c, max_hours_outside_cold_chain, cold_chain_required)
    VALUES (@product_id, @storage_min_c, @storage_max_c, @max_hours_outside_cold_chain, 1)
  `);

  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  const twoDaysAgo = new Date(today.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const fiveDaysAgo = new Date(today.getTime() - 5 * 86400000).toISOString().slice(0, 10);

  const veg = [
    {
      id: randomUUID(),
      type: 'veg',
      name: 'Carottes',
      description: 'Carottes locales, croquantes.',
      price_cents: 250,
      unit: 'kg',
      origin: 'Ferme des Prés - 32',
      freshness_date: twoDaysAgo,
      stock_qty: 25,
    },
    {
      id: randomUUID(),
      type: 'veg',
      name: 'Tomates',
      description: 'Tomates de saison.',
      price_cents: 390,
      unit: 'kg',
      origin: 'Domaine du Soleil - 34',
      freshness_date: fiveDaysAgo,
      stock_qty: 18,
    },
  ];

  const meat = [
    {
      id: randomUUID(),
      type: 'meat',
      name: 'Steak haché',
      description: 'Bœuf - 2 x 125g',
      price_cents: 650,
      unit: 'pack',
      origin: 'Élevage du Bocage - 49',
      freshness_date: iso,
      stock_qty: 40,
      meat_details: {
        storage_min_c: 0,
        storage_max_c: 4,
        max_hours_outside_cold_chain: 2,
      },
    },
    {
      id: randomUUID(),
      type: 'meat',
      name: 'Escalopes de poulet',
      description: 'Poulet - 500g',
      price_cents: 890,
      unit: 'barquette',
      origin: 'Ferme des Volailles - 85',
      freshness_date: twoDaysAgo,
      stock_qty: 22,
      meat_details: {
        storage_min_c: 0,
        storage_max_c: 4,
        max_hours_outside_cold_chain: 2,
      },
    },
  ];

  const tx = database.transaction(() => {
    for (const p of veg) insertProduct.run(p);
    for (const p of meat) {
      insertProduct.run(p);
      insertMeat.run({ product_id: p.id, ...p.meat_details });
    }
  });

  tx();
}

async function initDb() {
  if (db) return;
  const dbPath = resolveDbPath();
  db = new Database(dbPath);
  migrate();
  seedIfEmpty();
}

module.exports = {
  initDb,
  getDb,
};
