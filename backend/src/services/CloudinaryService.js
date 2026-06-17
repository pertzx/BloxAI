import { v2 as cloudinary } from 'cloudinary';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } from '../config/env.js';

let configured = false;
function ensureConfig() {
  if (configured) return true;
  if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
    return true;
  }
  return false;
}

/**
 * Armazenamento de imagens no Cloudinary. Imagens NUNCA vão para o MongoDB —
 * guardamos apenas a URL retornada.
 */
export const CloudinaryService = {
  isEnabled() {
    return Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
  },

  /** `source` pode ser uma data URI (data:image/png;base64,...) ou uma URL remota. */
  async uploadImage(source, { folder = 'bloxai', publicId } = {}) {
    if (!ensureConfig()) throw new Error('Cloudinary não está configurado no servidor.');
    const res = await cloudinary.uploader.upload(source, {
      folder,
      public_id: publicId,
      resource_type: 'image',
      overwrite: true,
    });
    return res.secure_url;
  },

  /** Upload de um Buffer (ex.: arquivo enviado pelo usuário). */
  async uploadBuffer(buffer, { folder = 'bloxai', resourceType = 'auto' } = {}) {
    if (!ensureConfig()) throw new Error('Cloudinary não está configurado no servidor.');
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: resourceType },
        (err, result) => (err ? reject(err) : resolve(result.secure_url))
      );
      stream.end(buffer);
    });
  },
};
