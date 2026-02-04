import { Pool } from 'pg';
import { logger } from './logger.js';

const databaseUrl = process.env.DATABASE_URL;

export const db = databaseUrl
  ? new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  })
  : null;

export async function query(text, params) {
  if (!db) {
    throw new Error('DATABASE_URL not set');
  }
  return db.query(text, params);
}

export async function withDb(fn) {
  if (!db) return null;
  try {
    return await fn(db);
  } catch (error) {
    logger.error('DB error:', error);
    throw error;
  }
}
