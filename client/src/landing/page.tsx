import React from 'react';
import Link from 'next/link';
import { Bot, ArrowRight, Code2, Zap, ShieldCheck, Sparkles, Cpu, Layers3 } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen aurora-bg flex flex-col font-sans text-slate-100">

      {/* Navbar */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 glass border-b border-white/[0.07]">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,rgba(71,133,255,0.25),rgba(140,70,255,0.25))', border: '1px solid rgba(140,70,255,0.30)' }}
          >
            <Bot style={{ width: 17, height: 17, color: '#a78bfa' }} />
          </div>
          <span className="font-game text-[18px] text-white tracking-wide">Blox AI</span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <a href="#features" className="hover:text-white transition-colors duration-150">Features</a>
          <a href="#pricing"  className="hover:text-white transition-colors duration-150">Planos</a>
          <Link href="/login" className="hover:text-white transition-colors duration-150">Login</Link>
          <Link href="/login" className="btn-gradient text-sm py-2 px-5 rounded-xl">
            Começar Grátis
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-32 relative">

        {/* Orbe azul */}
        <div
          className="pointer-events-none absolute left-[30%] top-[45%] -translate-x-1/2 -translate-y-1/2 w-[500px] h-[260px] rounded-full opacity-25"
          style={{ background: 'radial-gradient(ellipse, #4785FF 0%, transparent 70%)', filter: 'blur(72px)' }}
        />
        {/* Orbe roxo */}
        <div
          className="pointer-events-none absolute left-[68%] top-[58%] -translate-x-1/2 -translate-y-1/2 w-[380px] h-[220px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(ellipse, #8C46FF 0%, transparent 70%)', filter: 'blur(72px)' }}
        />

        <div className="animate-fade-in relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-semibold mb-8">
            <span className="status-dot online" />
            Junte-se a mais de 4k de desenvolvedores.
          </div>

          <h1 className="font-game text-5xl md:text-[4.8rem] max-w-4xl leading-[1.12] mb-6 text-white mx-auto">
            O primeiro{' '}
            <span className="text-gradient-blue-purple">
              Agente Autônomo
            </span>
            {' '}para Roblox.
          </h1>

          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Você descreve em linguagem natural. O Blox analisa, planeja, escreve código,
            gera assets 3D e entrega funcionando direto no seu Workspace.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="btn-gradient text-base py-3.5 px-9 rounded-2xl font-bold"
              style={{ boxShadow: '0 8px 36px rgba(140,70,255,0.35), 0 0 0 1px rgba(140,70,255,0.2)' }}
            >
              Acessar Dashboard <ArrowRight className="w-4 h-4" />
            </Link>
            <button className="btn-secondary text-base py-3.5 px-8 rounded-2xl">
              Baixar Plugin
            </button>
          </div>
        </div>
      </main>

      {/* Features */}
      <section id="features" className="py-24 border-t border-white/[0.05]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-slate-400 text-xs font-medium mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              Recursos principais
            </div>
            <h2 className="font-game text-3xl md:text-4xl text-white tracking-wide">
              Tudo que você precisa para criar
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: <Code2 className="w-6 h-6" />,
                accent: { bg: 'rgba(71,133,255,0.10)', border: 'rgba(71,133,255,0.22)', color: '#7eb3ff', glow: 'rgba(71,133,255,0.12)' },
                title: 'Multi-Model Inteligente',
                description: 'Escolha entre DeepSeek, GPT-5.4 Mini ou Claude 3.5. O agente adapta o raciocínio e o custo à sua necessidade.',
              },
              {
                icon: <Zap className="w-6 h-6" />,
                accent: { bg: 'rgba(140,70,255,0.10)', border: 'rgba(140,70,255,0.22)', color: '#c084fc', glow: 'rgba(140,70,255,0.12)' },
                title: 'Fila Orquestrada',
                description: 'Nada de travar o Studio. O sistema enfileira comandos, executa um por vez e faz rollback automático se algo quebrar.',
              },
              {
                icon: <ShieldCheck className="w-6 h-6" />,
                accent: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.22)', color: '#34d399', glow: 'rgba(16,185,129,0.10)' },
                title: '100% Seguro',
                description: 'Análise de código automática bloqueia loadstrings e vulnerabilidades antes de aplicar no seu projeto.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="card p-8 group transition-all duration-300"
                style={{ '--hover-glow': f.accent.glow } as React.CSSProperties}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = f.accent.border;
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${f.accent.glow}`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = '';
                  (e.currentTarget as HTMLElement).style.boxShadow = '';
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110"
                  style={{ background: f.accent.bg, border: `1px solid ${f.accent.border}`, color: f.accent.color }}
                >
                  {f.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-3">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-t border-white/[0.05] py-14">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { label: 'Projetos criados', value: '2.4k+' },
            { label: 'Comandos executados', value: '180k+' },
            { label: 'Tokens processados', value: '12M+' },
            { label: 'Modelos disponíveis', value: '3' },
          ].map((s) => (
            <div key={s.label}>
              <div className="font-game text-3xl text-white mb-1">{s.value}</div>
              <div className="text-xs text-slate-500 uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 border-t border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-slate-400 text-xs font-medium mb-4">
              <Cpu className="w-3.5 h-3.5" />
              Planos
            </div>
            <h2 className="font-game text-3xl md:text-4xl text-white tracking-wide">Simples e transparente</h2>
            <p className="text-slate-400 mt-3 text-sm max-w-md mx-auto">Carregue créditos e pague apenas pelo que usar. Sem surpresas na fatura.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Prepaid */}
            <div className="card p-7 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(71,133,255,0.12)', border: '1px solid rgba(71,133,255,0.22)', color: '#7eb3ff' }}>
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-white text-base">Pré-pago</div>
                  <div className="text-xs text-slate-500">Créditos sob demanda</div>
                </div>
              </div>
              <ul className="space-y-2.5 text-sm text-slate-400 flex-1">
                {['Carregue qualquer valor', 'Pague por geração', 'Sem vencimento dos créditos', 'Acesso a todos os modelos'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-emerald-400 text-xs">✓</span> {item}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="btn-primary w-full justify-center py-2.5 rounded-xl text-sm mt-2">
                Começar <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Recorrente */}
            <div
              className="card p-7 flex flex-col gap-4 relative overflow-hidden"
              style={{ borderColor: 'rgba(140,70,255,0.28)', boxShadow: '0 0 40px rgba(140,70,255,0.10)' }}
            >
              <div className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: 'rgba(140,70,255,0.20)', color: '#c084fc', border: '1px solid rgba(140,70,255,0.30)' }}>
                Em breve
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(140,70,255,0.12)', border: '1px solid rgba(140,70,255,0.25)', color: '#c084fc' }}>
                  <Layers3 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-white text-base">Recorrente</div>
                  <div className="text-xs text-slate-500">Franquia mensal</div>
                </div>
              </div>
              <ul className="space-y-2.5 text-sm text-slate-400 flex-1">
                {['Cota mensal garantida', 'Gerador de Ideias Virais', 'Rollover de créditos', 'Suporte prioritário'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-violet-400 text-xs">✓</span> {item}
                  </li>
                ))}
              </ul>
              <button disabled className="btn-secondary w-full justify-center py-2.5 rounded-xl text-sm mt-2 opacity-50 cursor-not-allowed">
                Em breve
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.05] py-8 text-center text-sm text-slate-600">
        © {new Date().getFullYear()} Blox AI · Todos os direitos reservados.
      </footer>
    </div>
  );
}
