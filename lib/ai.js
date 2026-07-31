// Usa la API gratuita de Google Gemini para interpretar mensajes ambiguos.
// Se saca la llave gratis en https://aistudio.google.com/apikey (sin tarjeta).
// Solo se llama cuando las palabras clave no detectaron nada claro.

const SYSTEM_PROMPT = `Eres un clasificador de intenciones para el WhatsApp de una barbería.
Dado un mensaje de un cliente, responde SOLO con una de estas palabras, sin nada más:
- booking (si quiere agendar, reservar o preguntar por una cita/corte/hora)
- human (si quiere hablar directamente con el barbero, sin agendar nada)
- info (si pregunta precios, horarios, ubicación u otra info general)
- unknown (si no se entiende o no aplica ninguna de las anteriores)`;

async function classifyWithAI(message) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY no configurada, se omite el respaldo de IA');
    return 'unknown';
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: { maxOutputTokens: 10, temperature: 0 }
      })
    });

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();

    if (['booking', 'human', 'info', 'unknown'].includes(text)) {
      return text;
    }
    return 'unknown';
  } catch (err) {
    console.error('Error llamando a Gemini API:', err.message);
    return 'unknown';
  }
}

module.exports = { classifyWithAI };
