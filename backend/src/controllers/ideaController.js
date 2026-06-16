import { User } from '../models/User.js';
import { CreditService } from '../services/CreditService.js';
import { PlanService } from '../services/PlanService.js';
import { ModelRouter } from '../ai/ModelRouter.js';

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

const USER_PROMPT_TEMPLATE = (theme) => `
${FEW_SHOT_EXAMPLES}

TEMA / GÊNERO SOLICITADO: ${theme || 'livre — surpreenda-me com algo original e viral'}

Gere UMA ideia de jogo Roblox com alto potencial viral. Pense passo a passo:
1. O que torna viciante (loop reward)
2. A mechanic social/viral que faz jogadores recrutarem amigos
3. Como monetizar sem bloquear o loop principal
4. O diferencial único em relação ao que já existe

Retorne SOMENTE este JSON (sem nenhum texto fora dele):
{
  "title": "Nome do Jogo",
  "tagline": "Uma frase de impacto que vende o jogo em 10 segundos",
  "genre": "Gênero principal",
  "coreLoop": "Descrição detalhada do loop de 3 a 5 passos que o jogador repete",
  "viralMechanic": "O que faz os jogadores compartilharem e recrutarem amigos organicamente",
  "monetization": ["Ângulo 1 de monetização", "Ângulo 2", "Ângulo 3"],
  "uniqueHook": "O que diferencia este jogo de tudo que já existe",
  "targetAudience": "Perfil do jogador ideal e faixa etária",
  "estimatedDifficulty": "Fácil | Médio | Difícil (para desenvolver)"
}
`.trim();

function extractJson(text) {
  // Tenta extrair JSON do texto caso o modelo adicione texto extra
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('A IA não retornou JSON válido.');
  return JSON.parse(match[0]);
}

export const generateGameIdea = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    // Liberado conforme a feature do plano (admin sempre tem acesso)
    if (!PlanService.hasFeature(user, 'ideaGenerator')) {
      return res.status(403).json({
        error: 'O Gerador de Ideias Virais não está disponível no seu plano atual.',
        code: 'FEATURE_NOT_IN_PLAN',
      });
    }

    // Verifica saldo / status
    const eligibility = CreditService.checkSpendEligibility(user);
    if (!eligibility.allowed) {
      return res.status(402).json({ error: eligibility.reason, code: eligibility.code });
    }

    const { theme } = req.body || {};
    const prompt = USER_PROMPT_TEMPLATE(typeof theme === 'string' ? theme.trim().slice(0, 200) : '');

    // Usa o modelo mais capaz disponível para melhor qualidade de ideia
    const availableModels = ModelRouter.getAvailableModels();
    const preferredModel = availableModels.includes('DeepSeek-V3')
      ? 'DeepSeek-V3'
      : availableModels[0] || 'GPT-5.4 Mini';

    const aiResponse = await ModelRouter.generateResponse(prompt, {
      model: preferredModel,
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 900,
      temperature: 0.85,
    });

    let idea;
    try {
      idea = extractJson(aiResponse.text);
    } catch {
      return res.status(502).json({
        error: 'A IA retornou uma resposta inválida. Tente novamente.',
        raw: aiResponse.text?.slice(0, 300),
      });
    }

    // Cobra o uso
    const realCostUsd = Number(aiResponse.usage?.estimatedCostUsd || 0);
    let billing = null;
    if (realCostUsd > 0) {
      try {
        billing = await CreditService.chargeForUsage({
          userId: String(user._id),
          realCostUsd,
          model: aiResponse.model || preferredModel,
          type: 'idea_generation',
          projectId: null,
          commandId: null,
          tokens: {
            inputTokens:  Number(aiResponse.usage?.inputTokens  || 0),
            outputTokens: Number(aiResponse.usage?.outputTokens || 0),
            totalTokens:  Number(aiResponse.usage?.totalTokens  || 0),
          },
        });
      } catch (billingErr) {
        console.error('[idea] falha ao cobrar:', billingErr?.message);
      }
    }

    res.json({ success: true, idea, billing, model: aiResponse.model || preferredModel });
  } catch (err) {
    console.error('[idea] generateGameIdea:', err);
    res.status(500).json({ error: 'Falha ao gerar ideia.' });
  }
};
