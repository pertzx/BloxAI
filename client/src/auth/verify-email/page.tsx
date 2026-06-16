import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string || '';

/**
 * Chamada quando o usuário clica no link de verificação de e-mail.
 * Na verdade o backend faz a verificação e redireciona para /settings?emailVerified=ok/expired/error.
 * Esta página trata o parâmetro de resultado exibido pelo settings — mas também pode ser hit diretamente
 * se o link aponta aqui com ?token=...
 */
export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'ok' | 'expired' | 'error'>('loading');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { setStatus('error'); return; }

    // Redireciona para o backend que faz a verificação e volta para /settings
    window.location.href = `${BACKEND_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  }, [searchParams]);

  return (
    <div className="aurora-bg min-h-screen flex items-center justify-center p-4">
      <div className="glass-strong rounded-2xl p-8 max-w-sm w-full text-center animate-slide-up" style={{ borderRadius: 20 }}>
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-slate-300 text-sm">Verificando e-mail...</p>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <XCircle className="w-8 h-8 text-red-400" />
            <p className="text-white font-semibold">Link inválido</p>
            <p className="text-slate-400 text-sm">O link de verificação é inválido ou já foi usado.</p>
            <Link to="/settings" className="btn-gradient py-2 px-5 rounded-xl text-sm mt-2">
              Ir para configurações
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
