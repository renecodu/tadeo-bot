// ============================================================================
// Conexión a la base de datos (Neon Postgres en Vercel)
// ============================================================================
// Vercel inyecta solo la cadena de conexión como variable de entorno al
// conectar la base al proyecto. Probamos los nombres más comunes que crea
// la integración de Neon.
//
// Diseño defensivo: si NO hay base configurada, isConfigured() devuelve false
// y el resto del código sigue funcionando como antes (el bot no se rompe).
// ============================================================================

const { neon } = require('@neondatabase/serverless');

function getConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_PRISMA_URL ||
    null
  );
}

function isConfigured() {
  return !!getConnectionString();
}

// Devuelve el cliente SQL de Neon. Se usa como template:  await sql`SELECT 1`
// o con texto directo / parámetros:  await sql('SELECT $1', [valor])
function getSql() {
  const cs = getConnectionString();
  if (!cs) {
    throw new Error(
      'No hay base de datos configurada (falta DATABASE_URL / POSTGRES_URL).'
    );
  }
  return neon(cs);
}

module.exports = { getSql, isConfigured, getConnectionString };
