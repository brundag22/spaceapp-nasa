import 'dotenv/config';
import { createServer } from 'node:http';
import express from 'express';
import { createApp } from './app.js';
import { pool, closePool } from './db/pool.js';
import { applyMigrations } from './db/migrate.js';
import { seedInitialData } from './db/seed.js';
import { installRealtime } from './realtime/stomp.js';
import { startTelemetryScheduler, stopTelemetryScheduler } from './services/simulator.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDatabase(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      console.info(`Waiting for managed MySQL (attempt ${attempt}/18).`);
      await wait(2_000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Managed database was not available.');
}

async function main(): Promise<void> {
  await waitForDatabase();
  await applyMigrations();
  await seedInitialData();

  const app = createApp();
  const server = createServer(app);
  installRealtime(server);
  await startTelemetryScheduler();
  const port = Number(process.env.NODE_ENV === 'production' ? (process.env.PORT ?? 3000) : (process.env.API_PORT ?? 3001));
  server.listen(port, '0.0.0.0', () => console.info(`AstroCare API listening on ${port}.`));

  const shutdown = async () => {
    server.close();
    await stopTelemetryScheduler();
    await closePool();
    process.exit(0);
  };
  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
}

main().catch((error) => {
  console.error('AstroCare startup failed:', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
