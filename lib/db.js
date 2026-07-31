const { Pool } = require('pg');

// Neon requiere SSL. La cadena de conexión viene de la variable DATABASE_URL
// que Neon te da al crear el proyecto (Dashboard > Connection string).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Crea las tablas si no existen. Se llama una vez al arrancar el servidor.
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      chat_id TEXT NOT NULL,
      client_name TEXT,
      requested_when TEXT,
      service_name TEXT,
      price INTEGER,
      extra_detail JSONB DEFAULT '{}'::jsonb,
      status TEXT DEFAULT 'pendiente',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Por si la tabla ya existía de una versión anterior sin estas columnas
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_name TEXT`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS price INTEGER`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS extra_detail JSONB DEFAULT '{}'::jsonb`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_state (
      chat_id TEXT PRIMARY KEY,
      step TEXT NOT NULL,
      data JSONB DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log('Base de datos (Neon) lista: tablas verificadas/creadas');
}

async function getState(chatId) {
  const { rows } = await pool.query(
    'SELECT step, data FROM conversation_state WHERE chat_id = $1',
    [chatId]
  );
  if (rows.length === 0) return null;
  return { step: rows[0].step, data: rows[0].data };
}

async function setState(chatId, step, data = {}) {
  await pool.query(
    `INSERT INTO conversation_state (chat_id, step, data, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (chat_id) DO UPDATE
       SET step = EXCLUDED.step, data = EXCLUDED.data, updated_at = NOW()`,
    [chatId, step, JSON.stringify(data)]
  );
}

async function clearState(chatId) {
  await pool.query('DELETE FROM conversation_state WHERE chat_id = $1', [chatId]);
}

async function saveAppointment(chatId, clientName, requestedWhen, serviceName, price, extraDetail = {}) {
  const { rows } = await pool.query(
    `INSERT INTO appointments (chat_id, client_name, requested_when, service_name, price, extra_detail)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [chatId, clientName, requestedWhen, serviceName, price, JSON.stringify(extraDetail)]
  );
  return rows[0].id;
}

async function listAppointments() {
  const { rows } = await pool.query(
    'SELECT * FROM appointments ORDER BY created_at DESC'
  );
  return rows;
}

module.exports = { initDb, getState, setState, clearState, saveAppointment, listAppointments };
