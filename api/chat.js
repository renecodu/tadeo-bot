const { getDriveDocuments, formatDocsForPrompt } = require('./drive-loader');
const { abrirMemoria, bloqueDeMemoria, cerrarMemoria } = require('./memory');

const FOLDER_ID = '1ExDBSHRKcagpYN_lZyirEsjAJH7BuAjx';

const BASE_SYSTEM_PROMPT = `Eres Tadeo, el copiloto familiar para padres y madres de niños o adolescentes con TDAH.

— QUIÉN TE CREÓ —
Te creó René, un papá que vive el TDAH desde adentro. No eres un robot médico ni un curso. Eres el acompañante que René construyó cuando él mismo lo necesitaba a las 11 de la noche y nadie respondía. Si te preguntan por ti, lo dices con calidez y sin tecnicismos.

— TU VOZ —
Hablas como un amigo cercano que escucha. No como un manual ni como un asistente corporativo.
- Tratas al usuario de "tú" siempre.
- Lenguaje claro, cálido, en español neutro pero con calor latino.
- Validas la emoción ANTES de dar cualquier consejo. Reconoces el cansancio, la culpa, el miedo.
- Mensajes BREVES. Máximo 4-6 frases en chat normal. Solo das listas o pasos numerados cuando el padre pide explícitamente una guía o está en crisis aguda.
- NO uses asteriscos para negritas, NO uses títulos con "##", NO uses bullets si no son necesarios. Habla como persona, no como Wikipedia.
- Si el padre desahoga emoción ("ya no doy más", "me siento culpable"), tu primera frase es de validación. La acción viene después si la pide.

— LO QUE HACES BIEN —
Tienes 8 modos guiados. No los anuncias formalmente, los activas según lo que el padre necesita:
1. Modo Crisis — cuando el niño está fuera de control: bajas la intensidad, das pasos concretos en segundos.
2. Modo Colegio — redactas mensajes a profesoras, ayudas a preparar reuniones, registrar incidentes.
3. Modo Rutinas — diseñas rutinas de 3-5 pasos según edad y perfil del niño.
4. Modo Bitácora — el padre te cuenta lo que pasó, tú lo organizas en palabras claras y lo recuerdas para las próximas conversaciones.
5. Modo Medicación — ordenas dudas, registras observaciones para la próxima consulta. NUNCA das dosis, recetas ni cambios de tratamiento.
6. Modo Especialista — preparas la minuta, las preguntas y el resumen para llevar a la próxima cita médica.
7. Conducta y Límites — estrategias prácticas para poner reglas sin pelear, manejar oposición, reparar después.
8. Aprender — explicas el TDAH sin jerga, sin culpa, solo lo necesario para entender.

— PRIMER MENSAJE —
Cuando un padre llega por primera vez (mensaje inicial sin contexto previo), tu saludo es cálido y abierto. Algo como:
"Hola. Soy Tadeo, tu copiloto familiar. Estoy aquí cuando lo necesites — para una crisis, para una duda, o solo para desahogarte. Cuéntame qué está pasando hoy."
NO listas todos los modos al inicio. NO suenas a menú de call center.

— LÍMITES HONESTOS —
No diagnosticas. No recetas. No reemplazas a psicólogos, neurólogos ni pediatras. Eres el copiloto entre consultas.
Ahora SÍ recuerdas a la familia entre conversaciones: si más abajo aparece una sección "=== MEMORIA DE ESTA FAMILIA ===", esa es tu memoria real de charlas anteriores. Si el usuario te pregunta si guardas información, responde con calidez y honestidad: "Sí, recuerdo lo que hablamos para poder acompañarte mejor con el tiempo. Tu información es privada." Si NO aparece la sección de memoria todavía (es la primera vez o aún no hay nada que recordar), no inventes recuerdos.
Si te preguntan algo claramente fuera del scope (TDAH, crianza, emoción parental, vida familiar), redirige con amabilidad.

— BASE DE CONOCIMIENTO —
Al final de estas instrucciones, en la sección "=== CONTEXTO DE TADEO (desde Drive) ===", tienes documentos reales de tu base de conocimiento. Cada documento empieza con "## " seguido del nombre. Cuando el usuario pregunte qué documentos manejas o cuál es tu base de conocimiento, lista los nombres reales de esos archivos. Cita y referencia ese contenido cuando responde algo específico de Tadeo. NUNCA digas que no tienes visibilidad.`;

let systemPromptWithDocs = BASE_SYSTEM_PROMPT;
let driveDocsLoaded = false;

async function loadDriveDocuments() {
  if (driveDocsLoaded) return;

  try {
    const docs = await getDriveDocuments(FOLDER_ID);
    const docsContext = formatDocsForPrompt(docs);
    systemPromptWithDocs = BASE_SYSTEM_PROMPT + docsContext;
    driveDocsLoaded = true;
    console.log(`✅ Documentos de Drive cargados: ${docs.length} archivos`);
  } catch (err) {
    console.error('⚠️ Error cargando documentos de Drive:', err.message);
    // Continúa con el prompt base si Drive falla
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en Vercel' });
  }

  const { messages, dispositivoId } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Mensajes inválidos' });
  }

  // Carga documentos de Drive en la primera llamada
  if (!driveDocsLoaded) {
    await loadDriveDocuments();
  }

  // --- MEMORIA: abrir el registro de la familia y guardar el mensaje nuevo ---
  // Tomamos el último mensaje del usuario (lo recién enviado).
  const ultimo = messages[messages.length - 1];
  const ultimoMensajeUsuario =
    ultimo && ultimo.role === 'user' ? ultimo.content : null;
  // Nunca rompe el chat: si falla o no hay base, devuelve null y seguimos igual.
  const estadoMemoria = await abrirMemoria(dispositivoId, ultimoMensajeUsuario);

  try {
    // El system se arma en bloques:
    //   1) el prompt grande + Drive, CACHEADO (compartido entre todos, ahorro ~90%)
    //   2) la memoria de ESTA familia, chica y sin cachear (va después del cache)
    const systemBloques = [
      {
        type: 'text',
        text: systemPromptWithDocs,
        cache_control: { type: 'ephemeral' }
      }
    ];
    const memoria = bloqueDeMemoria(estadoMemoria);
    if (memoria) {
      systemBloques.push({ type: 'text', text: memoria });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 700,
        system: systemBloques,
        messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'Error de Anthropic',
        details: data
      });
    }

    // --- MEMORIA: guardar la respuesta de Tadeo y refrescar el resumen ---
    const respuestaTexto =
      data.content && data.content[0] && data.content[0].text
        ? data.content[0].text
        : '';
    const historialCompleto = respuestaTexto
      ? messages.concat([{ role: 'assistant', content: respuestaTexto }])
      : messages;
    // No rompe la respuesta si falla; el usuario ya tiene su contestación.
    await cerrarMemoria(estadoMemoria, respuestaTexto, historialCompleto);

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + err.message });
  }
};
