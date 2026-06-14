import { Routes, Route, Navigate, useLocation, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  FolderKanban, 
  MessageSquare, 
  Settings, 
  LogOut, 
  Zap, 
  Menu,
  Loader2
} from "lucide-react";
import { useAuth } from "./hooks/useAuth";
import LandingPage from "./landing/page";
import LoginPage from "./login/page";
import RegisterPage from "./register/page";
import DashboardPage from "./dashboard/page";
import ProjectPage from "./project/[id]/page";

const Sidebar = ({ isOpen, onClose, user, onLogout }: { 
  isOpen: boolean; 
  onClose: () => void; 
  user: any;
  onLogout: () => void;
}) => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/projects", icon: FolderKanban, label: "Projetos" },
    { path: "/chat", icon: MessageSquare, label: "Chat IA" },
    { path: "/settings", icon: Settings, label: "Configurações" },
  ];

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed lg:sticky top-0 left-0 z-50 h-screen w-72 glass-strong border-r border-border
        flex flex-col transition-transform duration-300 ease-out
        ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        {/* Logo */}
        <div className="p-6 border-b border-border">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-glow">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">BloxAI</h1>
              <p className="text-2xs text-text-subtle uppercase tracking-wider">SaaS Edition</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={`nav-item ${isActive(item.path) ? "active" : ""}`}
            >
              <item.icon className="w-[18px] h-[18px]" strokeWidth={2} />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* User / Logout */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/20 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name || "Usuário"}</p>
              <p className="text-xs text-text-subtle truncate">{user?.plan || "Free"}</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="nav-item w-full text-error/70 hover:text-error hover:bg-error/10"
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={2} />
            <span className="text-sm font-medium">Sair</span>
          </button>
        </div>
      </aside>
    </>
  );
};

const Navbar = ({ onMenuClick }: { onMenuClick: () => void }) => {
  const location = useLocation();
  const isProject = location.pathname.startsWith("/project/");

  return (
    <header className="sticky top-0 z-30 glass border-b border-border px-6 py-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <button 
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg hover:bg-surface transition-colors"
          >
            <Menu className="w-5 h-5 text-text-muted" />
          </button>
          <div className="hidden sm:flex items-center gap-2 text-sm text-text-muted">
            <span>BloxAI</span>
            <span className="text-border-strong">/</span>
            <span className="text-text">{isProject ? "Projeto" : "Workspace"}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs text-text-muted font-medium">Sistema Online</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/20 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">U</span>
          </div>
        </div>
      </div>
    </header>
  );
};

const AppLayout = ({ children, user, onLogout }: { 
  children: React.ReactNode; 
  user: any;
  onLogout: () => void;
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
        user={user}
        onLogout={onLogout}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto animate-slide-up">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

const ProtectedRoute = ({ children, user, onLogout }: { 
  children: React.ReactNode; 
  user: any;
  onLogout: () => void;
}) => {
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout user={user} onLogout={onLogout}>{children}</AppLayout>;
};

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-glow animate-pulse">
        <Zap className="w-6 h-6 text-white" />
      </div>
      <p className="text-text-muted text-sm">Carregando...</p>
    </div>
  </div>
);

function App() {
  const { user, loading, logout, isAuth } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <>
      <div className="aurora-bg" />
      <div className="noise-overlay" />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={isAuth ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route path="/register" element={isAuth ? <Navigate to="/dashboard" replace /> : <RegisterPage />} />
        <Route path="/dashboard" element={<ProtectedRoute user={user} onLogout={logout}><DashboardPage /></ProtectedRoute>} />
        <Route path="/project/:id" element={<ProtectedRoute user={user} onLogout={logout}><ProjectPage /></ProtectedRoute>} />
        <Route path="/projects" element={<ProtectedRoute user={user} onLogout={logout}><div className="text-center py-20 text-text-muted">Página de projetos em construção</div></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute user={user} onLogout={logout}><div className="text-center py-20 text-text-muted">Chat global em construção</div></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute user={user} onLogout={logout}><div className="text-center py-20 text-text-muted">Configurações em construção</div></ProtectedRoute>} />
      </Routes>
    </>
  );
}

export default App;