"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Zap, DollarSign, Users, Lock,
  RefreshCw, Copy, Check, ChevronRight, Image as ImageIcon,
  Wand2, FolderPlus, History, X, Send,
} from 'lucide-react';
import api from '../api/api.js';

type GameIdea = {
  title: string;
  tagline: string;
  genre: string;
  coreLoop: string;
  viralMechanic: string;
  monetization: string[];
  uniqueHook: string;
  targetAudience: string;
  estimatedDifficulty: string;
};

type AppliedTo = { projectId: string; projectName: string; at: string };

type HistoryItem = {
  id: string;
  theme: string;
  idea: GameIdea;
  imageUrl: string;
  model: string;
  refinedFrom: string | null;
  instruction: string;
  appliedTo: AppliedTo[];
  createdAt: string;
};

const DIFFICULTY_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  'Fácil': { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', text: '#34d399' },
  'Médio': { bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.25)',  text: '#fbbf24' },
  'Difícil':{ bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', text: '#f87171' },
};

export default function IdeasPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem('blox_token') ?? '';
  const headers = { Authorization: `Bearer ${token}` };

  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [theme, setTheme] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const [instruction, setInstruction] = useState('');
  const [refining, setRefining] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  const selected = history.find((h) => h.id === selectedId) ?? null;

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.get('/api/ideas/history', { headers });
      const items: HistoryItem[] = res.data?.history ?? [];
      setHistory(items);
      setSelectedId((cur) => cur ?? items[0]?.id ?? null);
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    api.get('/api/auth/me', { headers })
      .then((res) => {
        const ok = Boolean(res.data?.features?.ideaGenerator);
        setHasAccess(ok);
        if (ok) loadHistory();
      })
      .catch(() => setHasAccess(false));
  }, [token, navigate, loadHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await api.post('/api/ideas/generate', { theme: theme.trim() || undefined }, { headers });
      const item: HistoryItem = res.data.history;
      setHistory((prev) => [item, ...prev]);
      setSelectedId(item.id);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Falha ao gerar ideia. Tente novamente.');
    } finally { setLoading(false); }
  };

  const refine = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selected || !instruction.trim()) return;
    setRefining(true); setError('');
    try {
      const res = await api.post('/api/ideas/refine', { historyId: selected.id, instruction: instruction.trim() }, { headers });
      const item: HistoryItem = res.data.history;
      setHistory((prev) => [item, ...prev]);
      setSelectedId(item.id);
      setInstruction('');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Falha ao refinar ideia.');
    } finally { setRefining(false); }
  };

  const genImage = async () => {
    if (!selected) return;
    setImageLoading(true); setError('');
    try {
      const res = await api.post('/api/ideas/image', { historyId: selected.id }, { headers });
      const url = res.data.imageUrl;
      setHistory((prev) => prev.map((h) => h.id === selected.id ? { ...h, imageUrl: url } : h));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Falha ao gerar imagem.');
    } finally { setImageLoading(false); }
  };

  const copyIdea = async () => {
    if (!selected) return;
    const idea = selected.idea;
    const text = [
      `🎮 ${idea.title}`, `"${idea.tagline}"`, ``,
      `Gênero: ${idea.genre}`, ``,
      `🔄 Core Loop:\n${idea.coreLoop}`, ``,
      `🚀 Mechanic Viral:\n${idea.viralMechanic}`, ``,
      `💰 Monetização:\n${idea.monetization.map((m) => `• ${m}`).join('\n')}`, ``,
      `✨ Diferencial:\n${idea.uniqueHook}`, ``,
      `🎯 Público-alvo: ${idea.targetAudience}`,
      `⚙️ Dificuldade: ${idea.estimatedDifficulty}`,
    ].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="aurora-bg min-h-screen flex flex-col text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-4 glass border-b border-white/[0.07]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/[0.08] hover:bg-white/[0.06] transition-colors text-slate-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-game text-[17px] text-white tracking-wide">Gerador de Ideias Virais</span>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(140,70,255,0.20)', color: '#c084fc', border: '1px solid rgba(140,70,255,0.30)' }}>Trends</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Conceitos virais com IA — gere, refine, ilustre e aplique ao seu projeto</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {hasAccess === null ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <RefreshCw className="w-6 h-6 text-violet-400 animate-spin" />
            <span className="text-slate-500 text-sm">Verificando acesso...</span>
          </div>
        ) : !hasAccess ? (
          <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(140,70,255,0.12)', border: '1px solid rgba(140,70,255,0.25)' }}>
              <Lock className="w-8 h-8 text-violet-400" />
            </div>
            <div>
              <h2 className="font-game text-2xl text-white mb-2">Recurso Exclusivo</h2>
              <p className="text-slate-400 max-w-sm mx-auto text-sm leading-relaxed">
                O Gerador de Ideias Virais não está disponível no seu plano atual. Faça upgrade para desbloquear.
              </p>
            </div>
            <button onClick={() => navigate('/upgrade')} className="btn-gradient py-2.5 px-6 rounded-xl text-sm">
              Ver planos <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
            {/* Sidebar: generator + history */}
            <div className="flex flex-col gap-4">
              <div className="card p-4">
                <h2 className="text-sm font-semibold text-white mb-2">Nova ideia</h2>
                <form onSubmit={generate} className="flex flex-col gap-2.5">
                  <input
                    type="text" value={theme} onChange={(e) => setTheme(e.target.value)}
                    placeholder="Tema (opcional): tower defense, RP escolar..."
                    className="input text-sm" maxLength={200} disabled={loading}
                  />
                  <button type="submit" disabled={loading} className="btn-gradient py-2.5 rounded-xl text-sm justify-center disabled:opacity-50">
                    {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Gerando...</> : <><Sparkles className="w-4 h-4" /> Gerar ideia</>}
                  </button>
                </form>
              </div>

              <div className="card p-4 flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-slate-400" />
                  <h2 className="text-sm font-semibold text-white">Histórico</h2>
                  <span className="text-[11px] text-slate-600">{history.length}</span>
                </div>
                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
                  {history.length === 0 && <div className="text-xs text-slate-600 py-4 text-center">Nenhuma ideia ainda.</div>}
                  {history.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setSelectedId(h.id)}
                      className="w-full text-left flex items-center gap-2.5 p-2 rounded-xl border transition-colors"
                      style={selectedId === h.id
                        ? { background: 'rgba(140,70,255,0.10)', borderColor: 'rgba(140,70,255,0.30)' }
                        : { background: 'transparent', borderColor: 'rgba(255,255,255,0.06)' }}
                    >
                      <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-white/[0.08] bg-white/[0.04] flex items-center justify-center">
                        {h.imageUrl ? <img src={h.imageUrl} alt="" className="w-full h-full object-cover" /> : <Sparkles className="w-4 h-4 text-slate-600" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-white truncate">{h.idea.title}</div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {h.refinedFrom ? '✎ refino' : (h.theme || 'original')}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Detail */}
            <div className="flex flex-col gap-5">
              {error && <div className="p-4 rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 text-sm">{error}</div>}

              {!selected ? (
                <div className="card flex flex-col items-center justify-center py-24 text-center gap-3">
                  <Sparkles className="w-8 h-8 text-violet-400" />
                  <p className="text-slate-400 text-sm">Gere sua primeira ideia para começar.</p>
                </div>
              ) : (
                <IdeaDetail
                  item={selected}
                  copied={copied}
                  onCopy={copyIdea}
                  imageLoading={imageLoading}
                  onGenImage={genImage}
                  instruction={instruction}
                  setInstruction={setInstruction}
                  refining={refining}
                  onRefine={refine}
                  onApply={() => setApplyOpen(true)}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {applyOpen && selected && (
        <ApplyModal item={selected} headers={headers} onClose={() => setApplyOpen(false)} onApplied={() => { setApplyOpen(false); loadHistory(); }} />
      )}
    </div>
  );
}

// ─── Idea Detail ────────────────────────────────────────────────────────────────

function IdeaDetail({
  item, copied, onCopy, imageLoading, onGenImage, instruction, setInstruction, refining, onRefine, onApply,
}: {
  item: HistoryItem; copied: boolean; onCopy: () => void;
  imageLoading: boolean; onGenImage: () => void;
  instruction: string; setInstruction: (v: string) => void;
  refining: boolean; onRefine: (e?: React.FormEvent) => void; onApply: () => void;
}) {
  const idea = item.idea;
  const diffKey = idea.estimatedDifficulty?.split('|')[0].trim();
  const c = DIFFICULTY_COLOR[diffKey] || DIFFICULTY_COLOR['Médio'];

  return (
    <div className="animate-slide-up space-y-5">
      {/* Title + image */}
      <div className="card p-6 relative overflow-hidden" style={{ borderColor: 'rgba(140,70,255,0.25)', boxShadow: '0 0 40px rgba(140,70,255,0.08)' }}>
        <div className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-20" style={{ background: 'radial-gradient(ellipse, #8C46FF, transparent)', filter: 'blur(40px)' }} />
        <div className="flex flex-col sm:flex-row gap-5 relative">
          {/* Image */}
          <div className="w-full sm:w-44 shrink-0">
            <div className="aspect-square rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03] flex items-center justify-center">
              {item.imageUrl
                ? <img src={item.imageUrl} alt={idea.title} className="w-full h-full object-cover" />
                : <div className="flex flex-col items-center gap-2 text-slate-600 p-4 text-center">
                    <ImageIcon className="w-8 h-8" />
                    <span className="text-[11px]">Sem imagem</span>
                  </div>}
            </div>
            <button onClick={onGenImage} disabled={imageLoading} className="btn-secondary w-full justify-center py-2 rounded-lg text-xs mt-2 disabled:opacity-50">
              {imageLoading ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Gerando...</> : <><ImageIcon className="w-3.5 h-3.5" /> {item.imageUrl ? 'Regenerar' : 'Gerar imagem'}</>}
            </button>
          </div>
          {/* Title */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs text-slate-500 uppercase tracking-wide">{idea.genre}</span>
                  {idea.estimatedDifficulty && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border" style={{ background: c.bg, borderColor: c.border, color: c.text }}>{idea.estimatedDifficulty}</span>
                  )}
                  {item.refinedFrom && <span className="text-[10px] text-violet-300">✎ refinado</span>}
                </div>
                <h2 className="font-game text-2xl text-white mb-2">{idea.title}</h2>
                <p className="text-slate-300 text-sm leading-relaxed italic">"{idea.tagline}"</p>
              </div>
              <button onClick={onCopy} title="Copiar" className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border border-white/[0.08] hover:bg-white/[0.06] text-slate-400 hover:text-white">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            {item.appliedTo.length > 0 && (
              <div className="mt-3 text-[11px] text-emerald-300/80 flex items-center gap-1.5">
                <Check className="w-3 h-3" /> Aplicado em: {item.appliedTo.map((a) => a.projectName).join(', ')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <IdeaSection icon={<RefreshCw className="w-4 h-4" />} title="Core Loop" content={idea.coreLoop} accent="blue" />
        <IdeaSection icon={<Zap className="w-4 h-4" />} title="Mechanic Viral" content={idea.viralMechanic} accent="purple" />
        <IdeaSection icon={<DollarSign className="w-4 h-4" />} title="Monetização" content={idea.monetization} accent="green" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <IdeaSection icon={<Sparkles className="w-4 h-4" />} title="Diferencial único" content={idea.uniqueHook} accent="purple" />
        <IdeaSection icon={<Users className="w-4 h-4" />} title="Público-alvo" content={idea.targetAudience} accent="blue" />
      </div>

      {/* Refine + Apply */}
      <div className="card p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-slate-300">
          <Wand2 className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold">Pedir uma alteração</span>
        </div>
        <form onSubmit={onRefine} className="flex gap-2">
          <input
            value={instruction} onChange={(e) => setInstruction(e.target.value)}
            placeholder="Ex.: deixe mais focado em PvP, adicione sistema de clãs..."
            className="input flex-1 text-sm" maxLength={400} disabled={refining}
          />
          <button type="submit" disabled={refining || !instruction.trim()} className="btn-gradient py-2.5 px-4 rounded-xl text-sm disabled:opacity-50">
            {refining ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
        <button onClick={onApply} className="btn-primary w-full justify-center py-2.5 rounded-xl text-sm mt-1">
          <FolderPlus className="w-4 h-4" /> Aplicar a um projeto
        </button>
      </div>
    </div>
  );
}

// ─── Apply Modal ────────────────────────────────────────────────────────────────

function ApplyModal({ item, headers, onClose, onApplied }: {
  item: HistoryItem; headers: Record<string, string>; onClose: () => void; onApplied: () => void;
}) {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    api.get('/api/projects', { headers })
      .then((r) => setProjects(r.data ?? []))
      .catch(() => setErr('Falha ao carregar projetos.'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async (projectId: string, projectName: string) => {
    setApplyingId(projectId); setErr('');
    try {
      await api.post('/api/ideas/apply', { historyId: item.id, projectId }, { headers });
      setDone(`Ideia adicionada ao contexto de ${projectName}!`);
      setTimeout(onApplied, 1200);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'Falha ao aplicar.');
    } finally { setApplyingId(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="glass-strong w-full max-w-md rounded-2xl p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <div className="text-base font-semibold text-white">Aplicar ao projeto</div>
            <div className="text-xs text-slate-500 mt-0.5">"{item.idea.title}" entrará no contexto da IA do projeto.</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/[0.08] hover:bg-white/[0.06] text-slate-400 hover:text-white shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>

        {done ? (
          <div className="py-8 text-center text-emerald-300 text-sm flex flex-col items-center gap-2">
            <Check className="w-8 h-8" /> {done}
          </div>
        ) : (
          <>
            {err && <div className="text-xs text-red-400 my-3">{err}</div>}
            <div className="space-y-2 mt-4 max-h-[50vh] overflow-y-auto pr-1">
              {loading ? (
                <div className="py-8 text-center"><RefreshCw className="w-5 h-5 text-violet-400 animate-spin mx-auto" /></div>
              ) : projects.length === 0 ? (
                <div className="text-xs text-slate-600 text-center py-6">Você ainda não tem projetos.</div>
              ) : projects.map((p) => (
                <button
                  key={p._id} onClick={() => apply(p._id, p.name)} disabled={applyingId === p._id}
                  className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-xl border border-white/[0.07] hover:border-white/[0.14] hover:bg-white/[0.03] transition-colors disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{p.name}</div>
                    <div className="text-[11px] text-slate-500">Place ID: {p.placeId}</div>
                  </div>
                  {applyingId === p._id ? <RefreshCw className="w-4 h-4 animate-spin text-violet-400" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Idea Section ───────────────────────────────────────────────────────────────

const ACCENT = {
  blue:   { icon: '#7eb3ff', border: 'rgba(71,133,255,0.20)',  bg: 'rgba(71,133,255,0.06)'  },
  purple: { icon: '#c084fc', border: 'rgba(140,70,255,0.20)', bg: 'rgba(140,70,255,0.06)' },
  green:  { icon: '#34d399', border: 'rgba(16,185,129,0.20)', bg: 'rgba(16,185,129,0.06)' },
};

function IdeaSection({ icon, title, content, accent }: {
  icon: React.ReactNode; title: string; content: string | string[]; accent: 'blue' | 'purple' | 'green';
}) {
  const c = ACCENT[accent];
  return (
    <div className="card p-4 flex flex-col gap-3" style={{ borderColor: c.border, background: c.bg }}>
      <div className="flex items-center gap-2" style={{ color: c.icon }}>
        {icon}
        <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
      </div>
      {Array.isArray(content) ? (
        <ul className="space-y-1.5">
          {content.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300 leading-relaxed">
              <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: c.icon }} />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-300 leading-relaxed">{content}</p>
      )}
    </div>
  );
}
