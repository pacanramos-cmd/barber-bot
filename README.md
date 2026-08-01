# Barber Bot 💈 (versión Twilio)

Chatbot de WhatsApp para agendar citas con el barbero, usando el catálogo de 7 servicios, palabras clave + IA de respaldo, y **Twilio** para conectarse a WhatsApp (sin necesitar un navegador/Chrome corriendo).

## ¿Por qué Twilio y no whatsapp-web.js?

La primera versión usaba `whatsapp-web.js`, que necesita correr un Chrome completo detrás — eso consume mucha memoria RAM y no cabe en el plan gratis de Render (512 MB). Twilio es una API ligera: no necesita navegador, así que corre sin problema en cualquier plan gratis.

**La diferencia importante:** con Twilio, los clientes ya no le escriben al número personal del barbero directamente, sino a un número especial que te da Twilio (el "Sandbox" mientras estemos en modo de prueba). Más abajo se explica cómo funciona esto.

## ¿Cómo funciona el flujo?

1. El cliente le escribe al número de WhatsApp de Twilio.
2. Twilio reenvía ese mensaje a nuestro servidor (a la URL `/webhook/whatsapp`).
3. El bot decide la respuesta (menú, servicio, fecha, etc. — misma lógica de siempre) y se la devuelve a Twilio, que se la manda al cliente.
4. Si el cliente pide hablar con el barbero, el bot dejar de responder ahí y ese chat aparece en el **panel de administración** (`/admin`), donde el barbero puede escribirle manualmente desde una página web sencilla.
5. Las citas se guardan en Neon (Postgres) y se copian a Google Sheets, igual que antes.

## 0. Configurar Twilio (el Sandbox de WhatsApp, gratis)

1. Crea una cuenta gratis en [twilio.com/try-twilio](https://www.twilio.com/try-twilio) (te da crédito de prueba, no necesitas tarjeta para el Sandbox).
2. En el dashboard, busca **Messaging → Try it out → Send a WhatsApp message** (o busca "WhatsApp Sandbox" en el buscador de Twilio).
3. Ahí Twilio te da:
   - Un número de WhatsApp (siempre es el mismo para todos en modo sandbox: `+1 415 523 8886`)
   - Un código de activación único, tipo `join palabra-clave`
4. Copia el **Account SID** y el **Auth Token** (están en el dashboard principal de Twilio) — esos son tus `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN`.
5. Tu `TWILIO_WHATSAPP_NUMBER` es: `whatsapp:+14155238886`

### ⚠️ Limitación importante del modo Sandbox (léelo antes de probar)
Mientras estés en modo de prueba (sin pagar), **cada persona que quiera chatear con el bot** (incluyendo tú, el barbero, y cada cliente) **primero tiene que mandarle al número de Twilio el mensaje `join palabra-clave`** (la palabra que te dé tu sandbox) desde su propio WhatsApp. Solo se hace una vez por número, pero es un paso extra que no existía con el número personal. Es la única forma de probar gratis; si más adelante el negocio ya está funcionando de verdad, ahí se puede pedir un número de WhatsApp Business real con Twilio (ya no sandbox), lo cual sí tiene un costo pequeño por mensaje.

## 1. Configurar el webhook de Twilio

Una vez que tengas el bot desplegado en Render (ver más abajo) y tengas su URL pública:

1. Ve a la consola de Twilio → **Messaging → Try it out → WhatsApp Sandbox Settings** (o busca "Sandbox settings").
2. En el campo **"When a message comes in"**, pega: `https://tu-url.onrender.com/webhook/whatsapp`
3. Método: **HTTP POST**
4. Guarda.

Listo — desde ese momento, cualquier mensaje que le llegue al número de Twilio se reenvía a tu bot.

## 2. Probarlo en tu computadora primero

```bash
npm install
cp .env.example .env
```

Llena tu `.env` con las variables de Twilio, Neon, etc. (ver `.env.example`).

Para probar localmente necesitas exponer tu compu a internet temporalmente (Twilio necesita una URL pública para mandarte el webhook). La forma más fácil es con [ngrok](https://ngrok.com) (gratis):
```bash
npm start
# en otra terminal:
ngrok http 3000
```
Copia la URL que te da ngrok (tipo `https://algo.ngrok-free.app`) y ponla en el Sandbox de Twilio como se explicó arriba, agregando `/webhook/whatsapp` al final.

## 3. Subirlo a Render (gratis)

1. Sube esta carpeta a tu repo de GitHub (reemplazando los archivos viejos).
2. En [render.com](https://render.com), crea un **Web Service** nuevo conectado a ese repo.
3. Configuración:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Plan:** Free
4. En **Environment Variables**, agrega todas las de tu `.env`:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_NUMBER`
   - `ADMIN_SECRET` (invéntate una clave larga y única)
   - `DATABASE_URL`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`
   - `BARBER_NAME`
   - `GEMINI_API_KEY`
5. Dale **Create Web Service**. Esta vez el build es rápido (ya no descarga Chrome).
6. Cuando termine, copia la URL pública y agrégala también como variable `PUBLIC_URL`, y ponla en el Sandbox de Twilio como se explicó en el paso 1.

## 4. Probar todo

1. Desde tu celular, mándale al número de Twilio (`+1 415 523 8886`) el mensaje `join palabra-clave` (la tuya).
2. Cuando confirme la activación, mándale "hola" — debería responder con el menú.
3. Prueba el flujo completo de agendar una cita.
4. Prueba escribir "quiero hablar con el barbero" — el bot debe avisar que ya no va a responder ahí.
5. Entra a `https://tu-url.onrender.com/admin?secret=TU_ADMIN_SECRET` — deberías ver ese chat en la lista, con la opción de responderle manualmente o reactivar el bot.

## 5. El panel del barbero (`/admin`)

Es una página sencilla (sin diseño, solo funcional) donde el barbero puede:
- Ver qué clientes están esperando que él responda directamente.
- Escribirles un mensaje manual desde ahí (se manda por WhatsApp real vía Twilio).
- Reactivar el bot para ese chat, cuando ya terminó de atenderlo en persona.

Se accede así: `https://tu-url.onrender.com/admin?secret=LO_QUE_PUSISTE_EN_ADMIN_SECRET`

Guarda esa URL completa (con la clave) en los favoritos del navegador del barbero.

## 6. Ajustar servicios, precios, palabras clave o menú

- **Servicios y precios:** `lib/services.js`
- Palabras clave: `lib/keywords.js`
- Textos del menú principal: `lib/flow.js`
- Prompt de la IA de respaldo (Gemini): `lib/ai.js`

## Estructura del proyecto

```
barber-bot/
├── index.js             # servidor Express + webhook de Twilio + panel /admin
├── lib/
│   ├── db.js              # conexión a Neon/Postgres (citas y estado de conversación)
│   ├── sheets.js           # copia automática de citas a Google Sheets
│   ├── twilioClient.js     # envío de mensajes manuales desde el panel /admin
│   ├── services.js         # catálogo de servicios y precios (edítalo aquí)
│   ├── keywords.js         # detección de palabras clave
│   ├── flow.js             # flujo de la conversación (menú, agendar, etc.)
│   └── ai.js               # respaldo con IA (Gemini, gratis) para mensajes ambiguos
├── .env.example
└── package.json
```
