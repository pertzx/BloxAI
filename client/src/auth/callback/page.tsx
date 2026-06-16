import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, CheckCircle2 } from 'lucide-react';

/**
 * Página intermediária de callback OAuth.
 * O backend redireciona aqui com ?token=JWT[&new=1][&recovered=1].
 * Guarda o token e redireciona para o destino correto.
 */
export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const isNew = searchParams.get('new') === '1';
    const isRecovered = searchParams.get('recovered') === '1';

    if (!token) {
      setError('Token de autenticação não encontrado.');
      setTimeout(() => navigate('/login?error=server', { replace: true }), 2500);
      return;
    }

    localStorage.setItem('blox_token', token);

    if (isNew) {
      // Novo usuário: vai para settings para configurar e-mail de segurança
      navigate('/settings?welcome=1', { replace: true });
    } else if (isRecovered) {
      navigate('/dashboard?recovered=1', { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div className="aurora-bg min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        {error ? (
          <p className="text-red-300 text-sm">{error}</p>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
              <Bot className="w-6 h-6 text-blue-400 animate-pulse" />
            </div>
            <div>
              <p className="text-white font-semibold">Autenticando...</p>
              <p className="text-slate-500 text-sm mt-1">Verificando sua conta Roblox</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
