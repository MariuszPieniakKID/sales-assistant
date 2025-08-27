#!/usr/bin/env node
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function main() {
  try {
    const email = process.env.EMAIL || process.argv[2];
    const password = process.env.PASSWORD || process.argv[3];
    const firstName = process.env.FIRST_NAME || process.argv[4] || 'User';
    const lastName = process.env.LAST_NAME || process.argv[5] || 'Auto';
    const phone = process.env.PHONE || null;
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      console.error('Missing DATABASE_URL env. Abort.');
      process.exit(1);
    }

    if (!email || !password) {
      console.error('Usage: EMAIL=... PASSWORD=... node scripts/create-user.js');
      console.error('Or: node scripts/create-user.js <email> <password> [firstName] [lastName]');
      process.exit(1);
    }

    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });

    const client = await pool.connect();
    try {
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length) {
        console.log(`User already exists: ${email} (id=${existing.rows[0].id})`);
        process.exit(0);
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const result = await client.query(
        'INSERT INTO users (first_name, last_name, email, phone, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, email',
        [firstName, lastName, email, phone, passwordHash]
      );

      console.log(`Created user: ${result.rows[0].email} (id=${result.rows[0].id})`);
    } finally {
      client.release();
      await pool.end();
    }
  } catch (err) {
    console.error('Error creating user:', err.message);
    process.exit(1);
  }
}

main();


