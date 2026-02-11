const express = require('express');
const { z } = require('zod');

const { createOrder, getOrder } = require('../repo');
const { httpError } = require('../errors');

const ordersRouter = express.Router();

ordersRouter.post('/', (req, res) => {
  const schema = z.object({
    cartId: z.string().uuid(),
    customer: z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().min(1).optional(),
      deliveryAddress: z.string().min(5),
    }),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw httpError(400, 'INVALID_BODY', 'Body invalide');

  const result = createOrder({ cartId: parsed.data.cartId, customer: parsed.data.customer });
  if (!result.ok) {
    const mapping = {
      CART_NOT_FOUND: [404, 'CART_NOT_FOUND', 'Panier introuvable'],
      CART_NOT_OPEN: [409, 'CART_NOT_OPEN', 'Panier non modifiable'],
      CART_EMPTY: [409, 'CART_EMPTY', 'Panier vide'],
      INSUFFICIENT_STOCK: [409, 'INSUFFICIENT_STOCK', 'Stock insuffisant'],
    };
    const [status, code, msg] = mapping[result.reason] || [400, 'ORDER_CREATE_ERROR', 'Erreur création commande'];
    throw httpError(status, code, msg);
  }

  const order = getOrder(result.orderId);
  res.status(201).json({ order });
});

ordersRouter.get('/:id', (req, res) => {
  const schema = z.object({ id: z.string().uuid() });
  const parsed = schema.safeParse(req.params);
  if (!parsed.success) throw httpError(400, 'INVALID_PARAMS', 'Paramètres invalides');

  const order = getOrder(parsed.data.id);
  if (!order) throw httpError(404, 'ORDER_NOT_FOUND', 'Commande introuvable');

  res.json({ order });
});

module.exports = { ordersRouter };
