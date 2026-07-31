// Palabras/frases que disparan directamente el flujo de agendar cita.
// Todo en minúsculas y sin acentos para comparar fácil.
const BOOKING_KEYWORDS = [
  'cita', 'agendar', 'agenda', 'peluquear', 'pelo', 'corte', 'cortar',
  'bloquear', 'bloqueame', 'reservar', 'reserva', 'turno', 'hora',
  'disponibilidad', 'cuando puedes', 'cuando me puedes'
];

// Frases que indican que quieren hablar directo con el barbero (no con el bot)
const HUMAN_KEYWORDS = [
  'hablar con', 'peña', 'pena', 'el barbero', 'quiero hablar', 'necesito hablar'
];

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita acentos
}

function matchesAny(text, list) {
  const clean = normalize(text);
  return list.some((kw) => clean.includes(normalize(kw)));
}

function detectIntent(text) {
  if (matchesAny(text, HUMAN_KEYWORDS)) return 'human';
  if (matchesAny(text, BOOKING_KEYWORDS)) return 'booking';
  return 'unknown';
}

module.exports = { detectIntent };
