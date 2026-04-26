const { google } = require('googleapis');

// Cache para documentos de Drive
let docsCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 3600000; // 1 hora

async function getServiceAccountAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY no configurada');
  }

  const keyFile = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

  const auth = new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });

  return await auth.getClient();
}

async function getDriveDocuments(folderId) {
  // Retorna cache si es válido
  if (docsCache && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_TTL) {
    return docsCache;
  }

  try {
    const authClient = await getServiceAccountAuth();
    const drive = google.drive({ version: 'v3', auth: authClient });

    // Busca archivos Word en la carpeta
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, modifiedTime)',
      pageSize: 50
    });

    const files = response.data.files || [];
    const docs = [];

    // Lee el contenido de cada documento
    for (const file of files) {
      try {
        const content = await downloadFileAsText(drive, file.id);
        docs.push({
          name: file.name,
          content: content,
          modifiedTime: file.modifiedTime
        });
      } catch (err) {
        console.error(`Error leyendo ${file.name}:`, err.message);
      }
    }

    // Cachea los documentos
    docsCache = docs;
    cacheTimestamp = Date.now();

    return docs;
  } catch (err) {
    console.error('Error en getDriveDocuments:', err.message);
    throw err;
  }
}

async function downloadFileAsText(drive, fileId) {
  try {
    const response = await drive.files.export({
      fileId: fileId,
      mimeType: 'text/plain'
    });
    return response.data;
  } catch (err) {
    console.error(`Error exportando ${fileId}:`, err.message);
    throw err;
  }
}

function formatDocsForPrompt(docs) {
  if (!docs || docs.length === 0) return '';

  let formatted = '\n\n=== CONTEXTO DE TADEO (desde Drive) ===\n';
  for (const doc of docs) {
    formatted += `\n## ${doc.name}\n${doc.content.substring(0, 2000)}...\n`;
  }
  formatted += '\n=== FIN DEL CONTEXTO ===\n';

  return formatted;
}

module.exports = {
  getDriveDocuments,
  formatDocsForPrompt
};
