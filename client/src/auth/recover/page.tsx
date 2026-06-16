import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ShieldCheck, XCircle, Loader2 } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string || '';

/**
 * Link de recuperação: o e-mail aponta para o backend que redireciona aqui com ?token=...
 * Confirmamos a recuperação redirecionando para /api/auth/recover/confirm.
 */
export default function RecoverPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { setStatus('error'); return; }

    // Backend valida o token e redireciona para /auth/callback com JWT
    window.location.href = `${BACKEND_URL}/api/auth/recover/confirm?token=${encodeURIComponent(token)}`;
  }, [searchParams]);

  return (
    <div className="aurora-bg min-h-screen flex items-center justify-center p-4">
      <div className="glass-strong rounded-2xl p-8 max-w-sm w-full text-center animate-slide-up" style={{ borderRadius: 20 }}>
        {status === 'loading' ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(71,133,255,0.12)', border: '1px solid rgba(71,133,255,0.25)' }}>
              <ShieldCheck className="w-6 h-6 text-blue-400" />
            </div>
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            <p className="text-slate-300 text-sm">Validando link de recuperação...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <XCircle className="w-8 h-8 text-red-400" />
            <p className="text-white font-semibold">Link inválido ou expirado</p>
            <p className="text-slate-400 text-sm">Links de recuperação expiram em 15 minutos e são de uso único.</p>
            <Link to="/login" className="btn-gradient py-2 px-5 rounded-xl text-sm mt-2">
              Solicitar novo link
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
