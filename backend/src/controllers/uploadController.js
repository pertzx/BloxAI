import multer from 'multer';
import { processFile, MAX_FILE_SIZE, MAX_FILES } from '../services/FileService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});

// Middleware que captura erros do multer (tamanho/quantidade) e responde 400.
export const uploadMiddleware = (req, res, next) => {
  upload.array('files', MAX_FILES)(req, res, (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máx. 15 MB).'
        : err.code === 'LIMIT_FILE_COUNT' ? `Máximo de ${MAX_FILES} arquivos por envio.`
        : 'Falha no upload do arquivo.';
      return res.status(400).json({ error: msg });
    }
    next();
  });
};

export const handleUpload = async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    const attachments = [];
    for (const file of files) {
      try {
        attachments.push(await processFile(file));
      } catch (e) {
        return res.status(400).json({ error: e.message || 'Arquivo rejeitado.' });
      }
    }

    res.json({ attachments });
  } catch (error) {
    console.error('[upload] handleUpload:', error);
    res.status(500).json({ error: 'Falha ao processar o upload.' });
  }
};
