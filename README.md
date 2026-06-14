/BloxAI
├── /Backend (node + express)
│   ├── /src
│   │   ├── /ai
│   │   │   ├── AgentOrchestrator.js      # Orquestra Think vs Instant
│   │   │   └── ModelRouter.js            # Roteamento de modelos LLM
│   │   ├── /config
│   │   │   ├── db.js                     # Conexão MongoDB
│   │   │   └── env.js                    # Variáveis de ambiente
│   │   ├── /controllers
│   │   │   ├── authController.js         # Auth JWT (register/login/me)
│   │   │   ├── chatController.js         # REST + SSE streaming
│   │   │   ├── commandController.js      # CRUD + rollback
│   │   │   ├── pluginController.js       # Endpoints do plugin Luau
│   │   │   ├── projectController.js      # Gestão de projetos por UniverseId
│   │   │   └── syncController.js         # Sincronização Explorer tree
│   │   ├── /middlewares
│   │   │   └── auth.js                   # JWT verification middleware
│   │   ├── /models
│   │   │   ├── Command.js                # Schema (status, snapshot, rollback)
│   │   │   ├── Project.js                # Schema (UniverseId, tree, tokensUsed)
│   │   │   └── User.js                   # Schema (plan, tokensUsed, projects)
│   │   ├── /routes
│   │   │   ├── authRoutes.js             # POST /login, /register | GET /me
│   │   │   ├── chatRoutes.js             # POST / | GET /stream | GET /history/:id
│   │   │   ├── commandRoutes.js          # GET / | POST / | POST /:id/rollback
│   │   │   ├── pluginRoutes.js           # Plugin endpoints
│   │   │   ├── projectRoutes.js          # CRUD projetos
│   │   │   └── syncRoutes.js             # GET /tree/:id | POST /tree/:id
│   │   ├── /services
│   │   │   └── CommandQueue.js           # Fila de execução + snapshots
│   │   ├── app.js                        # Config Express + rotas
│   │   └── index.js                      # Entry point
│   ├── .env                              # Variáveis de ambiente
│   ├── package.json
│   └── package-lock.json
│
├── /client (react + vite + tailwind + typescript)
│   ├── /src
│   │   ├── /api
│   │   │   └── api.js                    # Axios client + interceptors + APIs
│   │   ├── /hooks
│   │   │   └── useAuth.js                # Hook de autenticação (login/register/logout/me)
│   │   ├── /dashboard
│   │   │   └── page.tsx                  # Dashboard com stats, projetos, atividade
│   │   ├── /landing
│   │   │   └── page.tsx                  # Landing page premium (hero, features, CTA)
│   │   ├── /login
│   │   │   └── page.tsx                  # Login com API real + glassmorphism
│   │   ├── /project
│   │   │   └── /[id]
│   │   │       └── page.tsx              # Workspace: chat real + SSE + Explorer
│   │   ├── /register
│   │   │   └── page.tsx                  # Registro em 2 etapas + API real
│   │   ├── /shims
│   │   │   ├── next-link.tsx             # Compat Next.js
│   │   │   └── next-navigation.tsx       # Compat Next.js
│   │   ├── App.tsx                       # Layout: Sidebar + Navbar + Router + Auth guard
│   │   ├── index.css                     # Design system: glassmorphism, tokens, animações
│   │   └── main.tsx                      # Entry point React + BrowserRouter
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js                # Design tokens customizados
│   ├── tsconfig.json
│   └── package.json
│
└── /plugin (luau)
    ├── /Auth
    │   └── AuthManager.lua               # Auth com backend via UniverseId
    ├── /Core
    │   ├── AssetImporter.lua             # Importação de assets
    │   ├── CommandExecutor.lua           # Executor de comandos da IA
    │   ├── HttpClient.lua                # Comunicação HTTP com backend
    │   ├── InstanceManager.lua           # CRUD de Instances no Explorer
    │   ├── ScriptManager.lua             # Criação/edição de scripts Luau
    │   ├── StateSync.lua                 # Sincronização de estado bidirecional
    │   ├── UIManager.lua                 # UI nativa do plugin
    │   └── Workspace3D.lua               # Manipulação 3D do workspace
    ├── /UI
    │   └── ChatWindow.lua                # Janela de chat dentro do Studio
    ├── /Utils
    │   ├── Logger.lua                    # Logs estruturados
    │   └── Config.lua                    # Configurações do plugin
    └── init.server.lua                   # Entry point do plugin