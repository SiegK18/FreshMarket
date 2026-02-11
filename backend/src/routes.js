const express = require('express');

const { productsRouter } = require('./routes/products');
const { cartsRouter } = require('./routes/carts');
const { ordersRouter } = require('./routes/orders');
const { paymentsRouter } = require('./routes/payments');
const { meatRouter } = require('./routes/meat');

const apiRouter = express.Router();

apiRouter.use('/products', productsRouter);
apiRouter.use('/carts', cartsRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/meat', meatRouter);

module.exports = { apiRouter };
