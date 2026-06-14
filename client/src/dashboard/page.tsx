import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  Plus, 
  Search, 
  Clock, 
  Zap, 
  TrendingUp, 
  AlertCircle,
  ChevronRight,
  Terminal,
  Shield,
  MoreVertical,
  Loader2,
  RefreshCw
} from "lucide-react";
import { projectAPI, commandAPI } from "../api/api";

const ProjectCard = ({ project, onDelete }: { project: any; onDelete: (id: string) => void }) => (
  <div className="glass-card p-6 block group relative">
    <div className="flex items-start justify-between mb-4">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/20 flex items-center justify-center">
        <Terminal className="w-5 h-5 text-primary" />
      </div>
      <button 
        onClick={() => onDelete(project._id)}
        className="p-1.5 rounded-lg hover:bg-error/10 text-text-subtle hover:text-error opacity-0 group-hover:opacity-100 transition-all"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
    <Link to={`/project/${project._id}`}>
      <h3 className="text-base font-semibold text-white mb-1 hover:text-primary transition-colors">{project.name}</h3>
    </Link>
    <p className="text-xs text-text-subtle mb-4">ID: {project.universeId}</p>
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${project.status === "active" ? "bg-success" : "bg-warning"}`} />
        <span className="text-text-muted capitalize">{project.status || "active"}</span>
      </div>
      <span className="text-text-subtle">
        {project.lastEdit ? new Date(project.lastEdit).toLocaleDateString() : "Nunca"}
      </span>
    </div>
    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs">
      <span className="text-text-subtle">{project.tokensUsed?.toLocaleString() || "0"} tokens</span>
      <Link to={`/project/${project._id}`}>
        <ChevronRight className="w-4 h-4 text-text-subtle group-hover:text-primary transition-colors" />
      </Link>
    </div>
  </div>
);

const ActivityItem = ({ type, message, time, status }: { type: string; message: string; time: string; status: "success" | "error" | "warning" }) => {
  const icons = {
    success: <div className="w-2 h-2 rounded-full bg-success" />,
    error: <div className="w-2 h-2 rounded-full bg-error" />,
    warning: <div className="w-2 h-2 rounded-full bg-warning" />,
  };

  return (
    <div className="flex items-start gap-3 py-3">
      {icons[status]}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text truncate">{message}</p>
        <p className="text-xs text-text-subtle mt-0.5">{time}</p>
      </div>
      <span className="text-xs px-2 py-0.5 rounded-md bg-surface text-text-muted uppercase">{type}</span>
    </div>
  );
};

export default function DashboardPage() {
  const [projects, setProjects] = useState([]);
  const [commands, setCommands] = useState([]);
  const [stats, setStats] = useState({ projects: 0, tokens: 0, commands: 0, successRate: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError("");
      
      const projectsRes = await projectAPI.list();
      const projectsData = projectsRes.data || [];
      setProjects(projectsData);

      // Tenta carregar comandos, mas não quebra se der erro
      let commandsData = [];
      try {
        const commandsRes = await commandAPI.list("all");
        commandsData = commandsRes.data || [];
        setCommands(commandsData);
      } catch (e) {
        // Se /commands não existir, ignora silenciosamente
        console.warn("Endpoint /commands indisponível:", e);
      }

      const totalTokens = projectsData.reduce((acc: number, p: any) => acc + (p.tokensUsed || 0), 0);
      const totalCommands = commandsData.length;
      const successCommands = commandsData.filter((c: any) => c.status === "success").length;
      const successRate = totalCommands > 0 ? Math.round((successCommands / totalCommands) * 100) : 100;

      setStats({
        projects: projectsData.length,
        tokens: totalTokens,
        commands: totalCommands,
        successRate,
      });
    } catch (err: any) {
      setError(err.response?.data?.message || "Erro ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este projeto?")) return;
    try {
      await projectAPI.delete(id);
      setProjects((prev) => prev.filter((p: any) => p._id !== id));
    } catch (err: any) {
      alert(err.response?.data?.message || "Erro ao excluir projeto");
    }
  };

  const filteredProjects = projects.filter((p: any) => 
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.universeId?.includes(searchQuery)
  );

  const statItems = [
    { label: "Projetos", value: stats.projects.toString(), icon: Terminal, trend: "Total" },
    { label: "Tokens", value: stats.tokens >= 1000 ? `${(stats.tokens / 1000).toFixed(1)}k` : stats.tokens.toString(), icon: Zap, trend: "Usados" },
    { label: "Comandos", value: stats.commands.toLocaleString(), icon: TrendingUp, trend: "Exec." },
    { label: "Sucesso", value: `${stats.successRate}%`, icon: Shield, trend: "Taxa" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Dashboard</h1>
          <p className="text-text-muted">Visão geral dos seus projetos e consumo</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={loadDashboard}
            className="ghost-button p-3"
            title="Recarregar"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <Link to="/project/new" className="glow-button flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Novo Projeto
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-error/10 border border-error/20 text-error text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadDashboard} className="text-xs underline">Tentar novamente</button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statItems.map((stat) => (
          <div key={stat.label} className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs text-success font-medium bg-success/10 px-2 py-1 rounded-md">
                {stat.trend}
              </span>
            </div>
            <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
            <div className="text-sm text-text-muted">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Seus Projetos</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-glass pl-10 py-2 text-sm w-64"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {filteredProjects.map((project: any) => (
              <ProjectCard key={project._id} project={project} onDelete={handleDelete} />
            ))}
            <Link to="/project/new" className="glass border-dashed border-2 border-border hover:border-primary/30 hover:bg-primary/5 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-all min-h-[200px]">
              <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center">
                <Plus className="w-6 h-6 text-text-muted" />
              </div>
              <span className="text-sm text-text-muted font-medium">Criar novo projeto</span>
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold text-white">Uso de Tokens</h3>
              <span className="text-xs text-text-muted">Plano Atual</span>
            </div>
            <div className="relative h-2 bg-surface rounded-full overflow-hidden mb-3">
              <div 
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-secondary rounded-full transition-all"
                style={{ width: `${Math.min((stats.tokens / 100000) * 100, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs mb-4">
              <span className="text-text-muted">{stats.tokens.toLocaleString()} / 100k</span>
              <span className="text-primary font-medium">{Math.round((stats.tokens / 100000) * 100)}%</span>
            </div>
            {(stats.tokens / 100000) > 0.75 && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-warning/5 border border-warning/20">
                <AlertCircle className="w-4 h-4 text-warning shrink-0" />
                <p className="text-xs text-warning/80">Alerta: 75% ativa travas automáticas</p>
              </div>
            )}
          </div>

          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Atividade Recente</h3>
              <Clock className="w-4 h-4 text-text-subtle" />
            </div>
            <div className="divide-y divide-border">
              {commands.length > 0 ? commands.slice(0, 4).map((cmd: any) => (
                <ActivityItem 
                  key={cmd._id}
                  type={cmd.mode || "think"}
                  message={cmd.command || "Comando executado"}
                  time={cmd.createdAt ? new Date(cmd.createdAt).toLocaleString() : "Agora"}
                  status={cmd.status === "success" ? "success" : cmd.status === "error" ? "error" : "warning"}
                />
              )) : (
                <p className="text-sm text-text-subtle py-4 text-center">Nenhuma atividade recente</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}