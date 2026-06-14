import { useState } from "react";
import { Link } from "react-router-dom";
import { 
  Zap, 
  ArrowRight, 
  Sparkles, 
  Shield, 
  Clock, 
  Code2, 
  Terminal,
  ChevronRight,
  Play
} from "lucide-react";

const FeatureCard = ({ icon: Icon, title, description }: { icon: any; title: string; description: string }) => (
  <div className="glass-card p-8">
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/20 flex items-center justify-center mb-6">
      <Icon className="w-6 h-6 text-primary" />
    </div>
    <h3 className="text-lg font-semibold text-white mb-3">{title}</h3>
    <p className="text-sm text-text-muted leading-relaxed">{description}</p>
  </div>
);

const StatItem = ({ value, label }: { value: string; label: string }) => (
  <div className="text-center">
    <div className="text-3xl lg:text-4xl font-bold gradient-text mb-2">{value}</div>
    <div className="text-sm text-text-muted">{label}</div>
  </div>
);

export default function LandingPage() {
  const [email, setEmail] = useState("");

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="aurora-bg" />
      <div className="noise-overlay" />

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-glow">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">BloxAI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="ghost-button text-sm py-2.5 px-5 hidden sm:inline-flex">
              Entrar
            </Link>
            <Link to="/register" className="glow-button text-sm py-2.5 px-5">
              Começar Grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-primary/20 mb-8 animate-fade-in">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-text-muted">Powered by IA Generativa</span>
          </div>
          
          <h1 className="text-5xl lg:text-6xl font-extrabold text-white mb-8 leading-tight text-balance animate-slide-up">
            Acabe com o <span className="gradient-text">Scripting Manual</span>
            <br />no Roblox Studio
          </h1>
          
          <p className="text-lg lg:text-xl text-text-muted max-w-2xl mx-auto mb-12 leading-relaxed text-balance animate-slide-up">
            A primeira plataforma SaaS de automação profissional para desenvolvimento de jogos no Roblox. 
            Deixe a IA cuidar da lógica complexa enquanto você foca na criatividade.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-slide-up">
            <Link to="/register" className="glow-button text-base py-4 px-8 flex items-center gap-2">
              <Play className="w-5 h-5" />
              Iniciar Projeto
            </Link>
            <button className="ghost-button text-base py-4 px-8 flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              Ver Demo
            </button>
          </div>

          {/* Hero Visual */}
          <div className="relative max-w-4xl mx-auto animate-fade-in">
            <div className="glass-strong rounded-3xl p-1 overflow-hidden">
              <div className="bg-background/80 rounded-[22px] p-6 lg:p-8 border border-border">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-3 h-3 rounded-full bg-error/80" />
                  <div className="w-3 h-3 rounded-full bg-warning/80" />
                  <div className="w-3 h-3 rounded-full bg-success/80" />
                  <div className="ml-4 px-3 py-1 rounded-lg bg-surface text-xs text-text-muted font-mono">
                    BloxAI Studio — Modo Think
                  </div>
                </div>
                <div className="space-y-3 font-mono text-sm">
                  <div className="flex gap-3">
                    <span className="text-primary">❯</span>
                    <span className="text-text-muted">Crie um sistema de inventário com UI drag-and-drop</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-secondary">✓</span>
                    <span className="text-text-subtle">Analisando árvore do Explorer...</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-secondary">✓</span>
                    <span className="text-text-subtle">Gerando estrutura de dados...</span>
                  </div>
                  <div className="pl-6 text-accent/80">
                    {`local Inventory = {}`}
                    <br />
                    {`function Inventory:DragItem(slot, target)`}
                    <br />
                    {`  -- Lógica otimizada gerada por IA`}
                    <br />
                    {`end`}
                  </div>
                  <div className="flex gap-3 animate-pulse">
                    <span className="text-primary">❯</span>
                    <span className="text-text-muted">Sincronizando com Roblox Studio...</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Glow effects */}
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 rounded-3xl blur-3xl -z-10 opacity-50" />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 px-6 border-y border-border">
        <div className="max-w-4xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-12">
          <StatItem value="10x" label="Mais Rápido" />
          <StatItem value="85%" label="Menos Código" />
          <StatItem value="50ms" label="Latência Média" />
          <StatItem value="∞" label="Escalabilidade" />
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
              Tudo que você precisa para <span className="gradient-text">escalar</span>
            </h2>
            <p className="text-text-muted max-w-xl mx-auto">
              Uma suite completa de ferramentas de IA integradas diretamente ao seu fluxo de trabalho no Roblox.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard 
              icon={Code2}
              title="Modo Think"
              description="Agente deliberativo com raciocínio profundo. Percebe, planeja e age com autocorreção automática baseada em logs."
            />
            <FeatureCard 
              icon={Zap}
              title="Modo Instant"
              description="Respostas ultra-rápidas para ajustes simples. Baixa latência e custo otimizado para tarefas do dia a dia."
            />
            <FeatureCard 
              icon={Shield}
              title="Rollback Inteligente"
              description="Snapshots automáticos antes de cada execução. Desfaça alterações da IA com um clique em caso de alucinações."
            />
            <FeatureCard 
              icon={Clock}
              title="Memória Híbrida"
              description="Janela deslizante + memória longa + resumos automáticos. Mantenha contexto sem custos explosivos."
            />
            <FeatureCard 
              icon={Terminal}
              title="Timeline de Auditoria"
              description="Registro completo de comandos com status [SUCCESS] ou [ERROR]. Debug transparente e rastreável."
            />
            <FeatureCard 
              icon={Sparkles}
              title="Streaming SSE"
              description="Veja o código sendo construído em tempo real. Experiência similar ao Gemini com latência percebida zero."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center glass-strong rounded-3xl p-12 lg:p-16 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/10 to-transparent" />
          <div className="relative z-10">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
              Pronto para revolucionar seu workflow?
            </h2>
            <p className="text-text-muted mb-10 max-w-lg mx-auto">
              Junte-se aos desenvolvedores que já estão construindo o futuro dos jogos no Roblox com IA.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-glass flex-1 text-center sm:text-left"
              />
              <Link to="/register" className="glow-button whitespace-nowrap flex items-center justify-center gap-2">
                Criar Conta
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            
            <p className="text-xs text-text-subtle mt-6">
              Sem cartão de crédito. Plano gratuito disponível.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">BloxAI</span>
          </div>
          <div className="flex items-center gap-8 text-sm text-text-muted">
            <a href="#" className="hover:text-text transition-colors">Termos</a>
            <a href="#" className="hover:text-text transition-colors">Privacidade</a>
            <a href="#" className="hover:text-text transition-colors">LGPD</a>
          </div>
          <p className="text-sm text-text-subtle">© 2026 BloxAI. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}