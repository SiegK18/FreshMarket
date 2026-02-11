const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');

const { initDb } = require('./db');
const { apiRouter } = require('./routes');

async function createApp() {
  dotenv.config();
  await initDb();

  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', apiRouter);

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });

  // error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = Number(err.status || 500);
    const code = err.code || 'INTERNAL_ERROR';

    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error('[backend] error:', err);
    }

    res.status(status).json({ error: code, message: err.message });
  });

  return app;
}

module.exports = { createApp };
