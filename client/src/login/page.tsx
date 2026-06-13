"use client";
import React, { useState } from 'react';
import { Bot, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '../api/api.js';
import Link from 'next/link';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/auth/login', { email, password });
      const data = res.data;
      if (data.token) {
        localStorage.setItem('blox_token', data.token);
        router.push('/dashboard');
      } else {
        setError(data.error || 'Erro ao fazer login');
      }
    } catch (err) {
      setError('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <Bot className="w-12 h-12 text-blue-500 mb-4" />
          <h2 className="text-2xl font-bold text-white">Entrar no Blox AI</h2>
          <p className="text-slate-400 mt-2 text-sm text-center">Faça login para gerenciar seus projetos.</p>
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 text-red-400 rounded-lg text-sm text-center">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Senha</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              placeholder="••••••••"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 mt-4"
          >
            {loading ? 'Conectando...' : 'Entrar'} <ArrowRight className="w-4 h-4" />
          </button>
        </form>
        <div className="mt-6 text-center text-sm text-slate-400">
          Não tem uma conta? <Link href="/register" className="text-blue-400 hover:text-blue-300">Crie aqui</Link>
        </div>
      </div>
    </div>
  );
}
