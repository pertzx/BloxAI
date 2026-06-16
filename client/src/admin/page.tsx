"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Search, Users, ShieldCheck, AlertTriangle, Ban,
  DollarSign, TrendingUp, ArrowLeft, RefreshCw, X, ChevronDown,
  Layers, Plus, Pencil, Trash2, Star, Sparkles, Check,
} from 'lucide-react';
import api from '../api/api.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminUser = {
  id: string;
  robloxUsername: string;
  robloxDisplayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended' | 'banned';
  suspendedUntil: string | null;
  balanceUsd: number;
  marginPercent: number | null;
  effectiveMarginPercent: number;
  totalRealCostUsd: number;
  totalChargedUsd: number;
  plan: string;
  planKey: string | null;
  planType: string;
  createdAt: string;
};

type PlanFeatures = {
  ideaGenerator: boolean;
  thinkMode: boolean;
  prioritySupport: boolean;
};

type AdminPlan = {
  _id: string;
  key: string;
  name: string;
  description: string;
  planType: 'recurring' | 'prepaid';
  priceUsd: number;
  marginPercent: number | null;
  monthlyCreditUsd: number;
  signupBonusUsd: number;
  features: PlanFeatures;
  highlight: boolean;
  order: number;
  active: boolean;
  isDefault: boolean;
};

type Modal =
  | { type: 'topup';  user: AdminUser }
  | { type: 'margin'; user: AdminUser }
  | { type: 'status'; user: AdminUser }
  | { type: 'assign'; user: AdminUser }
  | { type: 'planEditor'; plan: AdminPlan | null }
  | { type: 'planDelete'; plan: AdminPlan }
  | null;

type Tab = 'users' | 'plans';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decodeJwtRole(token: string): string | null {
  try { return JSON.parse(atob(token.split('.')[1]))?.role ?? null; }
  catch { return null; }
}

function fmt(n: number, decimals = 4) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function statusColor(s: string) {
  if (s === 'active')    return { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', text: '#34d399' };
  if (s === 'suspended') return { bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.25)',  text: '#fbbf24' };
  return                        { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.25)',  text: '#f87171' };
}

function statusLabel(s: string) {
  return s === 'active' ? 'Ativo' : s === 'suspended' ? 'Suspenso' : 'Banido';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab]           = useState<Tab>('users');
  const [users, setUsers]       = useState<AdminUser[]>([]);
  const [plans, setPlans]       = useState<AdminPlan[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modal, setModal]       = useState<Modal>(null);
  const [notice, setNotice]     = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const token = () => localStorage.getItem('blox_token') ?? '';

  const fetchUsers = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get('/api/billing/admin/users', {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setUsers(res.data.users ?? []);
      setError('');
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401 || status === 403) {
        navigate('/dashboard');
        return;
      }
      setError(e?.response?.data?.error ?? 'Falha ao carregar usuários.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate]);

  const fetchPlans = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    try {
      const res = await api.get('/api/billing/admin/plans', {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setPlans(res.data.plans ?? []);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Falha ao carregar planos.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const t = token();
    if (!t || decodeJwtRole(t) !== 'admin') { navigate('/dashboard'); return; }
    fetchUsers();
    fetchPlans();
  }, [fetchUsers, fetchPlans, navigate]);

  const refreshAll = useCallback(() => { fetchUsers(true); fetchPlans(true); }, [fetchUsers, fetchPlans]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (!term) return true;
      return (u.robloxUsername || '').toLowerCase().includes(term) || (u.robloxDisplayName || '').toLowerCase().includes(term);
    });
  }, [users, search, statusFilter]);

  const stats = useMemo(() => ({
    total:     users.length,
    active:    users.filter((u) => u.status === 'active').length,
    issues:    users.filter((u) => u.status !== 'active').length,
    charged:   users.reduce((s, u) => s + u.totalChargedUsd, 0),
    realCost:  users.reduce((s, u) => s + u.totalRealCostUsd, 0),
    profit:    users.reduce((s, u) => s + (u.totalChargedUsd - u.totalRealCostUsd), 0),
  }), [users]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  if (loading) {
    return (
      <div className="aurora-bg min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-xl animate-glow-pulse" style={{ background: 'rgba(140,70,255,0.2)', border: '1px solid rgba(140,70,255,0.3)' }}>
            <ShieldCheck className="w-4 h-4 m-2 text-violet-400" />
          </div>
          <span className="text-slate-400 text-sm">Carregando painel admin...</span>
        </div>
      </div>
    );
  }

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
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,rgba(71,133,255,0.25),rgba(140,70,255,0.25))', border: '1px solid rgba(140,70,255,0.30)' }}>
              <Bot style={{ width: 16, height: 16, color: '#a78bfa' }} />
            </div>
            <span className="font-game text-[17px] text-white tracking-wide">Blox AI</span>
          </div>
          <div className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest" style={{ background: 'rgba(140,70,255,0.18)', color: '#c084fc', border: '1px solid rgba(140,70,255,0.28)' }}>
            Admin
          </div>
        </div>
        <button
          onClick={refreshAll}
          disabled={refreshing}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 flex flex-col gap-7">

        {/* Toast */}
        {notice && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slide-up px-5 py-3 rounded-xl text-sm font-medium text-white shadow-lg" style={{ background: 'rgba(140,70,255,0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(140,70,255,0.4)' }}>
            {notice}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 text-sm">{error}</div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] -mb-2">
          {([['users', 'Usuários', <Users className="w-4 h-4" />], ['plans', 'Planos', <Layers className="w-4 h-4" />]] as const).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all duration-150"
              style={tab === key
                ? { borderColor: '#8C46FF', color: '#fff' }
                : { borderColor: 'transparent', color: '#64748b' }
              }
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {tab === 'users' && (<>
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <AdminStat icon={<Users className="h-4 w-4" />}       label="Total"        value={String(stats.total)}               />
          <AdminStat icon={<ShieldCheck className="h-4 w-4" />} label="Ativos"       value={String(stats.active)}    accent="green" />
          <AdminStat icon={<AlertTriangle className="h-4 w-4"/>} label="Ocorrências" value={String(stats.issues)}    accent="yellow"/>
          <AdminStat icon={<DollarSign className="h-4 w-4" />}  label="Cobrado"      value={`$${fmt(stats.charged, 2)}`} accent="blue" />
          <AdminStat icon={<TrendingUp className="h-4 w-4" />}  label="Custo real"   value={`$${fmt(stats.realCost, 2)}`}  />
          <AdminStat icon={<TrendingUp className="h-4 w-4" />}  label="Lucro"        value={`$${fmt(stats.profit, 2)}`}    accent="purple"/>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por email ou username..."
              className="input pl-9 text-sm"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'active', 'suspended', 'banned'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-150"
                style={statusFilter === s
                  ? { background: 'rgba(71,133,255,0.18)', borderColor: 'rgba(71,133,255,0.35)', color: '#93c5fd' }
                  : { background: 'transparent', borderColor: 'rgba(255,255,255,0.08)', color: '#64748b' }
                }
              >
                {s === 'all' ? 'Todos' : statusLabel(s)}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Usuário', 'Plano', 'Status', 'Saldo', 'Margem', 'Cobrado', 'Custo real', 'Ações'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-slate-600 text-sm">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  visible.map((u) => {
                    const sc = statusColor(u.status);
                    return (
                      <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        {/* Usuário */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{ background: 'rgba(140,70,255,0.15)', border: '1px solid rgba(140,70,255,0.25)', color: '#c084fc' }}
                            >
                              {(u.robloxUsername || u.robloxDisplayName || '?')?.[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-white truncate">@{u.robloxUsername || '—'}</div>
                              <div className="text-[11px] text-slate-500 truncate">{u.robloxDisplayName || ''}</div>
                            </div>
                            {u.role === 'admin' && (
                              <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(140,70,255,0.2)', color: '#c084fc' }}>
                                ADM
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Plano */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-slate-200">{u.plan || '—'}</span>
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={u.planType === 'recurring'
                              ? { background: 'rgba(140,70,255,0.18)', color: '#c084fc' }
                              : { background: 'rgba(148,163,184,0.12)', color: '#94a3b8' }
                            }>
                              {u.planType === 'recurring' ? 'REC' : 'PRÉ'}
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border" style={{ background: sc.bg, borderColor: sc.border, color: sc.text }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.text }} />
                            {statusLabel(u.status)}
                          </span>
                        </td>

                        {/* Saldo */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono text-sm text-slate-200">${fmt(u.balanceUsd)}</span>
                        </td>

                        {/* Margem */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono text-sm text-blue-300">{u.effectiveMarginPercent}%</span>
                        </td>

                        {/* Cobrado */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono text-sm text-slate-300">${fmt(u.totalChargedUsd)}</span>
                        </td>

                        {/* Custo real */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono text-sm text-slate-400">${fmt(u.totalRealCostUsd)}</span>
                        </td>

                        {/* Ações */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <ActionBtn color="blue"   label="+ Saldo"  onClick={() => setModal({ type: 'topup',  user: u })} />
                            <ActionBtn color="green"  label="Plano"    onClick={() => setModal({ type: 'assign', user: u })} />
                            <ActionBtn color="purple" label="Margem"   onClick={() => setModal({ type: 'margin', user: u })} />
                            <ActionBtn color="yellow" label="Status"   onClick={() => setModal({ type: 'status', user: u })} />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {visible.length > 0 && (
            <div className="px-4 py-3 border-t border-white/[0.05] text-[11px] text-slate-600">
              {visible.length} de {users.length} usuário{users.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        </>)}

        {tab === 'plans' && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Planos</h2>
                <p className="text-xs text-slate-500 mt-0.5">Configure margem, créditos, preço e features de cada plano.</p>
              </div>
              <button
                onClick={() => setModal({ type: 'planEditor', plan: null })}
                className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl"
              >
                <Plus className="w-4 h-4" />
                Novo plano
              </button>
            </div>

            {plans.length === 0 ? (
              <div className="card text-center py-16 text-slate-600 text-sm">Nenhum plano cadastrado.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {plans.map((p) => (
                  <PlanCard
                    key={p._id}
                    plan={p}
                    onEdit={() => setModal({ type: 'planEditor', plan: p })}
                    onDelete={() => setModal({ type: 'planDelete', plan: p })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {modal && (
        <ModalOverlay onClose={() => setModal(null)}>
          {modal.type === 'topup'  && <TopUpModal  user={modal.user} token={token()} onClose={() => setModal(null)} onDone={(msg) => { showNotice(msg); fetchUsers(true); }} />}
          {modal.type === 'margin' && <MarginModal user={modal.user} token={token()} onClose={() => setModal(null)} onDone={(msg) => { showNotice(msg); fetchUsers(true); }} />}
          {modal.type === 'status' && <StatusModal user={modal.user} token={token()} onClose={() => setModal(null)} onDone={(msg) => { showNotice(msg); fetchUsers(true); }} />}
          {modal.type === 'assign' && <AssignPlanModal user={modal.user} plans={plans} token={token()} onClose={() => setModal(null)} onDone={(msg) => { showNotice(msg); fetchUsers(true); }} />}
          {modal.type === 'planEditor' && <PlanEditorModal plan={modal.plan} token={token()} onClose={() => setModal(null)} onDone={(msg) => { showNotice(msg); fetchPlans(true); fetchUsers(true); }} />}
          {modal.type === 'planDelete' && <PlanDeleteModal plan={modal.plan} token={token()} onClose={() => setModal(null)} onDone={(msg) => { showNotice(msg); fetchPlans(true); fetchUsers(true); }} />}
        </ModalOverlay>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AdminStat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: 'blue' | 'green' | 'yellow' | 'purple' }) {
  const colors = {
    blue:   { text: '#7eb3ff', bg: 'rgba(71,133,255,0.08)',  border: 'rgba(71,133,255,0.15)' },
    green:  { text: '#34d399', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.15)' },
    yellow: { text: '#fbbf24', bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.15)'  },
    purple: { text: '#c084fc', bg: 'rgba(140,70,255,0.08)', border: 'rgba(140,70,255,0.15)' },
  };
  const c = accent ? colors[accent] : null;
  return (
    <div
      className="card px-4 py-3.5"
      style={c ? { borderColor: c.border } : undefined}
    >
      <div className="flex items-center gap-1.5 text-xs mb-2" style={{ color: c ? c.text : '#64748b' }}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function ActionBtn({ color, label, onClick }: { color: 'blue' | 'purple' | 'yellow' | 'green'; label: string; onClick: () => void }) {
  const colors = {
    blue:   { bg: 'rgba(71,133,255,0.12)',  border: 'rgba(71,133,255,0.25)',  text: '#7eb3ff',  hover: 'rgba(71,133,255,0.22)' },
    purple: { bg: 'rgba(140,70,255,0.12)', border: 'rgba(140,70,255,0.25)', text: '#c084fc', hover: 'rgba(140,70,255,0.22)' },
    yellow: { bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.25)',  text: '#fbbf24', hover: 'rgba(234,179,8,0.22)'  },
    green:  { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', text: '#34d399', hover: 'rgba(16,185,129,0.22)' },
  };
  const c = colors[color];
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all duration-150 hover:brightness-110"
      style={{ background: c.bg, borderColor: c.border, color: c.text }}
    >
      {label}
    </button>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="glass-strong w-full max-w-sm rounded-2xl p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div>
        <div className="text-base font-semibold text-white">{title}</div>
        {subtitle && <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{subtitle}</div>}
      </div>
      <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/[0.08] hover:bg-white/[0.06] transition-colors text-slate-400 hover:text-white shrink-0">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Top-up Modal ─────────────────────────────────────────────────────────────

function TopUpModal({ user, token, onClose, onDone }: { user: AdminUser; token: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(amount);
    if (!val || val <= 0) { setErr('Valor inválido.'); return; }
    setLoading(true); setErr('');
    try {
      await api.post('/api/billing/admin/topup', { userId: user.id, amountUsd: val }, { headers: { Authorization: `Bearer ${token}` } });
      onDone(`✓ +$${val.toFixed(2)} adicionados para @${user.robloxUsername}`);
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'Falha ao recarregar.');
    } finally { setLoading(false); }
  };

  return (
    <>
      <ModalHeader title="Adicionar Saldo" subtitle={`@${user.robloxUsername} · ${user.robloxDisplayName || ''}`} onClose={onClose} />
      <div className="text-xs text-slate-500 mb-4">Saldo atual: <span className="text-slate-300 font-mono">${fmt(user.balanceUsd)}</span></div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Valor (USD)</label>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="input" autoFocus />
        </div>
        {err && <div className="text-xs text-red-400">{err}</div>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm rounded-xl justify-center">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5 text-sm rounded-xl justify-center disabled:opacity-50">
            {loading ? 'Adicionando...' : 'Confirmar'}
          </button>
        </div>
      </form>
    </>
  );
}

// ─── Margin Modal ─────────────────────────────────────────────────────────────

function MarginModal({ user, token, onClose, onDone }: { user: AdminUser; token: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [margin, setMargin] = useState(String(user.effectiveMarginPercent));
  const [useGlobal, setUseGlobal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      const marginPercent = useGlobal ? null : Number(margin);
      await api.post('/api/billing/admin/margin', { userId: user.id, marginPercent }, { headers: { Authorization: `Bearer ${token}` } });
      onDone(`✓ Margem de @${user.robloxUsername} ${useGlobal ? 'redefinida para padrão global' : `definida para ${margin}%`}`);
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'Falha ao definir margem.');
    } finally { setLoading(false); }
  };

  return (
    <>
      <ModalHeader title="Definir Margem" subtitle={`@${user.robloxUsername} · atual: ${user.effectiveMarginPercent}%`} onClose={onClose} />
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2.5 p-3 rounded-xl border border-white/[0.07] cursor-pointer" onClick={() => setUseGlobal((v) => !v)}>
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${useGlobal ? 'bg-violet-500 border-violet-500' : 'border-slate-600'}`}>
            {useGlobal && <span className="text-white text-[9px] font-bold">✓</span>}
          </div>
          <span className="text-sm text-slate-300">Usar padrão global</span>
        </div>
        {!useGlobal && (
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Margem % (0–99)</label>
            <input type="number" min="0" max="99" step="0.5" value={margin} onChange={(e) => setMargin(e.target.value)} className="input" autoFocus />
          </div>
        )}
        {err && <div className="text-xs text-red-400">{err}</div>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm rounded-xl justify-center">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5 text-sm rounded-xl justify-center disabled:opacity-50">
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </>
  );
}

// ─── Status Modal ─────────────────────────────────────────────────────────────

function StatusModal({ user, token, onClose, onDone }: { user: AdminUser; token: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [status, setStatus] = useState<'active' | 'suspended' | 'banned'>(user.status);
  const [minutes, setMinutes] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const options: { value: 'active' | 'suspended' | 'banned'; label: string; desc: string }[] = [
    { value: 'active',    label: 'Ativo',    desc: 'Acesso liberado normalmente.' },
    { value: 'suspended', label: 'Suspenso', desc: 'Bloqueia uso da IA temporariamente.' },
    { value: 'banned',    label: 'Banido',   desc: 'Bloqueio permanente da conta.' },
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      const body: any = { userId: user.id, status };
      if (status === 'suspended' && minutes) body.suspendedMinutes = Number(minutes);
      await api.post('/api/billing/admin/status', body, { headers: { Authorization: `Bearer ${token}` } });
      onDone(`✓ Status de @${user.robloxUsername} alterado para ${statusLabel(status)}`);
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'Falha ao atualizar status.');
    } finally { setLoading(false); }
  };

  return (
    <>
      <ModalHeader title="Alterar Status" subtitle={`@${user.robloxUsername} · ${statusLabel(user.status)} atual`} onClose={onClose} />
      <form onSubmit={submit} className="space-y-3">
        {options.map((opt) => {
          const sc = statusColor(opt.value);
          const selected = status === opt.value;
          return (
            <div
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150"
              style={{ background: selected ? sc.bg : 'transparent', borderColor: selected ? sc.border : 'rgba(255,255,255,0.07)' }}
            >
              <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${selected ? '' : 'border-slate-600'}`} style={selected ? { borderColor: sc.text, background: sc.text } : {}}>
                {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: sc.text }}>{opt.label}</div>
                <div className="text-[11px] text-slate-500">{opt.desc}</div>
              </div>
            </div>
          );
        })}
        {status === 'suspended' && (
          <div className="pt-1">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Duração (minutos) — deixe vazio para indefinido</label>
            <input type="number" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Ex.: 60" className="input" />
          </div>
        )}
        {err && <div className="text-xs text-red-400">{err}</div>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm rounded-xl justify-center">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5 text-sm rounded-xl justify-center disabled:opacity-50">
            {loading ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </form>
    </>
  );
}

// ─── Plan helpers ───────────────────────────────────────────────────────────────

const FEATURE_LABELS: { key: keyof PlanFeatures; label: string }[] = [
  { key: 'ideaGenerator',   label: 'Gerador de Ideias' },
  { key: 'thinkMode',       label: 'Modo Think' },
  { key: 'prioritySupport', label: 'Suporte prioritário' },
];

function planTypeLabel(t: string) {
  return t === 'recurring' ? 'Recorrente' : 'Pré-pago';
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({ plan, onEdit, onDelete }: { plan: AdminPlan; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="card p-5 flex flex-col gap-4 relative" style={plan.highlight ? { borderColor: 'rgba(140,70,255,0.35)' } : undefined}>
      {!plan.active && (
        <div className="absolute top-3 right-3 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>
          Inativo
        </div>
      )}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-white">{plan.name}</span>
          {plan.isDefault && <Star className="w-3.5 h-3.5 text-amber-400" fill="#fbbf24" />}
          {plan.highlight && <Sparkles className="w-3.5 h-3.5 text-violet-400" />}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <code className="text-[11px] text-slate-500">{plan.key}</code>
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={plan.planType === 'recurring'
            ? { background: 'rgba(140,70,255,0.18)', color: '#c084fc' }
            : { background: 'rgba(148,163,184,0.12)', color: '#94a3b8' }
          }>
            {planTypeLabel(plan.planType)}
          </span>
        </div>
        {plan.description && <p className="text-xs text-slate-500 mt-2">{plan.description}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <PlanStat label="Preço" value={plan.priceUsd > 0 ? `$${plan.priceUsd.toFixed(2)}` : 'Grátis'} />
        <PlanStat label="Margem" value={plan.marginPercent === null ? 'Global' : `${plan.marginPercent}%`} />
        <PlanStat label="Crédito/mês" value={`$${plan.monthlyCreditUsd.toFixed(2)}`} />
        <PlanStat label="Bônus signup" value={`$${plan.signupBonusUsd.toFixed(2)}`} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FEATURE_LABELS.filter((f) => plan.features?.[f.key]).map((f) => (
          <span key={f.key} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg" style={{ background: 'rgba(16,185,129,0.10)', color: '#34d399', border: '1px solid rgba(16,185,129,0.20)' }}>
            <Check className="w-2.5 h-2.5" />
            {f.label}
          </span>
        ))}
      </div>

      <div className="flex gap-2 pt-1 mt-auto">
        <button onClick={onEdit} className="btn-secondary flex-1 py-2 text-xs rounded-lg justify-center flex items-center gap-1.5">
          <Pencil className="w-3 h-3" /> Editar
        </button>
        <button
          onClick={onDelete}
          disabled={plan.isDefault}
          title={plan.isDefault ? 'Não é possível remover o plano padrão' : 'Remover plano'}
          className="px-3 py-2 text-xs rounded-lg border flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ borderColor: 'rgba(239,68,68,0.25)', color: '#f87171', background: 'rgba(239,68,68,0.08)' }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function PlanStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-sm text-slate-200 mt-0.5">{value}</div>
    </div>
  );
}

// ─── Assign Plan Modal ──────────────────────────────────────────────────────────

function AssignPlanModal({ user, plans, token, onClose, onDone }: { user: AdminUser; plans: AdminPlan[]; token: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [planKey, setPlanKey] = useState(user.planKey ?? plans.find((p) => p.isDefault)?.key ?? plans[0]?.key ?? '');
  const [grantCredit, setGrantCredit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const selected = plans.find((p) => p.key === planKey);
  const canGrant = selected?.planType === 'recurring' && (selected?.monthlyCreditUsd ?? 0) > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planKey) { setErr('Selecione um plano.'); return; }
    setLoading(true); setErr('');
    try {
      await api.post('/api/billing/admin/plans/assign',
        { userId: user.id, planKey, grantCredit: canGrant && grantCredit },
        { headers: { Authorization: `Bearer ${token}` } });
      onDone(`✓ @${user.robloxUsername} movido para o plano ${selected?.name}`);
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'Falha ao atribuir plano.');
    } finally { setLoading(false); }
  };

  return (
    <>
      <ModalHeader title="Atribuir Plano" subtitle={`@${user.robloxUsername} · atual: ${user.plan || '—'}`} onClose={onClose} />
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
          {plans.map((p) => {
            const sel = planKey === p.key;
            return (
              <div
                key={p.key}
                onClick={() => setPlanKey(p.key)}
                className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150"
                style={{ background: sel ? 'rgba(140,70,255,0.12)' : 'transparent', borderColor: sel ? 'rgba(140,70,255,0.30)' : 'rgba(255,255,255,0.07)' }}
              >
                <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 ${sel ? '' : 'border-slate-600'}`} style={sel ? { borderColor: '#c084fc', background: '#c084fc' } : {}}>
                  {sel && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{p.name}</span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(148,163,184,0.12)', color: '#94a3b8' }}>{planTypeLabel(p.planType)}</span>
                    {!p.active && <span className="text-[9px] text-slate-600">(inativo)</span>}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {p.priceUsd > 0 ? `$${p.priceUsd.toFixed(2)}/mês` : 'Grátis'} · margem {p.marginPercent === null ? 'global' : `${p.marginPercent}%`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {canGrant && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl border border-white/[0.07] cursor-pointer" onClick={() => setGrantCredit((v) => !v)}>
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${grantCredit ? 'bg-violet-500 border-violet-500' : 'border-slate-600'}`}>
              {grantCredit && <Check className="w-2.5 h-2.5 text-white" />}
            </div>
            <span className="text-sm text-slate-300">Creditar ${selected?.monthlyCreditUsd.toFixed(2)} agora (crédito mensal do plano)</span>
          </div>
        )}

        {err && <div className="text-xs text-red-400">{err}</div>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm rounded-xl justify-center">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5 text-sm rounded-xl justify-center disabled:opacity-50">
            {loading ? 'Salvando...' : 'Atribuir'}
          </button>
        </div>
      </form>
    </>
  );
}

// ─── Plan Editor Modal ──────────────────────────────────────────────────────────

function PlanEditorModal({ plan, token, onClose, onDone }: { plan: AdminPlan | null; token: string; onClose: () => void; onDone: (msg: string) => void }) {
  const isEdit = Boolean(plan);
  const [key, setKey] = useState(plan?.key ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [planType, setPlanType] = useState<'recurring' | 'prepaid'>(plan?.planType ?? 'prepaid');
  const [priceUsd, setPriceUsd] = useState(String(plan?.priceUsd ?? ''));
  const [useGlobalMargin, setUseGlobalMargin] = useState(plan ? plan.marginPercent === null : true);
  const [marginPercent, setMarginPercent] = useState(String(plan?.marginPercent ?? ''));
  const [monthlyCreditUsd, setMonthlyCreditUsd] = useState(String(plan?.monthlyCreditUsd ?? ''));
  const [signupBonusUsd, setSignupBonusUsd] = useState(String(plan?.signupBonusUsd ?? ''));
  const [features, setFeatures] = useState<PlanFeatures>(plan?.features ?? { ideaGenerator: false, thinkMode: true, prioritySupport: false });
  const [order, setOrder] = useState(String(plan?.order ?? 0));
  const [highlight, setHighlight] = useState(plan?.highlight ?? false);
  const [active, setActive] = useState(plan?.active ?? true);
  const [isDefault, setIsDefault] = useState(plan?.isDefault ?? false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Auto-sugere o key a partir do nome ao criar
  const onNameChange = (v: string) => {
    setName(v);
    if (!isEdit && !key) {
      setKey(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Nome é obrigatório.'); return; }
    if (!isEdit && !/^[a-z0-9][a-z0-9-]*$/.test(key)) { setErr('Key inválido (use minúsculas, números e hífens).'); return; }
    setLoading(true); setErr('');

    const payload = {
      name: name.trim(),
      description: description.trim(),
      planType,
      priceUsd: Number(priceUsd) || 0,
      marginPercent: useGlobalMargin ? null : Number(marginPercent),
      monthlyCreditUsd: Number(monthlyCreditUsd) || 0,
      signupBonusUsd: Number(signupBonusUsd) || 0,
      features,
      order: Number(order) || 0,
      highlight, active, isDefault,
    };

    try {
      if (isEdit) {
        await api.put(`/api/billing/admin/plans/${plan!._id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        onDone(`✓ Plano ${name} atualizado`);
      } else {
        await api.post('/api/billing/admin/plans', { key, ...payload }, { headers: { Authorization: `Bearer ${token}` } });
        onDone(`✓ Plano ${name} criado`);
      }
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'Falha ao salvar plano.');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-h-[80vh] overflow-y-auto pr-1 -mr-1">
      <ModalHeader title={isEdit ? 'Editar Plano' : 'Novo Plano'} subtitle={isEdit ? plan!.key : 'Defina as regras do plano'} onClose={onClose} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome">
            <input value={name} onChange={(e) => onNameChange(e.target.value)} className="input" placeholder="Creator" autoFocus />
          </Field>
          <Field label="Key (slug)">
            <input value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} disabled={isEdit} className="input disabled:opacity-50" placeholder="creator" />
          </Field>
        </div>

        <Field label="Descrição">
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="Para devs solo levando o jogo a sério." />
        </Field>

        <Field label="Tipo">
          <div className="flex gap-2">
            {(['prepaid', 'recurring'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setPlanType(t)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold border transition-all"
                style={planType === t ? { background: 'rgba(140,70,255,0.15)', borderColor: 'rgba(140,70,255,0.30)', color: '#c084fc' } : { borderColor: 'rgba(255,255,255,0.08)', color: '#64748b' }}>
                {planTypeLabel(t)}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço (USD/mês)">
            <input type="number" min="0" step="0.01" value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} className="input" placeholder="0.00" />
          </Field>
          <Field label="Crédito mensal (USD)">
            <input type="number" min="0" step="0.01" value={monthlyCreditUsd} onChange={(e) => setMonthlyCreditUsd(e.target.value)} className="input" placeholder="0.00" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Bônus signup (USD)">
            <input type="number" min="0" step="0.01" value={signupBonusUsd} onChange={(e) => setSignupBonusUsd(e.target.value)} className="input" placeholder="0.00" />
          </Field>
          <Field label="Ordem de exibição">
            <input type="number" value={order} onChange={(e) => setOrder(e.target.value)} className="input" placeholder="0" />
          </Field>
        </div>

        <Field label="Margem de lucro">
          <div className="flex items-center gap-2.5 mb-2 cursor-pointer" onClick={() => setUseGlobalMargin((v) => !v)}>
            <div className={`w-4 h-4 rounded border flex items-center justify-center ${useGlobalMargin ? 'bg-violet-500 border-violet-500' : 'border-slate-600'}`}>
              {useGlobalMargin && <Check className="w-2.5 h-2.5 text-white" />}
            </div>
            <span className="text-sm text-slate-300">Usar margem global (.env)</span>
          </div>
          {!useGlobalMargin && (
            <input type="number" min="0" max="99" step="0.5" value={marginPercent} onChange={(e) => setMarginPercent(e.target.value)} className="input" placeholder="50" />
          )}
        </Field>

        <Field label="Features liberadas">
          <div className="space-y-2">
            {FEATURE_LABELS.map((f) => (
              <div key={f.key} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-white/[0.07] cursor-pointer" onClick={() => setFeatures((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}>
                <div className={`w-4 h-4 rounded border flex items-center justify-center ${features[f.key] ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
                  {features[f.key] && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="text-sm text-slate-300">{f.label}</span>
              </div>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-3 gap-2">
          <ToggleChip label="Destaque" active={highlight} onClick={() => setHighlight((v) => !v)} />
          <ToggleChip label="Ativo" active={active} onClick={() => setActive((v) => !v)} />
          <ToggleChip label="Padrão" active={isDefault} onClick={() => setIsDefault((v) => !v)} />
        </div>

        {err && <div className="text-xs text-red-400">{err}</div>}
        <div className="flex gap-3 pt-1 sticky bottom-0 bg-transparent">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm rounded-xl justify-center">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5 text-sm rounded-xl justify-center disabled:opacity-50">
            {loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar plano'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{label}</label>
      {children}
    </div>
  );
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="py-2 rounded-xl text-xs font-semibold border transition-all"
      style={active ? { background: 'rgba(140,70,255,0.15)', borderColor: 'rgba(140,70,255,0.30)', color: '#c084fc' } : { borderColor: 'rgba(255,255,255,0.08)', color: '#64748b' }}>
      {label}
    </button>
  );
}

// ─── Plan Delete Modal ──────────────────────────────────────────────────────────

function PlanDeleteModal({ plan, token, onClose, onDone }: { plan: AdminPlan; token: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setLoading(true); setErr('');
    try {
      const res = await api.delete(`/api/billing/admin/plans/${plan._id}`, { headers: { Authorization: `Bearer ${token}` } });
      const reassigned = res.data?.reassigned ?? 0;
      onDone(reassigned > 0
        ? `✓ Plano ${plan.name} removido · ${reassigned} usuário(s) movido(s) para o padrão`
        : `✓ Plano ${plan.name} removido`);
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'Falha ao remover plano.');
    } finally { setLoading(false); }
  };

  return (
    <>
      <ModalHeader title="Remover Plano" subtitle={plan.key} onClose={onClose} />
      <p className="text-sm text-slate-300">
        Remover o plano <strong className="text-white">{plan.name}</strong>? Usuários neste plano serão movidos automaticamente para o plano padrão.
      </p>
      {err && <div className="text-xs text-red-400 mt-3">{err}</div>}
      <div className="flex gap-3 pt-5">
        <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm rounded-xl justify-center">Cancelar</button>
        <button onClick={submit} disabled={loading} className="flex-1 py-2.5 text-sm rounded-xl justify-center font-semibold transition-colors disabled:opacity-50" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#f87171' }}>
          {loading ? 'Removendo...' : 'Remover'}
        </button>
      </div>
    </>
  );
}
