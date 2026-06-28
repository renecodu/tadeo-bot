// ============================================================================
// Memoria de Tadeo
// ============================================================================
// Guarda las conversaciones en la base y mantiene un "perfil_resumen" rodante
// de cada niño, que se reinyecta en cada conversación para que Tadeo recuerde
// a la familia sin tener que reenviar todo el historial (control de costos).
//
// IDENTIDAD (interino): mientras no haya login con Hotmart, identificamos a
// cada familia por un "dispositivo_id" (un código que el navegador guarda).
// Cuando llegue el login, ese mismo usuario se vincula a su email/Hotmart.
//
// TODO en este módulo es "a prueba de fallos": si la base falla, las funciones
// devuelven null o no hacen nada, y el chat sigue respondiendo igual que antes.
// ============================================================================

const { getSql, isConfigured } = require('./db');

// Cada cuántos mensajes (guardados) refrescamos el resumen del niño.
// Más alto = menos llamadas extra a la IA = más barato.
const REFRESCAR_RESUMEN_CADA = 6;

// ----------------------------------------------------------------------------
// Abre/crea el registro de la familia y guarda el último mensaje del usuario.
// Devuelve el "estado" que el resto de funciones necesitan, o null si no se
// pudo (sin base, sin dispositivo_id, o error).
// ----------------------------------------------------------------------------
async function abrirMemoria(dispositivoId, ultimoMensajeUsuario) {
  if (!isConfigured() || !dispositivoId) return null;

  try {
    const sql = getSql();

    // 1) Usuario (por dispositivo). Lo crea si no existe.
    const u = await sql(
      `INSERT INTO usuarios (dispositivo_id)
       VALUES ($1)
       ON CONFLICT (dispositivo_id) DO UPDATE SET actualizado_en = now()
       RETURNING id`,
      [dispositivoId]
    );
    const usuarioId = u[0].id;

    // 2) Niño (uno por familia en esta etapa). Lo crea si no existe.
    let ninos = await sql(
      `SELECT id, nombre, perfil_resumen FROM ninos WHERE usuario_id = $1 ORDER BY id LIMIT 1`,
      [usuarioId]
    );
    let nino;
    if (ninos.length === 0) {
      const creado = await sql(
        `INSERT INTO ninos (usuario_id) VALUES ($1) RETURNING id, nombre, perfil_resumen`,
        [usuarioId]
      );
      nino = creado[0];
    } else {
      nino = ninos[0];
    }

    // 3) Conversación (reusamos la más reciente; si no hay, creamos).
    let convs = await sql(
      `SELECT id FROM conversaciones WHERE nino_id = $1 ORDER BY id DESC LIMIT 1`,
      [nino.id]
    );
    let conversacionId;
    if (convs.length === 0) {
      const cc = await sql(
        `INSERT INTO conversaciones (nino_id) VALUES ($1) RETURNING id`,
        [nino.id]
      );
      conversacionId = cc[0].id;
    } else {
      conversacionId = convs[0].id;
    }

    // 4) Guardamos el mensaje nuevo del usuario.
    if (ultimoMensajeUsuario && ultimoMensajeUsuario.trim()) {
      await sql(
        `INSERT INTO mensajes (conversacion_id, rol, contenido) VALUES ($1, 'user', $2)`,
        [conversacionId, ultimoMensajeUsuario]
      );
    }

    return {
      sql,
      ninoId: nino.id,
      conversacionId,
      nombre: nino.nombre,
      perfilResumen: nino.perfil_resumen
    };
  } catch (err) {
    console.error('⚠️ memory.abrirMemoria falló:', err.message);
    return null;
  }
}

// ----------------------------------------------------------------------------
// Construye el bloque de "memoria de la familia" que se inyecta en el prompt.
// Es chico y va DESPUÉS del prompt grande cacheado, así no rompe el ahorro.
// ----------------------------------------------------------------------------
function bloqueDeMemoria(estado) {
  if (!estado) return null;
  const partes = [];
  if (estado.nombre) partes.push(`El niño/a se llama ${estado.nombre}.`);
  if (estado.perfilResumen) partes.push(estado.perfilResumen);
  if (partes.length === 0) return null;

  return (
    '=== MEMORIA DE ESTA FAMILIA (lo que recuerdas de conversaciones anteriores) ===\n' +
    partes.join('\n') +
    '\n=== FIN MEMORIA ===\n' +
    'Usa esta memoria con naturalidad, como alguien que ya conoce a esta familia. ' +
    'No la recites textual ni digas "según mi memoria"; simplemente recuerda.'
  );
}

// ----------------------------------------------------------------------------
// Guarda la respuesta de Tadeo y, cada cierto tiempo, refresca el resumen del
// niño con una llamada barata a la IA. Nunca rompe el flujo si algo falla.
// ----------------------------------------------------------------------------
async function cerrarMemoria(estado, respuestaAsistente, historialCompleto) {
  if (!estado) return;
  const { sql, conversacionId, ninoId } = estado;

  // Guardar la respuesta del asistente
  try {
    if (respuestaAsistente && respuestaAsistente.trim()) {
      await sql(
        `INSERT INTO mensajes (conversacion_id, rol, contenido) VALUES ($1, 'assistant', $2)`,
        [conversacionId, respuestaAsistente]
      );
    }
  } catch (err) {
    console.error('⚠️ memory.cerrarMemoria (guardar respuesta) falló:', err.message);
  }

  // ¿Toca refrescar el resumen?
  try {
    const r = await sql(
      `SELECT count(*)::int AS n
       FROM mensajes m JOIN conversaciones c ON c.id = m.conversacion_id
       WHERE c.nino_id = $1`,
      [ninoId]
    );
    const total = r[0].n;
    if (total >= REFRESCAR_RESUMEN_CADA && total % REFRESCAR_RESUMEN_CADA === 0) {
      const resumen = await generarResumen(historialCompleto);
      if (resumen && resumen.perfil_resumen) {
        await sql(
          `UPDATE ninos
             SET perfil_resumen = $1,
                 nombre = COALESCE($2, nombre),
                 actualizado_en = now()
           WHERE id = $3`,
          [resumen.perfil_resumen, resumen.nombre || null, ninoId]
        );
      }
    }
  } catch (err) {
    console.error('⚠️ memory.cerrarMemoria (resumen) falló:', err.message);
  }
}

// ----------------------------------------------------------------------------
// Genera/actualiza el resumen del niño a partir de la conversación.
// Usa Haiku (barato) y pide SOLO un JSON. Si algo falla, devuelve null.
// ----------------------------------------------------------------------------
async function generarResumen(historialCompleto) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  // Tomamos solo los últimos mensajes para no encarecer la llamada.
  const ultimos = (historialCompleto || []).slice(-20);
  const texto = ultimos
    .map((m) => `${m.role === 'user' ? 'Padre/Madre' : 'Tadeo'}: ${m.content}`)
    .join('\n');
  if (!texto.trim()) return null;

  const instruccion =
    'A partir de esta conversación entre un padre/madre y Tadeo (copiloto de TDAH), ' +
    'devolvé SOLO un JSON válido, sin texto adicional, con esta forma:\n' +
    '{"nombre": <nombre del niño/a si se mencionó, o null>, ' +
    '"perfil_resumen": <resumen breve (máx 120 palabras) de lo importante para recordar: ' +
    'edad, diagnóstico, qué le pasa al niño, qué funciona, qué no, patrones, contexto familiar>}\n\n' +
    'Conversación:\n' +
    texto;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        messages: [{ role: 'user', content: instruccion }]
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const salida = data.content && data.content[0] && data.content[0].text;
    if (!salida) return null;

    // Extraemos el JSON aunque venga con texto alrededor.
    const match = salida.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (err) {
    console.error('⚠️ memory.generarResumen falló:', err.message);
    return null;
  }
}

module.exports = { abrirMemoria, bloqueDeMemoria, cerrarMemoria };
