const express = require('express');
const { z } = require('zod');

const { listProducts, getProductById } = require('../repo');
const { httpError } = require('../errors');

const productsRouter = express.Router();

productsRouter.get('/', (req, res) => {
  const schema = z.object({ type: z.enum(['veg', 'meat']).optional() });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) throw httpError(400, 'INVALID_QUERY', 'Query invalide');

  const products = listProducts({ type: parsed.data.type });
  res.json({ products });
});

productsRouter.get('/:id', (req, res) => {
  const schema = z.object({ id: z.string().uuid() });
  const parsed = schema.safeParse(req.params);
  if (!parsed.success) throw httpError(400, 'INVALID_PARAMS', 'Paramètres invalides');

  const product = getProductById(parsed.data.id);
  if (!product) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Produit introuvable');

  res.json({ product });
});

module.exports = { productsRouter };
