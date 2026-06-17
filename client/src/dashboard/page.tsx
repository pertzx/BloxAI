"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Folder, Plus, Search, User, Activity, Cpu, Radio, Clock3, X, ArrowRight, ShieldCheck, Sparkles, Lock, Settings, Trophy, Crown, Zap, Wallet, Puzzle, Copy, Check, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/api.js';

function decodeJwtRole(token: string): string | null {
  try { return JSON.parse(atob(token.split('.')[1]))?.role ?? null; }
  catch { return null; }
}

type Me = {
  robloxUsername: string;
  robloxDisplayName: string;
  robloxAvatarUrl: string;
  role: string;
  planKey: string | null;
  planType: string;
  plan: string;
  balanceUsd: number;
  features?: { ideaGenerator?: boolean };
};

type RankRow = {
  rank: number;
  robloxUsername: string;
  robloxDisplayName: string;
  robloxAvatarUrl: string;
  totalTokens: number;
  commands: number;
  isMe: boolean;
};

type Billing = {
  balanceUsd: number;
  walletStartUsd: number;
  consumptionPercent: number;
  planType?: string;
  plan?: string;
  lifetime?: { totalChargedUsd: number; totalRealCostUsd: number };
};

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPlaceId, setNewProjectPlaceId] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [pluginModalOpen, setPluginModalOpen] = useState(false);
  const router = useNavigate();
  const _token = localStorage.getItem('blox_token') ?? '';
  const isAdmin = decodeJwtRole(_token) === 'admin';
  const hasIdeasAccess = Boolean(me?.features?.ideaGenerator) || isAdmin;
  // Plano grátis com saldo esgotado → toast de upgrade
  const freeExhausted = !!me && me.planType !== 'recurring' && (me.balanceUsd ?? 0) <= 0 && me.role !== 'admin';

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter((proj: any) =>
      String(proj?.name || '').toLowerCase().includes(term) ||
      String(proj?.placeId || '').toLowerCase().includes(term)
    );
  }, [projects, search]);

  const onlineCount = useMemo(() => projects.filter((proj: any) => proj.status === 'Online').length, [projects]);
  const totalNodes = useMemo(() => projects.reduce((acc: number, proj: any) => acc + countNodes(proj.workspaceNodes || []), 0), [projects]);
  const totalMessages = useMemo(() => projects.reduce((acc: number, proj: any) => acc + Number(proj.metrics?.messages || 0), 0), [projects]);
  const totalTokens = useMemo(() => projects.reduce((acc: number, proj: any) => acc + Number(proj.metrics?.totalTokens || 0), 0), [projects]);
  const totalCost = useMemo(() => projects.reduce((acc: number, proj: any) => acc + Number(proj.metrics?.estimatedCostUsd || 0), 0), [projects]);
  const recentlySynced = useMemo(
    () => [...projects].sort((a, b) => new Date(b.lastSync || 0).getTime() - new Date(a.lastSync || 0).getTime()).slice(0, 3),
    [projects]
  );

  useEffect(() => {
    const fetchProjects = async () => {
      const token = localStorage.getItem('blox_token');
      if (!token) { setTimeout(() => router('/login'), 2000); return; }
      try {
        const res = await api.get('/api/projects', { headers: { Authorization: `Bearer ${token}` } });
        if (res.data) setProjects(res.data);
        else router('/login');
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchProjects();
    const interval = setInterval(fetchProjects, 5000);
    return () => clearInterval(interval);
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem('blox_token');
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    api.get('/api/auth/me', { headers }).then((r) => setMe(r.data)).catch(() => {});
    api.get('/api/billing/ranking', { headers }).then((r) => setRanking(r.data?.ranking ?? [])).catch(() => {});
    const loadBilling = () => api.get('/api/billing/me', { headers }).then((r) => setBilling(r.data)).catch(() => {});
    loadBilling();
    const t = setInterval(loadBilling, 15000);
    return () => clearInterval(t);
  }, []);

  // Mostra o toast de upgrade uma vez por sessão de dashboard quando o plano grátis esgota.
  useEffect(() => {
    if (freeExhausted) setShowUpgrade(true);
  }, [freeExhausted]);

  const handleCreateProject = async () => {
    const token = localStorage.getItem('blox_token');
    const name = newProjectName.trim();
    const placeId = newProjectPlaceId.trim();
    if (!name || !placeId) { setCreateError('Preencha nome e Place ID.'); return; }
    setCreating(true); setCreateError('');
    try {
      const response = await api.post(
        '/api/projects',
        { name, placeId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProjects((current) => [response.data, ...current]);
      setIsCreateOpen(false); setNewProjectName(''); setNewProjectPlaceId('');
    } catch (err: any) {
      setCreateError(err?.response?.data?.error || 'Erro ao criar projeto.');
    }
    finally { setCreating(false); }
  };

  if (loading) {
    return (
      <div className="aurora-bg min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
            <Bot className="w-4 h-4 text-blue-400 animate-pulse" />
          </div>
          <span className="text-slate-400 text-sm">Carregando projetos...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="aurora-bg min-h-screen flex flex-col text-slate-100">
      {/* Upgrade toast — plano grátis esgotado */}
      {showUpgrade && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm animate-slide-up">
          <div className="glass-strong rounded-2xl p-5 border" style={{ borderColor: 'rgba(140,70,255,0.30)', boxShadow: '0 12px 40px rgba(140,70,255,0.20)' }}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(140,70,255,0.15)', border: '1px solid rgba(140,70,255,0.30)' }}>
                <Crown className="w-4 h-4 text-violet-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">Seus créditos acabaram</div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Faça upgrade para um plano recorrente e continue gerando com cota mensal garantida.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Link to="/upgrade" className="btn-gradient py-1.5 px-4 rounded-lg text-xs">
                    Ver planos <ArrowRight className="w-3 h-3" />
                  </Link>
                  <button onClick={() => setShowUpgrade(false)} className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1.5">
                    Agora não
                  </button>
                </div>
              </div>
              <button onClick={() => setShowUpgrade(false)} className="text-slate-500 hover:text-white shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-4 glass border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
            <Bot className="text-blue-400" style={{ width: 16, height: 16 }} />
          </div>
          <span className="text-[17px] font-bold tracking-tight text-white">Blox AI</span>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              to="/admin"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:brightness-110"
              style={{ background: 'rgba(140,70,255,0.15)', borderColor: 'rgba(140,70,255,0.30)', color: '#c084fc' }}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin
            </Link>
          )}
          {hasIdeasAccess ? (
            <Link
              to="/ideas"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:brightness-110"
              style={{ background: 'rgba(71,133,255,0.12)', borderColor: 'rgba(71,133,255,0.25)', color: '#7eb3ff' }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ideias Virais
            </Link>
          ) : (
            <Link
              to="/ideas"
              title="Exclusivo para plano Recorrente"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all opacity-50 cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: '#64748b' }}
            >
              <Lock className="w-3 h-3" />
              Ideias Virais
            </Link>
          )}
          {me && me.planType !== 'recurring' && me.role !== 'admin' && (
            <Link
              to="/upgrade"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(135deg,rgba(71,133,255,0.18),rgba(140,70,255,0.18))', borderColor: 'rgba(140,70,255,0.30)', color: '#c4b5fd' }}
            >
              <Crown className="w-3.5 h-3.5" />
              Fazer upgrade
            </Link>
          )}
          <button
            onClick={() => setPluginModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:brightness-110"
            style={{ background: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.25)', color: '#34d399' }}
          >
            <Puzzle className="w-3.5 h-3.5" />
            Conectar plugin
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="btn-primary text-sm py-2 px-4 rounded-xl"
          >
            <Plus className="w-4 h-4" />
            Novo Projeto
          </button>
          <Link
            to="/settings"
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] transition-colors overflow-hidden"
            title={me?.robloxDisplayName ? `${me.robloxDisplayName} · Configurações` : 'Configurações'}
          >
            {me?.robloxAvatarUrl
              ? <img src={me.robloxAvatarUrl} alt="" className="w-full h-full object-cover" />
              : <User className="w-4 h-4 text-slate-400" />
            }
          </Link>
          <button
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
            onClick={() => { localStorage.removeItem('blox_token'); router('/'); }}
            title="Sair"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-10">
        {/* Page Title */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white tracking-tight">Dashboard</h2>
          <p className="text-slate-400 mt-1 text-sm">Gerencie e monitore seus projetos Roblox.</p>
        </div>

        {/* Usage bar */}
        {billing && <UsageBar billing={billing} onUpgrade={() => router('/upgrade')} />}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
          <StatCard icon={<Folder className="h-4 w-4" />} label="Projetos" value={String(projects.length)} />
          <StatCard icon={<Radio className="h-4 w-4" />} label="Online" value={String(onlineCount)} accent />
          <StatCard icon={<Cpu className="h-4 w-4" />} label="Nodes" value={String(totalNodes)} />
          <StatCard icon={<Bot className="h-4 w-4" />} label="Mensagens" value={String(totalMessages)} />
          <StatCard icon={<Activity className="h-4 w-4" />} label="Tokens" value={formatCompactNumber(totalTokens)} />
          <StatCard icon={<Activity className="h-4 w-4" />} label="Gasto total" value={`$${(billing?.lifetime?.totalChargedUsd ?? totalCost).toFixed(2)}`} />
        </div>

        {/* Search + Recents */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 mb-10">
          <div className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="text-sm font-semibold text-white mb-0.5">Buscar projetos</div>
              <div className="text-xs text-slate-500">Filtre por nome ou Place ID.</div>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou Place ID..."
                className="input pl-9"
              />
            </div>
          </div>

          <div className="card p-5">
            <div className="text-sm font-semibold text-white mb-0.5">Recentes</div>
            <div className="text-xs text-slate-500 mb-4">Últimos projetos sincronizados.</div>
            <div className="space-y-2">
              {recentlySynced.map((proj: any) => (
                <Link
                  key={proj._id}
                  to={`/project/${proj._id}`}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-white/[0.06] hover:border-white/[0.10] hover:bg-white/[0.03] transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate group-hover:text-blue-300 transition-colors">{proj.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500">
                      <Clock3 className="h-3 w-3" />
                      {proj.lastSync ? formatRelativeTime(proj.lastSync) : 'Sem sync'}
                    </div>
                  </div>
                  <span className={`badge shrink-0 ${proj.status === 'Online' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-white/[0.04] border-white/[0.06] text-slate-500'}`}>
                    {proj.status === 'Online' && <span className="status-dot online" />}
                    {proj.status}
                  </span>
                </Link>
              ))}
              {recentlySynced.length === 0 && (
                <div className="text-xs text-slate-600 text-center py-3">Nenhum projeto ainda.</div>
              )}
            </div>
          </div>
        </div>

        {/* Ranking */}
        {ranking.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-5">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-semibold text-white">Ranking de atividade</h3>
              <span className="text-xs text-slate-500">— quem mais constrói com a IA</span>
            </div>
            <div className="card divide-y divide-white/[0.05]">
              {ranking.map((r) => (
                <div
                  key={r.rank}
                  className="flex items-center gap-3 px-4 py-3"
                  style={r.isMe ? { background: 'rgba(71,133,255,0.06)' } : undefined}
                >
                  <div className="w-7 text-center shrink-0">
                    {r.rank <= 3
                      ? <Crown className="w-4 h-4 mx-auto" style={{ color: r.rank === 1 ? '#fbbf24' : r.rank === 2 ? '#cbd5e1' : '#d97706' }} />
                      : <span className="text-sm font-bold text-slate-500">{r.rank}</span>
                    }
                  </div>
                  <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/[0.08] bg-white/[0.04] flex items-center justify-center">
                    {r.robloxAvatarUrl
                      ? <img src={r.robloxAvatarUrl} alt="" className="w-full h-full object-cover" />
                      : <User className="w-4 h-4 text-slate-500" />
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">
                      @{r.robloxUsername || '—'} {r.isMe && <span className="text-[10px] text-blue-400">(você)</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{r.robloxDisplayName}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono text-slate-200">{formatCompactNumber(r.totalTokens)}</div>
                    <div className="text-[10px] text-slate-600 uppercase tracking-wide">tokens · {r.commands} cmds</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects Grid */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-white">
              {filteredProjects.length > 0 ? `${filteredProjects.length} projeto${filteredProjects.length !== 1 ? 's' : ''}` : 'Projetos'}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.length === 0 ? (
              <div className="col-span-3 rounded-2xl border border-dashed border-white/[0.08] py-20 text-center">
                <div className="text-slate-600 text-sm">Nenhum projeto encontrado. Crie um novo para começar.</div>
              </div>
            ) : (
              filteredProjects.map((proj: any) => (
                <Link
                  to={`/project/${proj._id}`}
                  key={proj._id}
                  className="card card-interactive p-5 block group"
                >
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-white truncate group-hover:text-blue-300 transition-colors">{proj.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Place ID: {proj.placeId}</p>
                    </div>
                    <span className={`badge shrink-0 ${proj.status === 'Online' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-white/[0.04] border-white/[0.06] text-slate-500'}`}>
                      {proj.status === 'Online' && <span className="status-dot online" />}
                      {proj.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 mb-5">
                    {[
                      { label: 'Nodes', value: countNodes(proj.workspaceNodes || []) },
                      { label: 'Última ativ.', value: proj.lastSync ? formatRelativeTime(proj.lastSync) : 'Nunca' },
                      { label: 'Mensagens', value: proj.metrics?.messages || 0 },
                      { label: 'Custo', value: `$${Number(proj.metrics?.estimatedCostUsd || 0).toFixed(2)}` },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                        <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">{item.label}</div>
                        <div className="text-sm font-semibold text-slate-200">{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Tokens: {formatCompactNumber(Number(proj.metrics?.totalTokens || 0))}</span>
                    <span className="flex items-center gap-1 text-blue-400 group-hover:text-blue-300 font-medium transition-colors">
                      Abrir <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-strong w-full max-w-md rounded-2xl p-6 animate-slide-up" style={{ borderRadius: 20 }}>
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <div className="text-lg font-semibold text-white">Novo Projeto</div>
                <div className="mt-1 text-sm text-slate-500">Conecte com o plugin do Studio.</div>
              </div>
              <button
                type="button"
                onClick={() => { setIsCreateOpen(false); setCreateError(''); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/[0.08] hover:bg-white/[0.06] transition-colors text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Nome do projeto</label>
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Ex.: OakForest"
                  className="input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Place ID</label>
                <input
                  value={newProjectPlaceId}
                  onChange={(e) => setNewProjectPlaceId(e.target.value)}
                  placeholder="Ex.: 123456789"
                  className="input"
                />
              </div>
              {createError && <div className="text-sm text-rose-300">{createError}</div>}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="btn-secondary py-2.5 px-4 text-sm rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={creating}
                className="btn-primary py-2.5 px-4 text-sm rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Criando...' : 'Criar projeto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pluginModalOpen && <PluginConnectModal onClose={() => setPluginModalOpen(false)} />}
    </div>
  );
}

function PluginConnectModal({ onClose }: { onClose: () => void }) {
  const [pluginKey, setPluginKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const headers = { Authorization: `Bearer ${localStorage.getItem('blox_token') ?? ''}` };

  useEffect(() => {
    api.get('/api/plugin/key', { headers })
      .then((r) => setPluginKey(r.data?.pluginKey ?? ''))
      .catch(() => setErr('Falha ao carregar a chave.'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const regenerate = async () => {
    if (!confirm('Regenerar a chave? O plugin precisará ser reconectado com a nova chave.')) return;
    setRegenerating(true); setErr('');
    try {
      const r = await api.post('/api/plugin/key/regenerate', {}, { headers });
      setPluginKey(r.data?.pluginKey ?? '');
    } catch { setErr('Falha ao regenerar.'); }
    finally { setRegenerating(false); }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(pluginKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="glass-strong w-full max-w-md rounded-2xl p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <Puzzle className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-base font-semibold text-white">Conectar plugin</div>
              <div className="text-xs text-slate-500">Cole esta chave no plugin do Studio</div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/[0.08] hover:bg-white/[0.06] text-slate-400 hover:text-white shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>

        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Sua chave de conta</label>
        <div className="flex gap-2">
          <div className="flex-1 input font-mono text-xs flex items-center overflow-hidden">
            {loading ? <span className="text-slate-600">carregando...</span> : <span className="truncate text-slate-200">{pluginKey}</span>}
          </div>
          <button onClick={copy} disabled={loading || !pluginKey} className="btn-secondary px-3 rounded-xl disabled:opacity-50" title="Copiar">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        {err && <div className="text-xs text-red-400 mt-2">{err}</div>}

        <div className="mt-5 rounded-xl border border-white/[0.07] p-4 bg-white/[0.02]">
          <div className="text-xs font-semibold text-slate-300 mb-2">Como conectar</div>
          <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
            <li>Abra seu jogo no Roblox Studio (precisa estar publicado).</li>
            <li>Abra o plugin Blox AI.</li>
            <li>Cole esta chave e clique em <span className="text-emerald-300">Conectar</span>.</li>
            <li>O projeto é criado automaticamente para este jogo.</li>
          </ol>
        </div>

        <div className="flex items-center justify-between mt-5">
          <button onClick={regenerate} disabled={regenerating} className="text-xs text-slate-500 hover:text-red-300 flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} /> Regenerar chave
          </button>
          <button onClick={onClose} className="btn-primary py-2 px-4 text-sm rounded-xl">Pronto</button>
        </div>
      </div>
    </div>
  );
}

function UsageBar({ billing, onUpgrade }: { billing: Billing; onUpgrade: () => void }) {
  const start = Number(billing.walletStartUsd || 0);
  const balance = Math.max(0, Number(billing.balanceUsd || 0));
  const used = Math.max(0, start - balance);
  const pct = start > 0 ? Math.min(100, Math.max(0, (used / start) * 100)) : (balance > 0 ? 0 : 100);
  const lifetime = Number(billing.lifetime?.totalChargedUsd || 0);
  const isRecurring = billing.planType === 'recurring';

  // Cor da barra conforme o consumo (verde→âmbar→vermelho)
  const fill = pct >= 90
    ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
    : pct >= 70
      ? 'linear-gradient(90deg, #4785FF, #f59e0b)'
      : 'linear-gradient(90deg, #4785FF, #8C46FF)';
  const glow = pct >= 90 ? 'rgba(239,68,68,0.5)' : pct >= 70 ? 'rgba(245,158,11,0.45)' : 'rgba(140,70,255,0.45)';
  const low = start > 0 && balance <= start * 0.1; // ≤10% restante

  return (
    <div
      className="mb-10 relative overflow-hidden rounded-2xl p-5 sm:p-6"
      style={{
        background: 'linear-gradient(135deg, rgba(30,41,59,0.55), rgba(15,23,42,0.35))',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      <div className="pointer-events-none absolute -top-16 -right-10 w-64 h-40 rounded-full opacity-25" style={{ background: `radial-gradient(ellipse, ${glow}, transparent 70%)`, filter: 'blur(40px)' }} />

      <div className="flex items-center justify-between gap-4 mb-4 relative">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(140,70,255,0.15)', border: '1px solid rgba(140,70,255,0.28)' }}>
            <Wallet className="w-4 h-4 text-violet-300" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Uso da carteira</div>
            <div className="text-[11px] text-slate-400">{isRecurring ? 'Cota do ciclo atual' : 'Créditos pré-pagos'}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white leading-none">{pct.toFixed(0)}<span className="text-base text-slate-400">%</span></div>
          <div className="text-[11px] text-slate-500 mt-0.5">usado</div>
        </div>
      </div>

      <div className="relative h-3.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out relative"
          style={{ width: `${pct}%`, background: fill, boxShadow: `0 0 16px ${glow}` }}
        >
          <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.35), transparent 60%)' }} />
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs relative">
        <span className="text-slate-300">
          <span className="font-mono text-white">${used.toFixed(2)}</span>
          <span className="text-slate-500"> de ${start.toFixed(2)}</span>
        </span>
        <span className="text-slate-300">
          Restante <span className="font-mono text-emerald-300">${balance.toFixed(2)}</span>
        </span>
      </div>

      <div className="flex items-center justify-between mt-2 relative">
        <span className="text-[11px] text-slate-500">Total gasto: <span className="font-mono text-slate-400">${lifetime.toFixed(2)}</span></span>
        {low && (
          <button onClick={onUpgrade} className="text-[11px] font-semibold text-violet-300 hover:text-violet-200 flex items-center gap-1">
            <Crown className="w-3 h-3" /> Recarregar / upgrade
          </button>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card px-4 py-3.5 ${accent ? 'border-emerald-500/15' : ''}`}>
      <div className={`flex items-center gap-1.5 text-xs mb-2 ${accent ? 'text-emerald-400' : 'text-slate-500'}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function countNodes(nodes: any[]): number {
  return nodes.reduce((acc, node) => acc + 1 + countNodes(Array.isArray(node?.filhos) ? node.filhos : []), 0);
}

function formatRelativeTime(value?: string) {
  if (!value) return 'agora';
  const diff = Date.now() - new Date(value).getTime();
  const minute = 60 * 1000, hour = 60 * minute;
  if (diff < minute) return 'agora';
  if (diff < hour) return `${Math.floor(diff / minute)} min atrás`;
  if (diff < 24 * hour) return `${Math.floor(diff / hour)} h atrás`;
  return `${Math.floor(diff / (24 * hour))} d atrás`;
}

function formatCompactNumber(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
