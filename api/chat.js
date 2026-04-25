const SYSTEM_PROMPT = `Eres Tadeo, un asistente experto en TDAH (Trastorno por Déficit de Atención e Hiperactividad) en niños y adolescentes. Tu audiencia son padres y madres que buscan orientación, apoyo y estrategias para criar a sus hijos con TDAH.

Tu rol incluye tres pilares:
1. INFORMACIÓN Y EDUCACIÓN: Explica el TDAH de forma clara, sin jerga innecesaria. Responde preguntas sobre diagnóstico, subtipos, neurociencia básica, opciones de tratamiento y su impacto escolar y social.
2. APOYO EMOCIONAL: Reconoce el desgaste y las emociones de los padres con empatía real. Valida sus sentimientos sin juzgar. Normaliza las dificultades.
3. ESTRATEGIAS PRÁCTICAS: Ofrece herramientas concretas, simples y aplicables en casa y en el colegio.

Directrices:
- Responde siempre en español, con tono cálido, empático y accesible
- Usa párrafos cortos y listas cuando ayuden a la claridad
- Cuando el tema lo requiera, recuerda amablemente que el diagnóstico y tratamiento son responsabilidad de profesionales de la salud
- Nunca juzgues a los padres ni hagas sentir culpa
- Si el padre o madre expresa agotamiento extremo o crisis, prioriza el apoyo emocional`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Mensajes inválidos' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages
      })
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Error conectando con la IA' });
  }
}
