// Konfiguracja bazy danych Neon
const { Pool } = require('pg');

// Użyj zmiennej środowiskowej w produkcji, fallback do hardcoded w development
const connectionString = process.env.DATABASE_URL || 
  'postgresql://asystent_owner:npg_l5AZrIXmOu7D@ep-red-salad-a28d0d0e-pooler.eu-central-1.aws.neon.tech/asystent?sslmode=require';

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool; 