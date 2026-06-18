import mongoose from 'mongoose';

/**
 * Registro dinâmico de modelos de IA — gerenciado pelo admin em runtime.
 *
 * O admin cadastra quais modelos existem, de qual PROVEDOR (cada provedor tem
 * arquitetura de request diferente) e qual é o id real na API. Um modelo só fica
 * disponível para os usuários se estiver `enabled` E a chave do provedor estiver
 * configurada no .env (status OK). O pricing é usado para a cobrança por uso.
 */
const aiModelSchema = new mongoose.Schema({
  // Nome de exibição mostrado ao usuário (ex.: "GPT-4o", "Claude 3.5 Sonnet"). Único.
  label: { type: String, required: true, unique: true, trim: true },

  // Provedor / arquitetura de request. Determina URL, header de auth e formato.
  provider: { type: String, enum: ['openai', 'anthropic', 'deepseek'], required: true },

  // Id real do modelo na API do provedor (ex.: "gpt-4o", "claude-3-5-sonnet-20240620").
  apiModel: { type: String, required: true, trim: true },

  description: { type: String, default: '' },

  // Preço para cobrança (USD por 1 milhão de tokens).
  inputPer1M: { type: Number, default: 0, min: 0 },
  outputPer1M: { type: Number, default: 0, min: 0 },

  // Admin permite (aparece para os usuários) ou não.
  enabled: { type: Boolean, default: true },

  // Modelo padrão usado quando o usuário não escolhe um. Apenas um deve ser true.
  isDefault: { type: Boolean, default: false },

  order: { type: Number, default: 0 },
}, { timestamps: true });

export const AiModel = mongoose.models.AiModel || mongoose.model('AiModel', aiModelSchema);
