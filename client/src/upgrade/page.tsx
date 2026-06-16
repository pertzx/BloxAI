"use client";
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Crown, Sparkles, Zap, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import api from '../api/api.js';

type PlanFeatures = { ideaGenerator?: boolean; thinkMode?: boolean; prioritySupport?: boolean };

type PublicPlan = {
  key: string;
  name: string;
  description: string;
  planType: 'recurring' | 'prepaid';
  priceUsd: number;
  monthlyCreditUsd: number;
  features: PlanFeatures;
  highlight: boolean;
  order: number;
  purchasable: boolean;
};

const FEATURE_LABELS: { key: keyof PlanFeatures; label: string }[] = [
  { key: 'ideaGenerator', label: 'Gerador de Ideias Virais' },
  { key: 'thinkMode', label: 'Modo Think (raciocínio profundo)' },
  { key: 'prioritySupport', label: 'Suporte prioritário' },
];

export default function UpgradePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = localStorage.getItem('blox_token') ?? '';

  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [currentPlanKey, setCurrentPlanKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [error, setError] = useState('');
  const status = params.get('status'); // success | cancel

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      api.get('/api/billing/plans', { headers }),
      api.get('/api/auth/me', { headers }),
    ])
      .then(([plansRes, meRes]) => {
        setPlans(plansRes.data?.plans ?? []);
        setCurrentPlanKey(meRes.data?.planKey ?? null);
      })
      .catch(() => setError('Falha ao carregar os planos.'))
      .finally(() => setLoading(false));
  }, [token, navigate]);

  const subscribe = async (planKey: string) => {
    setCheckingOut(planKey); setError('');
    try {
      const res = await api.post('/api/billing/checkout', { planKey }, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.url) window.location.href = res.data.url;
      else setError('Não foi possível iniciar o checkout.');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Falha ao iniciar o checkout.');
    } finally { setCheckingOut(null); }
  };

  return (
    <div className="aurora-bg min-h-screen flex flex-col text-slate-100">
      <header className="sticky top-0 z-40 flex items-center gap-3 px-6 py-4 glass border-b border-white/[0.07]">
        <button
          onClick={() => navigate('/dashboard')}
          className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/[0.08] hover:bg-white/[0.06] transition-colors text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-violet-300" />
          <span className="font-game text-[17px] text-white tracking-wide">Planos & Upgrade</span>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10 flex flex-col gap-8">
        {status === 'success' && (
          <div className="p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Pagamento confirmado! Seu plano será ativado em instantes.
          </div>
        )}
        {status === 'cancel' && (
          <div className="p-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 text-yellow-300 text-sm flex items-center gap-2">
            <XCircle className="w-4 h-4" /> Checkout cancelado. Você pode tentar novamente quando quiser.
          </div>
        )}
        {error && <div className="p-4 rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 text-sm">{error}</div>}

        <div className="text-center">
          <h1 className="font-game text-3xl text-white mb-2">Escolha seu plano</h1>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            Planos recorrentes dão cota mensal garantida e desbloqueiam recursos exclusivos. Cancele quando quiser.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <RefreshCw className="w-6 h-6 text-violet-400 animate-spin" />
            <span className="text-slate-500 text-sm">Carregando planos...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {plans.map((p) => {
              const isCurrent = currentPlanKey === p.key;
              return (
                <div
                  key={p.key}
                  className="card p-6 flex flex-col gap-4 relative"
                  style={p.highlight ? { borderColor: 'rgba(140,70,255,0.35)', boxShadow: '0 0 40px rgba(140,70,255,0.10)' } : undefined}
                >
                  {p.highlight && (
                    <div className="absolute top-4 right-4 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: 'rgba(140,70,255,0.20)', color: '#c084fc', border: '1px solid rgba(140,70,255,0.30)' }}>
                      Popular
                    </div>
                  )}
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: p.planType === 'recurring' ? 'rgba(140,70,255,0.12)' : 'rgba(71,133,255,0.12)', border: `1px solid ${p.planType === 'recurring' ? 'rgba(140,70,255,0.25)' : 'rgba(71,133,255,0.22)'}` }}>
                      {p.planType === 'recurring' ? <Crown className="w-5 h-5 text-violet-300" /> : <Zap className="w-5 h-5 text-blue-300" />}
                    </div>
                    <div>
                      <div className="font-semibold text-white text-base">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.planType === 'recurring' ? 'Assinatura mensal' : 'Pré-pago'}</div>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="font-game text-3xl text-white">{p.priceUsd > 0 ? `$${p.priceUsd.toFixed(2)}` : 'Grátis'}</span>
                    {p.planType === 'recurring' && p.priceUsd > 0 && <span className="text-xs text-slate-500">/mês</span>}
                  </div>

                  {p.description && <p className="text-xs text-slate-400 leading-relaxed">{p.description}</p>}

                  <ul className="space-y-2 flex-1">
                    {p.monthlyCreditUsd > 0 && (
                      <li className="flex items-center gap-2 text-sm text-slate-300">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> ${p.monthlyCreditUsd.toFixed(2)} em créditos/mês
                      </li>
                    )}
                    {FEATURE_LABELS.filter((f) => p.features?.[f.key]).map((f) => (
                      <li key={f.key} className="flex items-center gap-2 text-sm text-slate-300">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> {f.label}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <button disabled className="btn-secondary w-full justify-center py-2.5 rounded-xl text-sm opacity-60 cursor-default">
                      Plano atual
                    </button>
                  ) : p.purchasable ? (
                    <button
                      onClick={() => subscribe(p.key)}
                      disabled={checkingOut === p.key}
                      className="btn-gradient w-full justify-center py-2.5 rounded-xl text-sm disabled:opacity-50"
                    >
                      {checkingOut === p.key ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {checkingOut === p.key ? 'Redirecionando...' : 'Assinar'}
                    </button>
                  ) : (
                    <button disabled className="btn-secondary w-full justify-center py-2.5 rounded-xl text-sm opacity-50 cursor-not-allowed">
                      {p.planType === 'recurring' ? 'Indisponível' : 'Padrão'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
