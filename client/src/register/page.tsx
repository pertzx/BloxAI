"use client";
import React, { useState } from 'react';
import { Bot, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '../api/api.js';
import Link from 'next/link';

export default function Register() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/auth/register', { email, username, password });
      const data = res.data;
      if (data.token) {
        localStorage.setItem('blox_token', data.token);
        router.push('/dashboard');
      } else {
        setError(data.error || 'Erro ao registrar');
      }
    } catch {
      setError('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="aurora-bg min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-slide-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center mb-4">
            <Bot className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Criar Conta</h1>
          <p className="text-slate-400 mt-2 text-sm text-center">Junte-se ao Blox AI e comece a criar.</p>
        </div>

        {/* Card */}
        <div className="glass-strong rounded-2xl p-8" style={{ borderRadius: 20 }}>
          {error && (
            <div className="mb-5 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Username (Roblox)</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="Ex: Builderman"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3 rounded-xl mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Criando...' : 'Criar conta'} <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/[0.06] text-center text-sm text-slate-500">
            Já tem conta?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
              Faça login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
