// Konfiguracja bazy danych Neon
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://asystent_owner:npg_l5AZrIXmOu7D@ep-red-salad-a28d0d0e-pooler.eu-central-1.aws.neon.tech/asystent?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool; 