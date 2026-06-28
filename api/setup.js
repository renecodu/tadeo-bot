// ============================================================================
// Endpoint de preparación de la base de datos
// ============================================================================
// Visitá esta URL UNA vez (ej. https://tu-sitio/api/setup) para:
//   1. Verificar que la conexión a la base funciona.
//   2. Crear las tablas (los "cajones de memoria" de Tadeo).
//
// Es idempotente: podés visitarla varias veces sin riesgo (usa IF NOT EXISTS).
//
// Guardia opcional: si definís la variable de entorno SETUP_TOKEN en Vercel,
// hay que visitar /api/setup?token=ESE_VALOR. Si no la definís, queda abierto
// (igual solo crea tablas vacías, no expone datos).
// ============================================================================

const { getSql, isConfigured } = require('./db');
const { STATEMENTS } = require('../db/schema');

module.exports = async function handler(req, res) {
  // Guardia opcional por token
  const requiredToken = process.env.SETUP_TOKEN;
  if (requiredToken && req.query.token !== requiredToken) {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }

  if (!isConfigured()) {
    return res.status(500).json({
      ok: false,
      error:
        'La base de datos no está conectada. Revisá que Neon esté conectado al proyecto en Vercel (no se encontró DATABASE_URL).'
    });
  }

  const sql = getSql();

  try {
    // Crea cada tabla / índice (el cliente HTTP de Neon acepta el texto directo)
    for (const stmt of STATEMENTS) {
      await sql(stmt);
    }

    // Lista las tablas resultantes como confirmación
    const filas = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    return res.status(200).json({
      ok: true,
      mensaje: '✅ Base lista. Tablas creadas/verificadas.',
      tablas: filas.map((f) => f.table_name)
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
