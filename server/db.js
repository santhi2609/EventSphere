
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

console.log('DATABASE_URL exists:', Boolean(process.env.DATABASE_URL));
console.log(
  'DATABASE_URL hostname:',
  process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL).hostname
    : 'MISSING'
);

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'eventsphere_db',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
    });

// Set the schema for every new Neon connection
if (process.env.DATABASE_URL) {
  pool.on('connect', (client) => {
    client.query('SET search_path TO public').catch((err) => {
      console.error('Failed to set database schema:', err.message);
    });
  });
}

export default pool;
