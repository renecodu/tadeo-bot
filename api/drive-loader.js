const { google } = require('googleapis');
const mammoth = require('mammoth');

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

    // Busca Google Docs nativos Y archivos Word .docx subidos
    const response = await drive.files.list({
      q: `'${folderId}' in parents and (mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document') and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, mimeType, modifiedTime)',
      pageSize: 50
    });

    const files = response.data.files || [];
    const docs = [];

    // Lee el contenido de cada documento según su tipo
    for (const file of files) {
      try {
        let content = null;

        if (file.mimeType === 'application/vnd.google-apps.document') {
          // Google Doc nativo → export como texto plano
          content = await exportGoogleDoc(drive, file.id);
        } else if (file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          // Word .docx subido → descargar binario y extraer texto con mammoth
          content = await extractDocxText(drive, file.id);
        }

        if (content) {
          docs.push({
            name: file.name,
            content: content,
            modifiedTime: file.modifiedTime
          });
        }
      } catch (err) {
        console.error(`Error leyendo ${file.name}:`, err.message);
      }
    }

    // Cachea los documentos
    docsCache = docs;
    cacheTimestamp = Date.now();

    console.log(`✅ Documentos de Drive cargados: ${docs.length} archivos`);
    return docs;
  } catch (err) {
    console.error('Error en getDriveDocuments:', err.message);
    throw err;
  }
}

async function exportGoogleDoc(drive, fileId) {
  const response = await drive.files.export({
    fileId: fileId,
    mimeType: 'text/plain'
  });
  return response.data;
}

async function extractDocxText(drive, fileId) {
  const response = await drive.files.get(
    { fileId: fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  const buffer = Buffer.from(response.data);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function formatDocsForPrompt(docs) {
  if (!docs || docs.length === 0) return '';

  let formatted = '\n\n=== CONTEXTO DE TADEO (desde Drive) ===\n';
  for (const doc of docs) {
    formatted += `\n## ${doc.name}\n${doc.content.substring(0, 4000)}\n`;
  }
  formatted += '\n=== FIN DEL CONTEXTO ===\n';

  return formatted;
}

module.exports = {
  getDriveDocuments,
  formatDocsForPrompt
};
