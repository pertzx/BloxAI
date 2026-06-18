import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Folder, MessageSquare,
  ChevronDown, Send, FileCode, ArrowLeft, Box, ImageIcon, Music4, AppWindow, Blocks, Sparkles, Waypoints, Shield, Component, Layers3, PanelRightOpen, CheckSquare2, Square, Paperclip, X, Plus, Clock3, Bot, History, Cpu, Search, Pin, PinOff, Pencil, Trash2, Copy, Check
} from 'lucide-react';
import api from '../../api/api.js';
import { Link } from 'react-router-dom';

type WorkspaceNode = {
  nome: string;
  propriedades: Record<string, any>;
  filhos: WorkspaceNode[];
};

type ChatReference = {
  path: string;
  snippet: string;
  raw: string;
  lineLabel?: string;
  body?: string;
};

type ChatSegment =
  | { type: 'text'; value: string }
  | { type: 'reference'; value: ChatReference };

type ProjectCommand = {
  _id: string;
  action: string;
  status: string;
  requestId?: string;
  parentCommandId?: string;
  retryCount?: number;
  requiresApproval?: boolean;
  approvedByUser?: boolean;
  payload?: Record<string, any>;
  result?: any;
  createdAt?: string;
  updatedAt?: string;
  chatId?: string;
  chatTitle?: string;
};

type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  pendingCount: number;
  lastMessage: string;
  isDraft?: boolean;
};

type DisplayChatMessage = {
  id: string;
  role: 'user' | 'ai';
  content: string;
  status?: string;
  kind?: 'conversation' | 'analysis' | 'proposal';
  phase?: 'thinking' | 'writing' | 'done';
  model?: string;
  mode?: 'instant' | 'think' | 'agent';
  reasoning?: string;
  progressSteps?: string[];
  pipelineStep?: number;
  cost?: number;
  plan?: { title: string; status: string }[];
  executions?: { executionId: number; source: string }[];
  request?: {
    parentCommandId: string;
    requestId: string;
    approvalRequired: boolean;
    canApprove: boolean;
    canCancel: boolean;
    latestError?: string;
    retryCount?: number;
    isRetryCorrection?: boolean;
    retryMode?: 'instant' | 'think';
    lastRetryGeneratedFrom?: {
      failedCommandId?: string;
      failedAction?: string;
      failedStepIndex?: number;
      failedError?: string;
      retryMode?: 'instant' | 'think';
    };
    lastRetryWasFullScriptRegeneration?: boolean;
    steps: {
      stepIndex?: number;
      commandId: string;
      action: string;
      status: string;
      payload?: Record<string, any>;
      result?: any;
      retryGeneratedFrom?: {
        failedCommandId?: string;
        failedAction?: string;
        failedStepIndex?: number;
        failedError?: string;
        retryMode?: 'instant' | 'think';
      };
      fullScriptRegeneration?: {
        enabled?: boolean;
        reason?: string;
        retryMode?: 'instant' | 'think';
      };
    }[];
  };
};

type OptimisticAssistantState = {
  chatId: string;
  userMessage: string;
  content: string;
  kind: 'conversation' | 'analysis' | 'proposal';
  phase: 'thinking' | 'writing';
  model?: string;
  mode?: 'instant' | 'think' | 'agent';
  reasoning?: string;
  progressSteps?: string[];
  pipelineStep: number;
  cost?: number;
  plan?: { title: string; status: string }[];
};

const CHAT_INPUT_LIMIT = 12000;
const CHAT_REFERENCE_REGEX = /\('((?:\\.|[^'])*)',\s*"((?:\\.|[^"])*)"\)/g;
const EXECUTION_REFERENCE_REGEX = /(executionId:\d+)/g;
const SUPPORTED_MODEL_OPTIONS = ['DeepSeek-V3', 'GPT-5.4 Mini'] as const;

export default function ProjectView({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<any>(null);
  const [commands, setCommands] = useState<ProjectCommand[]>([]);
  const [pendingChat, setPendingChat] = useState<ChatSession | null>(null);
  const [activeChatId, setActiveChatId] = useState('default');
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<{ kind: 'image' | 'text'; name: string; url?: string; content?: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<WorkspaceNode | null>(null);
  const [mainPanelView, setMainPanelView] = useState<'explorer' | 'chat' | 'script' | 'timeline'>('chat');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'explorer' | 'chat' | 'timeline' | 'script' | 'context'>('chat');
  const [contextItems, setContextItems] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [contextInput, setContextInput] = useState('');
  const [contextSaving, setContextSaving] = useState(false);
  const [selectedModel, setSelectedModel] = useState('GPT-5.4 Mini');
  const [agentMode, setAgentMode] = useState<'instant' | 'think'>('instant');
  const [availableModels, setAvailableModels] = useState<string[]>([...SUPPORTED_MODEL_OPTIONS]);
  const [chatSearch, setChatSearch] = useState('');
  const [pinnedChatIds, setPinnedChatIds] = useState<string[]>([]);
  const [renamedChats, setRenamedChats] = useState<Record<string, string>>({});
  const [hiddenChatIds, setHiddenChatIds] = useState<string[]>([]);
  const [selectedExplorerPaths, setSelectedExplorerPaths] = useState<string[]>([]);
  const [collapsedPaths, setCollapsedPaths] = useState<string[]>([]);
  const [isExplorerPaneCollapsed, setIsExplorerPaneCollapsed] = useState(true);
  const [isExplorerTreeCollapsed, setIsExplorerTreeCollapsed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [isChatListCollapsed, setIsChatListCollapsed] = useState(true);
  const [isChatTimelineCollapsed, setIsChatTimelineCollapsed] = useState(true);
  const [composerNotice, setComposerNotice] = useState('');
  const [optimisticAssistant, setOptimisticAssistant] = useState<OptimisticAssistantState | null>(null);
  const [animatedAiMessageIds, setAnimatedAiMessageIds] = useState<string[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const lastActiveChatIdRef = useRef<string | null>(null);
  const seenServerLogIntentIdsRef = useRef<Set<string>>(new Set());
  const hydratedServerLogIntentsRef = useRef(false);
  const thinkPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalNodeCount = useMemo(() => countNodes(nodes), [nodes]);
  const selectedNodeSummary = useMemo(() => getNodeSummary(selectedNode), [selectedNode]);
  const selectedNodeProperties = useMemo(() => getNodePropertyEntries(selectedNode), [selectedNode]);
  const selectedScriptAnalysis = useMemo(() => analyzeScriptSource(selectedNode?.propriedades?.Source), [selectedNode]);
  const selectedScriptType = selectedNode?.propriedades?.ScriptType || selectedNode?.propriedades?.ClassName || 'Script';
  const isSelectedNodeScript = Boolean(selectedNode?.propriedades?.Source);
  const composerSegments = useMemo(() => extractChatSegments(input), [input]);
  const composerReferences = useMemo(
    () => composerSegments.filter((segment): segment is { type: 'reference'; value: ChatReference } => segment.type === 'reference'),
    [composerSegments]
  );
  const chatSessions = useMemo(() => buildChatSessions(commands), [commands]);
  const visibleChatSessions = useMemo(() => {
    const normalizedSearch = chatSearch.trim().toLowerCase();
    return [...chatSessions]
      .filter((chat) => !hiddenChatIds.includes(chat.id))
      .map((chat) => ({
        ...chat,
        title: renamedChats[chat.id] || chat.title,
      }))
      .filter((chat) =>
        !normalizedSearch ||
        chat.title.toLowerCase().includes(normalizedSearch) ||
        String(chat.lastMessage || '').toLowerCase().includes(normalizedSearch)
      )
      .sort((a, b) => {
        const aPinned = pinnedChatIds.includes(a.id);
        const bPinned = pinnedChatIds.includes(b.id);
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [chatSessions, chatSearch, hiddenChatIds, pinnedChatIds, renamedChats]);
  const activeChat = useMemo(
    () =>
      (pendingChat && pendingChat.id === activeChatId ? pendingChat : null) ||
      visibleChatSessions.find((chat) => chat.id === activeChatId) ||
      chatSessions.find((chat) => chat.id === activeChatId) ||
      visibleChatSessions[0] ||
      chatSessions[0] ||
      createDraftChat('default', 'Chat principal'),
    [visibleChatSessions, chatSessions, activeChatId, pendingChat]
  );
  const activeChatCommands = useMemo(
    () => commands.filter((command) => getCommandChatId(command) === activeChat.id),
    [commands, activeChat.id]
  );
  const messages = useMemo(
    () => buildChatMessages(
      activeChatCommands,
      optimisticAssistant && optimisticAssistant.chatId === activeChat.id ? optimisticAssistant : null,
      animatedAiMessageIds
    ),
    [activeChatCommands, optimisticAssistant, activeChat.id, animatedAiMessageIds]
  );
  const timelineEntries = useMemo(() => buildTimelineEntries(activeChatCommands), [activeChatCommands]);
  const activeRequest = useMemo(() => getLatestActiveRequest(activeChatCommands), [activeChatCommands]);
  const isChatBusy = Boolean(optimisticAssistant || activeRequest);
  const syncState = useMemo(() => getProjectSyncState(project), [project]);

  const fetchProjectAndData = async () => {
    try {
      const token = localStorage.getItem('blox_token');
      
      // Fetch project details
      const res = await api.get(`/api/projects/${params.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = res.data;
      setProject(data);
      if (Array.isArray(data?.contextState)) {
        setContextItems(data.contextState);
      }
      const nextAvailableModels = Array.isArray(data?.availableModels) && data.availableModels.length > 0
        ? data.availableModels.filter((item: any) => typeof item === 'string')
        : [];
      setAvailableModels(nextAvailableModels);
      setSelectedModel((current) => {
        if (nextAvailableModels.length === 0) return current;
        return nextAvailableModels.includes(current) ? current : nextAvailableModels[0];
      });
      if (data.workspaceNodes) {
        setNodes(data.workspaceNodes);
        setSelectedNode((current: WorkspaceNode | null) => {
          if (!current) return data.workspaceNodes[0] || null;
          return findNodeByPath(data.workspaceNodes, current.propriedades?.Path) || current;
        });
      }

      // Fetch command history
      const cmdRes = await api.get(`/api/projects/${params.id}/commands`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const commandData = cmdRes.data;
      setCommands(Array.isArray(commandData) ? commandData : []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCommandsOnly = async () => {
    try {
      const token = localStorage.getItem('blox_token');
      const cmdRes = await api.get(`/api/projects/${params.id}/commands`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setCommands(Array.isArray(cmdRes.data) ? cmdRes.data : []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProjectAndData();
    // Comandos (status do chat) a cada 3s; o projeto completo (inclui a árvore do
    // explorer / workspaceNodes) só a cada 9s — reduz o payload repetido do polling.
    let tick = 0;
    const infoInterval = setInterval(() => {
      tick += 1;
      if (tick % 3 === 0) {
        fetchProjectAndData();
      } else {
        fetchCommandsOnly();
      }
    }, 3000);
    return () => clearInterval(infoInterval);
  }, [params.id]);

  useEffect(() => {
    return () => {
      if (thinkPollRef.current) clearInterval(thinkPollRef.current);
    };
  }, []);

  useEffect(() => {
    const activeChatChanged = lastActiveChatIdRef.current !== activeChat.id;
    if (activeChatChanged) {
      shouldAutoScrollRef.current = true;
    }

    if (!shouldAutoScrollRef.current && !activeChatChanged) {
      lastActiveChatIdRef.current = activeChat.id;
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) {
      lastActiveChatIdRef.current = activeChat.id;
      return;
    }

    const behavior: ScrollBehavior = activeChatChanged ? 'auto' : 'smooth';
    window.requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior });
    });

    lastActiveChatIdRef.current = activeChat.id;
  }, [messages, activeChat.id]);

  useEffect(() => {
    if (pendingChat?.id === activeChatId) return;
    if (!visibleChatSessions.length && !chatSessions.length) return;
    if (!visibleChatSessions.some((chat) => chat.id === activeChatId) && !chatSessions.some((chat) => chat.id === activeChatId) && pendingChat?.id !== activeChatId) {
      setActiveChatId((visibleChatSessions[0] || chatSessions[0]).id);
    }
  }, [visibleChatSessions, chatSessions, activeChatId, pendingChat]);

  useEffect(() => {
    const serverChatIds = new Set(commands.map((command) => getCommandChatId(command)));
    setPendingChat((current) => (current && serverChatIds.has(current.id) ? null : current));
  }, [commands]);

  useEffect(() => {
    const savedPinned = localStorage.getItem(`blox_pinned_chats_${params.id}`);
    const savedRenamed = localStorage.getItem(`blox_renamed_chats_${params.id}`);
    const savedHidden = localStorage.getItem(`blox_hidden_chats_${params.id}`);
    if (savedPinned) {
      try { setPinnedChatIds(JSON.parse(savedPinned)); } catch {}
    }
    if (savedRenamed) {
      try { setRenamedChats(JSON.parse(savedRenamed)); } catch {}
    }
    if (savedHidden) {
      try { setHiddenChatIds(JSON.parse(savedHidden)); } catch {}
    }
  }, [params.id]);

  useEffect(() => {
    localStorage.setItem(`blox_pinned_chats_${params.id}`, JSON.stringify(pinnedChatIds));
  }, [params.id, pinnedChatIds]);

  useEffect(() => {
    localStorage.setItem(`blox_renamed_chats_${params.id}`, JSON.stringify(renamedChats));
  }, [params.id, renamedChats]);

  useEffect(() => {
    localStorage.setItem(`blox_hidden_chats_${params.id}`, JSON.stringify(hiddenChatIds));
  }, [params.id, hiddenChatIds]);

  useEffect(() => {
    if (!optimisticAssistant) return;

    const synced = commands.some(
      (command) =>
        getCommandChatId(command) === optimisticAssistant.chatId &&
        String(command.payload?.message || '') === optimisticAssistant.userMessage
    );

    if (synced) {
      setOptimisticAssistant(null);
    }
  }, [commands, optimisticAssistant]);

  useEffect(() => {
    const logIntentIds = commands
      .filter((command) => command.action === 'LogIntent')
      .map((command) => String(command._id));

    if (!hydratedServerLogIntentsRef.current) {
      logIntentIds.forEach((id) => seenServerLogIntentIdsRef.current.add(id));
      hydratedServerLogIntentsRef.current = true;
      return;
    }

    const newIds = logIntentIds.filter((id) => !seenServerLogIntentIdsRef.current.has(id));
    if (newIds.length === 0) return;

    newIds.forEach((id) => seenServerLogIntentIdsRef.current.add(id));
    const animatedIds = newIds.map((id) => `${id}-ai`);
    setAnimatedAiMessageIds((current) => Array.from(new Set([...current, ...animatedIds])));

    const timer = window.setTimeout(() => {
      setAnimatedAiMessageIds((current) => current.filter((id) => !animatedIds.includes(id)));
    }, 4500);

    return () => window.clearTimeout(timer);
  }, [commands]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey && event.key.toLowerCase() === 'u')) return;
      if (!isSelectedNodeScript || !selectedNode?.propriedades?.Path) return;

      const selection = window.getSelection();
      const selectedLineRange = getSelectedScriptLineRange(selection);
      if (!selectedLineRange) {
        setComposerNotice('Selecione linhas dentro do visualizador de script para anexar com Ctrl + U.');
        return;
      }

      event.preventDefault();
      const scriptLines = String(selectedNode.propriedades?.Source || '').split('\n');
      const selectedLines = scriptLines.slice(selectedLineRange.startLine - 1, selectedLineRange.endLine).join('\n').trim();
      if (!selectedLines) {
        setComposerNotice('Nao foi possivel identificar as linhas selecionadas.');
        return;
      }

      const lineLabel = selectedLineRange.startLine === selectedLineRange.endLine
        ? `Linha ${selectedLineRange.startLine}`
        : `Linhas ${selectedLineRange.startLine}-${selectedLineRange.endLine}`;

      const reference = buildChatReference(selectedNode.propriedades.Path, `${lineLabel}\n${selectedLines}`);
      const didAppend = appendReferencesToComposer([reference]);

      if (didAppend) {
        setMainPanelView('chat');
        setActiveSidebarTab('chat');
        shouldAutoScrollRef.current = true;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelectedNodeScript, selectedNode]);

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true); setComposerNotice('');
    try {
      const form = new FormData();
      Array.from(files).slice(0, 5).forEach((f) => form.append('files', f));
      const token = localStorage.getItem('blox_token');
      const res = await api.post('/api/uploads', form, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      const newAtt = res.data?.attachments ?? [];
      setAttachments((prev) => [...prev, ...newAtt].slice(0, 5));
    } catch (e: any) {
      setComposerNotice(e?.response?.data?.error ?? 'Falha ao anexar arquivo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (isChatBusy) {
      setComposerNotice('Existe uma requisicao em andamento. Aprove ou cancele antes de enviar outra mensagem.');
      return;
    }
    if (availableModels.length === 0) {
      setComposerNotice('Nenhum modelo de IA esta configurado corretamente no servidor.');
      return;
    }
    if (!availableModels.includes(selectedModel)) {
      setComposerNotice('O modelo selecionado nao esta configurado corretamente.');
      return;
    }
    if (!input.trim() && attachments.length === 0) return;
    const userMsg = input;
    const sentAttachments = attachments;
    shouldAutoScrollRef.current = true;
    setInput('');
    setAttachments([]);
    setComposerNotice('');
    setSelectedExplorerPaths([]);
    const sendingChat = pendingChat && pendingChat.id === activeChat.id ? pendingChat : activeChat;
    setOptimisticAssistant({
      chatId: sendingChat.id,
      userMessage: userMsg,
      content: '',
      kind: agentMode === 'instant' ? 'conversation' : 'proposal',
      phase: agentMode === 'think' ? 'thinking' : 'writing',
      model: selectedModel,
      mode: agentMode,
      reasoning: agentMode === 'think' ? '' : undefined,
      progressSteps: [],
      pipelineStep: 1,
    });

    // Para o modo Instant, avança visualmente do step 1→2 após 900ms enquanto aguarda o backend.
    let instantStepTimer: ReturnType<typeof setTimeout> | null = window.setTimeout(() => {
      instantStepTimer = null;
      setOptimisticAssistant((prev) => prev ? { ...prev, pipelineStep: 2 } : prev);
    }, 900);

    try {
      const token = localStorage.getItem('blox_token');

      // ── Streaming SSE (Instant e Think) — tokens em tempo real ───────────────
      // No modo Think, o backend transmite primeiro a fase de raciocínio
      // (think_token) e depois a resposta (token), tudo transparente e ao vivo.
      const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) || '';
      const streamResp = await fetch(
        `${backendUrl}/api/projects/${params.id}/chat/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ intent: userMsg, chatId: sendingChat.id, chatTitle: sendingChat.title, model: selectedModel, mode: agentMode, attachments: sentAttachments }),
        }
      );
      if (instantStepTimer) { clearTimeout(instantStepTimer); instantStepTimer = null; }

      if (!streamResp.ok || !streamResp.body) {
        const errText = await streamResp.text().catch(() => '');
        throw new Error(errText || 'Stream indisponível');
      }

      const reader = streamResp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let accContent = '';
      let accReasoning = '';

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const raw = trimmed.slice(5).trim();
          try {
            const evt = JSON.parse(raw);
            if (evt.type === 'think_start') {
              setOptimisticAssistant((prev) => prev ? { ...prev, phase: 'thinking', pipelineStep: 1, reasoning: '' } : prev);
            } else if (evt.type === 'think_token' && evt.token) {
              accReasoning += evt.token as string;
              setOptimisticAssistant((prev) => prev ? { ...prev, phase: 'thinking', reasoning: accReasoning } : prev);
            } else if (evt.type === 'think_done') {
              setOptimisticAssistant((prev) => prev ? { ...prev, pipelineStep: 2 } : prev);
            } else if (evt.type === 'start') {
              setOptimisticAssistant((prev) => prev ? { ...prev, pipelineStep: 2, phase: 'writing' } : prev);
            } else if (evt.type === 'token' && evt.token) {
              accContent += evt.token as string;
              setOptimisticAssistant((prev) => prev ? { ...prev, content: accContent, phase: 'writing' } : prev);
            } else if (evt.type === 'done') {
              const aiRes = evt.aiResult;
              setOptimisticAssistant({
                chatId: sendingChat.id,
                userMessage: userMsg,
                content: String(
                  aiRes?.structuredResponse?.message ||
                  aiRes?.reply ||
                  accContent ||
                  'Resposta pronta.'
                ),
                kind: normalizeResponseType(aiRes?.responseType),
                phase: 'writing',
                model: aiRes?.selectedAgents?.[0]?.model || selectedModel,
                mode: agentMode,
                reasoning: aiRes?.reasoning || accReasoning || undefined,
                progressSteps: [],
                pipelineStep: 3,
                cost: Number(evt.billing?.chargedUsd) || 0,
                plan: Array.isArray(aiRes?.agentPlan) ? aiRes.agentPlan : undefined,
              });
              fetchProjectAndData();
              break outer;
            } else if (evt.type === 'error') {
              setComposerNotice((evt.error as string) || 'Erro no stream.');
              setInput(userMsg);
              setOptimisticAssistant(null);
              break outer;
            }
          } catch {}
        }
      }
    } catch (e) {
      if (instantStepTimer) { clearTimeout(instantStepTimer); instantStepTimer = null; }
      console.error(e);
      setComposerNotice('Erro ao processar a mensagem do chat.');
      setInput(userMsg);
      setOptimisticAssistant(null);
    }
  };

  const handleRequestDecision = async (parentCommandId: string, decision: 'approve' | 'cancel') => {
    try {
      const token = localStorage.getItem('blox_token');
      await api.patch(
        `/api/projects/${params.id}/commands`,
        { parentCommandId, decision },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setComposerNotice(decision === 'approve' ? 'Requisicao aprovada e enviada para execucao.' : 'Requisicao cancelada.');
      fetchProjectAndData();
    } catch (error: any) {
      setComposerNotice(error?.response?.data?.error || 'Falha ao atualizar a aprovacao da requisicao.');
    }
  };

  const handleOpenScriptViewer = () => {
    if (!isSelectedNodeScript) return;
    setMainPanelView('script');
    setActiveSidebarTab('script');
  };

  const handleOpenNodeScript = (node: WorkspaceNode) => {
    setSelectedNode(node);
    if (node?.propriedades?.Source) {
      setMainPanelView('script');
      setActiveSidebarTab('script');
    }
    setIsInspectorCollapsed(false);
  };

  const saveContextItems = async (items: { id: string; text: string; done: boolean }[]) => {
    setContextSaving(true);
    try {
      const token = localStorage.getItem('blox_token');
      await api.put(
        `/api/projects/${params.id}/context`,
        { contextState: items },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (e) {
      console.error('[context] falha ao salvar:', e);
    } finally {
      setContextSaving(false);
    }
  };

  const handleContextAdd = () => {
    const text = contextInput.trim();
    if (!text) return;
    const item = { id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2)}`, text, done: false };
    const next = [...contextItems, item];
    setContextItems(next);
    setContextInput('');
    saveContextItems(next);
  };

  const handleContextToggle = (id: string) => {
    const next = contextItems.map((item) => item.id === id ? { ...item, done: !item.done } : item);
    setContextItems(next);
    saveContextItems(next);
  };

  const handleContextDelete = (id: string) => {
    const next = contextItems.filter((item) => item.id !== id);
    setContextItems(next);
    saveContextItems(next);
  };

  const appendReferencesToComposer = (references: string[]) => {
    if (references.length === 0) return false;

    let wasAppended = false;

    setInput((current) => {
      const sanitizedReferences = references.filter(Boolean);
      if (sanitizedReferences.length === 0) return current;

      const prefix = current.trim().length > 0 ? '\n' : '';
      const appendedBlock = sanitizedReferences.join('\n');
      const nextValue = `${current}${prefix}${appendedBlock}`;

      if (nextValue.length > CHAT_INPUT_LIMIT) {
        setComposerNotice(`Limite de ${CHAT_INPUT_LIMIT} caracteres atingido no chat.`);
        return current;
      }

      wasAppended = true;
      setComposerNotice('');
      return nextValue;
    });

    return wasAppended;
  };

  const handleAttachSelectedExplorerNodes = () => {
    const references = selectedExplorerPaths.map((path) => buildChatReference(path, 'arquivo selecionado'));
    const didAppend = appendReferencesToComposer(references);

    if (didAppend) {
      setSelectedExplorerPaths([]);
      setMainPanelView('chat');
      setActiveSidebarTab('chat');
      shouldAutoScrollRef.current = true;
    }
  };

  const toggleExplorerSelection = (path: string) => {
    setSelectedExplorerPaths((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
    );
  };

  const toggleNodeCollapsed = (path: string) => {
    setCollapsedPaths((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
    );
  };

  const handleCreateChat = () => {
    const nextIndex = chatSessions.length + (pendingChat ? 1 : 0) + 1;
    const newChat = createDraftChat(`chat-${Date.now()}`, `Novo chat ${nextIndex}`);
    setPendingChat(newChat);
    setActiveChatId(newChat.id);
    setInput('');
    setComposerNotice('');
    setMainPanelView('chat');
    setActiveSidebarTab('chat');
    setIsChatListCollapsed(false);
    shouldAutoScrollRef.current = true;
  };

  const handleRenameChat = (chatId: string, currentTitle: string) => {
    const nextTitle = window.prompt('Novo nome da conversa:', renamedChats[chatId] || currentTitle);
    if (!nextTitle || !nextTitle.trim()) return;
    setRenamedChats((current) => ({ ...current, [chatId]: nextTitle.trim() }));
  };

  const handleTogglePinnedChat = (chatId: string) => {
    setPinnedChatIds((current) =>
      current.includes(chatId) ? current.filter((item) => item !== chatId) : [chatId, ...current]
    );
  };

  const handleHideChat = (chatId: string) => {
    if (chatId === 'default') return;
    setHiddenChatIds((current) => (current.includes(chatId) ? current : [...current, chatId]));
    if (activeChatId === chatId) {
      const fallback = visibleChatSessions.find((chat) => chat.id !== chatId) || chatSessions.find((chat) => chat.id !== chatId);
      if (fallback) setActiveChatId(fallback.id);
    }
  };

  const handleSidebarTabChange = (tab: 'explorer' | 'chat' | 'timeline' | 'script' | 'context') => {
    setActiveSidebarTab(tab);

    if (tab === 'chat') {
      setIsExplorerPaneCollapsed(true);
      setIsExplorerTreeCollapsed(true);
      setIsInspectorCollapsed(true);
      setMainPanelView('chat');
      setIsChatTimelineCollapsed(true);
    }

    if (tab === 'timeline') {
      setMainPanelView('chat');
      setIsChatTimelineCollapsed(false);
    }

    if (tab === 'script') {
      if (isSelectedNodeScript) {
        setMainPanelView('script');
      }
      return;
    }

    if (tab === 'explorer') {
      setMainPanelView('explorer');
      setIsExplorerPaneCollapsed(false);
      setIsExplorerTreeCollapsed(false);
      setIsInspectorCollapsed(false);
    }
  };

  const showExplorerPane = activeSidebarTab === 'explorer' && !isExplorerPaneCollapsed;
  const showMainPane = activeSidebarTab === 'chat' || activeSidebarTab === 'timeline' || activeSidebarTab === 'script' || activeSidebarTab === 'context';
  const showMobileTimeline = activeSidebarTab === 'timeline';

  if (!project) return (
    <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
          <Bot className="w-4 h-4 text-blue-400 animate-pulse" />
        </div>
        <span className="txt-soft text-sm">Carregando projeto...</span>
      </div>
    </div>
  );
  return (
    <div className="h-screen w-full text-slate-100 flex overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* SIDEBAR NAVEGAÇÃO */}
      <aside className="w-16 md:w-64 flex flex-col transition-all flex-shrink-0" style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border)' }}>
        <div className="p-4 flex items-center justify-center md:justify-start gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <Link to="/dashboard" className="w-7 h-7 rounded-lg flex items-center justify-center text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="hidden md:block text-sm font-semibold truncate text-white">{project.name}</span>
        </div>

        <nav className="flex-1 py-3 px-2 flex flex-col gap-1">
          <NavItem icon={<Folder />} label="Explorer" active={activeSidebarTab === 'explorer'} onClick={() => handleSidebarTabChange('explorer')} />
          <NavItem icon={<MessageSquare />} label="Chat" active={activeSidebarTab === 'chat'} onClick={() => handleSidebarTabChange('chat')} />
          <NavItem icon={<History />} label="Timeline" active={activeSidebarTab === 'timeline'} onClick={() => handleSidebarTabChange('timeline')} />
          <NavItem icon={<FileCode />} label="Script" active={activeSidebarTab === 'script'} onClick={() => handleSidebarTabChange('script')} disabled={!isSelectedNodeScript} />
          <NavItem
            icon={<Pin />}
            label="Contexto"
            active={activeSidebarTab === 'context'}
            onClick={() => handleSidebarTabChange('context')}
            badge={contextItems.filter((i) => !i.done).length || undefined}
          />
        </nav>

        <div className="p-4 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${syncState.studioDotClass}`}></span>
            <span className="hidden md:block text-xs txt-muted">Studio: {syncState.studioLabel}</span>
          </div>
          <div className={`hidden md:block text-xs ${syncState.syncTextClass}`}>{syncState.syncLabel}</div>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 min-w-0 flex flex-col xl:flex-row h-full overflow-hidden">

        {/* EXPLORER SINCRONIZADO */}
        <section className={`${showExplorerPane ? 'flex' : 'hidden'} ${isExplorerPaneCollapsed ? 'xl:hidden' : 'xl:flex xl:w-[38%]'} w-full flex-col`} style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <div className="p-3 font-semibold flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <div>
              <div>Explorer (DataModel)</div>
              <div className="mt-1 text-[10px] uppercase tracking-wide txt-muted">Clique na seta para expandir ou minimizar</div>
            </div>
            <div className="flex items-center gap-2">
              {activeSidebarTab === 'explorer' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const nextCollapsed = !isExplorerPaneCollapsed;
                      setIsExplorerPaneCollapsed(nextCollapsed);
                      if (nextCollapsed) {
                        setActiveSidebarTab('chat');
                      }
                    }}
                    className="text-xs txt-soft hover:text-white"
                  >
                    {isExplorerPaneCollapsed ? 'Mostrar explorer' : 'Minimizar explorer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsInspectorCollapsed((current) => !current)}
                    className="text-xs txt-soft hover:text-white"
                  >
                    {isInspectorCollapsed ? 'Expandir detalhes' : 'Minimizar detalhes'}
                  </button>
                </>
              )}
              {selectedExplorerPaths.length > 0 && (
                <button
                  type="button"
                  onClick={handleAttachSelectedExplorerNodes}
                  className="inline-flex items-center gap-2 rounded-xl border brd-strong bg-sunken px-3 py-2 text-xs txt-soft transition hov-brd-strong hov-surface-2"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Enviar {selectedExplorerPaths.length}
                </button>
              )}
              <button onClick={fetchProjectAndData} className="text-xs txt-soft hover:text-white">Atualizar</button>
            </div>
          </div>
          {!isExplorerTreeCollapsed && (
            <div className="flex-1 overflow-y-auto p-2 text-sm font-mono">
              {nodes.length === 0 ? (
                <div className="txt-muted text-xs italic p-2">Aguardando sincronização do Studio...</div>
              ) : (
                nodes.map((node, index) => (
                  <ExplorerBranch
                    key={`${node.nome}-${index}`}
                    node={node}
                    selectedPath={selectedNode?.propriedades?.Path || ''}
                    selectedExplorerPaths={selectedExplorerPaths}
                    collapsedPaths={collapsedPaths}
                    onSelect={setSelectedNode}
                    onToggleSelect={toggleExplorerSelection}
                    onToggleCollapsed={toggleNodeCollapsed}
                    onOpenScript={handleOpenNodeScript}
                  />
                ))
              )}
            </div>
          )}
          
          {/* PAINEL DE DETALHES / PREVIEW */}
          {!isInspectorCollapsed && (
            <div className="h-[48%] p-4 overflow-y-auto" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
            {selectedNode ? (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-xs txt-muted uppercase font-bold mb-1">Detalhes</h4>
                    <div className="flex items-center gap-2">
                      {getNodeIcon(selectedNode.propriedades?.ClassName)}
                      <span className="font-semibold text-slate-100">{selectedNode.nome}</span>
                      <span className="rounded-full border brd-strong bg-surface-1 px-2 py-0.5 text-[10px] uppercase tracking-wide txt-soft">
                        {selectedNode.propriedades?.ClassName || 'Instance'}
                      </span>
                    </div>
                  </div>
                  <span className="rounded-full bg-surface-1 px-2 py-1 text-[10px] txt-soft">
                    {selectedNode.filhos?.length || 0} filhos
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {selectedNodeSummary.map((item) => (
                    <div key={item.label} className="rounded-lg border brd bg-surface-1 p-2">
                      <div className="text-[10px] uppercase tracking-wide txt-muted">{item.label}</div>
                      <div className="mt-1 text-xs txt-soft break-all">{item.value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-wide txt-muted">Propriedades</div>
                    <div className="rounded-full border brd bg-surface-1 px-2 py-1 text-[10px] txt-soft">
                      {selectedNodeProperties.length} campos
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                    {selectedNodeProperties.map((item) => (
                      <div key={item.label} className="rounded-xl border brd bg-surface-1 p-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] txt-muted">{item.label}</div>
                        <div className="mt-2 break-words rounded-lg border brd bg-sunken px-2 py-1.5 font-mono text-xs txt-soft">
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedNode.propriedades?.Source && (
                  <div className="mt-4">
                    <div className="rounded-2xl border brd bg-surface-1 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide txt-muted">Script Selecionado</div>
                          <div className="mt-1 flex items-center gap-2 text-sm">
                            {getNodeIcon(selectedScriptType)}
                            <span className="font-medium text-slate-100">{selectedScriptType}</span>
                            <span className="text-xs txt-soft">{selectedScriptAnalysis.lineCount} linhas</span>
                          </div>
                          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] text-blue-200">
                            <Paperclip className="h-3.5 w-3.5" />
                            `Ctrl + U` anexa as linhas selecionadas ao chat
                          </div>
                          <div className="mt-2 text-[11px] txt-muted">Duplo clique no script no explorer para abrir aqui.</div>
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenScriptViewer}
                          className="inline-flex items-center gap-2 rounded-xl border brd-strong bg-sunken px-3 py-2 text-xs font-medium txt-soft transition hov-brd-strong hov-surface-2"
                        >
                          <PanelRightOpen className="h-4 w-4" />
                          Ver Script
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="txt-muted text-xs italic flex h-full items-center justify-center">Selecione um node no explorer para ver detalhes.</div>
            )}
            </div>
          )}
        </section>

        {/* AREA PRINCIPAL INTERATIVA */}
        <section className={`${showMainPane ? 'flex' : 'hidden'} xl:flex min-w-0 flex-1 flex-col relative overflow-hidden`} style={{ background: 'var(--bg)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${syncState.studioDotClass}`} />
                <span className="truncate text-sm font-semibold text-white">{project.name}</span>
                <span className="hidden sm:inline text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                  {syncState.headerStudioLabel} · {totalNodeCount} nodes
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{ border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                  <Cpu className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
                  <select
                    value={selectedModel}
                    onChange={(event) => setSelectedModel(event.target.value)}
                    disabled={availableModels.length === 0}
                    className="bg-transparent text-white focus:outline-none"
                  >
                    {availableModels.length === 0 && (
                      <option value="" className="bg-slate-900 text-white">
                        Nenhum configurado
                      </option>
                    )}
                    {availableModels.map((model) => (
                      <option key={model} value={model} className="bg-slate-900 text-white">
                        {model}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleCreateChat}
                  disabled={isChatBusy}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                    isChatBusy
                      ? 'cursor-not-allowed border-slate-700 bg-slate-900 text-slate-500'
                      : 'border-blue-500/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20'
                  }`}
                >
                  <Plus className="h-4 w-4" />
                  Novo chat
                </button>
              </div>
            </div>
            {(syncState.warningMessage || syncState.otherProjectWarning) && (
              <div className="mt-3 grid gap-2">
                {syncState.warningMessage && (
                  <div className={`rounded-2xl border px-3 py-2 text-sm ${syncState.warningTone}`}>
                    {syncState.warningMessage}
                  </div>
                )}
                {syncState.otherProjectWarning && (
                  <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
                    {syncState.otherProjectWarning}
                  </div>
                )}
              </div>
            )}
          </div>

          {mainPanelView === 'chat' ? (
            activeSidebarTab === 'context' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                {/* Header */}
                <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <Pin className="h-4 w-4 text-violet-400" />
                      <span className="text-sm font-semibold text-white">Contexto do Projeto</span>
                      {contextSaving && <span className="text-[10px] txt-muted animate-pulse">salvando...</span>}
                    </div>
                    <div className="mt-0.5 text-xs txt-muted">
                      Itens <span className="text-violet-300">não concluídos</span> são injetados automaticamente em toda mensagem da IA.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSidebarTabChange('chat')}
                    className="rounded-xl border brd-strong bg-surface-1 px-3 py-2 text-xs txt-soft transition hov-brd-strong hov-surface-2"
                  >
                    Voltar ao chat
                  </button>
                </div>

                {/* Add input */}
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleContextAdd(); }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={contextInput}
                      onChange={(e) => setContextInput(e.target.value)}
                      placeholder="Adicionar item ao contexto..."
                      className="input text-sm flex-1"
                      maxLength={500}
                    />
                    <button
                      type="submit"
                      disabled={!contextInput.trim()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition disabled:opacity-40"
                      style={{ background: 'rgba(140,70,255,0.15)', borderColor: 'rgba(140,70,255,0.30)', color: '#c084fc' }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar
                    </button>
                  </form>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4">
                  {contextItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <Pin className="w-8 h-8 txt-muted" />
                      <div className="txt-muted text-sm">Nenhum item no contexto.</div>
                      <div className="txt-muted text-xs max-w-xs">
                        Adicione tarefas, metas ou notas que a IA deve considerar em todas as respostas deste projeto.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {contextItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 p-3 rounded-xl border transition-all group"
                          style={{
                            background: item.done ? 'transparent' : 'rgba(140,70,255,0.05)',
                            borderColor: item.done ? 'rgba(255,255,255,0.05)' : 'rgba(140,70,255,0.15)',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleContextToggle(item.id)}
                            className="mt-0.5 shrink-0 transition-colors"
                          >
                            {item.done
                              ? <CheckSquare2 className="w-4 h-4 text-emerald-500" />
                              : <Square className="w-4 h-4 text-violet-400" />
                            }
                          </button>
                          <span className={`flex-1 text-sm leading-relaxed break-words ${item.done ? 'line-through txt-muted' : 'txt-soft'}`}>
                            {item.text}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleContextDelete(item.id)}
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity txt-muted hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {contextItems.some((i) => i.done) && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = contextItems.filter((i) => !i.done);
                        setContextItems(next);
                        saveContextItems(next);
                      }}
                      className="mt-4 text-xs txt-muted hover:text-red-400 transition-colors"
                    >
                      Limpar concluídos ({contextItems.filter((i) => i.done).length})
                    </button>
                  )}
                </div>
              </div>
            ) : activeSidebarTab === 'timeline' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-violet-300" />
                        <span className="text-sm font-semibold text-white">Timeline do chat</span>
                      </div>
                      <div className="mt-1 text-xs txt-soft">
                        Alterações, planos e status vinculados a esta conversa.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSidebarTabChange('chat')}
                      className="rounded-xl border brd-strong bg-surface-1 px-3 py-2 text-xs txt-soft transition hov-brd-strong hov-surface-2"
                    >
                      Voltar ao chat
                    </button>
                  </div>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {timelineEntries.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border brd bg-surface-1 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-white">{entry.title}</div>
                          <div className="mt-1 text-xs txt-soft">{entry.description}</div>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getStatusTone(entry.status)}`}>
                          {entry.status}
                        </span>
                      </div>
                      {entry.detail && (
                        <div className="mt-3 whitespace-pre-wrap rounded-xl border brd bg-sunken px-3 py-2 font-mono text-xs txt-soft">
                          {entry.detail}
                        </div>
                      )}
                      <div className="mt-3 text-[11px] txt-muted">{formatDateTime(entry.date)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
            <div className="flex min-h-0 flex-1">
              <aside className={`${isChatListCollapsed ? 'hidden' : 'hidden xl:flex xl:flex-col'} w-72 shrink-0`} style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="text-xs uppercase tracking-wide txt-muted">Chats do Projeto</div>
                  <div className="mt-1 text-sm txt-soft">Histórico persistido por conversa</div>
                  <div className="relative mt-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 txt-muted" />
                    <input
                      value={chatSearch}
                      onChange={(event) => setChatSearch(event.target.value)}
                      placeholder="Buscar conversa..."
                      className="w-full rounded-xl border brd bg-surface-1 pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-3">
                  {visibleChatSessions.map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => {
                        setActiveChatId(chat.id);
                        setMainPanelView('chat');
                        setActiveSidebarTab('chat');
                        setComposerNotice('');
                      }}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        chat.id === activeChat.id
                          ? 'border-blue-500/30 bg-blue-500/10 text-white'
                          : 'brd bg-surface-1 txt-soft hov-brd-strong hov-surface-2'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{chat.title}</div>
                          <div className="mt-1 truncate text-xs txt-soft">{chat.lastMessage || 'Sem mensagens ainda'}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          {pinnedChatIds.includes(chat.id) && (
                            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200">
                              Fixado
                            </span>
                          )}
                          {chat.pendingCount > 0 && (
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                              {chat.pendingCount} pend.
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[11px] txt-muted">
                        <span>{chat.messageCount} msgs</span>
                        <span>{formatRelativeTime(chat.updatedAt)}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleTogglePinnedChat(chat.id);
                          }}
                          className="rounded-lg border brd-strong bg-sunken p-1.5 txt-soft transition hover:text-white"
                        >
                          {pinnedChatIds.includes(chat.id) ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRenameChat(chat.id, chat.title);
                          }}
                          className="rounded-lg border brd-strong bg-sunken p-1.5 txt-soft transition hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {chat.id !== 'default' && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleHideChat(chat.id);
                            }}
                            className="rounded-lg border brd-strong bg-sunken p-1.5 txt-soft transition hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </button>
                  ))}
                  {visibleChatSessions.length === 0 && (
                    <div className="rounded-2xl border border-dashed brd bg-surface-1 px-3 py-5 text-center text-xs txt-muted">
                      Nenhuma conversa encontrada.
                    </div>
                  )}
                </div>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-blue-300" />
                        <span className="text-sm font-semibold text-white">{activeChat.title}</span>
                        {activeChat.isDraft && (
                          <span className="rounded-full border brd-strong bg-surface-1 px-2 py-0.5 text-[10px] txt-soft">
                            Novo chat
                          </span>
                        )}
                      </div>
                      {isChatBusy && (
                        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-200">
                          <Clock3 className="h-3.5 w-3.5" />
                          Existe uma requisicao ativa. O chat fica bloqueado ate aprovar, concluir ou cancelar.
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg border brd bg-sunken px-2.5 py-1 text-[11px] txt-soft">{selectedModel}</span>
                      <span className={`rounded-lg border px-2.5 py-1 text-[11px] ${
                        agentMode === 'think'
                          ? 'border-violet-500/30 bg-violet-500/10 text-violet-200'
                          : 'brd bg-sunken txt-soft'
                      }`}>
                        {agentMode === 'think' ? 'Think (Agente)' : 'Instant'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 hidden xl:flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsChatListCollapsed((current) => !current)}
                      className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs txt-soft transition hov-surface-2"
                    >
                      {isChatListCollapsed ? 'Expandir conversas' : 'Minimizar conversas'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSidebarTab('timeline');
                        setMainPanelView('chat');
                        setIsChatTimelineCollapsed(false);
                      }}
                      className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs txt-soft transition hov-surface-2"
                    >
                      Abrir timeline
                    </button>
                  </div>
                </div>

                <div className="xl:hidden px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                  <div className="mb-2 text-[10px] uppercase tracking-wide txt-muted">Conversas</div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {visibleChatSessions.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => {
                          setActiveChatId(chat.id);
                          setComposerNotice('');
                          setActiveSidebarTab('chat');
                          setMainPanelView('chat');
                        }}
                        className={`shrink-0 rounded-xl border px-3 py-2 text-left text-xs transition ${
                          chat.id === activeChat.id
                            ? 'border-blue-500/30 bg-blue-500/10 text-white'
                            : 'brd bg-surface-1 txt-soft'
                        }`}
                      >
                        <div className="font-medium">{chat.title}</div>
                        <div className="mt-1 text-[10px] txt-soft">{chat.messageCount} msgs</div>
                      </button>
                    ))}
                  </div>
                </div>

                <>
                  <div
                    ref={messagesContainerRef}
                    onScroll={() => {
                      const container = messagesContainerRef.current;
                      if (!container) return;
                      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
                      shouldAutoScrollRef.current = distanceToBottom < 72;
                    }}
                    className="flex-1 overflow-y-auto px-4 py-6"
                  >
                    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
                    {messages.map((msg) => (
                      <div key={msg.id} className={`flex flex-col max-w-[88%] ${msg.role === 'user' ? 'items-end self-end' : 'items-start self-start'}`}>
                        {msg.role === 'ai' && (
                          <div className="mb-1 flex items-center gap-2 px-1">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getMessageKindTone(msg.kind)}`}>
                              {getMessageKindLabel(msg.kind)}
                            </span>
                            {msg.status && (
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getStatusTone(msg.status)}`}>
                                {getCommandStatusLabel(msg.status)}
                              </span>
                            )}
                            {msg.model && <span className="text-[10px] txt-muted">{msg.model}</span>}
                            {msg.mode && <span className="text-[10px] txt-muted">{msg.mode === 'instant' ? 'Instant' : 'Think (Agente)'}</span>}
                            {typeof msg.cost === 'number' && msg.cost > 0 && (
                              <span className="text-[10px] text-emerald-300/80" title="Custo cobrado desta resposta">
                                ${msg.cost.toFixed(4)}
                              </span>
                            )}
                          </div>
                        )}
                        <div className={`p-4 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${msg.role === 'user' ? 'rounded-tr-sm text-white' : 'rounded-tl-sm'}`} style={msg.role === 'user' ? { background: 'var(--accent)', boxShadow: '0 2px 12px rgba(59,130,246,0.25)' } : { background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                          {msg.role === 'ai' ? (
                            <>
                              {msg.reasoning && msg.reasoning.trim() && (
                                <details
                                  open={msg.phase === 'thinking' || msg.phase === 'writing'}
                                  className="mb-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.06]"
                                >
                                  <summary className="flex cursor-pointer select-none items-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-violet-300">
                                    <Sparkles className="h-3 w-3" />
                                    Raciocínio
                                    {msg.phase === 'thinking' && <span className="normal-case text-violet-400/70">· pensando…</span>}
                                  </summary>
                                  <div className="whitespace-pre-wrap px-3 pb-3 text-xs leading-relaxed txt-soft">
                                    {msg.reasoning}
                                  </div>
                                </details>
                              )}
                              {msg.plan && msg.plan.length > 0 && <AgentPlanChecklist plan={msg.plan} />}
                              <TypewriterContent
                                content={msg.content}
                                animate={msg.phase === 'writing' && msg.mode === 'think'}
                                thinking={msg.phase === 'thinking' && !msg.reasoning}
                                executions={msg.executions || []}
                                progressSteps={msg.progressSteps || []}
                                pipelineStep={msg.pipelineStep ?? 1}
                              />
                              {msg.request && (
                                <RequestExecutionPanel
                                  request={msg.request}
                                  onDecision={handleRequestDecision}
                                />
                              )}
                            </>
                          ) : (
                            <ChatContent content={msg.content} compact />
                          )}
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>

                  <div className="p-4" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                    {composerReferences.length > 0 && (
                      <div className="mb-3 rounded-2xl border brd bg-surface-1 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-[10px] uppercase tracking-wide txt-muted">Itens anexados ao chat</div>
                          <button
                            type="button"
                            onClick={() => {
                              setInput((current) => removeChatReferences(current));
                              setComposerNotice('');
                            }}
                            className="inline-flex items-center gap-1 text-xs txt-soft transition hov-txt"
                          >
                            <X className="h-3.5 w-3.5" />
                            Limpar anexos
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {composerReferences.map((segment, index) => (
                            <ChatReferenceCard key={`${segment.value.raw}-${index}`} reference={segment.value} />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAttachSelectedExplorerNodes}
                        disabled={selectedExplorerPaths.length === 0}
                        className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs transition ${
                          selectedExplorerPaths.length === 0
                            ? 'cursor-not-allowed brd bg-surface-1 txt-muted'
                            : 'brd-strong bg-surface-1 txt-soft hov-brd-strong'
                        }`}
                      >
                        <Plus className="h-4 w-4" />
                        Adicionar contexto
                      </button>
                      <button
                        type="button"
                        onClick={() => setAgentMode('instant')}
                        className={`rounded-2xl border px-3 py-2 text-xs font-medium transition ${
                          agentMode === 'instant'
                            ? 'border-blue-500/30 bg-blue-500/15 text-blue-100'
                            : 'brd-strong bg-surface-1 txt-soft'
                        }`}
                      >
                        Instant
                      </button>
                      <button
                        type="button"
                        onClick={() => setAgentMode('think')}
                        className={`inline-flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-medium transition ${
                          agentMode === 'think'
                            ? 'border-violet-500/30 bg-violet-500/15 text-violet-100'
                            : 'brd-strong bg-surface-1 txt-soft'
                        }`}
                      >
                        <Bot className="h-3.5 w-3.5" />
                        Think (Agente)
                      </button>
                      <div className="text-xs txt-muted">
                        {agentMode === 'think'
                          ? 'Agente: planeja, executa um passo, lê o resultado real e decide o próximo (1 aprovação só).'
                          : 'Resposta única e rápida, menor custo.'}
                      </div>
                    </div>

                    <div className="relative rounded-2xl p-2" style={{ border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)' }}>
                      {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-2 pt-1.5 pb-1">
                          {attachments.map((a, i) => (
                            <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border brd-strong bg-surface-1 text-xs txt-soft">
                              {a.kind === 'image'
                                ? (a.url ? <img src={a.url} alt="" className="w-4 h-4 rounded object-cover" /> : <ImageIcon className="w-3 h-3 text-blue-400" />)
                                : <FileCode className="w-3 h-3 text-violet-400" />}
                              <span className="max-w-[130px] truncate">{a.name}</span>
                              <button onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} className="txt-muted hover:text-red-300">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder="Digite uma tarefa..."
                        disabled={isChatBusy}
                        className={`min-h-[112px] w-full resize-none rounded-xl bg-transparent pl-12 pr-12 py-3 text-white focus:outline-none text-sm leading-relaxed ${
                          isChatBusy ? 'cursor-not-allowed txt-muted' : ''
                        }`}
                        style={{ caretColor: '#60a5fa' }}
                      />
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        hidden
                        accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.markdown,.csv,.log,.json,.yaml,.yml,.lua,.luau,.js,.ts,.jsx,.tsx,.py,.html,.css,.xml,.zip"
                        onChange={(e) => handleFilesSelected(e.target.files)}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading || isChatBusy}
                        title="Anexar imagem ou arquivo (.pdf, .md, .txt, .zip...)"
                        className={`absolute left-3 bottom-3 w-8 h-8 rounded-xl flex items-center justify-center transition-all border brd-strong ${
                          uploading || isChatBusy ? 'cursor-not-allowed opacity-40' : 'txt-soft hov-surface-2 hover:text-white'
                        }`}
                      >
                        {uploading ? <Sparkles className="w-3.5 h-3.5 animate-pulse" /> : <Paperclip className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={handleSend}
                        disabled={isChatBusy}
                        className={`absolute right-3 bottom-3 w-8 h-8 rounded-xl flex items-center justify-center text-white transition-all ${
                          isChatBusy ? 'cursor-not-allowed opacity-30' : 'bg-blue-600 hover:bg-blue-500 hover:shadow-lg'
                        }`}
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs txt-soft">
                      <span>
                        {isChatBusy
                          ? 'O chat esta bloqueado enquanto a requisicao atual aguarda aprovacao, execucao ou cancelamento.'
                          : '`Ctrl + U` anexa linhas do script. O explorer tambem pode anexar arquivos.'}
                      </span>
                      <span>{input.length}/{CHAT_INPUT_LIMIT}</span>
                    </div>
                    {composerNotice && <div className="mt-2 text-xs text-amber-300">{composerNotice}</div>}
                  </div>
                </>
              </div>
            </div>
            )
          ) : (
            <div className="flex-1 overflow-hidden p-4">
              {isSelectedNodeScript ? (
                <div className="flex h-full flex-col rounded-2xl border brd bg-sunken p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide txt-muted">Visualizacao ampliada</div>
                      <div className="mt-1 flex items-center gap-2">
                        {getNodeIcon(selectedScriptType)}
                        <span className="font-semibold text-slate-100">{selectedNode?.nome}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getNodeMeta(selectedScriptType).badgeClass}`}>
                          {selectedScriptType}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMainPanelView('chat');
                        setActiveSidebarTab('chat');
                      }}
                      className="rounded-xl border brd-strong bg-surface-1 px-3 py-2 text-xs txt-soft transition hov-brd-strong hov-surface-2"
                    >
                      Voltar ao chat
                    </button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <ScriptViewer
                      source={selectedNode?.propriedades?.Source || ''}
                      scriptType={selectedScriptType}
                      analysis={selectedScriptAnalysis}
                      expanded
                    />
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed brd bg-sunken p-6 text-center text-sm txt-soft">
                  Selecione um `Script`, `LocalScript` ou `ModuleScript` no explorer e clique em `Ver Script`.
                </div>
              )}
            </div>
          )}

        </section>
      </main>
    </div>
  );
}

// Subcomponentes auxiliares
function NavItem({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`nav-item w-full ${active ? 'active' : ''} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
      style={disabled ? { pointerEvents: 'none' } : undefined}
    >
      <div className="relative w-4 h-4 flex items-center justify-center flex-shrink-0" style={{ width: 16, height: 16 }}>
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center" style={{ background: '#8C46FF', color: '#fff' }}>
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      <span className="hidden md:block text-sm">{label}</span>
    </button>
  );
}

function ExplorerBranch({
  node,
  selectedPath,
  selectedExplorerPaths,
  collapsedPaths,
  onSelect,
  onToggleSelect,
  onToggleCollapsed,
  onOpenScript,
}: {
  node: WorkspaceNode;
  selectedPath: string;
  selectedExplorerPaths: string[];
  collapsedPaths: string[];
  onSelect: (node: WorkspaceNode) => void;
  onToggleSelect: (path: string) => void;
  onToggleCollapsed: (path: string) => void;
  onOpenScript: (node: WorkspaceNode) => void;
}) {
  const currentPath = node.propriedades?.Path || '';
  const isSelected = selectedPath === currentPath;
  const hasChildren = node.filhos.length > 0;
  const meta = getNodeMeta(node.propriedades?.ClassName);
  const isCollapsed = collapsedPaths.includes(currentPath);
  const isMarkedForChat = selectedExplorerPaths.includes(currentPath);
  const isScriptNode = Boolean(node.propriedades?.Source);

  return (
    <div className="ml-2">
      <div
        className={`group flex w-full items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition ${
          isSelected
            ? 'brd-strong bg-surface-2 text-blue-200 shadow-[0_0_0_1px_rgba(59,130,246,0.2)]'
            : 'border-transparent txt-soft hov-surface-2'
        }`}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) onToggleCollapsed(currentPath);
          }}
          className="flex h-5 w-5 items-center justify-center rounded txt-muted transition hov-surface-2 hover:text-white"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition ${hasChildren ? (isCollapsed ? '-rotate-90' : 'rotate-0') : 'text-transparent'}`} />
        </button>

        <button
          type="button"
          onClick={() => onSelect(node)}
          onDoubleClick={() => {
            onSelect(node);
            if (isScriptNode) onOpenScript(node);
          }}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${meta.iconWrapperClass}`}>
            {meta.icon}
          </div>
          <span className="truncate flex-1 text-left">{node.nome}</span>
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${meta.badgeClass}`}>
            {node.propriedades?.ClassName || 'Instance'}
          </span>
        </button>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect(currentPath);
          }}
          className={`inline-flex min-w-[74px] items-center justify-center gap-1 rounded-xl border px-2 py-1 text-[11px] font-medium transition ${
            isMarkedForChat
              ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
              : 'brd-strong bg-surface-1 txt-soft hov-brd-strong hover:text-white'
          }`}
          title={isMarkedForChat ? 'Remover da selecao do chat' : 'Selecionar para enviar ao chat'}
        >
          {isMarkedForChat ? <CheckSquare2 className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          <span>{isMarkedForChat ? 'Anexado' : 'Anexar'}</span>
        </button>
      </div>
      {hasChildren && !isCollapsed && (
        <div className="ml-3 border-l brd-strong pl-1">
          {node.filhos.map((child, index) => (
            <ExplorerBranch
              key={`${child.nome}-${index}-${child.propriedades?.Path || ''}`}
              node={child}
              selectedPath={selectedPath}
              selectedExplorerPaths={selectedExplorerPaths}
              collapsedPaths={collapsedPaths}
              onSelect={onSelect}
              onToggleSelect={onToggleSelect}
              onToggleCollapsed={onToggleCollapsed}
              onOpenScript={onOpenScript}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScriptViewer({
  source,
  scriptType,
  analysis,
  expanded = false,
}: {
  source: string;
  scriptType: string;
  analysis: ReturnType<typeof analyzeScriptSource>;
  expanded?: boolean;
}) {
  const theme = getScriptTheme(scriptType);
  const lines = String(source || '').split('\n');

  return (
    <div className={`overflow-hidden rounded-2xl border bg-sunken ${theme.borderClass}`}>
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 ${theme.headerClass}`}>
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${theme.iconWrapperClass}`}>
            {getNodeIcon(scriptType)}
          </div>
          <div>
            <div className={`text-sm font-semibold ${theme.titleClass}`}>{scriptType}</div>
            <div className="text-[11px] txt-soft">Conteudo sincronizado do Studio</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wide txt-soft">
          <span className="rounded-full border brd-strong bg-surface-1 px-2 py-1">{analysis.lineCount} linhas</span>
          <span className="rounded-full border brd-strong bg-surface-1 px-2 py-1">{analysis.functionCount} funcoes</span>
          <span className="rounded-full border brd-strong bg-surface-1 px-2 py-1">{analysis.requireCount} requires</span>
          <span className="rounded-full border brd-strong bg-surface-1 px-2 py-1">{analysis.commentCount} comentarios</span>
        </div>
      </div>

      <div className="border-b brd bg-surface-1 px-3 py-2 text-[11px] txt-soft">
        {theme.summaryText} {analysis.hasReturn ? 'Possui retorno declarado.' : 'Sem retorno declarado.'} Use `Ctrl + U` para anexar a selecao atual ao chat.
      </div>

      <div className={`${expanded ? 'h-full min-h-0' : 'max-h-[26rem]'} overflow-auto`}>
        <div className="min-w-full">
          {lines.map((line, index) => (
            <div
              key={`${scriptType}-${index}`}
              data-script-line-index={index + 1}
              className="grid grid-cols-[56px_1fr] border-b brd font-mono text-xs last:border-b-0"
            >
              <div className="select-none bg-sunken px-3 py-1.5 text-right txt-muted">
                {index + 1}
              </div>
              <pre className={`overflow-x-auto whitespace-pre-wrap break-words px-3 py-1.5 ${theme.codeClass}`}>
                {line.length > 0 ? line : ' '}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getNodeIcon(className: string) {
  if (className === 'LocalScript') {
    return <FileCode className="w-4 h-4 text-blue-400" />;
  }

  if (className === 'ModuleScript') {
    return <FileCode className="w-4 h-4 text-violet-400" />;
  }

  if (className === 'Script') {
    return <FileCode className="w-4 h-4 text-slate-100" />;
  }

  if (
    className === 'Folder' ||
    className === 'Workspace' ||
    className === 'ServerScriptService' ||
    className === 'ReplicatedStorage' ||
    className === 'StarterGui' ||
    className === 'StarterPlayer' ||
    className === 'ServerStorage' ||
    className === 'ReplicatedFirst' ||
    className === 'Teams' ||
    className === 'Model'
  ) {
    return <Folder className="w-4 h-4 text-yellow-500" />;
  }

  if (
    className === 'RemoteEvent' ||
    className === 'RemoteFunction' ||
    className === 'BindableEvent' ||
    className === 'BindableFunction'
  ) {
    return <Waypoints className="w-4 h-4 text-rose-400" />;
  }

  if (
    className === 'BoolValue' ||
    className === 'IntValue' ||
    className === 'NumberValue' ||
    className === 'StringValue' ||
    className === 'ObjectValue'
  ) {
    return <Sparkles className="w-4 h-4 text-amber-300" />;
  }

  if (className === 'Part' || className === 'MeshPart' || className === 'SpawnLocation' || className === 'UnionOperation') {
    return <Box className="w-4 h-4 text-orange-400" />;
  }

  if (className === 'Decal' || className === 'Texture' || className === 'ImageLabel' || className === 'ImageButton') {
    return <ImageIcon className="w-4 h-4 text-pink-400" />;
  }

  if (className === 'Sound') {
    return <Music4 className="w-4 h-4 text-emerald-400" />;
  }

  if (className === 'Humanoid') {
    return <Shield className="w-4 h-4 text-emerald-300" />;
  }

  if (className === 'Attachment' || className === 'WeldConstraint' || className === 'Motor6D') {
    return <Component className="w-4 h-4 text-teal-300" />;
  }

  if (className?.includes('Gui') || className === 'ScreenGui' || className === 'Frame' || className === 'TextLabel' || className === 'TextButton') {
    return <AppWindow className="w-4 h-4 text-cyan-400" />;
  }

  if (className === 'Camera' || className === 'Lighting') {
    return <Layers3 className="w-4 h-4 text-sky-300" />;
  }

  return <Blocks className="w-4 h-4 text-slate-400" />;
}

function getNodeMeta(className: string) {
  if (className === 'LocalScript') {
    return {
      icon: getNodeIcon(className),
      iconWrapperClass: 'border-blue-500/30 bg-blue-500/10',
      badgeClass: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    };
  }

  if (className === 'ModuleScript') {
    return {
      icon: getNodeIcon(className),
      iconWrapperClass: 'border-violet-500/30 bg-violet-500/10',
      badgeClass: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
    };
  }

  if (className === 'Script') {
    return {
      icon: getNodeIcon(className),
      iconWrapperClass: 'border-slate-500/30 bg-slate-200/5',
      badgeClass: 'border-slate-600 bg-slate-900 text-slate-200',
    };
  }

  if (className?.includes('Gui') || className === 'Frame' || className === 'TextLabel' || className === 'TextButton') {
    return {
      icon: getNodeIcon(className),
      iconWrapperClass: 'border-cyan-500/30 bg-cyan-500/10',
      badgeClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    };
  }

  if (className === 'RemoteEvent' || className === 'RemoteFunction' || className === 'BindableEvent' || className === 'BindableFunction') {
    return {
      icon: getNodeIcon(className),
      iconWrapperClass: 'border-rose-500/30 bg-rose-500/10',
      badgeClass: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    };
  }

  if (className === 'Sound') {
    return {
      icon: getNodeIcon(className),
      iconWrapperClass: 'border-emerald-500/30 bg-emerald-500/10',
      badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    };
  }

  if (className === 'Part' || className === 'MeshPart' || className === 'SpawnLocation' || className === 'UnionOperation') {
    return {
      icon: getNodeIcon(className),
      iconWrapperClass: 'border-orange-500/30 bg-orange-500/10',
      badgeClass: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
    };
  }

  if (
    className === 'Folder' ||
    className === 'Workspace' ||
    className === 'ServerScriptService' ||
    className === 'ReplicatedStorage' ||
    className === 'StarterGui' ||
    className === 'StarterPlayer' ||
    className === 'ServerStorage' ||
    className === 'ReplicatedFirst' ||
    className === 'Teams' ||
    className === 'Model'
  ) {
    return {
      icon: getNodeIcon(className),
      iconWrapperClass: 'border-yellow-500/30 bg-yellow-500/10',
      badgeClass: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200',
    };
  }

  return {
    icon: getNodeIcon(className),
    iconWrapperClass: 'border-slate-700 bg-slate-900/80',
    badgeClass: 'border-slate-700 bg-slate-900 text-slate-400',
  };
}

function countNodes(nodes: WorkspaceNode[]): number {
  return nodes.reduce((acc, node) => acc + 1 + countNodes(node.filhos || []), 0);
}

function getCommandChatId(command: ProjectCommand) {
  return command.chatId || 'default';
}

function createDraftChat(id: string, title: string): ChatSession {
  const now = new Date().toISOString();
  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    pendingCount: 0,
    lastMessage: '',
    isDraft: true,
  };
}

function buildChatSessions(commands: ProjectCommand[]) {
  const grouped = new Map<string, ChatSession>();

  for (const command of commands) {
    const chatId = getCommandChatId(command);
    const createdAt = command.createdAt || new Date().toISOString();
    const updatedAt = command.updatedAt || createdAt;
    const current = grouped.get(chatId);
    const nextMessageCount = (current?.messageCount || 0) + (command.action === 'LogIntent' ? 1 : 0);
    const nextPendingCount =
      (current?.pendingCount || 0) +
      (['AWAITING_APPROVAL', 'PENDING', 'QUEUED', 'EXECUTING'].includes(command.status) ? 1 : 0);

    grouped.set(chatId, {
      id: chatId,
      title: command.chatTitle || current?.title || 'Chat principal',
      createdAt: current?.createdAt || createdAt,
      updatedAt: updatedAt > (current?.updatedAt || '') ? updatedAt : (current?.updatedAt || updatedAt),
      messageCount: nextMessageCount,
      pendingCount: nextPendingCount,
      lastMessage: String(command.payload?.message || current?.lastMessage || ''),
    });
  }

  if (!grouped.has('default')) {
    grouped.set('default', createDraftChat('default', 'Chat principal'));
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const aTime = new Date(a.updatedAt).getTime();
    const bTime = new Date(b.updatedAt).getTime();
    return bTime - aTime;
  });
}

function buildChatMessages(
  commands: ProjectCommand[],
  optimisticAssistant: OptimisticAssistantState | null,
  animatedAiMessageIds: string[] = []
) {
  const history: DisplayChatMessage[] = [
    { id: 'welcome', role: 'ai', content: 'Olá! O que vamos construir hoje no seu projeto?', kind: 'conversation', phase: 'done' },
  ];
  const childCommandsByParent = new Map<string, ProjectCommand[]>();

  for (const cmd of commands) {
    if (!cmd.parentCommandId) continue;
    const key = String(cmd.parentCommandId);
    const current = childCommandsByParent.get(key) || [];
    current.push(cmd);
    childCommandsByParent.set(key, current);
  }

  for (const cmd of commands) {
    if (cmd.action === 'LogIntent') {
      const childCommands = (childCommandsByParent.get(String(cmd._id)) || []).sort(
        (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      );
      const payloadSteps = Array.isArray(cmd.payload?.executionSteps)
        ? cmd.payload.executionSteps.map((step: any, index: number) => ({
            stepIndex: Number(step?.stepIndex) || index + 1,
            commandId: String(step?.commandId || `preview-${cmd._id}-${index}`),
            action: String(step?.action || 'Comando'),
            status: String(step?.status || cmd.status || 'AWAITING_APPROVAL'),
            payload: step?.payload && typeof step.payload === 'object' ? step.payload : {},
            result: step?.result,
          }))
        : [];
      const rawExecutionSteps = payloadSteps.length > 0
        ? payloadSteps
        : Array.isArray(cmd.payload?.aiExecutions)
          ? cmd.payload.aiExecutions.map((execution: any, index: number) => ({
              stepIndex: index + 1,
              commandId: String(`raw-${cmd._id}-${execution?.executionId || index + 1}`),
              action: `Execution ${execution?.executionId || index + 1}`,
              status: String(cmd.status || 'FAILED_FINAL'),
              payload: {
                __rawSource: typeof execution?.source === 'string' ? execution.source : '',
              },
              result: null,
            }))
          : [];
      const steps = childCommands.length > 0
        ? childCommands.map((item, index) => ({
            stepIndex: index + 1,
            commandId: String(item._id),
            action: item.action,
            status: item.status,
            payload: item.payload || {},
            result: item.result,
            retryGeneratedFrom:
              item.payload?.__retryGeneratedFrom && typeof item.payload.__retryGeneratedFrom === 'object'
                ? item.payload.__retryGeneratedFrom
                : undefined,
            fullScriptRegeneration:
              item.payload?.__fullScriptRegeneration && typeof item.payload.__fullScriptRegeneration === 'object'
                ? item.payload.__fullScriptRegeneration
                : undefined,
          }))
        : rawExecutionSteps;
      const waitingApproval = cmd.status === 'AWAITING_APPROVAL' || steps.some((item) => item.status === 'AWAITING_APPROVAL');
      const retryCount = Number(cmd.retryCount || 0);

      history.push({ id: `${cmd._id}-user`, role: 'user', content: cmd.payload?.message || 'Comando' });
      history.push({
        id: `${cmd._id}-ai`,
        role: 'ai',
        content: String(
          cmd.payload?.aiStructuredResponse?.message ||
          cmd.payload?.aiReply ||
          cmd.payload?.aiCommands ||
          cmd.payload?.aiPlan ||
          'Resposta pronta.'
        ),
        status: cmd.status,
        kind: normalizeResponseType(cmd.payload?.aiResponseType),
        phase: 'done',
        model: cmd.payload?.selectedModel || cmd.payload?.model,
        mode: (cmd.payload?.aiMode2 === 'think' || cmd.payload?.aiMode2 === 'agent' || cmd.payload?.aiMode === 'think') ? 'think' : 'instant',
        cost: (Number(cmd.payload?.aiBilling?.chargedUsd) || 0) + (Number(cmd.payload?.agentCostUsd) || 0),
        plan: Array.isArray(cmd.payload?.agentPlan) ? cmd.payload.agentPlan : undefined,
        reasoning: typeof cmd.payload?.aiReasoning === 'string' ? cmd.payload.aiReasoning : undefined,
        executions: Array.isArray(cmd.payload?.aiStructuredResponse?.executions)
          ? cmd.payload.aiStructuredResponse.executions
          : Array.isArray(cmd.payload?.aiExecutions)
            ? cmd.payload.aiExecutions
            : [],
        request: {
          parentCommandId: String(cmd._id),
          requestId: String(cmd.requestId || cmd._id),
          approvalRequired: waitingApproval,
          canApprove: waitingApproval,
          canCancel: !isTerminalStatus(cmd.status),
          latestError:
            typeof cmd.payload?.lastExecutionError === 'string' && cmd.payload.lastExecutionError
              ? cmd.payload.lastExecutionError
              : getLatestChildError(childCommands.length > 0 ? childCommands : steps),
          retryCount,
          isRetryCorrection: retryCount > 0,
          retryMode: cmd.payload?.aiMode === 'think' ? 'think' : 'instant',
          lastRetryGeneratedFrom:
            cmd.payload?.lastRetryGeneratedFrom && typeof cmd.payload.lastRetryGeneratedFrom === 'object'
              ? cmd.payload.lastRetryGeneratedFrom
              : undefined,
          lastRetryWasFullScriptRegeneration: Boolean(cmd.payload?.lastRetryWasFullScriptRegeneration),
          steps,
        },
      });
      continue;
    }

    if (cmd.parentCommandId) {
      continue;
    }

    history.push({
      id: `${cmd._id}-system`,
      role: 'ai',
      content: `Comando ${cmd.action}: ${getCommandStatusLabel(cmd.status)}`,
      status: cmd.status,
      kind: 'proposal',
      phase: 'done',
      model: cmd.payload?.selectedModel || cmd.payload?.model,
    });
  }

  if (optimisticAssistant) {
    history.push({
      id: 'optimistic-user',
      role: 'user',
      content: optimisticAssistant.userMessage,
    });
    history.push({
      id: 'optimistic-ai',
      role: 'ai',
      content:
        optimisticAssistant.phase === 'thinking'
          ? 'Organizando contexto, escolhendo o melhor agente e montando a resposta...'
          : optimisticAssistant.content,
      status: optimisticAssistant.phase === 'thinking' ? 'THINKING' : 'WRITING',
      kind: optimisticAssistant.kind,
      phase: optimisticAssistant.phase,
      model: optimisticAssistant.model,
      mode: optimisticAssistant.mode,
      reasoning: optimisticAssistant.reasoning,
      progressSteps: optimisticAssistant.progressSteps,
      pipelineStep: optimisticAssistant.pipelineStep,
      cost: optimisticAssistant.cost,
      plan: optimisticAssistant.plan,
      executions: [],
    });
  }

  return history;
}

function getLatestActiveRequest(commands: ProjectCommand[]) {
  const requestCommands = commands
    .filter((command) => command.action === 'LogIntent' && !isTerminalStatus(command.status))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return requestCommands[0] || null;
}

function isTerminalStatus(status?: string) {
  return ['DONE', 'FAILED', 'FAILED_FINAL', 'CANCELLED'].includes(String(status || ''));
}

function getLatestChildError(
  commands: Array<ProjectCommand | { status?: string; result?: any }>
) {
  const failed = [...commands].reverse().find((item) => item.status === 'FAILED' || item.status === 'FAILED_FINAL');
  if (!failed) return '';
  return formatPropertyValue(failed.result);
}

function buildTimelineEntries(commands: ProjectCommand[]) {
  if (commands.length === 0) {
    return [
      {
        id: 'empty-timeline',
        title: 'Sem alterações ainda',
        description: 'Envie uma mensagem neste chat para começar a gerar ações e histórico.',
        detail: '',
        status: 'IDLE',
        date: new Date().toISOString(),
      },
    ];
  }

  return [...commands]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .map((command) => ({
      id: command._id,
      title: command.action === 'LogIntent' ? getTimelineTitle(command) : command.action,
      description: command.payload?.message || command.payload?.aiPlan || 'Ação registrada para este chat.',
      detail: getTimelineDetail(command),
      status: command.status,
      date: command.updatedAt || command.createdAt || new Date().toISOString(),
    }));
}

function getTimelineTitle(command: ProjectCommand) {
  const responseType = normalizeResponseType(command.payload?.aiResponseType);
  if (responseType === 'conversation') return 'Resposta conversacional';
  if (responseType === 'analysis') return 'Análise gerada';
  return 'Proposta técnica gerada';
}

function getTimelineDetail(command: ProjectCommand) {
  const telemetry = command.payload?.aiTelemetry || {};
  const contextBudget = command.payload?.aiContextBudget || {};
  const chunks = [
    command.payload?.aiResponseType ? `Tipo: ${command.payload.aiResponseType}` : '',
    command.payload?.aiMode ? `Modo: ${command.payload.aiMode}` : '',
    Number(command.retryCount || 0) > 0 ? `Correcoes geradas: ${Number(command.retryCount || 0)}` : '',
    command.payload?.model ? `Modelo: ${command.payload.model}` : '',
    command.payload?.selectedModel ? `Agente: ${command.payload.selectedModel}` : '',
    telemetry.totalTokens ? `Tokens totais: ${telemetry.totalTokens}` : '',
    telemetry.inputTokens ? `Input tokens: ${telemetry.inputTokens}` : '',
    telemetry.outputTokens ? `Output tokens: ${telemetry.outputTokens}` : '',
    telemetry.estimatedCostUsd ? `Custo estimado: US$ ${Number(telemetry.estimatedCostUsd).toFixed(6)}` : '',
    contextBudget.summaryChars ? `Chars contexto: ${contextBudget.summaryChars}` : '',
    contextBudget.explorerChars ? `Chars explorer: ${contextBudget.explorerChars}` : '',
    command.payload?.aiPlan ? `Plano: ${command.payload.aiPlan}` : '',
    command.payload?.aiReply ? `Resposta: ${command.payload.aiReply}` : '',
    Array.isArray(command.payload?.executionSteps) ? `Etapas: ${command.payload.executionSteps.length}` : '',
    command.payload?.lastExecutionError ? `Erro: ${command.payload.lastExecutionError}` : '',
    Array.isArray(command.payload?.aiExecutions) && command.payload.aiExecutions.length > 0
      ? `Executions:\n${command.payload.aiExecutions
          .map((execution: any) => `[executionId:${execution?.executionId ?? '?'}]\n${String(execution?.source || '')}`)
          .join('\n\n')}`
      : '',
    command.result ? `Resultado: ${formatPropertyValue(command.result)}` : '',
  ].filter(Boolean);

  return chunks.join('\n');
}

function getCommandStatusLabel(status: string) {
  if (status === 'AWAITING_APPROVAL') return 'Aguardando aprovacao';
  if (status === 'PREVIEW') return 'Preview';
  if (status === 'THINKING') return 'Pensando';
  if (status === 'WRITING') return 'Escrevendo';
  if (status === 'PENDING') return 'Enfileirado';
  if (status === 'QUEUED') return 'Na fila';
  if (status === 'EXECUTING') return 'Executando no Studio';
  if (status === 'DONE') return 'Concluído';
  if (status === 'FAILED') return 'Falhou';
  if (status === 'FAILED_FINAL') return 'Falha final';
  if (status === 'CANCELLED') return 'Cancelado';
  return status || 'Sem status';
}

function formatRelativeTime(value?: string) {
  if (!value) return 'agora';
  const diff = Date.now() - new Date(value).getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;

  if (diff < minute) return 'agora';
  if (diff < hour) return `${Math.floor(diff / minute)} min atrás`;
  if (diff < 24 * hour) return `${Math.floor(diff / hour)} h atrás`;
  return `${Math.floor(diff / (24 * hour))} d atrás`;
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function getStatusTone(status: string) {
  if (status === 'AWAITING_APPROVAL') return 'border-amber-400/30 bg-amber-400/10 text-amber-100';
  if (status === 'PREVIEW') return 'border-sky-500/30 bg-sky-500/10 text-sky-100';
  if (status === 'THINKING') return 'border-violet-500/30 bg-violet-500/10 text-violet-200';
  if (status === 'WRITING') return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';
  if (status === 'DONE') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'FAILED' || status === 'FAILED_FINAL') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (status === 'EXECUTING') return 'border-blue-500/30 bg-blue-500/10 text-blue-200';
  if (status === 'PENDING' || status === 'QUEUED') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (status === 'CANCELLED') return 'border-slate-600 bg-slate-800 text-slate-300';
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

function normalizeResponseType(value: any): 'conversation' | 'analysis' | 'proposal' {
  if (value === 'conversation') return 'conversation';
  if (value === 'proposal') return 'proposal';
  return 'analysis';
}

function getMessageKindLabel(kind?: 'conversation' | 'analysis' | 'proposal') {
  if (kind === 'conversation') return 'Conversa';
  if (kind === 'proposal') return 'Proposta';
  return 'Raciocínio';
}

function getMessageKindTone(kind?: 'conversation' | 'analysis' | 'proposal') {
  if (kind === 'conversation') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (kind === 'proposal') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-blue-500/30 bg-blue-500/10 text-blue-200';
}

const PIPELINE_STEPS = ['Enviado', 'Roteando', 'IA Gerando', 'Finalizado'] as const;

function PipelineStepper({ step }: { step: number }) {
  return (
    <div className="flex items-start gap-0 w-full pt-1 pb-2">
      {PIPELINE_STEPS.map((label, i) => {
        const isDone = i < step;
        const isActive = i === step;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isDone
                    ? 'bg-emerald-500/20 border border-emerald-500/60 text-emerald-400'
                    : isActive
                    ? 'bg-violet-500/20 border border-violet-400/60 text-violet-300'
                    : 'bg-slate-800 border border-slate-700 text-slate-600'
                }`}
                style={isActive ? { boxShadow: '0 0 8px rgba(167,139,250,0.4)' } : undefined}
              >
                {isDone ? (
                  <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className={`text-[8px] font-bold ${isActive ? 'animate-pulse' : ''}`}>{i + 1}</span>
                )}
              </div>
              <span
                className={`text-[9px] font-medium leading-tight text-center whitespace-nowrap ${
                  isDone ? 'text-emerald-400/80' : isActive ? 'text-violet-300' : 'text-slate-600'
                }`}
              >
                {label}
              </span>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div
                className="flex-1 h-px mt-2.5 mx-1 transition-all duration-500"
                style={{
                  background: i < step
                    ? 'rgba(52,211,153,0.4)'
                    : i === step - 1
                    ? 'linear-gradient(to right, rgba(52,211,153,0.4), rgba(167,139,250,0.3))'
                    : 'rgba(51,65,85,0.6)',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function TypewriterContent({
  content,
  animate,
  thinking,
  executions,
  progressSteps,
  pipelineStep = 1,
}: {
  content: string;
  animate?: boolean;
  thinking?: boolean;
  executions?: { executionId: number; source: string }[];
  progressSteps?: string[];
  pipelineStep?: number;
}) {
  const [visibleContent, setVisibleContent] = useState(animate ? '' : content);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (thinking) {
      setVisibleContent(progressSteps?.[0] || 'Organizando contexto...');
      return;
    }

    if (!animate) {
      setVisibleContent(content);
      return;
    }

    setVisibleContent('');
    let index = 0;
    const timer = window.setInterval(() => {
      index += Math.max(1, Math.ceil(content.length / 48));
      setVisibleContent(content.slice(0, index));
      if (index >= content.length) {
        window.clearInterval(timer);
      }
    }, 28);

    return () => window.clearInterval(timer);
  }, [content, animate, thinking, progressSteps]);

  useEffect(() => {
    if (!thinking || !progressSteps || progressSteps.length <= 1) return;
    const timer = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % progressSteps.length);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [thinking, progressSteps]);

  useEffect(() => {
    if (!thinking || !progressSteps || progressSteps.length === 0) return;
    setVisibleContent(progressSteps[stepIndex] || progressSteps[0]);
  }, [thinking, progressSteps, stepIndex]);

  if (thinking) {
    return (
      <div className="w-full rounded-2xl border border-violet-500/20 bg-violet-500/10 px-3 py-3 text-slate-100">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-300" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-300 [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-300 [animation-delay:240ms]" />
            </span>
            <span className="text-xs font-medium text-violet-100">Processando</span>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-violet-200/70">BloxAI Agent</span>
        </div>
        <PipelineStepper step={pipelineStep} />
        <div className="mt-2 text-xs text-slate-400 italic">{visibleContent}</div>
      </div>
    );
  }

  return <ChatContent content={visibleContent} compact={false} executions={executions} />;
}

function findNodeByPath(nodes: WorkspaceNode[], path?: string): WorkspaceNode | null {
  if (!path) return null;

  for (const node of nodes) {
    if (node.propriedades?.Path === path) return node;
    const found = findNodeByPath(node.filhos || [], path);
    if (found) return found;
  }

  return null;
}

function getNodeSummary(node: WorkspaceNode | null) {
  if (!node) return [];

  const props = node.propriedades || {};
  const items = [
    { label: 'Path', value: props.Path || '-' },
    { label: 'Parent', value: props.Parent || '-' },
    { label: 'Tipo', value: props.ClassName || '-' },
    { label: 'Filhos', value: String(node.filhos?.length || 0) },
    { label: 'Propriedades', value: String(Object.keys(props).length) },
  ];

  if (props.Position) items.push({ label: 'Position', value: JSON.stringify(props.Position) });
  if (props.Size) items.push({ label: 'Size', value: JSON.stringify(props.Size) });
  if (props.Color) items.push({ label: 'Color', value: JSON.stringify(props.Color) });
  if (props.Material) items.push({ label: 'Material', value: String(props.Material) });
  if (props.SoundId) items.push({ label: 'SoundId', value: String(props.SoundId) });
  if (props.Image) items.push({ label: 'Image', value: String(props.Image) });
  if (props.RunContext) items.push({ label: 'RunContext', value: String(props.RunContext) });

  return items;
}

function getNodePropertyEntries(node: WorkspaceNode | null) {
  if (!node) return [];

  const priorityOrder = [
    'ClassName',
    'ScriptType',
    'Path',
    'Parent',
    'Name',
    'ChildCount',
    'Archivable',
    'Enabled',
    'Disabled',
    'RunContext',
    'Position',
    'Size',
    'CFrame',
    'Color',
    'Material',
    'Value',
  ];

  return Object.entries(node.propriedades || {})
    .filter(([key, value]) => key !== 'Source' && value !== undefined)
    .sort(([a], [b]) => {
      const aIndex = priorityOrder.indexOf(a);
      const bIndex = priorityOrder.indexOf(b);
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      }
      return a.localeCompare(b);
    })
    .map(([label, value]) => ({
      label,
      value: formatPropertyValue(value),
    }));
}

function formatPropertyValue(value: any) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function analyzeScriptSource(source?: string) {
  const text = typeof source === 'string' ? source : '';
  const lines = text.length > 0 ? text.split('\n') : [];

  return {
    lineCount: lines.length,
    functionCount: (text.match(/\bfunction\b/g) || []).length,
    requireCount: (text.match(/\brequire\s*\(/g) || []).length,
    commentCount: (text.match(/--/g) || []).length,
    hasReturn: /\breturn\b/.test(text),
  };
}

function getScriptTheme(scriptType: string) {
  if (scriptType === 'LocalScript') {
    return {
      borderClass: 'border-blue-500/30',
      headerClass: 'border-blue-500/20 bg-blue-500/10',
      titleClass: 'text-blue-200',
      iconWrapperClass: 'border-blue-500/30 bg-blue-500/10',
      codeClass: 'text-blue-100',
      summaryText: 'Executa no cliente.',
    };
  }

  if (scriptType === 'ModuleScript') {
    return {
      borderClass: 'border-violet-500/30',
      headerClass: 'border-violet-500/20 bg-violet-500/10',
      titleClass: 'text-violet-200',
      iconWrapperClass: 'border-violet-500/30 bg-violet-500/10',
      codeClass: 'text-violet-100',
      summaryText: 'Modulo reutilizavel exportado por require.',
    };
  }

  return {
    borderClass: 'border-slate-500/30',
    headerClass: 'border-slate-500/20 bg-slate-200/5',
    titleClass: 'text-slate-100',
    iconWrapperClass: 'border-slate-500/30 bg-slate-200/5',
    codeClass: 'text-slate-100',
    summaryText: 'Executa no servidor.',
  };
}

function ChatContent({
  content,
  compact = false,
  executions = [],
}: {
  content: string;
  compact?: boolean;
  executions?: { executionId: number; source: string }[];
}) {
  const segments = extractChatSegments(content);

  return (
    <div className="space-y-2">
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          if (!segment.value.trim()) return null;
          return <ExecutionAwareText key={`text-${index}`} text={segment.value} compact={compact} executions={executions} />;
        }

        return <ChatReferenceCard key={`ref-${segment.value.raw}-${index}`} reference={segment.value} compact={compact} />;
      })}
    </div>
  );
}

function ExecutionAwareText({
  text,
  compact,
  executions,
}: {
  text: string;
  compact?: boolean;
  executions: { executionId: number; source: string }[];
}) {
  const parts = text.split(EXECUTION_REFERENCE_REGEX);

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        const match = /^executionId:(\d+)$/.exec(part.trim());
        if (!match) {
          if (!part.trim()) return null;
          return <MarkdownContent key={`txt-${index}`} text={part} compact={compact} />;
        }

        const executionId = Number(match[1]);
        const execution = executions.find((item) => item.executionId === executionId);
        return (
          <ExecutionReferenceCard
            key={`exec-${executionId}-${index}`}
            executionId={executionId}
            source={execution?.source || ''}
            compact={compact}
          />
        );
      })}
    </div>
  );
}

function MarkdownContent({ text, compact = false }: { text: string; compact?: boolean }) {
  const blocks = parseMarkdownBlocks(text);
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === 'code') {
          return <CodePreviewBlock key={`code-${index}`} code={block.code} language={block.language} compact={compact} />;
        }
        if (block.type === 'table') {
          return <MarkdownTable key={`table-${index}`} rows={block.rows} compact={compact} />;
        }
        if (block.type === 'list') {
          return (
            <ul
              key={`list-${index}`}
              className={`space-y-1 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'} ${compact ? 'text-sm' : 'text-sm'}`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`} className="text-slate-100">
                  <InlineMarkdownText text={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <div key={`paragraph-${index}`} className="whitespace-pre-wrap break-words leading-7 text-slate-100">
            <InlineMarkdownText text={block.text} />
          </div>
        );
      })}
    </div>
  );
}

function InlineMarkdownText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) => {
        const inlineCode = /^`([^`]+)`$/.exec(part);
        if (inlineCode) {
          return (
            <code key={`inline-code-${index}`} className="rounded-md border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[0.9em] text-emerald-200">
              {inlineCode[1]}
            </code>
          );
        }

        const richTokens = splitMarkdownDecorators(part);
        return richTokens.map((token, tokenIndex) => {
          if (token.type === 'bold') {
            return <strong key={`bold-${index}-${tokenIndex}`} className="font-semibold text-white">{token.value}</strong>;
          }
          if (token.type === 'italic') {
            return <em key={`italic-${index}-${tokenIndex}`} className="text-slate-200">{token.value}</em>;
          }
          return <React.Fragment key={`text-${index}-${tokenIndex}`}>{token.value}</React.Fragment>;
        });
      })}
    </>
  );
}

function CodePreviewBlock({
  code,
  language,
  compact = false,
}: {
  code: string;
  language?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const lines = String(code || '').split('\n');

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/90">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/90 px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
          <FileCode className="h-3.5 w-3.5" />
          <span>{language || 'code'}</span>
        </div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300 transition hover:border-slate-600 hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <div className={`${compact ? 'max-h-52' : 'max-h-[26rem]'} overflow-auto`}>
        {lines.map((line, index) => (
          <div key={`code-line-${index}`} className="grid grid-cols-[44px_1fr] border-b border-slate-900/80 font-mono text-xs last:border-b-0">
            <div className="select-none bg-slate-950 px-2 py-1.5 text-right text-slate-600">{index + 1}</div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-1.5 text-slate-100">
              <HighlightedCodeLine text={line.length > 0 ? line : ' '} />
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function HighlightedCodeLine({ text }: { text: string }) {
  const tokens = text.split(/(\b(?:local|function|return|if|then|else|elseif|for|while|do|end|const|let|var|async|await|class|new|import|export|from|true|false|nil|null)\b|".*?"|'.*?'|--.*$|\/\/.*$)/g);
  return (
    <>
      {tokens.map((token, index) => {
        if (!token) return null;
        if (/^--.*$|^\/\/.*$/m.test(token)) {
          return <span key={`comment-${index}`} className="text-slate-500">{token}</span>;
        }
        if (/^".*?"$|^'.*?'$/.test(token)) {
          return <span key={`string-${index}`} className="text-emerald-300">{token}</span>;
        }
        if (/^(local|function|return|if|then|else|elseif|for|while|do|end|const|let|var|async|await|class|new|import|export|from|true|false|nil|null)$/.test(token)) {
          return <span key={`keyword-${index}`} className="text-sky-300">{token}</span>;
        }
        return <React.Fragment key={`plain-${index}`}>{token}</React.Fragment>;
      })}
    </>
  );
}

function MarkdownTable({ rows, compact = false }: { rows: string[][]; compact?: boolean }) {
  const [header, ...body] = rows;
  return (
    <div className="overflow-auto rounded-2xl border border-slate-700">
      <table className={`min-w-full ${compact ? 'text-xs' : 'text-sm'}`}>
        <thead className="bg-slate-900/90 text-slate-200">
          <tr>
            {header.map((cell, index) => (
              <th key={`head-${index}`} className="border-b border-slate-800 px-3 py-2 text-left font-medium">
                <InlineMarkdownText text={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-slate-950/70 text-slate-300">
          {body.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`} className="border-b border-slate-800 last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top">
                  <InlineMarkdownText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExecutionReferenceCard({
  executionId,
  source,
  compact = false,
}: {
  executionId: number;
  source: string;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <span className="inline-block align-middle">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className={`mx-1 inline-flex items-center gap-1 rounded-lg border px-2 py-1 align-middle text-xs transition ${
          compact
            ? 'border-emerald-300/30 bg-emerald-950/35 text-emerald-100 hover:bg-emerald-950/50'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'
        }`}
      >
        <Cpu className="h-3.5 w-3.5" />
        <span>{`executionId:${executionId}`}</span>
      </button>
      {expanded && (
        <span className={`mt-2 block overflow-hidden rounded-2xl border ${compact ? 'border-emerald-300/30 bg-emerald-950/35' : 'border-slate-700 bg-slate-950/85'}`}>
          <span className={`flex items-center justify-between gap-3 border-b px-3 py-2 ${compact ? 'border-emerald-400/20 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/80'}`}>
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-200">
                <Cpu className="h-3.5 w-3.5" />
                <span>{`Execucao ${executionId}`}</span>
              </span>
              <span className="text-[10px] text-slate-400">Clique para minimizar</span>
          </span>
          <span className="block px-3 py-3">
            <CodePreviewBlock code={source || 'Nenhum source registrado para esta execucao.'} language="execution" compact={compact} />
          </span>
        </span>
      )}
    </span>
  );
}

function AgentPlanChecklist({ plan }: { plan: { title: string; status: string }[] }) {
  const doneCount = plan.filter((t) => t.status === 'done').length;
  return (
    <div className="mb-3 rounded-2xl border brd bg-surface-1 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
          <CheckSquare2 className="h-3.5 w-3.5" />
          Plano do agente
        </div>
        <span className="text-[10px] txt-muted">{doneCount}/{plan.length}</span>
      </div>
      <ul className="space-y-1.5">
        {plan.map((task, index) => {
          const status = task.status;
          const icon =
            status === 'done' ? (
              <CheckSquare2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            ) : status === 'failed' ? (
              <X className="h-3.5 w-3.5 shrink-0 text-rose-400" />
            ) : status === 'doing' ? (
              <Clock3 className="h-3.5 w-3.5 shrink-0 animate-pulse text-violet-300" />
            ) : (
              <Square className="h-3.5 w-3.5 shrink-0 txt-muted" />
            );
          return (
            <li key={index} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5">{icon}</span>
              <span className={status === 'done' ? 'line-through txt-muted' : status === 'failed' ? 'text-rose-200' : 'txt-soft'}>
                {task.title}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RequestExecutionPanel({
  request,
  onDecision,
}: {
  request: NonNullable<DisplayChatMessage['request']>;
  onDecision: (parentCommandId: string, decision: 'approve' | 'cancel') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasScriptStep = request.steps.some((step) => step.action === 'CreateScript');

  const counts = request.steps.reduce(
    (acc, step) => {
      if (step.status === 'DONE') acc.done += 1;
      else if (step.status === 'FAILED' || step.status === 'FAILED_FINAL') acc.failed += 1;
      else acc.running += 1;
      return acc;
    },
    { done: 0, failed: 0, running: 0 }
  );

  return (
    <div className="mt-3 w-full overflow-hidden rounded-2xl border brd bg-sunken">
      {/* Barra compacta — recolhida por padrão; detalhes só ao expandir. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 txt-muted transition ${expanded ? 'rotate-0' : '-rotate-90'}`} />
          <span className="text-[10px] uppercase tracking-wide txt-muted">Execução</span>
          <span className="text-xs txt-soft">{request.steps.length} comando(s)</span>
          {counts.done > 0 && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">{counts.done} ✓</span>}
          {counts.running > 0 && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">{counts.running} ⏳</span>}
          {counts.failed > 0 && <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200">{counts.failed} ✕</span>}
        </button>
        <div className="flex items-center gap-2">
          {request.canApprove && (
            <button
              type="button"
              onClick={() => onDecision(request.parentCommandId, 'approve')}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20"
            >
              Autorizar
            </button>
          )}
          {request.canCancel && (
            <button
              type="button"
              onClick={() => onDecision(request.parentCommandId, 'cancel')}
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t brd">
          {hasScriptStep && (
            <div className="px-3 py-2 text-[11px] text-blue-200">
              Esta resposta cria/edita script — o conteúdo aparece nos cartões abaixo.
            </div>
          )}
          {request.isRetryCorrection && (
            <div className={`mx-3 mt-2 rounded-xl border px-2.5 py-2 text-[11px] ${
              request.retryMode === 'think'
                ? 'border-violet-500/25 bg-violet-500/10 text-violet-100'
                : 'border-amber-500/25 bg-amber-500/10 text-amber-100'
            }`}>
              {request.retryMode === 'think'
                ? `Correção gerada pelo modo Think após revisar a falha anterior${request.retryCount ? ` (${request.retryCount} tentativa(s))` : ''}.`
                : `Correção rápida gerada após falha anterior${request.retryCount ? ` (${request.retryCount} tentativa(s))` : ''}.`}
            </div>
          )}
          {request.latestError && (
            <div className="mx-3 mt-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-100">
              Erro: {request.latestError}
            </div>
          )}
          <div className="space-y-2 p-3">
            {request.steps.map((step, index) => (
              <ExecutionStepCard key={step.commandId} step={step} index={index} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExecutionStepCard({
  step,
  index,
}: {
  step: NonNullable<NonNullable<DisplayChatMessage['request']>['steps']>[number];
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const fullPreview = formatCommandPreview(step.action, step.payload || {});
  const compactPreview = summarizeCommandPreview(fullPreview);
  const retryInfo = step.retryGeneratedFrom;
  const fullScriptRegeneration = step.fullScriptRegeneration?.enabled;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium text-white">{`#${step.stepIndex || index + 1} ${step.action}`}</div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getStatusTone(step.status)}`}>
            {getCommandStatusLabel(step.status)}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1 text-[10px] text-slate-300 transition hover:border-slate-600 hover:bg-slate-900"
          >
            {expanded ? 'Minimizar' : 'Ver completo'}
          </button>
        </div>
      </div>
      {retryInfo && (
        <div className={`mt-2 rounded-xl border px-3 py-2 text-[11px] ${
          retryInfo.retryMode === 'think'
            ? 'border-violet-500/20 bg-violet-500/10 text-violet-100'
            : 'border-amber-500/20 bg-amber-500/10 text-amber-100'
        }`}>
          {`Regenerado apos falha da etapa #${retryInfo.failedStepIndex || '?'} ${retryInfo.failedAction || 'Comando'}`}
          {retryInfo.failedError ? ` | ${retryInfo.failedError}` : ''}
        </div>
      )}
      {fullScriptRegeneration && (
        <div className="mt-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-100">
          Script/regra reenviado(a) por completo nesta correcao.
          {step.fullScriptRegeneration?.reason ? ` ${step.fullScriptRegeneration.reason}` : ''}
        </div>
      )}
      {expanded ? (
        <div className="mt-2">
          <CodePreviewBlock code={fullPreview} language={inferPreviewLanguage(step.action, fullPreview)} compact={false} />
        </div>
      ) : (
        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-black/25 px-3 py-2 font-mono text-[11px] text-slate-200">
          {compactPreview}
        </pre>
      )}
      {step.result !== undefined && step.result !== null && step.result !== '' && (
        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 font-mono text-[11px] text-slate-300">
          {formatPropertyValue(step.result)}
        </pre>
      )}
    </div>
  );
}

function ChatReferenceCard({ reference, compact = false }: { reference: ChatReference; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isFileReference = reference.snippet === 'arquivo selecionado';
  const title = getReferenceTitle(reference.path);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className={`inline-flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${
          compact
            ? 'border-blue-300/30 bg-blue-950/35 text-blue-50 hover:bg-blue-950/50'
            : 'border-slate-700 bg-slate-950/75 text-slate-100 hover:border-slate-600 hover:bg-slate-900/90'
        }`}
      >
        <Paperclip className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate text-xs font-medium">{title}</span>
        {reference.lineLabel && !isFileReference && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
            compact
              ? 'border-blue-200/30 bg-blue-300/10 text-blue-100'
              : 'border-violet-500/30 bg-violet-500/10 text-violet-200'
          }`}>
            {reference.lineLabel}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${expanded ? 'rotate-180' : 'rotate-0'}`} />
      </button>

      {expanded && (
        <div className={`overflow-hidden rounded-2xl border shadow-sm ${compact ? 'border-blue-300/35 bg-blue-950/40' : 'border-slate-700 bg-slate-950/80'}`}>
          <div className={`flex items-center justify-between gap-3 border-b px-3 py-2 ${compact ? 'border-blue-400/20 bg-blue-500/10' : 'border-slate-800 bg-slate-900/80'}`}>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-300">
              <Paperclip className="h-3.5 w-3.5" />
              <span>{isFileReference ? 'Arquivo anexado' : 'Linhas anexadas'}</span>
            </div>
            <span className="text-[10px] text-slate-400">Clique para minimizar</span>
          </div>
          <div className="px-3 py-3">
            <div className="rounded-xl border border-slate-800 bg-black/20 px-2 py-1.5 font-mono text-[11px] text-slate-300 break-all">
              {reference.path}
            </div>
            {!isFileReference && (
              <pre className={`mt-2 overflow-auto whitespace-pre-wrap break-words rounded-xl border px-3 py-2 font-mono text-xs ${
                compact
                  ? 'border-blue-300/20 bg-slate-950/40 text-blue-50'
                  : 'border-slate-800 bg-black/30 text-slate-100'
              }`}>
                {reference.body || reference.snippet}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function buildChatReference(path: string, snippet: string) {
  const safePath = String(path || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `('${safePath}', ${JSON.stringify(snippet)})`;
}

function decodeSingleQuotedValue(value: string) {
  return value.replace(/\\\\/g, '\\').replace(/\\'/g, "'");
}

function decodeDoubleQuotedValue(value: string) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
}

function extractChatSegments(content: string): ChatSegment[] {
  const segments: ChatSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CHAT_REFERENCE_REGEX.lastIndex = 0;

  while ((match = CHAT_REFERENCE_REGEX.exec(content)) !== null) {
    const [raw, encodedPath, encodedSnippet] = match;
    const start = match.index;

    if (start > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, start) });
    }

    segments.push({
      type: 'reference',
      value: {
        path: decodeSingleQuotedValue(encodedPath),
        ...parseChatReferenceSnippet(decodeDoubleQuotedValue(encodedSnippet)),
        raw,
      },
    });

    lastIndex = start + raw.length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: content }];
}

function removeChatReferences(content: string) {
  return content.replace(CHAT_REFERENCE_REGEX, '').replace(/\n{3,}/g, '\n\n').trim();
}

function getReferenceTitle(path: string) {
  const normalizedPath = String(path || '').replace(/\\/g, '/');
  const parts = normalizedPath.split('/').filter(Boolean);
  return parts[parts.length - 1] || path || 'anexo';
}

function parseChatReferenceSnippet(snippet: string) {
  const lineMatch = snippet.match(/^(Linha\s+\d+|Linhas\s+\d+\-\d+)\n([\s\S]*)$/);

  if (!lineMatch) {
    return {
      snippet,
      body: snippet,
      lineLabel: undefined,
    };
  }

  return {
    snippet,
    body: lineMatch[2],
    lineLabel: lineMatch[1],
  };
}

function formatCommandPreview(action: string, payload: Record<string, any>) {
  if (typeof payload.__rawSource === 'string' && payload.__rawSource.trim()) {
    return payload.__rawSource;
  }

  if (action === 'RunLuau') {
    return [
      `language: ${payload.language || 'luau'}`,
      'source:',
      String(payload.source || ''),
    ].join('\n');
  }

  if (action === 'CreateScript') {
    return [
      `scriptType: ${payload.scriptType || 'Script'}`,
      `parent: ${payload.parent || 'workspace'}`,
      `name: ${payload.name || 'NewScript'}`,
      'source:',
      String(payload.source || ''),
    ].join('\n');
  }

  if (action === 'CreatePart') {
    return [
      `shape: ${payload.shape || 'Block'}`,
      `position: ${formatPropertyValue(payload.position)}`,
      `size: ${formatPropertyValue(payload.size)}`,
      `properties: ${formatPropertyValue(payload.properties)}`,
    ].join('\n');
  }

  return JSON.stringify(payload || {}, null, 2);
}

function summarizeCommandPreview(value: string, maxLines = 6, maxCharsPerLine = 120) {
  const text = String(value || '').trim();
  if (!text) return 'Sem preview disponivel.';

  const lines = text.split('\n').slice(0, maxLines).map((line) => {
    if (line.length <= maxCharsPerLine) return line;
    return `${line.slice(0, maxCharsPerLine - 3)}...`;
  });

  const originalLineCount = text.split('\n').length;
  if (originalLineCount > maxLines) {
    lines.push(`... +${originalLineCount - maxLines} linha(s)`);
  }

  return lines.join('\n');
}

function parseMarkdownBlocks(text: string) {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: Array<
    | { type: 'paragraph'; text: string }
    | { type: 'list'; ordered: boolean; items: string[] }
    | { type: 'table'; rows: string[][] }
    | { type: 'code'; language?: string; code: string }
  > = [];
  let index = 0;

  while (index < lines.length) {
    const currentLine = lines[index];
    if (!currentLine.trim()) {
      index += 1;
      continue;
    }

    const fenced = currentLine.match(/^```([\w-]+)?\s*$/);
    if (fenced) {
      const language = fenced[1] || 'code';
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !/^```/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const rows: string[][] = [];
      rows.push(parseMarkdownTableRow(lines[index]));
      index += 2;
      while (index < lines.length && lines[index].includes('|')) {
        rows.push(parseMarkdownTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

    const listMatch = currentLine.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2]);
      const items: string[] = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (!itemMatch) break;
        items.push(itemMatch[3]);
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^```/.test(lines[index])) {
      if (isMarkdownTableStart(lines, index) || /^(\s*)([-*]|\d+\.)\s+/.test(lines[index])) break;
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') });
  }

  return blocks;
}

function isMarkdownTableStart(lines: string[], index: number) {
  const current = lines[index] || '';
  const next = lines[index + 1] || '';
  return current.includes('|') && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(next);
}

function parseMarkdownTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function splitMarkdownDecorators(text: string) {
  const output: Array<{ type: 'text' | 'bold' | 'italic'; value: string }> = [];
  let remaining = text;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    const italicMatch = remaining.match(/\*([^*]+)\*/);
    const nextMatch = [boldMatch, italicMatch]
      .filter(Boolean)
      .sort((a, b) => (a!.index || 0) - (b!.index || 0))[0];

    if (!nextMatch || nextMatch.index === undefined) {
      output.push({ type: 'text', value: remaining });
      break;
    }

    if (nextMatch.index > 0) {
      output.push({ type: 'text', value: remaining.slice(0, nextMatch.index) });
    }

    output.push({
      type: nextMatch[0].startsWith('**') ? 'bold' : 'italic',
      value: nextMatch[1],
    });

    remaining = remaining.slice(nextMatch.index + nextMatch[0].length);
  }

  return output;
}

function inferPreviewLanguage(action: string, preview: string) {
  if (action === 'RunLuau' || /\blocal\b|\bfunction\b|\bworkspace\b/.test(preview)) return 'luau';
  if (preview.trim().startsWith('{') || preview.trim().startsWith('[')) return 'json';
  return 'code';
}

function getProjectSyncState(project: any) {
  const syncAgeMs = Number(project?.syncAgeMs || 0);
  const syncAgeSeconds = Math.max(0, Math.floor(syncAgeMs / 1000));
  const isOnline = project?.status === 'Online';
  const isHealthy = project?.isSyncHealthy !== false;
  const studioLabel = isOnline ? 'ON' : 'OFF';
  const headerStudioLabel = isHealthy
    ? (isOnline ? 'Online' : 'Offline')
    : 'Desincronizado';
  const syncLabel = isOnline
    ? `Sync: ${syncAgeSeconds}s`
    : 'Sync: aguardando Studio';
  const warningMessage =
    typeof project?.syncWarning === 'string' && project.syncWarning
      ? project.syncWarning
      : null;
  const otherProjectWarning =
    project?.activeStudioProject?.name
      ? `O plugin esta sincronizando outro projeto no Studio agora: ${project.activeStudioProject.name}. Este painel esta aberto em ${project?.name || 'outro projeto'}.`
      : null;

  return {
    studioLabel,
    headerStudioLabel,
    syncLabel,
    studioDotClass: !isOnline ? 'bg-slate-500' : isHealthy ? 'bg-green-500' : 'bg-amber-400',
    headerStudioClass: !isOnline ? 'text-slate-200' : isHealthy ? 'text-white' : 'text-amber-200',
    syncTextClass: !isOnline ? 'text-slate-400' : isHealthy ? 'text-slate-400' : 'text-amber-300',
    warningMessage,
    otherProjectWarning,
    warningTone: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  };
}

function getSelectedScriptLineRange(selection: Selection | null) {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const startLine = getLineIndexFromNode(selection.anchorNode);
  const endLine = getLineIndexFromNode(selection.focusNode);

  if (!startLine || !endLine) return null;

  return {
    startLine: Math.min(startLine, endLine),
    endLine: Math.max(startLine, endLine),
  };
}

function getLineIndexFromNode(node: Node | null) {
  if (!node) return null;

  const element = node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;

  const lineElement = element?.closest?.('[data-script-line-index]');
  const rawIndex = lineElement?.getAttribute('data-script-line-index');
  const parsedIndex = rawIndex ? Number(rawIndex) : NaN;

  return Number.isFinite(parsedIndex) ? parsedIndex : null;
}
