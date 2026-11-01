import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'eventsphere_db',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
});

export default pool;