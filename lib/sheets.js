const { google } = require('googleapis');

let sheetsClient = null;

// Arma el cliente autenticado de Google Sheets usando una cuenta de servicio.
// Si faltan las variables de entorno, la sincronización simplemente se omite
// (el bot sigue funcionando normal, solo no copia a Sheets).
function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) return null;

  const auth = new google.auth.JWT({
    email,
    key: privateKey.replace(/\\n/g, '\n'), // en .env los saltos de línea van escapados
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

// Agrega una fila nueva a la hoja con los datos de la cita.
// Nunca debe tumbar el flujo del bot: si falla, solo se registra el error.
async function appendAppointmentToSheet({ clientName, requestedWhen, chatId, serviceName, price, gender, color }) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheets = getSheetsClient();

  if (!sheets || !sheetId) {
    console.warn('Google Sheets no configurado, se omite la copia de esta cita');
    return;
  }

  const detalle = [gender, color].filter(Boolean).join(' / ');

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Citas!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toLocaleString('es-CO'),
          clientName,
          serviceName || '',
          detalle,
          requestedWhen,
          price != null ? `$${price.toLocaleString('es-CO')}` : '',
          chatId
        ]]
      }
    });
  } catch (err) {
    console.error('Error escribiendo en Google Sheets:', err.message);
  }
}

module.exports = { appendAppointmentToSheet };
