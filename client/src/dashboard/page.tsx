"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Folder, Plus, Search, User, Activity, Cpu, Radio, Clock3, X, ArrowRight, ShieldCheck, Sparkles, Lock, Settings } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/api.js';

function decodeJwtRole(token: string): string | null {
  try { return JSON.parse(atob(token.split('.')[1]))?.role ?? null; }
  catch { return null; }
}
function decodeJwtPlanType(token: string): string | null {
  try { return JSON.parse(atob(token.split('.')[1]))?.planType ?? null; }
  catch { return null; }
}

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPlaceId, setNewProjectPlaceId] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const router = useNavigate();
  const _token = localStorage.getItem('blox_token') ?? '';
  const isAdmin = decodeJwtRole(_token) === 'admin';
  const hasIdeasAccess = decodeJwtPlanType(_token) === 'recurring' || isAdmin;

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
          <button
            onClick={() => setIsCreateOpen(true)}
            className="btn-primary text-sm py-2 px-4 rounded-xl"
          >
            <Plus className="w-4 h-4" />
            Novo Projeto
          </button>
          <Link
            to="/settings"
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
            title="Configurações"
          >
            <Settings className="w-4 h-4 text-slate-400" />
          </Link>
          <button
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
            onClick={() => { localStorage.removeItem('blox_token'); router('/'); }}
            title="Sair"
          >
            <User className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-10">
        {/* Page Title */}
        <div className="mb-10">
          <h2 className="text-3xl font-bold text-white tracking-tight">Dashboard</h2>
          <p className="text-slate-400 mt-1 text-sm">Gerencie e monitore seus projetos Roblox.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
          <StatCard icon={<Folder className="h-4 w-4" />} label="Projetos" value={String(projects.length)} />
          <StatCard icon={<Radio className="h-4 w-4" />} label="Online" value={String(onlineCount)} accent />
          <StatCard icon={<Cpu className="h-4 w-4" />} label="Nodes" value={String(totalNodes)} />
          <StatCard icon={<Bot className="h-4 w-4" />} label="Mensagens" value={String(totalMessages)} />
          <StatCard icon={<Activity className="h-4 w-4" />} label="Tokens" value={formatCompactNumber(totalTokens)} />
          <StatCard icon={<Activity className="h-4 w-4" />} label="Custo" value={`$${totalCost.toFixed(2)}`} />
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
