require('dotenv').config();
const express = require('express');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
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

app.get('/qr', async (req, res) => {
  if (whatsappReady) {
    return res.send('<h2>WhatsApp ya está conectado ✅</h2>');
  }
  if (!lastQr) {
    return res.send('<h2>Generando código QR, refresca en unos segundos...</h2>');
  }

  try {
    // Generamos la imagen del QR directamente en el servidor (PNG en base64),
    // así no depende de ningún script externo ni de que el navegador lo permita.
    const qrImageDataUrl = await QRCode.toDataURL(lastQr, { width: 300, margin: 2 });

    res.send(`
      <html>
        <body style="text-align:center; font-family:sans-serif;">
          <h2>Escanea este QR con WhatsApp (Dispositivos vinculados)</h2>
          <img src="${qrImageDataUrl}" alt="Código QR" width="300" height="300" />
          <p>Esta página se refresca sola cada 5 segundos.</p>
          <script>setTimeout(() => location.reload(), 5000);</script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Error generando la imagen del QR:', err);
    res.status(500).send('<h2>Error generando el QR, refresca la página.</h2>');
  }
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
// Se crea dentro de una función async porque, desde puppeteer v22+,
// executablePath() devuelve una Promesa (antes devolvía el texto directo).
let client;

function setupClient(chromePath) {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './data/wwebjs_auth' }),
    puppeteer: {
      headless: true,
      executablePath: chromePath,
      defaultViewport: { width: 480, height: 800 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-extensions',
        '--no-zygote',
        '--single-process',
        '--disable-software-rasterizer',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--js-flags=--max-old-space-size=192'
      ]
    }
  });

  // Bloqueamos imágenes, medios y fuentes para ahorrar memoria RAM.
  // Esto no afecta el funcionamiento del bot (solo maneja texto), y es
  // justo lo que más memoria consume cuando WhatsApp Web sincroniza chats.
  async function setupMediaBlocking() {
    try {
      if (client.pupPage && !client.pupPage.__interceptSetup) {
        await client.pupPage.setRequestInterception(true);
        client.pupPage.on('request', (req) => {
          const blockedTypes = ['image', 'media', 'font'];
          if (blockedTypes.includes(req.resourceType())) {
            req.abort();
          } else {
            req.continue();
          }
        });
        client.pupPage.__interceptSetup = true;
        console.log('Bloqueo de imágenes/media activado para ahorrar memoria');
      }
    } catch (err) {
      console.warn('No se pudo activar el bloqueo de media:', err.message);
    }
  }

  client.on('qr', (qr) => {
    lastQr = qr;
    console.log('Nuevo código QR generado. Ábrelo en /qr o escanea el que aparece abajo:');
    qrcode.generate(qr, { small: true });
    setupMediaBlocking();
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`Cargando WhatsApp Web: ${percent}% - ${message}`);
    setupMediaBlocking();
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

  client.initialize();
}

(async () => {
  try {
    await initDb();
  } catch (err) {
    console.error('No se pudo conectar/inicializar la base de datos (revisa DATABASE_URL):', err.message);
  }

  const chromePath = await puppeteer.executablePath();
  console.log('Chrome encontrado en:', chromePath);
  setupClient(chromePath);
})();
