import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import LandingPage from './landing/page';
import LoginPage from './login/page';
import RegisterPage from './register/page';
import DashboardPage from './dashboard/page';
import ProjectView from './project/[id]/page';

function ProjectRoute() {
  const params = useParams<{ id: string }>();
  if (!params.id) {
    return <Navigate to="/dashboard" replace />;
  }

  return <ProjectView params={{ id: params.id }} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/project/:id" element={<ProjectRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
