const twilio = require('twilio');

let client = null;

function getClient() {
  if (client) return client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  client = twilio(sid, token);
  return client;
}

// Envía un mensaje de WhatsApp saliente (se usa desde el panel /admin
// cuando el barbero quiere responder manualmente a un cliente).
async function sendWhatsAppMessage(toChatId, body) {
  const twilioClient = getClient();
  const from = process.env.TWILIO_WHATSAPP_NUMBER; // ej: whatsapp:+14155238886
  if (!twilioClient || !from) {
    throw new Error('Twilio no está configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_NUMBER)');
  }
  await twilioClient.messages.create({
    from,
    to: toChatId,
    body
  });
}

module.exports = { sendWhatsAppMessage };
