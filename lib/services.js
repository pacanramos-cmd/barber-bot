// Catálogo de servicios. Para cambiar precios o textos, edita solo este archivo.
const SERVICES = [
  { id: 1, name: 'Corte sencillo', price: 14000 },
  { id: 2, name: 'Corte sencillo + cejas', price: 15000 },
  { id: 3, name: 'Corte sencillo + barba', price: 18000 },
  { id: 4, name: 'Corte sencillo + cejas + barba', price: 20000 },
  { id: 5, name: 'Solo tinte', price: 30000, askGender: true, askColor: true },
  { id: 6, name: 'Corte completo + tinte', price: 35000, askColor: true },
  { id: 7, name: 'Depilación de cejas (henna)', price: 12000 }
];

const SUGGESTED_COLORS = ['Negro', 'Castaño', 'Rubio', 'Rojo', 'Azul'];

function formatCOP(price) {
  return `$${price.toLocaleString('es-CO')}`;
}

function getServiceById(id) {
  return SERVICES.find((s) => s.id === Number(id));
}

function serviceMenuText() {
  const lines = SERVICES.map((s) => `${s.id}️⃣ ${s.name} — ${formatCOP(s.price)}`);
  return `¿Qué servicio quieres agendar?\n\n${lines.join('\n')}\n\nResponde con el número del servicio.`;
}

function colorPromptText() {
  return (
    `¿Qué color te gustaría? Algunas opciones comunes:\n` +
    `${SUGGESTED_COLORS.join(' · ')}\n\n` +
    `Escríbeme el color que prefieras.`
  );
}

module.exports = { SERVICES, formatCOP, getServiceById, serviceMenuText, colorPromptText };
