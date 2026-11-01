
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pool from './db.js';

dotenv.config();

async function createAdmin() {
  try {
    const name = process.env.ADMIN_NAME;
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!name || !email || !password || !process.env.JWT_SECRET) {
      throw new Error('Missing ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, or JWT_SECRET in .env');
    }

    if (password.length < 12) {
      throw new Error('Please use an administrator password with at least 12 characters.');
    }

    const existingAdmin = await pool.query(
      'SELECT id FROM admin_users WHERE email = $1',
      [email]
    );

    if (existingAdmin.rows.length > 0) {
      console.log('Administrator account already exists.');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO admin_users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)`,
      [name, email, passwordHash, 'admin']
    );

    console.log('Administrator account created successfully.');
    console.log(`Email: ${email}`);
  } catch (error) {
    console.error('Admin setup failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createAdmin();
