const { detectIntent } = require('./keywords');
const { classifyWithAI } = require('./ai');
const { getState, setState, clearState, saveAppointment } = require('./db');
const { appendAppointmentToSheet } = require('./sheets');
const { getServiceById, formatCOP, serviceMenuText, colorPromptText } = require('./services');

const BARBER_NAME = process.env.BARBER_NAME || 'el barbero';

function menuText() {
  return (
    `¡Hola! 👋 Soy el asistente de *${BARBER_NAME}*.\n\n` +
    `¿En qué te ayudo?\n` +
    `1️⃣ Agendar una cita\n` +
    `2️⃣ Hablar directamente con ${BARBER_NAME}\n` +
    `3️⃣ Ver servicios y precios\n\n` +
    `Responde con el número de la opción, o escríbeme normal, también te entiendo 🙂`
  );
}

function infoText() {
  return `${serviceMenuText()}\n\nSi quieres agendar, responde "1" o escribe "agendar".`;
}

// Arma el resumen final que se guarda y se muestra al cliente
function buildSummaryLine(data) {
  let line = data.serviceName;
  if (data.gender) line += ` (${data.gender})`;
  if (data.color) line += ` — color: ${data.color}`;
  return line;
}

// Procesa un mensaje entrante y devuelve el texto de respuesta (o null si no debe responder nada)
async function handleMessage(chatId, rawText) {
  const text = (rawText || '').trim();
  const state = await getState(chatId);

  // Si el cliente ya pidió hablar directo con el barbero, el bot deja de intervenir
  // hasta que el propio barbero reinicie la conversación manualmente (ver index.js).
  if (state && state.step === 'human_takeover') {
    return null;
  }

  // Paso: esperando que elija el servicio del menú
  if (state && state.step === 'awaiting_service') {
    const service = getServiceById(text);
    if (!service) {
      return `No reconocí esa opción. ${serviceMenuText()}`;
    }
    const data = { serviceId: service.id, serviceName: service.name, price: service.price };

    if (service.askGender) {
      await setState(chatId, 'awaiting_tinte_gender', data);
      return '¿El tinte es para hombre o para mujer?';
    }
    if (service.askColor) {
      await setState(chatId, 'awaiting_color', data);
      return colorPromptText();
    }
    await setState(chatId, 'awaiting_datetime', data);
    return `Elegiste: *${service.name}* (${formatCOP(service.price)}).\n¿Qué día y hora te gustaría? (ej: "sábado 3pm")`;
  }

  // Paso: esperando género (solo aplica al servicio "solo tinte")
  if (state && state.step === 'awaiting_tinte_gender') {
    const gender = text.toLowerCase().includes('mujer') ? 'mujer' : 'hombre';
    await setState(chatId, 'awaiting_color', { ...state.data, gender });
    return colorPromptText();
  }

  // Paso: esperando el color del tinte
  if (state && state.step === 'awaiting_color') {
    const data = { ...state.data, color: text };
    await setState(chatId, 'awaiting_datetime', data);
    return `Perfecto, *${text}* anotado.\n¿Qué día y hora te gustaría para tu cita? (ej: "sábado 3pm")`;
  }

  // Paso: esperando fecha/hora deseada
  if (state && state.step === 'awaiting_datetime') {
    await setState(chatId, 'awaiting_name', { ...state.data, requestedWhen: text });
    return `Perfecto, apunté: *${text}*.\n¿Me confirmas tu nombre completo para agendar la cita?`;
  }

  // Paso: esperando nombre para confirmar la cita
  if (state && state.step === 'awaiting_name') {
    const data = state.data;
    const summaryLine = buildSummaryLine(data);

    await saveAppointment(chatId, text, data.requestedWhen, data.serviceName, data.price, {
      gender: data.gender || null,
      color: data.color || null
    });
    await clearState(chatId);

    // No bloqueamos la respuesta al cliente si Sheets tarda o falla
    appendAppointmentToSheet({
      clientName: text,
      requestedWhen: data.requestedWhen,
      chatId,
      serviceName: data.serviceName,
      price: data.price,
      gender: data.gender,
      color: data.color
    }).catch(() => {});

    return (
      `✅ ¡Listo, *${text}*!\n` +
      `Servicio: ${summaryLine}\n` +
      `Precio: ${formatCOP(data.price)}\n` +
      `Fecha/hora: *${data.requestedWhen}*\n\n` +
      `${BARBER_NAME} la va a confirmar contigo pronto. ¡Gracias! 💈`
    );
  }

  // Sin estado activo: primero probamos con opciones numéricas del menú
  if (!state) {
    if (text === '1') {
      await setState(chatId, 'awaiting_service', {});
      return serviceMenuText();
    }
    if (text === '2') {
      await setState(chatId, 'human_takeover', {});
      return `Listo, le avisé a ${BARBER_NAME} que quieres hablar con él directamente. En un momento te responde por aquí mismo.`;
    }
    if (text === '3') {
      return infoText();
    }
  }

  // Detección por palabras clave
  let intent = detectIntent(text);

  // Si no fue claro con palabras clave, usamos la IA como respaldo
  if (intent === 'unknown') {
    intent = await classifyWithAI(text);
  }

  if (intent === 'booking') {
    await setState(chatId, 'awaiting_service', {});
    return serviceMenuText();
  }

  if (intent === 'human') {
    await setState(chatId, 'human_takeover', {});
    return `Listo, le avisé a ${BARBER_NAME} que quieres hablar con él directamente. En un momento te responde por aquí mismo.`;
  }

  if (intent === 'info') {
    return infoText();
  }

  // No se entendió nada: mostramos el menú
  return menuText();
}

module.exports = { handleMessage };
