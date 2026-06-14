import Command from "../models/Command.js";
import jwt from "jsonwebtoken";
  
// REST API para modo Instant
export const send = async (req, res) => {
  try {
    const { projectId, message, mode } = req.body;

    // Aqui você integraria com AgentOrchestrator / ModelRouter
    // Por enquanto, resposta mock para testar o fluxo
    const response = mode === "instant" 
      ? `Resposta rápida para: ${message}`
      : `Análise completa de: ${message}`;

    // Salva no histórico
    const cmd = new Command({
      projectId,
      userId: req.userId,
      command: message,
      mode: mode || "instant",
      status: "success",
      response,
    });
    await cmd.save();

    res.json({
      response,
      codeBlocks: [],
      commandId: cmd._id,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// SSE Streaming para modo Think
export const stream = async (req, res) => {
  const { projectId, message, mode, token } = req.query;

  try {
    // Verifica token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "bloxai_secret");
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Simula streaming para teste
    const chunks = [
      "Analisando contexto...",
      " Planejando estrutura...",
      " Gerando código...",
      " Otimizando...",
      " Finalizado!"
    ];

    let fullResponse = "";

    for (const chunk of chunks) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
    }

    // Salva no histórico
    const cmd = new Command({
      projectId,
      userId: decoded.userId,
      command: message,
      mode: "think",
      status: "success",
      response: fullResponse,
    });
    await cmd.save();

    res.write(`data: ${JSON.stringify({ type: "complete", fullResponse, codeBlocks: [] })}\n\n`);
    res.end();

  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
    res.end();
  }
};

// Histórico de mensagens
export const history = async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const commands = await Command.find({ 
      projectId, 
      userId: req.userId,
      status: { $in: ["success", "error"] }
    })
    .sort({ createdAt: -1 })
    .limit(100);

    const messages = commands.flatMap((cmd) => [
      {
        _id: `user-${cmd._id}`,
        role: "user",
        content: cmd.command,
        mode: cmd.mode,
        createdAt: cmd.createdAt,
      },
      {
        _id: `ai-${cmd._id}`,
        role: "assistant",
        content: cmd.response || "Processando...",
        mode: cmd.mode,
        createdAt: cmd.createdAt,
      },
    ]);

    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};