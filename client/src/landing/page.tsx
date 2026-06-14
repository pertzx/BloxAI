import React from 'react';
import Link from 'next/link';
import { Bot, ArrowRight, Code, Zap, ShieldCheck } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Navbar */}
      <header className="flex items-center justify-between px-8 py-6 border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Bot className="w-8 h-8 text-blue-500" />
          <span className="text-2xl font-bold tracking-tight">Blox AI</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
          <a href="#features" className="hover:text-white transition">Features</a>
          <a href="#pricing" className="hover:text-white transition">Pricing</a>
          <Link href="/login" className="hover:text-white transition">Login</Link>
          <Link href="/login" className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg transition shadow-lg shadow-blue-900/20">
            Começar Grátis
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-32 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-sm font-semibold mb-8 border border-blue-500/20">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
          Roblox Studio Plugin v2.0 Live
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl leading-tight mb-6">
          O primeiro <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">Agente Autônomo</span> para Roblox.
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10 leading-relaxed">
          Você descreve em linguagem natural. O Blox analisa, planeja, escreve código, gera assets 3D e entrega funcionando direto no seu Workspace.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/login" className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl text-lg font-semibold transition shadow-xl shadow-blue-900/30">
            Acessar Dashboard <ArrowRight className="w-5 h-5" />
          </Link>
          <button className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-xl text-lg font-semibold transition border border-slate-700">
            Baixar Plugin
          </button>
        </div>
      </main>

      {/* Features */}
      <section id="features" className="py-24 bg-slate-900 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-3 gap-12">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 text-blue-400">
              <Code className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-3">Multi-Model Inteligente</h3>
            <p className="text-slate-400">Escolha entre DeepSeek, GPT-5.4 Mini ou Claude 3.5. O agente adapta o raciocínio e o custo à sua necessidade.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-6 text-cyan-400">
              <Zap className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-3">Fila Orquestrada</h3>
            <p className="text-slate-400">Nada de travar o Studio. O sistema enfileira comandos, executa um por vez e faz rollback automático se algo quebrar.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mb-6 text-green-400">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-3">100% Seguro</h3>
            <p className="text-slate-400">Análise de código automática bloqueia loadstrings e vulnerabilidades antes de aplicar no seu projeto.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
