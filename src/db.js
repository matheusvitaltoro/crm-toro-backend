const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') || process.env.DATABASE_URL?.includes('render')
    ? { rejectUnauthorized: false }
    : false,
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      instance_name TEXT UNIQUE,
      whatsapp_status TEXT DEFAULT 'disconnected',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      company TEXT DEFAULT '',
      role TEXT DEFAULT '',
      email TEXT DEFAULT '',
      value INTEGER DEFAULT 0,
      source TEXT DEFAULT 'Manual',
      stage INTEGER DEFAULT 0,
      custom_fields JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS timeline (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      direction TEXT DEFAULT 'sent',
      text TEXT NOT NULL,
      wpp_message_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS custom_field_defs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hidden_builtin_fields (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      PRIMARY KEY (user_id, field_key)
    );
  `);
  console.log('✓ Banco de dados pronto');
}

module.exports = { pool, migrate };
