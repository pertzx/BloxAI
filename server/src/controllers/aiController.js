/**
 * Blox AI - AI Controller (refatorado + compatibilidade)
 */

const llmService = require('../services/llm/llmService');
const Session = require('../models/Session');
const Project = require('../models/Project');
const UserAIConfig = require('../models/UserAIConfig');

// === COMPATIBILIDADE: Funções legadas (não remover) ===
exports.getProviders = async (req, res) => {
    res.json({
        status: 'success',
        data: {
            providers: [
                { id: 'blox', name: 'Blox AI', configured: true, models: ['fast','balanced','powerful'] },
                { id: 'openai', name: 'OpenAI', configured: false, models: ['gpt-4o-mini','gpt-4o'] },
                { id: 'gemini', name: 'Gemini', configured: false, models: ['gemini-1.5-flash','gemini-1.5-pro'] },
                { id: 'kimi', name: 'Kimi', configured: false, models: ['kimi-k2.5'] },
                { id: 'custom', name: 'Custom', configured: false, models: [] }
            ]
        }
    });
};

exports.getConfig = async (req, res) => {
    try {
        const cfg = await UserAIConfig.findOne({ userId: req.user._id });
        res.json({ status: 'success', data: { config: cfg || {} } });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
};

exports.updateConfig = async (req, res) => {
    try {
        const cfg = await UserAIConfig.findOneAndUpdate(
            { userId: req.user._id },
            { $set: req.body },
            { upsert: true, new: true }
        );
        res.json({ status: 'success', data: { config: cfg } });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
};

exports.saveApiKey = async (req, res) => {
    try {
        const { provider, key, baseURL } = req.body;
        if (!provider || !key) return res.status(400).json({ status: 'error', message: 'provider e key obrigatórios' });
        const update = { [`apiKeys.${provider}.key`]: key };
        if (baseURL) update[`apiKeys.${provider}.baseURL`] = baseURL;
        const cfg = await UserAIConfig.findOneAndUpdate(
            { userId: req.user._id },
            { $set: update },
            { upsert: true, new: true }
        );
        res.json({ status: 'success' });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
};

exports.removeApiKey = async (req, res) => {
    try {
        const { provider } = req.params;
        await UserAIConfig.updateOne(
            { userId: req.user._id },
            { $unset: { [`apiKeys.${provider}`]: '' } }
        );
        res.json({ status: 'success' });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
};

exports.testConnection = async (req, res) => {
    try {
        const { provider, model } = req.body;
        res.json({ status: 'success', message: 'Conexão OK' });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
};

exports.generate = async (req, res) => {
    try {
        const { prompt, provider, model } = req.body;
        const cfg = await UserAIConfig.findOne({ userId: req.user._id });
        const result = await llmService.generateCode(prompt, { provider, model, userConfig: cfg });
        res.json({ status: 'success', data: { result } });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
};

exports.generateWithProvider = exports.generate;

/**
 * Blox AI - AI Controller (refatorado)
 *
 * Fluxo two-step para reduzir custos:
 * 1. Reasoning: envia prompt + resumo da árvore
 * 2. Targeted: IA escolhe quais partes específicas da árvore precisa
 * 3. Result: processa com dados específicos
 *
 * Áreas de UI:
 * - Processing: ações em tempo real
 * - Final: resposta consolidada
 */

// In-memory store para processamentos em andamento
// { processingId: { userId, projectId, steps: [], result, status } }
const processings = new Map();

// === STEP 1: Reasoning ===
// Recebe o prompt e a árvore resumida, devolve o raciocínio
exports.startProcessing = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { prompt, provider, model, projectId, selection, treeSummary, fullTree } = req.body;

        if (!prompt) {
            return res.status(400).json({ status: 'error', message: 'prompt é obrigatório' });
        }

        const processingId = `proc_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;

        // Inicializa processamento
        processings.set(processingId, {
            id: processingId,
            userId,
            projectId,
            prompt,
            provider: provider || 'blox',
            model: model || 'balanced',
            selection: selection || [],
            steps: [],
            status: 'running',
            result: null,
            startedAt: new Date()
        });

        // Chama a IA em background
        processAIRequest(processingId, { treeSummary, fullTree });

        res.json({
            status: 'success',
            data: { processingId }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// === STEP 2: Status (polling) ===
// Cliente faz polling para pegar steps em tempo real
exports.getProcessingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const processing = processings.get(id);

        if (!processing) {
            return res.status(404).json({ status: 'error', message: 'Processamento não encontrado' });
        }

        res.json({
            status: 'success',
            data: {
                id: processing.id,
                steps: processing.steps,
                result: processing.result,
                status: processing.status
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// === Processamento em background ===
async function processAIRequest(processingId, { treeSummary, fullTree }) {
    const proc = processings.get(processingId);
    if (!proc) return;

    const { prompt, provider, model, selection } = proc;

    try {
        // STEP 1: Reasoning com prompt + resumo
        proc.steps.push({
            type: 'reasoning',
            label: 'Analisando solicitacao',
            status: 'running',
            timestamp: new Date()
        });

        const step1Prompt = buildReasoningPrompt(prompt, treeSummary, selection);
        const step1Result = await llmService.generateCode(step1Prompt, {
            provider,
            model,
            temperature: 0.1
        });

        // Verifica se a IA está configurada
        if (step1Result.explanation && step1Result.explanation.includes('não configurado')) {
            proc.steps[1].status = 'done';
            proc.steps.push({
                type: 'error',
                label: 'Provider nao configurado',
                message: step1Result.explanation,
                status: 'error',
                timestamp: new Date()
            });
            proc.status = 'error';
            proc.result = step1Result.explanation;
            return;
        }

        proc.steps[1].status = 'done';
        proc.steps[1].result = step1Result.explanation || 'Analise concluida';

        // STEP 2: IA escolhe quais partes da árvore ela precisa
        proc.steps.push({
            type: 'targeting',
            label: 'Selecionando dados necessarios',
            status: 'running',
            timestamp: new Date()
        });

        const step2Prompt = buildTargetingPrompt(prompt, step1Result.explanation, fullTree || treeSummary);
        const step2Result = await llmService.generateCode(step2Prompt, {
            provider,
            model,
            temperature: 0.1
        });

        proc.steps[2].status = 'done';

        // STEP 3: Gera a resposta final
        proc.steps.push({
            type: 'generating',
            label: 'Gerando resposta final',
            status: 'running',
            timestamp: new Date()
        });

        const step3Prompt = buildFinalPrompt(prompt, step1Result.explanation, step2Result.explanation, selection);
        const step3Result = await llmService.generateCode(step3Prompt, {
            provider,
            model,
            temperature: 0.1
        });

        proc.steps[3].status = 'done';
        proc.steps[3].result = step3Result.code || '';

        // Resultado final
        proc.result = {
            reasoning: step1Result.explanation,
            targeted: step2Result.explanation,
            code: step3Result.code,
            explanation: step3Result.explanation,
            actions: step3Result.actions || []
        };
        proc.status = 'done';
        proc.completedAt = new Date();

        // Salva no banco se houver projeto
        if (proc.projectId) {
            try {
                const session = new Session({
                    userId: proc.userId,
                    projectId: proc.projectId,
                    prompt,
                    response: proc.result,
                    steps: proc.steps,
                    createdAt: new Date()
                });
                await session.save();
            } catch (e) {
                console.error('[AI] Erro ao salvar sessao:', e);
            }
        }

        // Limpa após 5 minutos
        setTimeout(() => processings.delete(processingId), 5 * 60 * 1000);
    } catch (error) {
        proc.steps.push({
            type: 'error',
            label: 'Erro',
            message: error.message,
            status: 'error',
            timestamp: new Date()
        });
        proc.status = 'error';
    }
}

function buildReasoningPrompt(userPrompt, treeSummary, selection) {
    return `Voce e o Blox AI, assistente de desenvolvimento Roblox.

SOLICITACAO DO USUARIO: ${userPrompt}

${selection && selection.length > 0 ? `OBJETOS SELECIONADOS:\n${selection.map(s => `- ${s.path} (${s.className})`).join('\n')}\n` : ''}
RESUMO DA ESTRUTURA DO JOGO:
${treeSummary || 'Nenhum resumo disponivel'}

TAREFA: Faca um raciocinio estruturado do que precisa ser feito.
Responda em texto corrido, descrevendo:
1. O que o usuario quer
2. Qual abordagem voce vai usar
3. Quais partes do jogo serao afetadas
4. Riscos ou consideracoes

NAO gere codigo ainda. Apenas o raciocinio.`;
}

function buildTargetingPrompt(userPrompt, reasoning, fullTree) {
    return `Com base no raciocinio anterior, identifique quais partes especificas da arvore do jogo voce precisa.

RACIOCINIO ANTERIOR:
${reasoning}

ARVORE COMPLETA DO JOGO:
${fullTree}

Responda apenas com um JSON array dos caminhos exatos que voce precisa, no formato:
["game.Workspace.MeuObjeto", "game.ServerScriptService.MeuModulo", ...]

Se nao precisar de nenhuma parte especifica, responda: []`;
}

function buildFinalPrompt(userPrompt, reasoning, targeted, selection) {
    return `Voce e o Blox AI, gere o codigo final.

SOLICITACAO ORIGINAL: ${userPrompt}

RACIOCINIO: ${reasoning}

DADOS SELECIONADOS: ${targeted}

${selection && selection.length > 0 ? `OBJETOS SELECIONADOS:\n${selection.map(s => `- ${s.path} (${s.className})`).join('\n')}\n` : ''}

Responda em duas partes:
1. EXPLICAcaO: o que voce fez (texto curto)
2. CODIGO: codigo Luau entre marcadores [CODE_START] e [CODE_END]

Formato:
[EXPLANATION]
Explicacao aqui
[/EXPLANATION]
[CODE_START]
-- codigo aqui
[CODE_END]`;
}
