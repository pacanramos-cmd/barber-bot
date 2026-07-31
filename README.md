# Barber Bot 💈

Chatbot de WhatsApp para agendar citas con el barbero, usando palabras clave + IA de respaldo.

## ¿Cómo funciona?

1. El cliente escribe al WhatsApp (número de prueba, después el del barbero).
2. Si el mensaje trae palabras como "cita", "agendar", "peluquear", "corte", etc., el bot arranca el flujo de agendamiento.
3. Si el cliente escribe algo como "quiero hablar con Peña", el bot avisa que ya no va a intervenir y deja que el barbero conteste directamente.
4. Si el mensaje no es claro, primero se muestra un menú con 3 opciones (agendar / hablar con el barbero / ver info). Si tampoco eligen una opción clara, se usa la IA (Claude) para interpretar el mensaje.
5. Las citas quedan guardadas en **Neon (Postgres)**, y además se copian automáticamente a una fila nueva en **Google Sheets**. También puedes ver todas las citas abriendo `/citas` en el navegador (te da un JSON).

## 0. Configurar Neon (la base de datos)

1. Crea cuenta gratis en [neon.tech](https://neon.tech) (no pide tarjeta).
2. Crea un proyecto nuevo (ej: "barber-bot").
3. En el dashboard del proyecto, click en **Connect** y copia la **Connection string** (elige la opción "Pooled connection", termina en `-pooler`).
4. Esa cadena es tu `DATABASE_URL`. Se ve algo así: `postgresql://usuario:password@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require`
5. No necesitas crear tablas a mano — el bot las crea solo la primera vez que arranca.

## 0.1 Configurar Google Sheets (copia automática de citas)

1. Crea (o reutiliza) una hoja de Google Sheets. Dentro, crea una pestaña llamada exactamente **Citas**, con encabezados en la fila 1: `Fecha | Nombre | Servicio | Detalle | Cuándo | Precio | Chat ID`.
2. Ve a [Google Cloud Console](https://console.cloud.google.com/), crea un proyecto (o usa uno existente) y activa la **Google Sheets API**.
3. Ve a "Credenciales" > "Crear credenciales" > **Cuenta de servicio**. Créala y, dentro de ella, genera una **clave nueva en formato JSON** — se descarga un archivo.
4. Abre ese archivo JSON: ahí están `client_email` (es tu `GOOGLE_SERVICE_ACCOUNT_EMAIL`) y `private_key` (es tu `GOOGLE_PRIVATE_KEY`).
5. Abre tu Google Sheet, dale click a **Compartir**, y comparte la hoja con el correo de la cuenta de servicio (el `client_email`) dándole permiso de **Editor**.
6. El `GOOGLE_SHEET_ID` es el código que está en la URL de tu hoja: `docs.google.com/spreadsheets/d/AQUÍ_ESTÁ_EL_ID/edit`.

Si no configuras estas variables, el bot sigue funcionando normal (solo guarda en Neon y omite la copia a Sheets).

## 0.2 Configurar el respaldo de IA (Gemini, gratis)

1. Ve a [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e inicia sesión con tu cuenta de Google (puede ser la misma que usaste para Sheets).
2. Click en **Create API Key** (o "Crear clave de API"). No pide tarjeta ni datos de facturación.
3. Copia esa llave — es tu `GEMINI_API_KEY`.

Esta llave es completamente gratis y no vence. Tiene un límite de 1,500 mensajes al día, más que suficiente para una barbería. Si no la configuras, el bot igual funciona con el menú y las palabras clave, solo se salta este paso de IA extra para mensajes ambiguos.

## 1. Probarlo en tu computadora primero

```bash
npm install
cp .env.example .env
```

Abre `.env` y llena al menos:
- `DATABASE_URL` (la de Neon, ver paso 0 arriba — sin esta, el bot no puede guardar citas)
- `BARBER_NAME` (opcional, por defecto "el barbero")
- `GEMINI_API_KEY` (opcional al inicio, y gratis — sin ella, el bot funciona solo con palabras clave y menú, sin el respaldo de IA)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID` (opcionales — sin ellas, el bot guarda igual en Neon, solo omite la copia a Sheets)

Luego corre:
```bash
npm start
```

Te va a aparecer un código QR en la consola. Ábrelo con WhatsApp en el celular de PRUEBA:
`WhatsApp > Configuración > Dispositivos vinculados > Vincular un dispositivo`.

También puedes abrir `http://localhost:3000/qr` en el navegador para escanearlo más grande.

Una vez conectado, escríbele al número de prueba desde otro celular y prueba el flujo.

## 2. Subirlo a Render (gratis)

1. Sube esta carpeta a un repositorio de GitHub.
2. En [render.com](https://render.com), crea un **Web Service** nuevo, conectado a ese repo.
3. Configuración:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Plan:** Free
4. En la sección **Environment**, agrega las mismas variables que en `.env`:
   - `DATABASE_URL` (la de Neon)
   - `BARBER_NAME`
   - `GEMINI_API_KEY` (gratis, sin tarjeta)
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID` (si quieres la copia a Sheets)
   - `PUBLIC_URL` → aquí pon la URL que Render te asigna, ej: `https://barber-bot-xxxx.onrender.com` (la sabes después del primer deploy, y luego la agregas y vuelve a desplegar)

   ⚠️ Al pegar `GOOGLE_PRIVATE_KEY` en Render, cópiala tal cual viene en el JSON descargado (incluyendo los `\n` como texto) — el código ya se encarga de convertirlos en saltos de línea reales.
5. Cuando termine el deploy, entra a los **Logs** del servicio en Render — ahí vas a ver el QR en texto, o simplemente abre `https://tu-url.onrender.com/qr` en el navegador y escanéalo con el WhatsApp de prueba.

### Importante sobre que Render no se duerma
Ya dejé programado un auto-ping cada 4 minutos usando `PUBLIC_URL` (usa el mismo servicio para pingearse a sí mismo). Como respaldo extra, también puedes registrar la URL en [UptimeRobot](https://uptimerobot.com) (gratis) para que la visite cada 5 minutos desde afuera — es más confiable que el auto-ping interno.

### Sobre la sesión de WhatsApp
Render Free no tiene disco persistente garantizado entre reinicios, así que de vez en cuando (cuando Render reinicie el servicio) vas a tener que volver a escanear el QR en `/qr`. Esto **ya no afecta las citas** (esas viven seguras en Neon) — solo significa que el vínculo del WhatsApp se puede desconectar y hay que reconectar. Para un prototipo está bien; si más adelante se vuelve el bot "oficial", conviene un plan con disco persistente o la API oficial de WhatsApp.

## 3. Cuando quieras que el barbero retome la conversación manualmente

Si el bot ya le dijo a un cliente "ya le avisé al barbero", el bot deja de responder en ese chat. Cuando el barbero termine de hablar con ese cliente y quiera que el bot vuelva a atender ese número, basta con que escriba **`!reset`** en ese mismo chat desde su propio celular, y el bot retoma el control ahí.

## 4. Ajustar servicios, precios, palabras clave o menú

- **Servicios y precios (los 7 que maneja el barbero):** `lib/services.js` — cámbialos ahí, todo lo demás se actualiza solo.
- Palabras clave: `lib/keywords.js`
- Textos del menú principal: `lib/flow.js`
- Prompt que usa la IA para interpretar mensajes ambiguos: `lib/ai.js`

## Estructura del proyecto

```
barber-bot/
├── index.js          # servidor + conexión a WhatsApp + keep-alive
├── lib/
│   ├── db.js           # conexión a Neon/Postgres (citas y estado de conversación)
│   ├── sheets.js        # copia automática de citas a Google Sheets
│   ├── services.js      # catálogo de servicios y precios (edítalo aquí)
│   ├── keywords.js      # detección de palabras clave
│   ├── flow.js          # flujo de la conversación (menú, agendar, etc.)
│   └── ai.js            # respaldo con IA (Gemini, gratis) para mensajes ambiguos
├── data/                # aquí se guarda solo la sesión de WhatsApp (wwebjs_auth)
├── .env.example
└── package.json
```
