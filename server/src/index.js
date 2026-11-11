// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { migrate } from '../scripts/migrate.js';
import { seed } from '../scripts/seed.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { pool, query } from './db.js';
import { license, PRODUCT } from './license.js';

async function main() {
  await migrate();
  if (config.demoMode) {
    const { rows } = await query('select count(*)::int as n from users');
    if (rows[0].n === 0) {
      await seed();
      console.log('empty database, loaded demo data');
    }
  }

  const server = createApp().listen(config.port, () => {
    console.log(`${PRODUCT} listening on :${config.port} (${license.mode} build, demo mode ${config.demoMode ? 'on' : 'off'})`);
  });

  const shutdown = () => {
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
