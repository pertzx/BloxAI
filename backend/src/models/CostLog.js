import mongoose from 'mongoose';

// Objeto de auditoria interna de custo por geração de IA.
// Espelha { custo_real, modelo, tipo_geracao, data_timestamp } da especificação,
// acrescido do detalhamento de margem/cobrança e tokens.
const costLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
  command: { type: mongoose.Schema.Types.ObjectId, ref: 'Command' },
  type: { type: String, default: 'generic' }, // tipo_geracao (taskType)
  model: { type: String, default: 'unknown' }, // modelo
  realCostUsd: { type: Number, default: 0 }, // custo_real
  multiplier: { type: Number, default: 1 },
  marginPercent: { type: Number, default: 0 },
  chargedUsd: { type: Number, default: 0 }, // custo para a plataforma (debitado/exibido)
  profitUsd: { type: Number, default: 0 },
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  balanceAfterUsd: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true }, // data_timestamp
});

export const CostLog = mongoose.models.CostLog || mongoose.model('CostLog', costLogSchema);
