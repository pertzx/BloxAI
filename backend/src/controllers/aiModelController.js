import { AiModel } from '../models/AiModel.js';
import { ModelRegistry } from '../services/ModelRegistry.js';

const PROVIDERS = ['openai', 'anthropic', 'deepseek'];

function sanitize(body = {}, { partial = false } = {}) {
  const out = {};
  if (body.label !== undefined) out.label = String(body.label).trim();
  if (body.apiModel !== undefined) out.apiModel = String(body.apiModel).trim();
  if (body.description !== undefined) out.description = String(body.description).trim();
  if (body.provider !== undefined) {
    if (!PROVIDERS.includes(body.provider)) throw new Error('Provedor inválido (use openai, anthropic ou deepseek).');
    out.provider = body.provider;
  }
  if (body.inputPer1M !== undefined) out.inputPer1M = clamp(body.inputPer1M, 0, Number.MAX_SAFE_INTEGER);
  if (body.outputPer1M !== undefined) out.outputPer1M = clamp(body.outputPer1M, 0, Number.MAX_SAFE_INTEGER);
  if (body.enabled !== undefined) out.enabled = Boolean(body.enabled);
  if (body.isDefault !== undefined) out.isDefault = Boolean(body.isDefault);
  if (body.order !== undefined) out.order = Number(body.order) || 0;

  if (!partial) {
    if (!out.label) throw new Error('Nome (label) é obrigatório.');
    if (!out.provider) throw new Error('Provedor é obrigatório.');
    if (!out.apiModel) throw new Error('apiModel (id real na API) é obrigatório.');
  }
  return out;
}

function clamp(raw, min, max) {
  const v = Number(raw);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

async function ensureSingleDefault(model) {
  if (model.isDefault) {
    await AiModel.updateMany({ _id: { $ne: model._id } }, { isDefault: false });
  }
}

// Lista modelos + status de cada provedor (chave configurada ou não).
export const listAiModels = async (_req, res) => {
  try {
    await ModelRegistry.refresh();
    const models = ModelRegistry.all().map((m) => ({
      ...m,
      providerConfigured: ModelRegistry.isProviderConfigured(m.provider),
      available: m.enabled && ModelRegistry.isProviderConfigured(m.provider),
    }));
    res.json({ models, providers: ModelRegistry.providerStatus() });
  } catch (error) {
    console.error('[aiModels] list:', error);
    res.status(500).json({ error: 'Falha ao listar modelos.' });
  }
};

export const createAiModel = async (req, res) => {
  try {
    const data = sanitize(req.body);
    const exists = await AiModel.findOne({ label: data.label });
    if (exists) return res.status(409).json({ error: 'Já existe um modelo com esse nome.' });

    const model = await AiModel.create(data);
    await ensureSingleDefault(model);
    await ModelRegistry.refresh();
    res.status(201).json({ success: true, model });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Falha ao criar modelo.' });
  }
};

export const updateAiModel = async (req, res) => {
  try {
    const data = sanitize(req.body, { partial: true });
    if (data.label) {
      const clash = await AiModel.findOne({ label: data.label, _id: { $ne: req.params.id } });
      if (clash) return res.status(409).json({ error: 'Já existe um modelo com esse nome.' });
    }
    const model = await AiModel.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!model) return res.status(404).json({ error: 'Modelo não encontrado.' });
    await ensureSingleDefault(model);
    await ModelRegistry.refresh();
    res.json({ success: true, model });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Falha ao atualizar modelo.' });
  }
};

export const deleteAiModel = async (req, res) => {
  try {
    const model = await AiModel.findByIdAndDelete(req.params.id);
    if (!model) return res.status(404).json({ error: 'Modelo não encontrado.' });
    await ModelRegistry.refresh();
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Falha ao remover modelo.' });
  }
};
