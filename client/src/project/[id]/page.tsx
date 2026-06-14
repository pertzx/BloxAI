import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { 
  Send, 
  Bot, 
  User, 
  RotateCcw, 
  Clock, 
  Terminal,
  ChevronRight,
  Folder,
  FileCode,
  Settings,
  Sparkles,
  Zap,
  Loader2,
  ArrowLeft,
  RefreshCw
} from "lucide-react";
import { chatAPI, projectAPI, syncAPI, commandAPI } from "../../api/api";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: "think" | "instant";
  status?: "streaming" | "complete" | "error";
  timestamp: Date;
  codeBlocks?: string[];
};

const ExplorerItem = ({ name, type, depth = 0 }: { 
  name: string; 
  type: "folder" | "script" | "service"; 
  depth?: number;
}) => (
  <div 
    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface cursor-pointer transition-colors text-sm"
    style={{ paddingLeft: `${12 + depth * 16}px` }}
  >
    {type === "folder" && <ChevronRight className="w-3.5 h-3.5 text-text-subtle" />}
    {type === "folder" && <Folder className="w-4 h-4 text-warning" />}
    {type === "script" && <FileCode className="w-4 h-4 text-accent" />}
    {type === "service" && <Terminal className="w-4 h-4 text-primary" />}
    <span className="text-text-muted truncate">{name}</span>
  </div>
);

export default function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"think" | "instant">("think");
  const [isStreaming, setIsStreaming] = useState(false);
  const [project, setProject] = useState<any>(null);
  const [explorerTree, setExplorerTree] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    loadProject();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [id]);

  const loadProject = async () => {
    try {
      setLoading(true);
      setError("");
      
      const projectRes = await projectAPI.get(id!);
      setProject(projectRes.data);

      // Carrega histórico se existir
      try {
        const historyRes = await chatAPI.history(id!);
        const historyMessages = historyRes.data.map((msg: any) => ({
          id: msg._id || msg.id,
          role: msg.role,
          content: msg.content,
          mode: msg.mode,
          status: "complete",
          timestamp: new Date(msg.createdAt),
        }));
        setMessages(historyMessages);
      } catch (e) {
        // Se não tiver histórico, mostra welcome
        setMessages([{
          id: "welcome",
          role: "assistant",
          content: `Olá! Sou o BloxAI. Estou conectado ao projeto "${projectRes.data.name}" via UniverseId ${projectRes.data.universeId}. Como posso ajudar?`,
          mode: "instant",
          status: "complete",
          timestamp: new Date(),
        }]);
      }

      // Carrega tree se existir
      try {
        const treeRes = await syncAPI.getTree(id!);
        setExplorerTree(treeRes.data?.tree || []);
      } catch (e) {
        setExplorerTree([]);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Erro ao carregar projeto");
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => scrollToBottom(), [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !id) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);
    setError("");

    try {
      if (mode === "instant") {
        const res = await chatAPI.send(id, input, "instant");
        const aiMsg: Message = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: res.data.response,
          mode: "instant",
          status: "complete",
          timestamp: new Date(),
          codeBlocks: res.data.codeBlocks,
        };
        setMessages((prev) => [...prev, aiMsg]);
        setIsStreaming(false);
      } else {
        const es = chatAPI.stream(id, input, "think");
        eventSourceRef.current = es;

        let aiContent = "";
        const aiMsgId = `ai-${Date.now()}`;

        setMessages((prev) => [...prev, {
          id: aiMsgId,
          role: "assistant",
          content: "",
          mode: "think",
          status: "streaming",
          timestamp: new Date(),
        }]);

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "chunk") {
              aiContent += data.content;
              setMessages((prev) => 
                prev.map((m) => m.id === aiMsgId ? { ...m, content: aiContent } : m)
              );
            } else if (data.type === "complete") {
              setMessages((prev) => 
                prev.map((m) => m.id === aiMsgId ? { 
                  ...m, 
                  content: data.fullResponse || aiContent,
                  status: "complete",
                  codeBlocks: data.codeBlocks,
                } : m)
              );
              setIsStreaming(false);
              es.close();
            } else if (data.type === "error") {
              setMessages((prev) => 
                prev.map((m) => m.id === aiMsgId ? { ...m, content: `Erro: ${data.message}`, status: "error" } : m)
              );
              setIsStreaming(false);
              es.close();
            }
          } catch (e) {
            // Se não for JSON, trata como texto puro
            aiContent += event.data;
            setMessages((prev) => 
              prev.map((m) => m.id === aiMsgId ? { ...m, content: aiContent } : m)
            );
          }
        };

        es.onerror = () => {
          setMessages((prev) => 
            prev.map((m) => m.id === aiMsgId ? { ...m, content: aiContent || "Erro de conexão no streaming", status: "error" } : m)
          );
          setIsStreaming(false);
          es.close();
        };
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Erro ao enviar mensagem");
      setIsStreaming(false);
    }
  };

  const handleRollback = async (commandId: string) => {
    try {
      await commandAPI.rollback(commandId);
      setMessages((prev) => [...prev, {
        id: `rollback-${Date.now()}`,
        role: "assistant",
        content: "Rollback executado com sucesso. Alterações desfeitas.",
        mode: "instant",
        status: "complete",
        timestamp: new Date(),
      }]);
    } catch (err: any) {
      setError(err.response?.data?.message || "Erro no rollback");
    }
  };

  const renderMessageContent = (content: string, codeBlocks?: string[]) => {
    if (!codeBlocks || codeBlocks.length === 0) return <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{content}</p>;
    
    return (
      <div className="space-y-3">
        <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{content}</p>
        {codeBlocks.map((code, i) => (
          <div key={i} className="rounded-xl bg-black/40 border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-white/[0.02]">
              <span className="text-xs text-text-subtle font-mono">Luau</span>
              <button 
                onClick={() => navigator.clipboard.writeText(code)}
                className="text-xs text-primary hover:text-primary-hover transition-colors"
              >
                Copiar
              </button>
            </div>
            <pre className="p-4 text-xs text-text-muted font-mono overflow-x-auto">
              <code>{code}</code>
            </pre>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-4">
        <p className="text-error text-sm">{error}</p>
        <div className="flex gap-3">
          <button onClick={loadProject} className="glow-button flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
          <Link to="/dashboard" className="ghost-button flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6 animate-slide-up">
      {/* Explorer Sidebar */}
      <div className="w-64 glass flex flex-col shrink-0 hidden xl:flex">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Folder className="w-4 h-4 text-primary" />
            Explorer
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {explorerTree.length > 0 ? (
            explorerTree.map((item: any) => (
              <ExplorerItem 
                key={item.id || item.name} 
                name={item.name} 
                type={item.type} 
                depth={item.depth || 0}
              />
            ))
          ) : (
            <>
              <ExplorerItem name="Workspace" type="service" />
              <ExplorerItem name="StarterGui" type="service" />
              <ExplorerItem name="ReplicatedStorage" type="service" />
              <ExplorerItem name="ServerScriptService" type="service" />
            </>
          )}
        </div>
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-text-subtle">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            Sync ativo — {project?.universeId || id}
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="glass px-6 py-4 mb-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="p-2 rounded-lg hover:bg-surface transition-colors lg:hidden">
              <ArrowLeft className="w-4 h-4 text-text-muted" />
            </Link>
            <div className={`w-3 h-3 rounded-full ${mode === "think" ? "bg-secondary" : "bg-accent"} animate-pulse`} />
            <div>
              <h2 className="text-sm font-semibold text-white">
                {project?.name || "Projeto"} — Modo {mode === "think" ? "Think" : "Instant"}
              </h2>
              <p className="text-xs text-text-subtle">
                {mode === "think" ? "Raciocínio profundo com autocorreção" : "Respostas rápidas e diretas"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode("think")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${mode === "think" ? "bg-secondary/20 text-secondary border border-secondary/30" : "text-text-muted hover:bg-surface"}`}
            >
              <Sparkles className="w-3.5 h-3.5 inline mr-1" />
              Think
            </button>
            <button
              onClick={() => setMode("instant")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${mode === "instant" ? "bg-accent/20 text-accent border border-accent/30" : "text-text-muted hover:bg-surface"}`}
            >
              <Zap className="w-3.5 h-3.5 inline mr-1" />
              Instant
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="text-xs underline">Fechar</button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center ${msg.role === "assistant" ? "bg-gradient-to-br from-primary to-secondary" : "bg-surface border border-border"}`}>
                {msg.role === "assistant" ? <Bot className="w-4 h-4 text-white" /> : <User className="w-4 h-4 text-text-muted" />}
              </div>
              <div className={`max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`glass px-5 py-4 ${msg.role === "user" ? "bg-primary/10 border-primary/20" : ""}`}>
                  {msg.role === "assistant" ? renderMessageContent(msg.content, msg.codeBlocks) : (
                    <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  )}
                  {msg.status === "streaming" && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse delay-75" />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse delay-150" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 px-1">
                  <span className="text-[10px] text-text-subtle">
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {msg.mode && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${msg.mode === "think" ? "bg-secondary/10 text-secondary" : "bg-accent/10 text-accent"}`}>
                      {msg.mode}
                    </span>
                  )}
                  {msg.role === "assistant" && msg.status === "complete" && (
                    <button 
                      onClick={() => handleRollback(msg.id)}
                      className="text-[10px] text-text-subtle hover:text-error transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Rollback
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="glass p-2 shrink-0">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={mode === "think" ? "Descreva o sistema complexo que deseja criar..." : "Peça um ajuste rápido..."}
                className="input-glass resize-none min-h-[56px] max-h-[200px] py-3 pr-12"
                rows={1}
                disabled={isStreaming}
              />
              <div className="absolute right-3 bottom-3 text-xs text-text-subtle pointer-events-none">
                ↵ Enter
              </div>
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="glow-button h-14 w-14 flex items-center justify-center p-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isStreaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 px-2">
            <div className="flex items-center gap-4 text-xs text-text-subtle">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Latência: ~50ms
              </span>
              <span className="flex items-center gap-1">
                <Terminal className="w-3 h-3" />
                Tokens: {project?.tokensUsed?.toLocaleString() || "0"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-1.5 rounded-lg hover:bg-surface text-text-subtle transition-colors">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}