// ============================================================================
// Esquema de base de datos de Tadeo
// ============================================================================
// Define QUÉ recuerda Tadeo de cada familia. Cada bloque es un "cajón de memoria".
// Pensado para Postgres (Neon en Vercel).
//
// Cómo se conecta todo:
//   un USUARIO (papá/mamá que paga)  ->  tiene uno o más NIÑOS
//   un NIÑO  ->  tiene CONVERSACIONES, MENSAJES y EVENTOS (la bitácora)
//
// Cada elemento del array STATEMENTS es una instrucción que se ejecuta al
// preparar la base. Todas usan "IF NOT EXISTS", así que es seguro correrlas
// varias veces: si la tabla ya existe, no pasa nada.
// ============================================================================

const STATEMENTS = [
  // --------------------------------------------------------------------------
  // USUARIOS — el papá o mamá que paga la suscripción
  // Identidad interina por dispositivo (dispositivo_id) hasta que haya login
  // con Hotmart, momento en que se completa email/hotmart_codigo.
  // --------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS usuarios (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dispositivo_id  TEXT,                           -- identidad interina (navegador)
    email           TEXT UNIQUE,                    -- se completa al integrar Hotmart
    nombre          TEXT,
    hotmart_codigo  TEXT UNIQUE,                    -- identificador del suscriptor en Hotmart
    estado          TEXT NOT NULL DEFAULT 'trial',  -- 'trial' | 'activo' | 'cancelado'
    trial_termina   TIMESTAMPTZ,                    -- fin de los 3 días gratis
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  // Migraciones idempotentes para bases que ya existían con el esquema viejo:
  `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dispositivo_id TEXT`,
  `ALTER TABLE usuarios ALTER COLUMN email DROP NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_dispositivo ON usuarios(dispositivo_id)`,

  // --------------------------------------------------------------------------
  // NIÑOS — cada hijo/a registrado (un usuario puede tener varios)
  // --------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS ninos (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id        BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre            TEXT,           -- nullable: se descubre durante la conversación
    fecha_nacimiento  DATE,
    perfil            TEXT,           -- notas del papá: diagnóstico, medicación, etc.
    -- *** El corazón de la "memoria del niño" ***
    -- Resumen rodante que Tadeo mantiene y reinyecta en cada conversación
    -- (en vez del historial completo, para controlar costos).
    perfil_resumen    TEXT,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  // Migración idempotente: en bases viejas, nombre era obligatorio.
  `ALTER TABLE ninos ALTER COLUMN nombre DROP NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_ninos_usuario ON ninos(usuario_id)`,

  // --------------------------------------------------------------------------
  // CONVERSACIONES — cada hilo de chat con Tadeo
  // --------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS conversaciones (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nino_id     BIGINT NOT NULL REFERENCES ninos(id) ON DELETE CASCADE,
    titulo      TEXT,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conversaciones_nino ON conversaciones(nino_id)`,

  // --------------------------------------------------------------------------
  // MENSAJES — cada mensaje dentro de una conversación (da continuidad)
  // --------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS mensajes (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversacion_id  BIGINT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
    rol              TEXT NOT NULL,   -- 'user' (papá) | 'assistant' (Tadeo)
    contenido        TEXT NOT NULL,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion ON mensajes(conversacion_id)`,

  // --------------------------------------------------------------------------
  // EVENTOS — la BITÁCORA estructurada (base de los reportes colegio/médico)
  // --------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS eventos (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nino_id      BIGINT NOT NULL REFERENCES ninos(id) ON DELETE CASCADE,
    tipo         TEXT NOT NULL,       -- 'crisis' | 'colegio' | 'medicacion' | 'logro' | 'sueno' | ...
    descripcion  TEXT NOT NULL,
    intensidad   SMALLINT,            -- 1 a 5 (opcional), para detectar patrones
    fecha_evento DATE NOT NULL DEFAULT CURRENT_DATE,
    etiquetas    JSONB DEFAULT '[]'::jsonb,
    creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_eventos_nino ON eventos(nino_id)`,
  `CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos(fecha_evento)`
];

module.exports = { STATEMENTS };
