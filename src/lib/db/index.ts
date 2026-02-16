import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://notifications:notifications_dev_password@localhost:5437/notifications';

// Create connection pool
const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });

export async function closeDbConnection(): Promise<void> {
  await pool.end();
  console.log('Database connection closed');
}
