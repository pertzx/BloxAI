import { OPENAI_API_KEY } from '../config/env.js';

const IMAGE_MODEL = 'gpt-image-2';
// Estimativa de custo real por imagem (1024x1024, qualidade média). Ajuste conforme o preço real.
const IMAGE_COST_USD = 0.04;

/**
 * Geração de imagem via OpenAI Images API (gpt-image-2).
 * Retorna um data URL base64 + a estimativa de custo para cobrança via margem.
 */
export const ImageService = {
  isEnabled() {
    return Boolean(OPENAI_API_KEY);
  },

  async generate(prompt, { size = '1024x1024', quality = 'medium' } = {}) {
    if (!OPENAI_API_KEY) throw new Error('Geração de imagem não está configurada no servidor.');

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
    const url = data?.data?.[0]?.url;
    if (b64) return { dataUrl: `data:image/png;base64,${b64}`, estimatedCostUsd: IMAGE_COST_USD };
    if (url) return { dataUrl: url, estimatedCostUsd: IMAGE_COST_USD };
    throw new Error('Resposta de imagem inválida.');
  },
};
