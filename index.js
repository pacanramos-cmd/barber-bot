require('dotenv').config();
const express = require('express');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const { Client, LocalAuth } = require('whatsapp-web.js');
const puppeteer = require('puppeteer');
const { handleMessage } = require('./lib/flow');
const { initDb, clearState, listAppointments } = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3000;

let lastQr = null; // guardamos el último QR para mostrarlo también en el navegador
let whatsappReady = false;

// ---------- Servidor web (para keep-alive y ver el QR) ----------
app.get('/', (req, res) => {
  res.send(
    whatsappReady
      ? 'Barber Bot activo ✅ (WhatsApp conectado)'
      : 'Barber Bot activo, esperando escaneo de QR. Ve a /qr'
  );
});

app.get('/ping', (req, res) => {
  res.send('pong');
});

app.get('/qr', (req, res) => {
  if (whatsappReady) {
    return res.send('<h2>WhatsApp ya está conectado ✅</h2>');
  }
  if (!lastQr) {
    return res.send('<h2>Generando código QR, refresca en unos segundos...</h2>');
  }
  // Usamos una librería ligera vía CDN para pintar el QR como imagen en el navegador
  res.send(`
    <html>
      <body style="text-align:center; font-family:sans-serif;">
        <h2>Escanea este QR con WhatsApp (Dispositivos vinculados)</h2>
        <div id="qr"></div>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
        <script>
          QRCode.toCanvas(document.createElement('canvas'), ${JSON.stringify(lastQr)}, function (err, canvas) {
            document.getElementById('qr').appendChild(canvas);
          });
        </script>
        <p>Esta página se refresca sola cada 5 segundos.</p>
        <script>setTimeout(() => location.reload(), 5000);</script>
      </body>
    </html>
  `);
});

app.get('/citas', async (req, res) => {
  try {
    const appointments = await listAppointments();
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo consultar la base de datos', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor web escuchando en el puerto ${PORT}`);
});

// ---------- Auto-ping para que Render no duerma el servicio ----------
const PUBLIC_URL = process.env.PUBLIC_URL;
if (PUBLIC_URL) {
  cron.schedule('*/4 * * * *', async () => {
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

// ---------- Cliente de WhatsApp ----------
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './data/wwebjs_auth' }),
  puppeteer: {
    headless: true,
    executablePath: puppeteer.executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', (qr) => {
  lastQr = qr;
  console.log('Nuevo código QR generado. Ábrelo en /qr o escanea el que aparece abajo:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  whatsappReady = true;
  console.log('✅ WhatsApp conectado y listo para recibir mensajes');
});

client.on('disconnected', (reason) => {
  whatsappReady = false;
  console.warn('WhatsApp se desconectó:', reason);
});

client.on('message', async (message) => {
  // Ignoramos mensajes de grupos, solo atendemos chats individuales
  const chat = await message.getChat();
  if (chat.isGroup) return;

  const chatId = message.from;
  const text = message.body;

  try {
    const reply = await handleMessage(chatId, text);
    if (reply) {
      await client.sendMessage(chatId, reply);
    }
  } catch (err) {
    console.error('Error procesando mensaje:', err);
  }
});

// Comando de administración: el barbero puede escribir "!reset" en un chat
// (desde su propio celular) para que el bot vuelva a atender ese chat
// después de haber tomado control humano de la conversación.
client.on('message_create', async (message) => {
  if (!message.fromMe) return;
  if (message.body.trim().toLowerCase() === '!reset') {
    const chat = await message.getChat();
    clearState(chat.id._serialized);
    console.log(`Estado reiniciado para el chat ${chat.id._serialized}`);
  }
});

(async () => {
  try {
    await initDb();
  } catch (err) {
    console.error('No se pudo conectar/inicializar la base de datos (revisa DATABASE_URL):', err.message);
  }
  client.initialize();
})();
