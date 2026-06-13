"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Folder, Plus, Search, User, Activity, Cpu, Radio, Clock3, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPlaceId, setNewProjectPlaceId] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const router = useRouter();

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
      if (!token) {
        router.push('/login');
        return;
      }
      try {
        const res = await fetch('/api/projects', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
        } else {
          router.push('/login');
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
    const interval = setInterval(fetchProjects, 5000);
    return () => clearInterval(interval);
  }, [router]);

  const handleCreateProject = async () => {
    const token = localStorage.getItem('blox_token');
    const name = newProjectName.trim();
    const placeId = newProjectPlaceId.trim();

    if (!name || !placeId) {
      setCreateError('Preencha nome e Place ID.');
      return;
    }

    setCreating(true);
    setCreateError('');

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name, placeId })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setCreateError(data?.error || 'Nao foi possivel criar o projeto.');
        return;
      }

      const createdProject = await response.json();
      setProjects((current) => [createdProject, ...current]);
      setIsCreateOpen(false);
      setNewProjectName('');
      setNewProjectPlaceId('');
    } catch (error) {
      setCreateError('Erro ao criar projeto.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="flex items-center space-x-2">
          <Bot className="w-8 h-8 text-blue-500" />
          <h1 className="text-xl font-bold">Blox AI Dashboard</h1>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center space-x-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Projeto</span>
          </button>
          <button className="p-2 hover:bg-slate-800 rounded-full transition-colors" onClick={() => { localStorage.removeItem('blox_token'); router.push('/'); }}>
            <User className="w-5 h-5 text-slate-300" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-2xl font-semibold flex items-center">
            <Folder className="w-6 h-6 mr-2 text-slate-400" />
            Meus Projetos
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <OverviewCard icon={<Folder className="h-4 w-4" />} label="Projetos" value={String(projects.length)} />
            <OverviewCard icon={<Radio className="h-4 w-4" />} label="Online Agora" value={String(onlineCount)} />
            <OverviewCard icon={<Cpu className="h-4 w-4" />} label="Nodes Totais" value={String(totalNodes)} />
            <OverviewCard icon={<Bot className="h-4 w-4" />} label="Mensagens" value={String(totalMessages)} />
            <OverviewCard icon={<Activity className="h-4 w-4" />} label="Tokens" value={formatCompactNumber(totalTokens)} />
            <OverviewCard icon={<Activity className="h-4 w-4" />} label="Custo" value={`US$ ${totalCost.toFixed(2)}`} />
            <OverviewCard
              icon={<Activity className="h-4 w-4" />}
              label="Atividade"
              value={recentlySynced[0]?.lastSync ? formatRelativeTime(recentlySynced[0].lastSync) : 'Sem sync'}
            />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium text-white">Explorer dos projetos</div>
              <div className="text-xs text-slate-400">Filtre por nome ou `Place ID` para abrir mais rapido.</div>
            </div>
            <div className="relative w-full md:max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou Place ID"
                className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="text-sm font-medium text-white">Recentes</div>
            <div className="mt-1 text-xs text-slate-400">Últimos projetos com atividade de sync.</div>
            <div className="mt-3 space-y-3">
              {recentlySynced.map((proj: any) => (
                <Link key={proj._id} href={`/project/${proj._id}`} className="block rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 transition hover:border-slate-700 hover:bg-slate-900">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-white">{proj.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${proj.status === 'Online' ? 'bg-green-500/10 text-green-300' : 'bg-slate-800 text-slate-400'}`}>
                      {proj.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                    <Clock3 className="h-3.5 w-3.5" />
                    {proj.lastSync ? formatRelativeTime(proj.lastSync) : 'Sem sync'}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.length === 0 ? (
            <div className="col-span-3 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 py-16 text-center text-slate-500">
              Nenhum projeto encontrado. Crie um novo para comecar.
            </div>
          ) : (
            filteredProjects.map((proj: any) => (
              <Link href={`/project/${proj._id}`} key={proj._id} className="block rounded-2xl border border-slate-700 bg-slate-800 p-5 transition-colors group hover:border-slate-600">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-medium transition-colors group-hover:text-blue-400">{proj.name}</h3>
                    <p className="mt-1 text-xs text-slate-400">Place ID: {proj.placeId}</p>
                  </div>
                  <div className="flex items-center space-x-1 rounded-full bg-slate-900/70 px-2 py-1 text-xs text-slate-300">
                    <span className={`w-2 h-2 rounded-full ${proj.status === 'Online' ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`}></span>
                    <span>{proj.status}</span>
                  </div>
                </div>
                <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Nodes</div>
                    <div className="mt-1 font-medium text-slate-100">{countNodes(proj.workspaceNodes || [])}</div>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Última atividade</div>
                    <div className="mt-1 font-medium text-slate-100">{proj.lastSync ? formatRelativeTime(proj.lastSync) : 'Nunca'}</div>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Mensagens</div>
                    <div className="mt-1 font-medium text-slate-100">{proj.metrics?.messages || 0}</div>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Custo</div>
                    <div className="mt-1 font-medium text-slate-100">US$ {Number(proj.metrics?.estimatedCostUsd || 0).toFixed(2)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-slate-500">
                    Tokens: {formatCompactNumber(Number(proj.metrics?.totalTokens || 0))} • Sync: {proj.lastSync ? new Date(proj.lastSync).toLocaleString() : 'Nunca'}
                  </span>
                  <span className="font-medium text-blue-400 group-hover:text-blue-300">Abrir Projeto &rarr;</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </main>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">Novo Projeto</div>
                <div className="mt-1 text-sm text-slate-400">Crie um projeto para conectar com o plugin do Studio.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  setCreateError('');
                }}
                className="rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-400 transition hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Nome do projeto</div>
                <input
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="Ex.: OakForest"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="block">
                <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Place ID</div>
                <input
                  value={newProjectPlaceId}
                  onChange={(event) => setNewProjectPlaceId(event.target.value)}
                  placeholder="Ex.: 123456789"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              {createError && <div className="text-sm text-rose-300">{createError}</div>}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300 transition hover:border-slate-600 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={creating}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
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

function OverviewCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function countNodes(nodes: any[]): number {
  return nodes.reduce((acc, node) => acc + 1 + countNodes(Array.isArray(node?.filhos) ? node.filhos : []), 0);
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

function formatCompactNumber(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
