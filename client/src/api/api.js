import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// Request: injeta token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("bloxai_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response: NÃO redireciona. Apenas limpa token em 401.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("bloxai_token");
      localStorage.removeItem("bloxai_user");
      window.dispatchEvent(new CustomEvent("bloxai:auth:logout"));
    }
    return Promise.reject(error);
  }
);

export default api;

export const authAPI = {
  login: (email, password) => api.post("/auth/login", { email, password }),
  register: (name, email, password, universeId) => 
    api.post("/auth/register", { name, email, password, universeId }),
  me: () => api.get("/auth/me"),
};

export const projectAPI = {
  list: () => api.get("/projects"),
  get: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post("/projects", data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
};

export const chatAPI = {
  send: (projectId, message, mode = "think") => 
    api.post("/chat", { projectId, message, mode }),
  stream: (projectId, message, mode = "think") => {
    const token = localStorage.getItem("bloxai_token");
    const url = `${API_URL}/chat/stream?projectId=${projectId}&message=${encodeURIComponent(message)}&mode=${mode}&token=${token}`;
    return new EventSource(url);
  },
  history: (projectId) => api.get(`/chat/history/${projectId}`),
};

export const commandAPI = {
  list: (projectId) => api.get(`/commands?projectId=${projectId}`),
  execute: (projectId, command, type) => 
    api.post("/commands", { projectId, command, type }),
  rollback: (commandId) => api.post(`/commands/${commandId}/rollback`),
};

export const syncAPI = {
  getTree: (projectId) => api.get(`/sync/tree/${projectId}`),
  updateTree: (projectId, tree) => api.post(`/sync/tree/${projectId}`, { tree }),
};

export const pluginAPI = {
  verify: (universeId, apiKey) => api.post("/plugin/verify", { universeId, apiKey }),
  heartbeat: (universeId) => api.post("/plugin/heartbeat", { universeId }),
};