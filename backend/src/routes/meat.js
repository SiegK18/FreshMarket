const express = require('express');
const { z } = require('zod');

const { computeColdChainForCart } = require('../repo');
const { httpError } = require('../errors');

const meatRouter = express.Router();

// Sprint B: résumé chaîne du froid pour un panier
meatRouter.get('/cold-chain/:cartId', (req, res) => {
  const schema = z.object({ cartId: z.string().uuid() });
  const parsed = schema.safeParse(req.params);
  if (!parsed.success) throw httpError(400, 'INVALID_PARAMS', 'Paramètres invalides');

  const result = computeColdChainForCart(parsed.data.cartId);
  if (!result) throw httpError(404, 'CART_NOT_FOUND', 'Panier introuvable');

  res.json(result);
});

module.exports = { meatRouter };
