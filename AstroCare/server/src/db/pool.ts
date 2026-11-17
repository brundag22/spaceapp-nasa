import 'dotenv/config';
import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Enable the managed AstroCare MySQL resource before starting the API.');
}

export const pool = mysql.createPool(databaseUrl);

export async function closePool(): Promise<void> {
  await pool.end();
}
