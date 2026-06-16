"use client";
import React, { useEffect, useState } from 'react';
import { Bot, Mail, AlertCircle } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string || '';

const ERROR_MESSAGES: Record<string, string> = {
  cancelled: 'Autorização cancelada. Tente novamente.',
  invalid_state: 'Sessão expirada. Tente novamente.',
  token_exchange: 'Falha ao conectar com a Roblox. Tente novamente.',
  userinfo: 'Não foi possível obter seus dados do Roblox.',
  server: 'Erro interno. Tente novamente em instantes.',
  invalid_recovery: 'Link de recuperação inválido.',
  recovery_expired: 'Link de recuperação expirado. Solicite um novo.',
};

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMsg, setRecoveryMsg] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);

  const errorKey = searchParams.get('error') || '';
  const errorMsg = ERROR_MESSAGES[errorKey] || '';

  useEffect(() => {
    if (localStorage.getItem('blox_token')) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const handleRobloxLogin = () => {
    window.location.href = `${BACKEND_URL}/api/auth/roblox`;
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryLoading(true);
    setRecoveryMsg('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail }),
      });
      const data = await res.json();
      setRecoveryMsg(data.message || 'Verifique seu e-mail.');
    } catch {
      setRecoveryMsg('Erro de conexão. Tente novamente.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="aurora-bg min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-slide-up">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center mb-4">
            <Bot className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="font-game text-2xl text-white tracking-wide">Blox AI</h1>
          <p className="text-slate-400 mt-1.5 text-sm text-center">
            {showRecovery ? 'Recuperar conta' : 'Faça login com sua conta Roblox'}
          </p>
        </div>

        <div className="glass-strong rounded-2xl p-8" style={{ borderRadius: 20 }}>

          {/* Erro OAuth */}
          {errorMsg && (
            <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {errorMsg}
            </div>
          )}

          {!showRecovery ? (
            <>
              {/* Botão Roblox */}
              <button
                onClick={handleRobloxLogin}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-5 rounded-xl font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #00A2FF, #0057E7)', boxShadow: '0 4px 20px rgba(0,90,255,0.30)' }}
              >
                {/* Roblox logo SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M5.013 18.994L3 9.013 14.987 7 17 16.981 5.013 18.994Z" fill="white"/>
                </svg>
                Entrar com Roblox
              </button>

              <p className="mt-5 text-center text-xs text-slate-500 leading-relaxed">
                Ao entrar, você concorda com os termos do Blox AI.<br />
                Nenhuma senha é armazenada — a identidade Roblox é o único método de autenticação.
              </p>

              <div className="mt-6 pt-5 border-t border-white/[0.06] text-center">
                <button
                  onClick={() => setShowRecovery(true)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1.5 mx-auto"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Perdi acesso à minha conta Roblox
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Formulário de recuperação */}
              <form onSubmit={handleRecovery} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    E-mail de segurança cadastrado
                  </label>
                  <input
                    type="email"
                    required
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    className="input"
                    placeholder="seu@email.com"
                  />
                  <p className="mt-1.5 text-xs text-slate-600">
                    O e-mail que você vinculou na página de configurações.
                  </p>
                </div>

                {recoveryMsg && (
                  <div className="p-3 rounded-xl border border-blue-500/25 bg-blue-500/10 text-blue-300 text-sm">
                    {recoveryMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="btn-gradient w-full justify-center py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {recoveryLoading ? 'Enviando...' : 'Enviar link de recuperação'}
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-white/[0.06] text-center">
                <button
                  onClick={() => { setShowRecovery(false); setRecoveryMsg(''); }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  ← Voltar ao login
                </button>
              </div>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-slate-600">
          Novo no Blox AI?{' '}
          <Link to="/" className="text-blue-400 hover:text-blue-300 transition-colors">
            Conheça a plataforma
          </Link>
        </p>
      </div>
    </div>
  );
}
