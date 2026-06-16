"use client";
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, ShieldCheck, Mail, CheckCircle2, Clock, AlertCircle,
  ExternalLink, Bot, Sparkles,
} from 'lucide-react';
import api from '../api/api.js';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string || '';

type UserProfile = {
  robloxUsername: string;
  robloxDisplayName: string;
  robloxAvatarUrl: string;
  role: string;
  planType: string;
  balanceUsd: number;
  securityEmail: string | null;
  securityEmailVerified: boolean;
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isWelcome = searchParams.get('welcome') === '1';
  const emailVerified = searchParams.get('emailVerified');

  const token = localStorage.getItem('blox_token') ?? '';
  const headers = { Authorization: `Bearer ${token}` };

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [emailInput, setEmailInput] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    if (!token) { navigate('/login', { replace: true }); return; }
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get('/api/auth/me', { headers });
      setProfile(res.data);
      if (res.data.securityEmail) setEmailInput(res.data.securityEmail);
    } catch { navigate('/login', { replace: true }); }
    finally { setLoading(false); }
  };

  const handleSetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailSaving(true); setEmailMsg(''); setEmailError('');
    try {
      await api.post('/api/auth/security-email', { email: emailInput }, { headers });
      setEmailMsg('E-mail salvo! Verifique sua caixa de entrada para confirmar.');
      fetchProfile();
    } catch (err: any) {
      setEmailError(err?.response?.data?.error || 'Erro ao salvar e-mail.');
    } finally { setEmailSaving(false); }
  };

  if (loading) {
    return (
      <div className="aurora-bg min-h-screen flex items-center justify-center">
        <Bot className="w-6 h-6 text-blue-400 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="aurora-bg min-h-screen flex flex-col text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 px-6 py-4 glass border-b border-white/[0.07]">
        <Link
          to="/dashboard"
          className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/[0.08] hover:bg-white/[0.06] transition-colors text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="font-semibold text-white text-[15px]">Configurações da conta</h1>
          <p className="text-xs text-slate-500">Segurança e preferências</p>
        </div>
      </header>

      <main className="max-w-xl mx-auto w-full px-6 py-10 flex flex-col gap-6">

        {/* Banner boas-vindas (nova conta) */}
        {isWelcome && (
          <div className="card p-5 flex items-start gap-4" style={{ borderColor: 'rgba(71,133,255,0.25)', background: 'rgba(71,133,255,0.06)' }}>
            <Sparkles className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-white font-semibold text-sm">Bem-vindo ao Blox AI! 🎮</p>
              <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                Sua conta foi criada com seu perfil Roblox. Recomendamos adicionar um <strong className="text-slate-200">e-mail de segurança</strong> agora — é a única forma de recuperar sua conta caso perca acesso ao Roblox.
              </p>
            </div>
          </div>
        )}

        {/* Banner verificado */}
        {emailVerified === 'ok' && (
          <div className="card p-4 flex items-center gap-3" style={{ borderColor: 'rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.06)' }}>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-emerald-300 text-sm">E-mail de segurança verificado com sucesso!</p>
          </div>
        )}
        {(emailVerified === 'expired' || emailVerified === 'error') && (
          <div className="card p-4 flex items-center gap-3" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)' }}>
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-red-300 text-sm">
              {emailVerified === 'expired' ? 'Link de verificação expirado. Reenvie um novo abaixo.' : 'Erro ao verificar e-mail. Tente novamente.'}
            </p>
          </div>
        )}

        {/* Perfil Roblox */}
        {profile && (
          <div className="card p-5">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-4">Conta Roblox</h2>
            <div className="flex items-center gap-4">
              {profile.robloxAvatarUrl ? (
                <img src={profile.robloxAvatarUrl} alt="avatar" className="w-14 h-14 rounded-xl object-cover border border-white/[0.08]" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
                  <Bot className="w-7 h-7 text-blue-400" />
                </div>
              )}
              <div>
                <p className="text-white font-semibold">{profile.robloxDisplayName}</p>
                <p className="text-slate-400 text-sm">@{profile.robloxUsername}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(71,133,255,0.12)', border: '1px solid rgba(71,133,255,0.25)', color: '#7eb3ff' }}>
                    {profile.planType === 'recurring' ? 'Recorrente' : 'Pré-pago'}
                  </span>
                  {profile.role === 'admin' && (
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(140,70,255,0.15)', border: '1px solid rgba(140,70,255,0.30)', color: '#c084fc' }}>
                      Admin
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-600">
              Autenticação gerenciada pelo Roblox OAuth. Para trocar de conta, saia e entre com outro perfil.
            </p>
          </div>
        )}

        {/* E-mail de segurança */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-violet-400" />
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">E-mail de segurança</h2>
          </div>
          <p className="text-xs text-slate-500 mb-5 leading-relaxed">
            Usado <strong className="text-slate-400">apenas para recuperação de conta</strong> — nunca para login. Se perder acesso ao Roblox, enviamos um magic link para este e-mail que te deixa entrar sem o Roblox.
          </p>

          {/* Status atual */}
          {profile?.securityEmail && (
            <div className="flex items-center gap-2.5 mb-5 p-3 rounded-xl border" style={{ borderColor: profile.securityEmailVerified ? 'rgba(16,185,129,0.20)' : 'rgba(234,179,8,0.20)', background: profile.securityEmailVerified ? 'rgba(16,185,129,0.06)' : 'rgba(234,179,8,0.06)' }}>
              {profile.securityEmailVerified
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                : <Clock className="w-4 h-4 text-yellow-400 shrink-0" />
              }
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{profile.securityEmail}</p>
                <p className="text-xs mt-0.5" style={{ color: profile.securityEmailVerified ? '#34d399' : '#fbbf24' }}>
                  {profile.securityEmailVerified ? 'Verificado' : 'Aguardando verificação — cheque seu e-mail'}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSetEmail} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                {profile?.securityEmail ? 'Atualizar e-mail' : 'Adicionar e-mail de segurança'}
              </label>
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="input"
                placeholder="seu@email.com"
              />
            </div>

            {emailMsg && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-500/25 bg-emerald-500/08 text-emerald-300 text-sm">
                <Mail className="w-4 h-4 shrink-0" />
                {emailMsg}
              </div>
            )}
            {emailError && (
              <p className="text-red-300 text-sm">{emailError}</p>
            )}

            <button
              type="submit"
              disabled={emailSaving}
              className="btn-gradient py-2.5 px-5 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {emailSaving ? 'Salvando...' : profile?.securityEmail ? 'Atualizar e-mail' : 'Salvar e-mail de segurança'}
            </button>
          </form>
        </div>

        {/* Informação sobre como funciona */}
        <div className="card p-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Como funciona a recuperação</h2>
          <ol className="space-y-2.5">
            {[
              'Na tela de login, clique em "Perdi acesso à minha conta Roblox"',
              'Digite o e-mail de segurança que você cadastrou aqui',
              'Você receberá um link de recuperação (válido por 15 minutos)',
              'O link te loga na sua conta sem precisar do Roblox',
              'Depois, reconecte sua nova conta Roblox nas configurações',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-400">
                <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'rgba(140,70,255,0.15)', border: '1px solid rgba(140,70,255,0.25)', color: '#c084fc' }}>
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Sair */}
        <div className="flex justify-end">
          <button
            onClick={() => { localStorage.removeItem('blox_token'); navigate('/'); }}
            className="text-sm text-slate-500 hover:text-red-400 transition-colors"
          >
            Sair da conta
          </button>
        </div>
      </main>
    </div>
  );
}
