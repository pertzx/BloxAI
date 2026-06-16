"use client";
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Zap, DollarSign, Users, Lock,
  RefreshCw, Copy, Check, ChevronRight,
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


const DIFFICULTY_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  'Fácil': { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', text: '#34d399' },
  'Médio': { bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.25)',  text: '#fbbf24' },
  'Difícil':{ bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', text: '#f87171' },
};

export default function IdeasPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem('blox_token') ?? '';

  // Acesso é decidido pela feature do plano (resolvida no servidor), não pelo JWT.
  // null = carregando, true/false = resultado.
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    api.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setHasAccess(Boolean(res.data?.features?.ideaGenerator)))
      .catch(() => setHasAccess(false));
  }, [token, navigate]);

  const [theme, setTheme]     = useState('');
  const [loading, setLoading] = useState(false);
  const [idea, setIdea]       = useState<GameIdea | null>(null);
  const [error, setError]     = useState('');
  const [copied, setCopied]   = useState(false);
  const [model, setModel]     = useState('');

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(''); setIdea(null);
    try {
      const res = await api.post(
        '/api/ideas/generate',
        { theme: theme.trim() || undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIdea(res.data.idea);
      setModel(res.data.model || '');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Falha ao gerar ideia. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const copyIdea = async () => {
    if (!idea) return;
    const text = [
      `🎮 ${idea.title}`,
      `"${idea.tagline}"`,
      ``,
      `Gênero: ${idea.genre}`,
      ``,
      `🔄 Core Loop:\n${idea.coreLoop}`,
      ``,
      `🚀 Mechanic Viral:\n${idea.viralMechanic}`,
      ``,
      `💰 Monetização:\n${idea.monetization.map((m) => `• ${m}`).join('\n')}`,
      ``,
      `✨ Diferencial:\n${idea.uniqueHook}`,
      ``,
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
          <button
            onClick={() => navigate('/dashboard')}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/[0.08] hover:bg-white/[0.06] transition-colors text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-game text-[17px] text-white tracking-wide">Gerador de Ideias Virais</span>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(140,70,255,0.20)', color: '#c084fc', border: '1px solid rgba(140,70,255,0.30)' }}>
                Recorrente
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Conceitos com alto potencial viral gerados por IA com chain-of-thought</p>
          </div>
        </div>
        {model && (
          <span className="hidden sm:block text-[11px] text-slate-600">via {model}</span>
        )}
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10 flex flex-col gap-8">

        {/* Access gate */}
        {hasAccess === null ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <RefreshCw className="w-6 h-6 text-violet-400 animate-spin" />
            <span className="text-slate-500 text-sm">Verificando acesso...</span>
          </div>
        ) : !hasAccess ? (
          <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(140,70,255,0.12)', border: '1px solid rgba(140,70,255,0.25)' }}
            >
              <Lock className="w-8 h-8 text-violet-400" />
            </div>
            <div>
              <h2 className="font-game text-2xl text-white mb-2">Recurso Exclusivo</h2>
              <p className="text-slate-400 max-w-sm mx-auto text-sm leading-relaxed">
                O Gerador de Ideias Virais não está disponível no seu plano atual.
                Faça upgrade para desbloquear ideias ilimitadas com análise de viralidade.
              </p>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn-gradient py-2.5 px-6 rounded-xl text-sm"
            >
              Ver planos <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            {/* Form */}
            <div className="card p-6">
              <h2 className="text-base font-semibold text-white mb-1">Tema ou gênero</h2>
              <p className="text-xs text-slate-500 mb-5">
                Opcional — deixe em branco para uma ideia completamente original. Exemplos: "torre de defesa", "roleplay escolar", "sobrevivência de zumbis".
              </p>
              <form onSubmit={generate} className="flex gap-3">
                <input
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="Ex.: guerra medieval com sistema de território..."
                  className="input flex-1 text-sm"
                  maxLength={200}
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gradient py-2.5 px-5 rounded-xl text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Gerando...</>
                    : <><Sparkles className="w-4 h-4" /> Gerar ideia</>
                  }
                </button>
              </form>
            </div>

            {/* Error */}
            {error && (
              <div className="p-4 rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 text-sm animate-fade-in">
                {error}
              </div>
            )}

            {/* Loading skeleton */}
            {loading && !idea && (
              <div className="card p-6 animate-pulse space-y-4">
                <div className="h-7 w-2/3 rounded-lg bg-white/[0.05]" />
                <div className="h-4 w-full rounded-lg bg-white/[0.04]" />
                <div className="h-4 w-4/5 rounded-lg bg-white/[0.04]" />
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-white/[0.04]" />)}
                </div>
              </div>
            )}

            {/* Result */}
            {idea && !loading && (
              <div className="animate-slide-up space-y-5">

                {/* Title card */}
                <div
                  className="card p-6 relative overflow-hidden"
                  style={{ borderColor: 'rgba(140,70,255,0.25)', boxShadow: '0 0 40px rgba(140,70,255,0.08)' }}
                >
                  {/* bg glow */}
                  <div className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-20" style={{ background: 'radial-gradient(ellipse, #8C46FF, transparent)', filter: 'blur(40px)' }} />

                  <div className="flex items-start justify-between gap-4 relative">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-slate-500 uppercase tracking-wide">{idea.genre}</span>
                        {idea.estimatedDifficulty && (() => {
                          const key = idea.estimatedDifficulty.split('|')[0].trim();
                          const c = DIFFICULTY_COLOR[key] || DIFFICULTY_COLOR['Médio'];
                          return (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border" style={{ background: c.bg, borderColor: c.border, color: c.text }}>
                              {idea.estimatedDifficulty}
                            </span>
                          );
                        })()}
                      </div>
                      <h2 className="font-game text-2xl text-white mb-2">{idea.title}</h2>
                      <p className="text-slate-300 text-sm leading-relaxed italic">"{idea.tagline}"</p>
                    </div>
                    <button
                      onClick={copyIdea}
                      title="Copiar ideia"
                      className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border border-white/[0.08] hover:bg-white/[0.06] transition-colors text-slate-400 hover:text-white"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* 3-col stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <IdeaSection
                    icon={<RefreshCw className="w-4 h-4" />}
                    title="Core Loop"
                    content={idea.coreLoop}
                    accent="blue"
                  />
                  <IdeaSection
                    icon={<Zap className="w-4 h-4" />}
                    title="Mechanic Viral"
                    content={idea.viralMechanic}
                    accent="purple"
                  />
                  <IdeaSection
                    icon={<DollarSign className="w-4 h-4" />}
                    title="Monetização"
                    content={idea.monetization}
                    accent="green"
                  />
                </div>

                {/* 2-col bottom */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <IdeaSection
                    icon={<Sparkles className="w-4 h-4" />}
                    title="Diferencial único"
                    content={idea.uniqueHook}
                    accent="purple"
                  />
                  <IdeaSection
                    icon={<Users className="w-4 h-4" />}
                    title="Público-alvo"
                    content={idea.targetAudience}
                    accent="blue"
                  />
                </div>

                {/* Regenerate */}
                <div className="flex justify-center pt-2">
                  <button
                    onClick={generate}
                    disabled={loading}
                    className="flex items-center gap-2 text-sm text-slate-500 hover:text-violet-300 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Gerar outra ideia com o mesmo tema
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ACCENT = {
  blue:   { icon: '#7eb3ff', border: 'rgba(71,133,255,0.20)',  bg: 'rgba(71,133,255,0.06)'  },
  purple: { icon: '#c084fc', border: 'rgba(140,70,255,0.20)', bg: 'rgba(140,70,255,0.06)' },
  green:  { icon: '#34d399', border: 'rgba(16,185,129,0.20)', bg: 'rgba(16,185,129,0.06)' },
};

function IdeaSection({
  icon, title, content, accent,
}: {
  icon: React.ReactNode;
  title: string;
  content: string | string[];
  accent: 'blue' | 'purple' | 'green';
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
