import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import LandingPage from './landing/page';
import LoginPage from './login/page';
import DashboardPage from './dashboard/page';
import AdminPage from './admin/page';
import IdeasPage from './ideas/page';
import SettingsPage from './settings/page';
import AuthCallbackPage from './auth/callback/page';
import VerifyEmailPage from './auth/verify-email/page';
import RecoverPage from './auth/recover/page';
import ProjectView from './project/[id]/page';

function ProjectRoute() {
  const params = useParams<{ id: string }>();
  if (!params.id) return <Navigate to="/dashboard" replace />;
  return <ProjectView params={{ id: params.id }} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      {/* /register redireciona para /login — autenticação é exclusivamente via Roblox */}
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
      <Route path="/auth/recover" element={<RecoverPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/ideas" element={<IdeasPage />} />
      <Route path="/project/:id" element={<ProjectRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
