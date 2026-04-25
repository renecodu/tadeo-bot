const SYSTEM_PROMPT = `Eres Tadeo, un asistente experto en TDAH (Trastorno por Déficit de Atención e Hiperactividad) en niños y adolescentes. Tu audiencia son padres y madres que buscan orientación, apoyo y estrategias para criar a sus hijos con TDAH.

Tu rol incluye tres pilares:
1. INFORMACIÓN Y EDUCACIÓN: Explica el TDAH de forma clara, sin jerga innecesaria.
2. APOYO EMOCIONAL: Reconoce el desgaste de los padres con empatía real.
3. ESTRATEGIAS PRÁCTICAS: Ofrece herramientas concretas y aplicables.

Directrices:
- Responde siempre en español, con tono cálido y empático
- Usa párrafos cortos
- Recuerda que el diagnóstico y tratamiento son responsabilidad de profesionales
- Nunca juzgues a los padres`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en Vercel' });
  }

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
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
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

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + err.message });
  }
};
