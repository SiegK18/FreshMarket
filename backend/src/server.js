const http = require('http');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT || 4000);

async function main() {
  const app = await createApp();
  const server = http.createServer(app);

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[backend] listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[backend] fatal:', err);
  process.exit(1);
});
