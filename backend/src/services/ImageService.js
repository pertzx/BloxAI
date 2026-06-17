import { OPENAI_API_KEY } from '../config/env.js';
import { CloudinaryService } from './CloudinaryService.js';

const IMAGE_MODEL = 'gpt-image-2';
// Estimativa de custo real por imagem (1024x1024, qualidade média). Ajuste conforme o preço real.
const IMAGE_COST_USD = 0.04;

/**
 * Geração de imagem via OpenAI Images API (gpt-image-2).
 * A imagem é enviada ao Cloudinary — guardamos apenas a URL (nunca base64 no DB).
 */
export const ImageService = {
  isEnabled() {
    // Precisa da OpenAI (gerar) e do Cloudinary (armazenar).
    return Boolean(OPENAI_API_KEY) && CloudinaryService.isEnabled();
  },

  async generate(prompt, { size = '1024x1024', quality = 'medium' } = {}) {
    if (!OPENAI_API_KEY) throw new Error('Geração de imagem não está configurada no servidor.');
    if (!CloudinaryService.isEnabled()) {
      throw new Error('Cloudinary não está configurado — necessário para armazenar as imagens.');
    }

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt, size, quality, n: 1 }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Falha na geração de imagem: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    const remoteUrl = data?.data?.[0]?.url;

    const source = b64 ? `data:image/png;base64,${b64}` : remoteUrl;
    if (!source) throw new Error('Resposta de imagem inválida.');

    // Sobe para o Cloudinary e devolve só a URL.
    const url = await CloudinaryService.uploadImage(source, { folder: 'bloxai/ideas' });
    return { url, estimatedCostUsd: IMAGE_COST_USD };
  },
};
