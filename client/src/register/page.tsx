import { useState } from "react";
import { Link } from "react-router-dom";
import { Zap, Eye, EyeOff, ArrowRight, Check, Github, Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", password: "", universeId: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const requirements = [
    { label: "Mínimo 8 caracteres", met: form.password.length >= 8 },
    { label: "Letra maiúscula", met: /[A-Z]/.test(form.password) },
    { label: "Número", met: /\d/.test(form.password) },
    { label: "Caractere especial", met: /[!@#$%^&*]/.test(form.password) },
  ];

  const allRequirementsMet = requirements.every((r) => r.met);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await register(form.name, form.email, form.password, form.universeId);
    } catch (err: any) {
      setError(err.response?.data?.message || "Erro ao criar conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="aurora-bg" />
      <div className="noise-overlay" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-glow mx-auto mb-6">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Criar conta</h1>
          <p className="text-text-muted text-sm">Comece a automatizar seu desenvolvimento</p>
        </div>

        <div className="glass-strong p-8">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
              {error}
            </div>
          )}

          {/* Steps */}
          <div className="flex items-center gap-3 mb-8">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step >= 1 ? "bg-primary text-white" : "bg-surface text-text-muted"}`}>
              1
            </div>
            <div className={`flex-1 h-0.5 rounded-full transition-colors ${step >= 2 ? "bg-primary" : "bg-border"}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step >= 2 ? "bg-primary text-white" : "bg-surface text-text-muted"}`}>
              2
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {step === 1 ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">Nome completo</label>
                  <input
                    type="text"
                    placeholder="Seu nome"
                    className="input-glass"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">Email</label>
                  <input
                    type="email"
                    placeholder="dev@roblox.com"
                    className="input-glass"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">Senha</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="input-glass pr-12"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {requirements.map((req) => (
                      <div key={req.label} className={`flex items-center gap-1.5 text-xs ${req.met ? "text-success" : "text-text-subtle"}`}>
                        <Check className={`w-3.5 h-3.5 ${req.met ? "opacity-100" : "opacity-40"}`} />
                        {req.label}
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => allRequirementsMet && setStep(2)}
                  disabled={!allRequirementsMet}
                  className="glow-button w-full justify-center flex items-center gap-2 disabled:opacity-40"
                >
                  Continuar
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">Universe ID do Roblox</label>
                  <input
                    type="text"
                    placeholder="123456789"
                    className="input-glass"
                    value={form.universeId}
                    onChange={(e) => setForm({ ...form, universeId: e.target.value })}
                    required
                  />
                  <p className="text-xs text-text-subtle mt-2">
                    Encontre em Game Settings {'>'} Basic Info no Roblox Studio
                  </p>
                </div>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="glow-button w-full justify-center flex items-center gap-2 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {loading ? "Criando..." : "Criar conta e conectar"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="ghost-button w-full text-sm"
                >
                  Voltar
                </button>
              </>
            )}
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-background text-text-subtle">ou</span>
            </div>
          </div>

          <button className="ghost-button w-full justify-center flex items-center gap-2 text-sm">
            <Github className="w-5 h-5" />
            GitHub
          </button>
        </div>

        <p className="text-center text-sm text-text-muted mt-8">
          Já tem uma conta?{" "}
          <Link to="/login" className="text-primary hover:text-primary-hover font-medium transition-colors">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}