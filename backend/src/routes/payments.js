const express = require('express');
const { z } = require('zod');

const { createPaymentIntent, confirmPaymentIntent, getOrder } = require('../repo');
const { httpError } = require('../errors');

const paymentsRouter = express.Router();

paymentsRouter.post('/intent', (req, res) => {
  const schema = z.object({ orderId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw httpError(400, 'INVALID_BODY', 'Body invalide');

  const provider = process.env.PAYMENT_PROVIDER || 'mock';
  const result = createPaymentIntent({ orderId: parsed.data.orderId, provider });

  if (!result.ok) {
    const mapping = {
      ORDER_NOT_FOUND: [404, 'ORDER_NOT_FOUND', 'Commande introuvable'],
      ORDER_NOT_PAYABLE: [409, 'ORDER_NOT_PAYABLE', 'Commande non payable'],
    };
    const [status, code, msg] = mapping[result.reason] || [400, 'PAYMENT_INTENT_ERROR', 'Erreur paiement'];
    throw httpError(status, code, msg);
  }

  // Mock: clientSecret is just the id.
  res.status(201).json({
    provider,
    paymentIntentId: result.paymentIntentId,
    clientSecret: `mock_${result.paymentIntentId}`,
  });
});

paymentsRouter.post('/confirm', (req, res) => {
  const schema = z.object({ paymentIntentId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw httpError(400, 'INVALID_BODY', 'Body invalide');

  const result = confirmPaymentIntent({ paymentIntentId: parsed.data.paymentIntentId });
  if (!result.ok) {
    const mapping = {
      PAYMENT_INTENT_NOT_FOUND: [404, 'PAYMENT_INTENT_NOT_FOUND', 'Intent introuvable'],
      PAYMENT_INTENT_NOT_CONFIRMABLE: [409, 'PAYMENT_INTENT_NOT_CONFIRMABLE', 'Intent non confirmable'],
    };
    const [status, code, msg] = mapping[result.reason] || [400, 'PAYMENT_CONFIRM_ERROR', 'Erreur confirmation'];
    throw httpError(status, code, msg);
  }

  const order = getOrder(result.orderId);
  res.json({ order });
});

module.exports = { paymentsRouter };
