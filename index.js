require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const twilio = require('twilio');
const { handleMessage } = require('./lib/flow');
const { initDb, clearState, listAppointments, listHumanTakeoverChats } = require('./lib/db');
const { sendWhatsAppMessage } = require('./lib/twilioClient');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

app.use(express.urlencoded({ extended: false })); // Twilio manda el webhook así
app.use(express.json());

// ---------- Estado / salud ----------
app.get('/', (req, res) => {
  res.send('Barber Bot activo ✅ (esperando mensajes de Twilio)');
});

app.get('/ping', (req, res) => {
  res.send('pong');
});

// ---------- Webhook de Twilio: aquí llegan los mensajes entrantes ----------
app.post('/webhook/whatsapp', async (req, res) => {
  const chatId = req.body.From; // ej: "whatsapp:+521234567890"
  const text = req.body.Body || '';

  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const reply = await handleMessage(chatId, text);
    if (reply) {
      twiml.message(reply);
    }
  } catch (err) {
    console.error('Error procesando mensaje:', err);
  }

  res.type('text/xml').send(twiml.toString());
});

// ---------- Citas guardadas (JSON) ----------
app.get('/citas', async (req, res) => {
  try {
    const appointments = await listAppointments();
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo consultar la base de datos', detail: err.message });
  }
});

// ---------- Panel de administración (para el barbero) ----------
// Protegido con una clave simple por URL: /admin?secret=TU_CLAVE
function checkAdminSecret(req, res) {
  const secret = req.query.secret || req.body.secret;
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    res.status(401).send('No autorizado. Agrega ?secret=TU_CLAVE a la URL.');
    return false;
  }
  return true;
}

app.get('/admin', async (req, res) => {
  if (!checkAdminSecret(req, res)) return;

  try {
    const chats = await listHumanTakeoverChats();
    const rows = chats.map((c) => `
      <tr>
        <td>${c.chat_id}</td>
        <td>${new Date(c.updated_at).toLocaleString('es-CO')}</td>
        <td>
          <form method="POST" action="/admin/send?secret=${encodeURIComponent(req.query.secret)}" style="display:inline">
            <input type="hidden" name="chatId" value="${c.chat_id}">
            <input type="text" name="message" placeholder="Escribe tu respuesta..." required style="width:250px">
            <button type="submit">Enviar</button>
          </form>
          <form method="POST" action="/admin/reactivate?secret=${encodeURIComponent(req.query.secret)}" style="display:inline">
            <input type="hidden" name="chatId" value="${c.chat_id}">
            <button type="submit">Reactivar bot</button>
          </form>
        </td>
      </tr>
    `).join('');

    res.send(`
      <html>
        <head><meta charset="utf-8"><title>Panel del barbero</title></head>
        <body style="font-family:sans-serif; max-width:900px; margin:2rem auto;">
          <h2>💈 Clientes esperando hablar contigo</h2>
          <p><a href="/citas">Ver todas las citas agendadas (JSON)</a></p>
          ${chats.length === 0
            ? '<p>No hay clientes esperando respuesta ahora mismo.</p>'
            : `<table border="1" cellpadding="8" style="border-collapse:collapse; width:100%">
                <tr><th>Número</th><th>Desde</th><th>Acciones</th></tr>
                ${rows}
              </table>`
          }
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error cargando el panel: ' + err.message);
  }
});

app.post('/admin/send', async (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const { chatId, message } = req.body;
  try {
    await sendWhatsAppMessage(chatId, message);
    res.redirect('/admin?secret=' + encodeURIComponent(req.query.secret));
  } catch (err) {
    res.status(500).send('Error enviando el mensaje: ' + err.message);
  }
});

app.post('/admin/reactivate', async (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const { chatId } = req.body;
  try {
    await clearState(chatId);
    res.redirect('/admin?secret=' + encodeURIComponent(req.query.secret));
  } catch (err) {
    res.status(500).send('Error reactivando el chat: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor web escuchando en el puerto ${PORT}`);
});

// ---------- Auto-ping para que Render no duerma el servicio ----------
const PUBLIC_URL = process.env.PUBLIC_URL;
if (PUBLIC_URL) {
  cron.schedule('*/10 * * * *', async () => {
    try {
      await fetch(`${PUBLIC_URL}/ping`);
      console.log('Auto-ping enviado para mantener el servicio despierto');
    } catch (err) {
      console.error('Error en auto-ping:', err.message);
    }
  });
} else {
  console.warn('PUBLIC_URL no configurada: el auto-ping está desactivado. Usa UptimeRobot como alternativa.');
}

// ---------- Base de datos ----------
(async () => {
  try {
    await initDb();
    console.log('✅ Barber Bot listo (esperando webhooks de Twilio)');
  } catch (err) {
    console.error('No se pudo conectar/inicializar la base de datos (revisa DATABASE_URL):', err.message);
  }
})();
