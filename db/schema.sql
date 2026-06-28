-- ============================================================================
-- Esquema de base de datos de Tadeo
-- ============================================================================
-- Define QUÉ recuerda Tadeo de cada familia. Cada tabla es un "cajón de memoria".
-- Pensado para Postgres (Vercel Postgres / Neon / Supabase).
--
-- Cómo se conecta todo:
--   un USUARIO (papá/mamá que paga)  ->  tiene uno o más NIÑOS
--   un NIÑO  ->  tiene CONVERSACIONES, MENSAJES y EVENTOS (la bitácora)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- USUARIOS — el papá o mamá que paga la suscripción
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email              TEXT UNIQUE NOT NULL,        -- viene de Hotmart al comprar
  nombre             TEXT,
  -- Datos de Hotmart para saber quién pagó y si la suscripción sigue activa:
  hotmart_codigo     TEXT UNIQUE,                 -- identificador del suscriptor en Hotmart
  estado             TEXT NOT NULL DEFAULT 'trial', -- 'trial' | 'activo' | 'cancelado'
  trial_termina      TIMESTAMPTZ,                 -- fin de los 3 días gratis
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- NIÑOS — cada hijo/a que el papá registra (puede tener más de uno)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ninos (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id         BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre             TEXT NOT NULL,
  fecha_nacimiento   DATE,                        -- para calcular la edad
  -- Notas de perfil que el papá comparte (diagnóstico, medicación, etc.):
  perfil             TEXT,
  -- *** El corazón de la "memoria del niño" ***
  -- Resumen rodante que Tadeo mantiene y actualiza: qué funciona, qué no,
  -- patrones, contexto importante. Esto es lo que se reinyecta en cada
  -- conversación (en vez del historial completo, para controlar costos).
  perfil_resumen     TEXT,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ninos_usuario ON ninos(usuario_id);


-- ----------------------------------------------------------------------------
-- CONVERSACIONES — cada hilo de chat con Tadeo
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversaciones (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nino_id            BIGINT NOT NULL REFERENCES ninos(id) ON DELETE CASCADE,
  titulo             TEXT,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversaciones_nino ON conversaciones(nino_id);


-- ----------------------------------------------------------------------------
-- MENSAJES — cada mensaje dentro de una conversación (lo que da continuidad)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mensajes (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversacion_id    BIGINT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  rol                TEXT NOT NULL,               -- 'user' (papá) | 'assistant' (Tadeo)
  contenido          TEXT NOT NULL,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion ON mensajes(conversacion_id);


-- ----------------------------------------------------------------------------
-- EVENTOS — la BITÁCORA estructurada (base de los reportes para colegio/médico)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventos (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nino_id            BIGINT NOT NULL REFERENCES ninos(id) ON DELETE CASCADE,
  tipo               TEXT NOT NULL,               -- 'crisis' | 'colegio' | 'medicacion' | 'logro' | 'sueno' | ...
  descripcion        TEXT NOT NULL,
  intensidad         SMALLINT,                    -- 1 a 5 (opcional), para detectar patrones
  fecha_evento       DATE NOT NULL DEFAULT CURRENT_DATE,
  etiquetas          JSONB DEFAULT '[]'::jsonb,   -- tags flexibles para análisis de patrones
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eventos_nino ON eventos(nino_id);
CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos(fecha_evento);
