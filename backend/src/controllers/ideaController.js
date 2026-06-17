import crypto from 'crypto';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { IdeaHistory } from '../models/IdeaHistory.js';
import { CreditService } from '../services/CreditService.js';
import { PlanService } from '../services/PlanService.js';
import { ModelRouter } from '../ai/ModelRouter.js';
import { ImageService } from '../services/ImageService.js';

const FEW_SHOT_EXAMPLES = `
EXEMPLOS DE JOGOS VIRAIS ROBLOX E POR QUE FUNCIONARAM:
1. Adopt Me! — Loop: adotar pets > criar família > trocar raridades. Viral: trading cria dependência social infinita. Monetização: ovos premium, passe de pets.
2. Brookhaven RP — Loop: morar numa cidade > encenar situações > customizar casa. Viral: sem condição de vitória, sessão infinita. Monetização: casas VIP, veículos exclusivos.
3. Blox Fruits — Loop: comer fruta > subir de nível > caçar bosses > raidear raridades. Viral: frutas raras são moeda social. Monetização: boosts 2x, frutas premium.
4. Tower of Hell — Loop: subir obstáculos sem checkpoint > morrer > tentar de novo. Viral: clips engraçados de morte, competição natural. Monetização: passes de cor, aura.
5. Murder Mystery 2 — Loop: sheriff vs assassino vs inocentes > tensão social > godrim de faca rara. Viral: metas de faca criam FOMO. Monetização: skins de faca, caixas.
`.trim();

const SYSTEM_PROMPT = `Você é um estrategista sênior de jogos Roblox com histórico de criar títulos com mais de 1 bilhão de visitas.
Você pensa em loops viciantes, mechanics sociais, monetização ética e estratégias de crescimento orgânico.
Responda APENAS com JSON válido, sem texto extra, sem markdown, sem blocos de código.`;

const IDEA_JSON_SHAPE = `{
  "title": "Nome do Jogo",
  "tagline": "Uma frase de impacto que vende o jogo em 10 segundos",
  "genre": "Gênero principal",
  "coreLoop": "Descrição detalhada do loop de 3 a 5 passos que o jogador repete",
  "viralMechanic": "O que faz os jogadores compartilharem e recrutarem amigos organicamente",
  "monetization": ["Ângulo 1 de monetização", "Ângulo 2", "Ângulo 3"],
  "uniqueHook": "O que diferencia este jogo de tudo que já existe",
  "targetAudience": "Perfil do jogador ideal e faixa etária",
  "estimatedDifficulty": "Fácil | Médio | Difícil (para desenvolver)"
}`;

const USER_PROMPT_TEMPLATE = (theme) => `
${FEW_SHOT_EXAMPLES}

TEMA / GÊNERO SOLICITADO: ${theme || 'livre — surpreenda-me com algo original e viral'}

Gere UMA ideia de jogo Roblox com alto potencial viral. Pense passo a passo:
1. O que torna viciante (loop reward)
2. A mechanic social/viral que faz jogadores recrutarem amigos
3. Como monetizar sem bloquear o loop principal
4. O diferencial único em relação ao que já existe

Retorne SOMENTE este JSON (sem nenhum texto fora dele):
${IDEA_JSON_SHAPE}
`.trim();

const REFINE_PROMPT_TEMPLATE = (idea, instruction) => `
Aqui está uma ideia de jogo Roblox existente (JSON):
${JSON.stringify(idea, null, 2)}

O usuário pediu a seguinte alteração/refinamento:
"${instruction}"

Aplique a alteração mantendo a coerência do conceito. Pode ajustar qualquer campo necessário.
Retorne SOMENTE o JSON atualizado completo (sem texto fora dele):
${IDEA_JSON_SHAPE}
`.trim();

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('A IA não retornou JSON válido.');
  return JSON.parse(match[0]);
}

function pickModel() {
  const available = ModelRouter.getAvailableModels();
  return available.includes('DeepSeek-V3') ? 'DeepSeek-V3' : available[0] || 'GPT-5.4 Mini';
}

// Cobra o uso da IA (texto) via carteira/margem. Não lança — só loga em caso de erro.
async function chargeText(user, aiResponse, type, projectId = null) {
  const realCostUsd = Number(aiResponse.usage?.estimatedCostUsd || 0);
  if (realCostUsd <= 0) return null;
  try {
    return await CreditService.chargeForUsage({
      userId: String(user._id),
      realCostUsd,
      model: aiResponse.model || type,
      type,
      projectId,
      commandId: null,
      tokens: {
        inputTokens: Number(aiResponse.usage?.inputTokens || 0),
        outputTokens: Number(aiResponse.usage?.outputTokens || 0),
        totalTokens: Number(aiResponse.usage?.totalTokens || 0),
      },
    });
  } catch (err) {
    console.error(`[idea] falha ao cobrar (${type}):`, err?.message);
    return null;
  }
}

function gateAndEligibility(user, res) {
  if (!PlanService.hasFeature(user, 'ideaGenerator')) {
    res.status(403).json({
      error: 'O Gerador de Ideias Virais não está disponível no seu plano atual.',
      code: 'FEATURE_NOT_IN_PLAN',
    });
    return false;
  }
  const eligibility = CreditService.checkSpendEligibility(user);
  if (!eligibility.allowed) {
    res.status(402).json({ error: eligibility.reason, code: eligibility.code });
    return false;
  }
  return true;
}

function serializeHistory(h) {
  return {
    id: String(h._id),
    theme: h.theme,
    idea: h.idea,
    imageUrl: h.imageUrl || '',
    model: h.model,
    refinedFrom: h.refinedFrom ? String(h.refinedFrom) : null,
    instruction: h.instruction || '',
    appliedTo: (h.appliedTo || []).map((a) => ({ projectId: String(a.projectId), projectName: a.projectName, at: a.at })),
    createdAt: h.createdAt,
  };
}

// ── Gerar nova ideia ───────────────────────────────────────────────────────────
export const generateGameIdea = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!gateAndEligibility(user, res)) return;

    const { theme } = req.body || {};
    const cleanTheme = typeof theme === 'string' ? theme.trim().slice(0, 200) : '';
    const model = pickModel();

    const aiResponse = await ModelRouter.generateResponse(USER_PROMPT_TEMPLATE(cleanTheme), {
      model, systemPrompt: SYSTEM_PROMPT, maxTokens: 900, temperature: 0.85,
    });

    let idea;
    try { idea = extractJson(aiResponse.text); }
    catch { return res.status(502).json({ error: 'A IA retornou uma resposta inválida. Tente novamente.', raw: aiResponse.text?.slice(0, 300) }); }

    const billing = await chargeText(user, aiResponse, 'idea_generation');
    const saved = await IdeaHistory.create({ user: user._id, theme: cleanTheme, idea, model: aiResponse.model || model });

    res.json({ success: true, history: serializeHistory(saved), billing });
  } catch (err) {
    console.error('[idea] generateGameIdea:', err);
    res.status(500).json({ error: 'Falha ao gerar ideia.' });
  }
};

// ── Refinar / editar uma ideia existente ───────────────────────────────────────
export const refineIdea = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!gateAndEligibility(user, res)) return;

    const { historyId, instruction } = req.body || {};
    const cleanInstruction = typeof instruction === 'string' ? instruction.trim().slice(0, 400) : '';
    if (!historyId || !cleanInstruction) {
      return res.status(400).json({ error: 'historyId e instruction são obrigatórios.' });
    }

    const source = await IdeaHistory.findOne({ _id: historyId, user: user._id }).lean();
    if (!source) return res.status(404).json({ error: 'Ideia não encontrada.' });

    const model = pickModel();
    const aiResponse = await ModelRouter.generateResponse(REFINE_PROMPT_TEMPLATE(source.idea, cleanInstruction), {
      model, systemPrompt: SYSTEM_PROMPT, maxTokens: 900, temperature: 0.7,
    });

    let idea;
    try { idea = extractJson(aiResponse.text); }
    catch { return res.status(502).json({ error: 'A IA retornou uma resposta inválida. Tente novamente.', raw: aiResponse.text?.slice(0, 300) }); }

    const billing = await chargeText(user, aiResponse, 'idea_refine');
    const saved = await IdeaHistory.create({
      user: user._id, theme: source.theme, idea, model: aiResponse.model || model,
      refinedFrom: source._id, instruction: cleanInstruction,
    });

    res.json({ success: true, history: serializeHistory(saved), billing });
  } catch (err) {
    console.error('[idea] refineIdea:', err);
    res.status(500).json({ error: 'Falha ao refinar ideia.' });
  }
};

// ── Gerar imagem de conceito (gpt-image-2) ─────────────────────────────────────
export const generateIdeaImage = async (req, res) => {
  try {
    if (!ImageService.isEnabled()) {
      return res.status(503).json({ error: 'Geração de imagem não está configurada.' });
    }
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!gateAndEligibility(user, res)) return;

    const { historyId } = req.body || {};
    const history = await IdeaHistory.findOne({ _id: historyId, user: user._id });
    if (!history) return res.status(404).json({ error: 'Ideia não encontrada.' });

    const idea = history.idea;
    const prompt = `Roblox-style 3D game cover art, vibrant and stylized, for a game called "${idea.title}". ${idea.tagline}. Genre: ${idea.genre}. ${idea.uniqueHook}. No text, no watermark, cinematic lighting, high quality render.`;

    const { url: imageUrl, estimatedCostUsd } = await ImageService.generate(prompt, { size: '1024x1024', quality: 'medium' });

    // Cobra a imagem via margem (mesma carteira)
    let billing = null;
    try {
      billing = await CreditService.chargeForUsage({
        userId: String(user._id), realCostUsd: estimatedCostUsd,
        model: 'gpt-image-2', type: 'idea_image', projectId: null, commandId: null,
        tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    } catch (e) { console.error('[idea] falha ao cobrar imagem:', e?.message); }

    history.imageUrl = imageUrl;
    await history.save();

    res.json({ success: true, imageUrl, billing });
  } catch (err) {
    console.error('[idea] generateIdeaImage:', err);
    res.status(500).json({ error: err.message || 'Falha ao gerar imagem.' });
  }
};

// ── Histórico ──────────────────────────────────────────────────────────────────
export const listIdeaHistory = async (req, res) => {
  try {
    const items = await IdeaHistory.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ history: items.map(serializeHistory) });
  } catch (err) {
    console.error('[idea] listIdeaHistory:', err);
    res.status(500).json({ error: 'Falha ao carregar histórico.' });
  }
};

// ── Aplicar ideia ao contexto de um projeto ────────────────────────────────────
export const applyIdeaToProject = async (req, res) => {
  try {
    const { historyId, projectId } = req.body || {};
    if (!historyId || !projectId) return res.status(400).json({ error: 'historyId e projectId são obrigatórios.' });

    const history = await IdeaHistory.findOne({ _id: historyId, user: req.user.id });
    if (!history) return res.status(404).json({ error: 'Ideia não encontrada.' });

    const project = await Project.findOne({ _id: projectId, owner: req.user.id });
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });

    const idea = history.idea;
    const items = [
      `🎮 Conceito do jogo: ${idea.title} — ${idea.tagline}`,
      `🔄 Core loop: ${idea.coreLoop}`,
      `🚀 Mecânica viral: ${idea.viralMechanic}`,
      `💰 Monetização: ${(idea.monetization || []).join('; ')}`,
      `✨ Diferencial: ${idea.uniqueHook}`,
    ];

    const newContextItems = items.map((text) => ({
      id: crypto.randomBytes(8).toString('hex'),
      text: text.slice(0, 500),
      done: false,
      createdAt: new Date(),
    }));

    project.contextState = [...(project.contextState || []), ...newContextItems].slice(-100);
    await project.save();

    history.appliedTo.push({ projectId: project._id, projectName: project.name, at: new Date() });
    await history.save();

    res.json({ success: true, projectName: project.name, addedItems: newContextItems.length });
  } catch (err) {
    console.error('[idea] applyIdeaToProject:', err);
    res.status(500).json({ error: 'Falha ao aplicar ideia ao projeto.' });
  }
};
