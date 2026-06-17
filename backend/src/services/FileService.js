import path from 'path';
import AdmZip from 'adm-zip';
import { createRequire } from 'module';
import { CloudinaryService } from './CloudinaryService.js';

// pdf-parse é CommonJS; importamos o módulo interno para evitar o bloco de
// auto-teste do index.js (que tenta ler um PDF de exemplo e quebra).
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

// ── Limites de segurança (anti-exploiter) ──────────────────────────────────────
export const MAX_FILE_SIZE = 15 * 1024 * 1024;      // 15 MB por arquivo (multer)
export const MAX_FILES = 5;                          // por requisição
const MAX_TEXT_CHARS = 60_000;                       // texto extraído por arquivo
const ZIP_MAX_ENTRIES = 80;                          // arquivos dentro do zip
const ZIP_MAX_TOTAL_UNCOMPRESSED = 12 * 1024 * 1024; // soma descompactada (zip bomb)
const ZIP_MAX_TEXT = 80_000;                         // texto total extraído do zip

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'csv', 'log', 'json', 'yaml', 'yml',
  'lua', 'luau', 'js', 'ts', 'jsx', 'tsx', 'py', 'html', 'css', 'xml', 'ini', 'env', 'sql',
]);
const ALLOWED_EXT = new Set([...IMAGE_EXT, ...TEXT_EXT, 'pdf', 'zip']);

function ext(name) {
  const parts = String(name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function sanitizeName(name) {
  return path.basename(String(name || 'arquivo')).replace(/[^\w.\-() ]+/g, '_').slice(0, 120);
}

// Validação por magic bytes — não confia só na extensão/MIME.
function isImageBuffer(buf, e) {
  if (!buf || buf.length < 12) return false;
  if (e === 'png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (e === 'jpg' || e === 'jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (e === 'gif') return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
  if (e === 'webp') return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
  return false;
}

function extractZipText(buffer) {
  let zip;
  try { zip = new AdmZip(buffer); } catch { throw new Error('ZIP inválido ou corrompido.'); }

  const entries = zip.getEntries();
  if (entries.length > ZIP_MAX_ENTRIES) throw new Error('ZIP com arquivos demais.');

  let totalUncompressed = 0;
  let text = '';
  let included = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const entryName = entry.entryName || '';
    // Bloqueia path traversal / caminhos absolutos
    if (entryName.includes('..') || entryName.startsWith('/') || entryName.includes('\\..')) continue;

    const e = ext(entryName);
    if (!TEXT_EXT.has(e)) continue; // apenas texto; ignora binários/executáveis

    const size = Number(entry.header?.size || 0);
    totalUncompressed += size;
    if (totalUncompressed > ZIP_MAX_TOTAL_UNCOMPRESSED) {
      throw new Error('ZIP descompactado excede o limite (possível zip bomb).');
    }

    let content = '';
    try { content = entry.getData().toString('utf-8'); } catch { continue; }

    text += `\n\n----- ${sanitizeName(entryName)} -----\n${content}`;
    included += 1;
    if (text.length > ZIP_MAX_TEXT) { text = text.slice(0, ZIP_MAX_TEXT) + '\n…(truncado)'; break; }
  }

  if (included === 0) return '(ZIP sem arquivos de texto legíveis)';
  return text;
}

/** Processa um arquivo (buffer multer) e retorna um anexo seguro. */
export async function processFile(file) {
  const name = sanitizeName(file.originalname);
  const e = ext(name);

  if (!ALLOWED_EXT.has(e)) {
    throw new Error(`Tipo de arquivo não permitido: .${e || '?'}`);
  }

  if (IMAGE_EXT.has(e)) {
    if (!isImageBuffer(file.buffer, e)) throw new Error(`Imagem inválida: ${name}`);
    if (!CloudinaryService.isEnabled()) throw new Error('Cloudinary não configurado para armazenar imagens.');
    const url = await CloudinaryService.uploadBuffer(file.buffer, { folder: 'bloxai/uploads', resourceType: 'image' });
    return { kind: 'image', name, url };
  }

  if (TEXT_EXT.has(e)) {
    const content = file.buffer.toString('utf-8').slice(0, MAX_TEXT_CHARS);
    return { kind: 'text', name, content };
  }

  if (e === 'pdf') {
    if (!(file.buffer[0] === 0x25 && file.buffer[1] === 0x50 && file.buffer[2] === 0x44 && file.buffer[3] === 0x46)) {
      throw new Error('PDF inválido.'); // %PDF
    }
    let parsed;
    try { parsed = await pdfParse(file.buffer); } catch { throw new Error('Falha ao ler o PDF.'); }
    return { kind: 'text', name, content: String(parsed.text || '').slice(0, MAX_TEXT_CHARS) };
  }

  if (e === 'zip') {
    return { kind: 'text', name, content: extractZipText(file.buffer) };
  }

  throw new Error('Tipo de arquivo não suportado.');
}

/**
 * Monta um bloco de contexto a partir de anexos (texto + imagens) para injetar
 * no prompt da IA. Sanitiza e limita o tamanho.
 */
export function buildAttachmentsBlock(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';

  const parts = [];
  let budget = 100_000; // teto global do bloco

  for (const att of attachments.slice(0, MAX_FILES)) {
    if (!att || typeof att !== 'object') continue;
    const name = sanitizeName(att.name);
    if (att.kind === 'image' && typeof att.url === 'string' && /^https:\/\//.test(att.url)) {
      parts.push(`[Imagem anexada: ${name}] ${att.url}`);
    } else if (att.kind === 'text' && typeof att.content === 'string') {
      const content = att.content.slice(0, Math.max(0, budget));
      budget -= content.length;
      parts.push(`--- Arquivo anexado: ${name} ---\n${content}`);
    }
    if (budget <= 0) break;
  }

  if (parts.length === 0) return '';
  return `ANEXOS DO USUÁRIO (use como contexto):\n${parts.join('\n\n')}`;
}
