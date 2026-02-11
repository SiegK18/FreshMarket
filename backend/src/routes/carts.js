const express = require('express');
const { z } = require('zod');

const { createCart, getCart, setCartItem, removeCartItem } = require('../repo');
const { httpError } = require('../errors');

const cartsRouter = express.Router();

cartsRouter.post('/', (req, res) => {
  const cart = createCart();
  res.status(201).json({ cartId: cart.id });
});

cartsRouter.get('/:id', (req, res) => {
  const schema = z.object({ id: z.string().uuid() });
  const parsed = schema.safeParse(req.params);
  if (!parsed.success) throw httpError(400, 'INVALID_PARAMS', 'Paramètres invalides');

  const cart = getCart(parsed.data.id);
  if (!cart) throw httpError(404, 'CART_NOT_FOUND', 'Panier introuvable');

  res.json({ cart });
});

cartsRouter.put('/:id/items', (req, res) => {
  const paramsSchema = z.object({ id: z.string().uuid() });
  const bodySchema = z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() });

  const params = paramsSchema.safeParse(req.params);
  if (!params.success) throw httpError(400, 'INVALID_PARAMS', 'Paramètres invalides');

  const body = bodySchema.safeParse(req.body);
  if (!body.success) throw httpError(400, 'INVALID_BODY', 'Body invalide');

  const result = setCartItem({
    cartId: params.data.id,
    productId: body.data.productId,
    quantity: body.data.quantity,
  });

  if (!result.ok) {
    const mapping = {
      CART_NOT_FOUND: [404, 'CART_NOT_FOUND', 'Panier introuvable'],
      CART_NOT_OPEN: [409, 'CART_NOT_OPEN', 'Panier non modifiable'],
      PRODUCT_NOT_FOUND: [404, 'PRODUCT_NOT_FOUND', 'Produit introuvable'],
      INSUFFICIENT_STOCK: [409, 'INSUFFICIENT_STOCK', 'Stock insuffisant'],
    };
    const [status, code, msg] = mapping[result.reason] || [400, 'CART_ITEM_ERROR', 'Erreur panier'];
    throw httpError(status, code, msg);
  }

  const cart = getCart(params.data.id);
  res.json({ cart });
});

cartsRouter.delete('/:id/items/:productId', (req, res) => {
  const schema = z.object({ id: z.string().uuid(), productId: z.string().uuid() });
  const parsed = schema.safeParse(req.params);
  if (!parsed.success) throw httpError(400, 'INVALID_PARAMS', 'Paramètres invalides');

  const result = removeCartItem({ cartId: parsed.data.id, productId: parsed.data.productId });
  if (!result.ok) {
    const mapping = {
      CART_NOT_FOUND: [404, 'CART_NOT_FOUND', 'Panier introuvable'],
      CART_NOT_OPEN: [409, 'CART_NOT_OPEN', 'Panier non modifiable'],
    };
    const [status, code, msg] = mapping[result.reason] || [400, 'CART_ITEM_ERROR', 'Erreur panier'];
    throw httpError(status, code, msg);
  }

  const cart = getCart(parsed.data.id);
  res.json({ cart });
});

module.exports = { cartsRouter };
