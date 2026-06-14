import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { authAPI } from "../api/api";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Verifica auth ao montar
  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      const token = localStorage.getItem("bloxai_token");
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const res = await authAPI.me();
        if (!cancelled) {
          setUser(res.data);
          localStorage.setItem("bloxai_user", JSON.stringify(res.data));
        }
      } catch (err) {
        // Se der erro (401, 404, network), apenas limpa. NÃO redireciona sozinho.
        localStorage.removeItem("bloxai_token");
        localStorage.removeItem("bloxai_user");
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkAuth();
    return () => { cancelled = true; };
  }, []);

  // Escuta evento de logout global (do interceptor 401)
  useEffect(() => {
    const handleLogout = () => {
      setUser(null);
      // Só redireciona se NÃO estiver em /login ou /register
      const path = window.location.pathname;
      if (path !== "/login" && path !== "/register") {
        navigate("/login", { replace: true });
      }
    };

    window.addEventListener("bloxai:auth:logout", handleLogout);
    return () => window.removeEventListener("bloxai:auth:logout", handleLogout);
  }, [navigate]);

  const login = useCallback(async (email, password) => {
    const res = await authAPI.login(email, password);
    const { token, user: userData } = res.data;
    localStorage.setItem("bloxai_token", token);
    localStorage.setItem("bloxai_user", JSON.stringify(userData));
    setUser(userData);
    navigate("/dashboard", { replace: true });
    return userData;
  }, [navigate]);

  const register = useCallback(async (name, email, password, universeId) => {
    const res = await authAPI.register(name, email, password, universeId);
    const { token, user: userData } = res.data;
    localStorage.setItem("bloxai_token", token);
    localStorage.setItem("bloxai_user", JSON.stringify(userData));
    setUser(userData);
    navigate("/dashboard", { replace: true });
    return userData;
  }, [navigate]);

  const logout = useCallback(() => {
    localStorage.removeItem("bloxai_token");
    localStorage.removeItem("bloxai_user");
    setUser(null);
    navigate("/login", { replace: true });
  }, [navigate]);

  return { user, loading, login, register, logout, isAuth: !!user };
}