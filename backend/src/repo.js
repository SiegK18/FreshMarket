const { randomUUID } = require('crypto');
const { getDb } = require('./db');
const { daysSince } = require('./util');

function mapProductRow(row) {
  if (!row) return null;
  const freshnessDays = daysSince(row.freshness_date);
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    unit: row.unit,
    origin: row.origin,
    freshnessDate: row.freshness_date,
    freshnessDays,
    stockQty: row.stock_qty,
    isActive: Boolean(row.is_active),
  };
}

function listProducts({ type } = {}) {
  const db = getDb();
  const where = ['is_active = 1'];
  const params = {};
  if (type) {
    where.push('type = @type');
    params.type = type;
  }
  const rows = db
    .prepare(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY created_at DESC`)
    .all(params);
  return rows.map(mapProductRow);
}

function getProductById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(id);
  const product = mapProductRow(row);
  if (!product) return null;

  if (product.type === 'meat') {
    const meat = db
      .prepare(
        'SELECT storage_min_c, storage_max_c, max_hours_outside_cold_chain, cold_chain_required FROM meat_details WHERE product_id = ?'
      )
      .get(id);
    if (meat) {
      product.coldChain = {
        required: Boolean(meat.cold_chain_required),
        storageMinC: meat.storage_min_c,
        storageMaxC: meat.storage_max_c,
        maxHoursOutside: meat.max_hours_outside_cold_chain,
      };
    }
  }

  return product;
}

function createCart() {
  const db = getDb();
  const id = randomUUID();
  db.prepare('INSERT INTO carts (id, status) VALUES (?, ?)').run(id, 'open');
  return { id };
}

function getCart(cartId) {
  const db = getDb();
  const cart = db.prepare('SELECT id, status, created_at FROM carts WHERE id = ?').get(cartId);
  if (!cart) return null;

  const items = db
    .prepare(
      `
      SELECT ci.product_id, ci.quantity, p.type, p.name, p.price_cents, p.unit, p.origin, p.freshness_date
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
      ORDER BY p.created_at DESC
    `
    )
    .all(cartId);

  const mappedItems = items.map((r) => ({
    productId: r.product_id,
    quantity: r.quantity,
    product: {
      id: r.product_id,
      type: r.type,
      name: r.name,
      priceCents: r.price_cents,
      unit: r.unit,
      origin: r.origin,
      freshnessDate: r.freshness_date,
      freshnessDays: daysSince(r.freshness_date),
    },
    lineTotalCents: r.price_cents * r.quantity,
  }));

  const totalCents = mappedItems.reduce((sum, it) => sum + it.lineTotalCents, 0);

  return {
    id: cart.id,
    status: cart.status,
    createdAt: cart.created_at,
    items: mappedItems,
    totalCents,
  };
}

function assertCartOpen(cartId) {
  const db = getDb();
  const cart = db.prepare('SELECT id, status FROM carts WHERE id = ?').get(cartId);
  if (!cart) return { ok: false, reason: 'CART_NOT_FOUND' };
  if (cart.status !== 'open') return { ok: false, reason: 'CART_NOT_OPEN' };
  return { ok: true };
}

function setCartItem({ cartId, productId, quantity }) {
  const db = getDb();
  const cartCheck = assertCartOpen(cartId);
  if (!cartCheck.ok) return cartCheck;

  const product = db
    .prepare('SELECT id, stock_qty, is_active FROM products WHERE id = ?')
    .get(productId);
  if (!product || product.is_active !== 1) return { ok: false, reason: 'PRODUCT_NOT_FOUND' };
  if (quantity > product.stock_qty) return { ok: false, reason: 'INSUFFICIENT_STOCK' };

  db.prepare(
    `
    INSERT INTO cart_items (cart_id, product_id, quantity)
    VALUES (@cart_id, @product_id, @quantity)
    ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity=excluded.quantity
  `
  ).run({ cart_id: cartId, product_id: productId, quantity });

  return { ok: true };
}

function removeCartItem({ cartId, productId }) {
  const db = getDb();
  const cartCheck = assertCartOpen(cartId);
  if (!cartCheck.ok) return cartCheck;

  db.prepare('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?').run(cartId, productId);
  return { ok: true };
}

function computeColdChainForCart(cartId) {
  const db = getDb();
  const cart = getCart(cartId);
  if (!cart) return null;

  const meatProductIds = cart.items
    .filter((it) => it.product.type === 'meat')
    .map((it) => it.productId);

  if (meatProductIds.length === 0) {
    return { hasMeat: false, requirements: null };
  }

  const rows = db
    .prepare(
      `
      SELECT md.storage_min_c, md.storage_max_c, md.max_hours_outside_cold_chain
      FROM meat_details md
      WHERE md.product_id IN (${meatProductIds.map(() => '?').join(',')})
    `
    )
    .all(...meatProductIds);

  const storageMinC = Math.max(...rows.map((r) => r.storage_min_c));
  const storageMaxC = Math.min(...rows.map((r) => r.storage_max_c));
  const maxHoursOutside = Math.min(...rows.map((r) => r.max_hours_outside_cold_chain));

  return {
    hasMeat: true,
    requirements: {
      storageMinC,
      storageMaxC,
      maxHoursOutside,
      note: "Chaîne du froid requise (produits viande).",
    },
  };
}

function createOrder({ cartId, customer }) {
  const db = getDb();

  const cartCheck = assertCartOpen(cartId);
  if (!cartCheck.ok) return { ok: false, reason: cartCheck.reason };

  const cart = getCart(cartId);
  if (!cart) return { ok: false, reason: 'CART_NOT_FOUND' };
  if (cart.items.length === 0) return { ok: false, reason: 'CART_EMPTY' };

  // Re-check stock (simple, no reservation in this MVP)
  for (const item of cart.items) {
    const p = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(item.productId);
    if (!p || item.quantity > p.stock_qty) return { ok: false, reason: 'INSUFFICIENT_STOCK' };
  }

  const orderId = randomUUID();

  const tx = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO orders (id, cart_id, status, total_cents, customer_name, customer_email, customer_phone, delivery_address)
      VALUES (@id, @cart_id, 'pending_payment', @total_cents, @customer_name, @customer_email, @customer_phone, @delivery_address)
    `
    ).run({
      id: orderId,
      cart_id: cartId,
      total_cents: cart.totalCents,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone || null,
      delivery_address: customer.deliveryAddress,
    });

    const insertItem = db.prepare(
      `
      INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
      VALUES (@order_id, @product_id, @quantity, @unit_price_cents)
    `
    );

    for (const item of cart.items) {
      insertItem.run({
        order_id: orderId,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price_cents: item.product.priceCents,
      });

      // decrement stock
      db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?').run(
        item.quantity,
        item.productId
      );
    }

    db.prepare("UPDATE carts SET status='checked_out' WHERE id = ?").run(cartId);
  });

  tx();

  return { ok: true, orderId };
}

function getOrder(orderId) {
  const db = getDb();
  const order = db
    .prepare(
      'SELECT id, cart_id, status, total_cents, customer_name, customer_email, customer_phone, delivery_address, created_at FROM orders WHERE id = ?'
    )
    .get(orderId);
  if (!order) return null;

  const items = db
    .prepare(
      `
      SELECT oi.product_id, oi.quantity, oi.unit_price_cents, p.type, p.name, p.unit, p.origin, p.freshness_date
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `
    )
    .all(orderId);

  return {
    id: order.id,
    cartId: order.cart_id,
    status: order.status,
    totalCents: order.total_cents,
    customer: {
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
      deliveryAddress: order.delivery_address,
    },
    items: items.map((r) => ({
      productId: r.product_id,
      quantity: r.quantity,
      unitPriceCents: r.unit_price_cents,
      product: {
        id: r.product_id,
        type: r.type,
        name: r.name,
        unit: r.unit,
        origin: r.origin,
        freshnessDate: r.freshness_date,
        freshnessDays: daysSince(r.freshness_date),
      },
      lineTotalCents: r.unit_price_cents * r.quantity,
    })),
    createdAt: order.created_at,
  };
}

function createPaymentIntent({ orderId, provider }) {
  const db = getDb();
  const order = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(orderId);
  if (!order) return { ok: false, reason: 'ORDER_NOT_FOUND' };
  if (order.status !== 'pending_payment') return { ok: false, reason: 'ORDER_NOT_PAYABLE' };

  const id = randomUUID();
  db.prepare(
    `INSERT INTO payment_intents (id, provider, order_id, status)
     VALUES (?, ?, ?, 'requires_confirmation')`
  ).run(id, provider, orderId);

  return { ok: true, paymentIntentId: id };
}

function confirmPaymentIntent({ paymentIntentId }) {
  const db = getDb();
  const pi = db
    .prepare('SELECT id, order_id, status FROM payment_intents WHERE id = ?')
    .get(paymentIntentId);
  if (!pi) return { ok: false, reason: 'PAYMENT_INTENT_NOT_FOUND' };
  if (pi.status !== 'requires_confirmation') return { ok: false, reason: 'PAYMENT_INTENT_NOT_CONFIRMABLE' };

  const tx = db.transaction(() => {
    db.prepare("UPDATE payment_intents SET status='succeeded' WHERE id = ?").run(paymentIntentId);
    db.prepare("UPDATE orders SET status='paid' WHERE id = ?").run(pi.order_id);
  });

  tx();
  return { ok: true, orderId: pi.order_id };
}

module.exports = {
  listProducts,
  getProductById,
  createCart,
  getCart,
  setCartItem,
  removeCartItem,
  computeColdChainForCart,
  createOrder,
  getOrder,
  createPaymentIntent,
  confirmPaymentIntent,
};
