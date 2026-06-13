# Blox AI
## Documentação Completa do Produto — Visão, Arquitetura e Implementação

**Versão:** 2.0  
**Data:** 2026-06-06  
**Status:** Especificação Final para Desenvolvimento

---

## Sumário

1. [Visão do Produto](#1-visão-do-produto)
2. [Arquitetura de Alto Nível](#2-arquitetura-de-alto-nível)
3. [Plugin (Roblox Studio)](#3-plugin-roblox-studio)
4. [Backend (SaaS)](#4-backend-saas)
5. [Frontend (Dashboard Web)](#5-frontend-dashboard-web)
6. [Sistema Multi-Model](#6-sistema-multi-model)
7. [Sistema de Agendamento](#7-sistema-de-agendamento)
8. [Features Avançadas](#8-features-avançadas)
9. [Segurança](#9-segurança)
10. [Modelo de Negócio](#10-modelo-de-negócio)
11. [Roadmap](#11-roadmap)

---

## 1. Visão do Produto

### 1.1 O Que É

Blox AI é um **SaaS + Plugin para Roblox Studio** que coloca um **agente de IA autônomo** dentro do projeto do desenvolvedor. O agente não é um chatbot — ele **lê o projeto inteiro, escreve código, manipula objetos no Workspace, gera assets 3D e publica no Roblox**.

### 1.2 Promessa

> "Você descreve o que quer em linguagem natural. O Blox analisa seu projeto, planeja, escreve o código, cria os objetos, testa e entrega funcionando no Studio."

### 1.3 Diferencial

| Concorrente | O que fazem | O que o Blox faz melhor |
|-------------|-------------|----------------------------------|
| **Roblox Assistant (nativo)** | Sugere código, gera meshes básicos | Nosso agente é **cross-platform** (funciona fora do Studio via web/mobile), tem **memória persistente**, **multi-agent** e **multi-model** |
| **Ropanion** | Plugin com multi-provider, workspace awareness | Nós somos **SaaS cloud-native** com **playtesting real**, **geração de assets**, **colaboração em equipe** e **sistema de agendamento** |
| **SuperbulletAI / WEPPY** | Geração de scripts e mundos | Não só geramos — **executamos, testamos e corrigimos** em loop autônomo com **fila orquestrada** |

### 1.4 Público-Alvo

- **Iniciantes**: Criam primeiro jogo em 10 minutos sem saber programar
- **Indie devs**: Prototipam 5x mais rápido
- **Studios profissionais**: Automatizam tarefas repetitivas, review de código, QA

---

## 2. Arquitetura de Alto Nível

### 2.1 Os Três Pilares

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Web)                                  │
│  Dashboard do usuário — visão global, controle e monitoramento             │
│  • Autenticação e gerenciamento de API Keys                                  │
│  • Visualização em tempo real do estado dos projetos                         │
│  • Interface de chat alternativa (fora do Studio)                            │
│  • Histórico de ações, logs e métricas de uso                                │
│  • Seleção de modelo de IA (DeepSeek, GPT-4o, Gemini, Kimi, Claude)          │
└──────────────────────────────┬────────────────────────────────────────────────┘
                               │ HTTPS / WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (SaaS)                                  │
│  Orquestrador central — cérebro do sistema                                   │
│  • Recebe sincronizações de estado do Plugin                                 │
│  • Gerencia múltiplas IAs (Multi-Model: DeepSeek, GPT, Gemini, Kimi, Claude)│
│  • Multi-Agent: Planner, Coder, Reviewer, Game Designer, etc.               │
│  • Processa comandos, gera planos de ação e valida segurança                 │
│  • Sistema de agendamento com fila orquestrada                               │
│  • Persistência de dados, memória vetorial, filas e cache                    │
└──────────────────────────────┬────────────────────────────────────────────────┘
                               │ HTTPS / REST / JSON
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PLUGIN (Roblox Studio)                          │
│  Agente local — braços e olhos da IA dentro do editor                        │
│  • Sincroniza o estado completo do DataModel com o Backend                   │
│  • Expõe API interna de funções executáveis para a IA                        │
│  • Recebe comandos estruturados e executa ações no Workspace                 │
│  • Autenticação segura via OAuth com persistência de sessão                │
│  • Consome fila de comandos — um por vez, nunca tudo de uma vez             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Fluxo de Dados em 3 Vias

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   PLUGIN    │      │   BACKEND   │      │  FRONTEND   │
│  (Studio)   │◄────►│   (SaaS)    │◄────►│   (Web)     │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                    │
       │ ① SYNC             │ ② REQUEST          │
       │ (diffs do jogo)    │ (pedidos do user)  │
       │                    │                    │
       │◄───────────────────│ ③ COMMAND DISPATCH │
       │  (comandos         │  (1 por vez,        │
       │   agendados)       │   fila orquestrada) │
```

**Via ① — Plugin → Server:** Sincronização de estado (diffs, não o jogo inteiro)  
**Via ② — Front → Server:** Pedidos de alteração (chat, aprovações, configurações)  
**Via ③ — Server → Plugin:** Envio de comandos agendados (um por vez, com retry e rollback)

---

## 3. Plugin (Roblox Studio)

### 3.1 Responsabilidade

O Plugin é o **executor local** e o **sensor** do sistema. Ele **não pensa** — ele **enxerga** e **faz**.

### 3.2 O Que Faz

| Função | Descrição |
|--------|-----------|
| **Sincronização** | Escaneia o DataModel, detecta mudanças, envia diffs pro Backend |
| **API de Funções** | Expõe funções que a IA pode chamar: criar/editar scripts, criar instances, mover parts, gerenciar UI, inserir assets |
| **Execução** | Recebe comandos JSON do Backend e executa fisicamente no Studio |
| **Autenticação** | OAuth via navegador, token salvo no ServerStorage criptografado |
| **Consumo de Fila** | Consome comandos um por vez, reporta resultado, pega o próximo |

### 3.3 Estrutura de Arquivos

```
BloxPlugin/
├── init.server.lua              ← Entry point (Script)
├── Config.lua                   ← URL da API, versão, flags
│
├── UI/
│   ├── ChatWindow.lua           ← Janela de chat no Studio
│   ├── DiffViewer.lua           ← Mostra antes/depois de scripts
│   ├── StatusBar.lua            ← Status da fila, sync, conexão
│   └── ConfirmationDialog.lua   ← Pede confirmação para ações destrutivas
│
├── Core/
│   ├── HttpClient.lua           ← Comunicação HTTPS com Backend
│   ├── StateSync.lua            ← Detecta mudanças e envia diffs
│   ├── CommandExecutor.lua      ← Consome fila e executa comandos
│   ├── ScriptManager.lua        ← Cria/edita/deleta scripts
│   ├── InstanceManager.lua      ← Cria/edita/deleta qualquer Instance
│   ├── Workspace3D.lua          ← Manipula Parts, Models, posições
│   ├── UIManager.lua            ← Cria ScreenGuis e elementos UI
│   ├── AssetImporter.lua        ← Insere assets por ID no Workspace
│   └── SelectionService.lua     ← Seleciona/foca objetos no Explorer
│
├── Auth/
│   └── AuthManager.lua          ← OAuth, tokens, refresh, ServerStorage
│
└── Utils/
    ├── Logger.lua               ← Logs estruturados
    └── Helpers.lua              ─ Funções utilitárias
```

### 3.4 Autenticação (OAuth + ServerStorage)

```
Usuário clica "Conectar" no Plugin
        │
        ▼
Plugin pede device_code pro Backend
        │
        ▼
Backend gera URL única de autorização
        │
        ▼
Plugin mostra: "Abra esse link no navegador"
        │
        ▼
Usuário loga no site e autoriza
        │
        ▼
Backend emite access_token + refresh_token
        │
        ▼
Plugin salva no ServerStorage (criptografado)
        │
        ▼
Próxima abertura do Studio → auto-login com refresh_token
```

**Por que ServerStorage?** Invisível no Explorer por padrão, não aparece em commits, persiste enquanto o Studio está aberto.

### 3.5 Sincronização de Estado (Diff Inteligente)

O Plugin **não envia o jogo inteiro**. Ele envia apenas o que mudou:

| Tipo | Quando Envia | Conteúdo |
|------|-------------|----------|
| **Heartbeat** | A cada 30s | `projectId + hash do estado` |
| **Diff estrutural** | Cria/deleta/move | `path, action, className, name` |
| **Diff de script** | Source alterado | `path, hash, linesChanged` |
| **Diff de propriedade** | PropertyChanged | `path, property, old, new` |
| **Snapshot completo** | Primeira conexão | Árvore compactada |

Usa `DescendantAdded`, `DescendantRemoving`, `PropertyChangedSignal` — sem polling pesado.

### 3.6 API de Funções (O Vocabulário da IA)

```lua
-- CATEGORIA: SCRIPT MANAGEMENT
ScriptManager.Create(scriptType, parentPath, name, source)
ScriptManager.Edit(targetPath, operation, newSource, lineRange)
ScriptManager.Delete(targetPath)
ScriptManager.Rename(targetPath, newName)

-- CATEGORIA: INSTANCES
InstanceManager.Create(className, parentPath, name, properties)
InstanceManager.SetProperty(targetPath, property, value)
InstanceManager.Reparent(targetPath, newParentPath)
InstanceManager.Delete(targetPath)

-- CATEGORIA: WORKSPACE 3D
Workspace3D.CreatePart(shape, position, size, properties)
Workspace3D.MoveTo(targetPath, newPosition)
Workspace3D.Rotate(targetPath, rotation)

-- CATEGORIA: UI
UIManager.CreateScreenGui(name, parent, properties)
UIManager.CreateElement(className, parentPath, name, properties)

-- CATEGORIA: ASSETS
AssetImporter.InsertById(assetId, parentPath, position)
```

### 3.7 Consumo da Fila de Comandos

```lua
-- O Plugin consome UM comando por vez
while true do
    local command = fetchNextCommand()  -- Pede próximo da fila
    if command then
        showStatus("Executando: " .. command.action .. " (" .. command.index .. "/" .. command.total .. ")")

        local success, result = pcall(function()
            return execute(command)  -- Executa a função
        end)

        reportResult(command.id, { success = success, data = result })
        -- Só depois de reportar, pega o próximo
    end
    wait(0.5)  -- Throttle: 500ms entre comandos
end
```

**Por que um por vez?**
- Script 2 depende do Script 1 existir
- Se comando 3 quebrar, pode parar sem bagunçar o resto
- Studio trava com 50 ações simultâneas
- Undo funciona granularmente (1 waypoint por comando)

---

## 4. Backend (SaaS)

### 4.1 Responsabilidade

O Backend é o **cérebro** do sistema. Ele recebe o estado do jogo, processa intenções do usuário, orquestra IAs, gera planos de ação estruturados e devolve comandos precisos para o Plugin executar.

### 4.2 Componentes Principais

```
Backend (Node.js + Express)
│
├── API Gateway
│   ├── Auth (JWT + OAuth2 Roblox)
│   ├── Rate Limiting
│   └── WebSocket para streaming
│
├── Model Router (Multi-Model)
│   ├── DeepSeek (padrão)
│   ├── GPT-4o
│   ├── Gemini 2.5
│   ├── Kimi K2.6
│   ├── Claude 3.5
│   └── Local (Ollama)
│
├── Multi-Agent Orchestrator
│   ├── Supervisor Agent
│   ├── Planner Agent
│   ├── Coder Agent
│   ├── Game Designer Agent
│   ├── UI Designer Agent
│   ├── Performance Engineer Agent
│   ├── Monetization Advisor Agent
│   └── Reviewer Agent
│
├── Command Scheduler (Fila)
│   ├── Enfileiramento com prioridade
│   ├── Dependências entre comandos
│   ├── Retry automático (3x)
│   ├── Rollback em caso de falha
│   └── Throttle (1 comando por vez no Plugin)
│
├── State Manager
│   ├── Recebe diffs do Plugin
│   ├── Mantém snapshot atualizado
│   └── Detecta divergências (hash)
│
├── Memory System
│   ├── Project Memory (Pinecone vector store)
│   ├── User Memory (preferências, erros)
│   └── Asset Memory (AssetIDs reutilizáveis)
│
├── Security
│   ├── Code Analyzer (detecta vulnerabilidades)
│   ├── Audit Trail (log de todas as ações)
│   └── Sanitização de comandos
│
└── Integrations
    ├── Roblox Open Cloud API (upload assets, publish)
    ├── Creator Hub Analytics
    ├── GitHub/GitLab (commits, PRs)
    └── Meshy.ai / Rodin (geração 3D)
```

### 4.3 Tecnologias

| Componente | Tecnologia |
|-----------|-----------|
| Runtime | Node.js 20+ |
| Framework | Express.js / Fastify |
| Banco Relacional | PostgreSQL (Supabase/Neon) |
| Banco Vetorial | Pinecone |
| Cache / Fila | Redis (Upstash) |
| Fila de Jobs | BullMQ |
| WebSocket | Socket.io |
| Auth | JWT + OAuth2 |
| Hosting | Railway / Render / Fly.io |
| Storage | Cloudflare R2 / AWS S3 |

---

## 5. Frontend (Dashboard Web)

### 5.1 Tela Inicial — Lista de Projetos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🏠 Blox AI    [🔍 Buscar...]    [➕ Novo Projeto]    [👤 Perfil]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Meus Projetos                                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 🟢 OakForest              │  🟢 Online │ Sync: 2s │ 12 itens        │    │
│  │    Place ID: 123456789    │  Última atividade: 5 min atrás         │    │
│  │    [Abrir] [Config] [🗑]  │                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 🟡 CyberCity RPG          │  🟡 Atrasado │ 45 itens                │    │
│  │    Place ID: 987654321    │  Última atividade: 2h atrás            │    │
│  │    [Abrir] [Config] [🗑]  │                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Tela de Projeto (Ao Clicar em "Abrir")

Quando o usuário clica em um projeto, a tela se transforma em um **ambiente de desenvolvimento completo**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🏠 Blox AI    [🔍 Buscar...]    [⚙️ Config]    [👤 Perfil ▼]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌─────────────────────────────────────────────────────┐  │
│  │  SIDEBAR     │  │           ÁREA PRINCIPAL DO PROJETO                │  │
│  │  NAVEGAÇÃO   │  │                                                      │  │
│  │              │  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  🗂️ Projeto  │  │ │  EXPLORER SINCRONIZADO  │  CHAT UNIVERSAL      │ │  │
│  │     OakForest│  │ │  (Árvore do DataModel)   │  (Conversa com IA)   │ │  │
│  │              │  │ │                          │                      │ │  │
│  │  📁 Explorer │  │ │  ▼ Workspace             │  [IA]: Olá! O que    │ │  │
│  │  💬 Chat     │  │ │    ▼ Terrain             │      vamos construir  │ │  │
│  │  📋 Fila     │  │ │    ▼ SpawnLocation       │      hoje?            │ │  │
│  │  📊 Estado   │  │ │  ▼ ServerScriptService   │                      │ │  │
│  │  🎬 Replay   │  │ │    ▼ Systems             │  [Vocé]: Crie um      │ │  │
│  │  ⚙️ Config   │  │ │      ▶ InventoryService  │      sistema de       │ │  │
│  │              │  │ │      ▶ DataService       │      inventário       │ │  │
│  │  ──────────  │  │ │  ▼ StarterGui            │                      │ │  │
│  │  🟢 Online   │  │ │    ▼ MainMenu            │  [IA]: Analisando...  │ │  │
│  │  Studio: ON  │  │ │      ▶ PlayButton        │  ┌─────────────────┐ │  │
│  │  Sync: 3s    │  │ │      ▶ SettingsFrame     │  │ ⏳ Agendamentos  │ │  │
│  │  Player: ON  │  │ │                          │  │ pendentes: 3      │ │  │
│  │              │  │ │  [🔄 Sync manual]         │  │ □ Criar script    │ │  │
│  │              │  │ │  [📥 Download .rbxm]      │  │ □ Criar UI        │ │  │
│  │              │  │ │                          │  │ □ Conectar dados  │ │  │
│  │              │  │ └─────────────────────────────────────────────────┘ │  │
│  │              │  │                                                      │  │
│  │              │  │  ┌─────────────────────────────────────────────────┐   │  │
│  │              │  │  │         PAINEL DE DETALHES / PREVIEW            │   │  │
│  │              │  │  │                                                  │   │  │
│  │              │  │  │  Quando clica em um script:                      │   │  │
│  │              │  │  │  ┌─────────────────────────────────────────────┐   │   │  │
│  │              │  │  │  │ function getPlayerData(player)               │   │   │  │
│  │              │  │  │  │   local data = cache[player.UserId]          │   │   │  │
│  │              │  │  │  │   if not data then                           │   │   │  │
│  │              │  │  │  │     data = DataStore:GetAsync(...)            │   │   │  │
│  │              │  │  │  │   end                                         │   │   │  │
│  │              │  │  │  │   return data                                 │   │   │  │
│  │              │  │  │  │ end                                           │   │   │  │
│  │              │  │  │  └─────────────────────────────────────────────┘   │   │  │
│  │              │  │  │                                                  │  │
│  │              │  │  │  Quando clica em uma Part:                       │  │
│  │              │  │  │  Position: 0, 10, 0  │  Size: 10, 1, 10         │  │
│  │              │  │  │  Color: [🟫] 120, 80, 50  │  Material: Wood    │  │
│  │              │  │  │  [Editar no Studio] [Focar] [Deletar]            │  │
│  │              │  │  └─────────────────────────────────────────────────┘   │  │
│  └──────────────┘  └─────────────────────────────────────────────────────┘  │
│                                                                             │
│  Status Bar: 🟢 Studio conectado │ Última sync: 2s │ 3 comandos na fila   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Áreas da Tela de Projeto

| Área | O que Mostra | Interatividade |
|------|-------------|----------------|
| **Explorer Sincronizado** | Árvore do DataModel em tempo real | Clique = detalhes, Duplo = foca no Studio, Arrasta = reparenta |
| **Chat Universal** | Conversa com IA (mesmo histórico do Studio) | Mensagens ricas: planos, diffs, status, erros |
| **Agendamentos** | Fila de comandos pendentes/executando/concluídos | Arrastar para reordenar, Pausar, Retry, Rollback |
| **Painel de Detalhes** | Código do script, propriedades da Part, preview 3D | Editar, Reverter, Focar no Studio |
| **Sidebar** | Navegação entre seções + status do Studio | — |

### 5.4 Seletor de Modelo (No Header)

```
🤖 Modelo: [DeepSeek-V3 ▼]

┌─────────────────────────────────────────┐
│ ⭐ DeepSeek-V3    $0.50/1M   Código    │ ← Padrão
│ 🧠 GPT-4o         $2.50/1M   Raciocínio│
│ 🔮 Gemini 2.5     $1.25/1M   Contexto  │
│ 🌙 Kimi K2.6      $1.00/1M   Rápido    │
│ ⚡ Claude 3.5      $3.00/1M   Qualidade │
└─────────────────────────────────────────┘

Modelo por Agente (Avançado):
Planner: [Padrão ▼]  Coder: [DeepSeek ▼]  Reviewer: [Claude ▼]
```

---

## 6. Sistema Multi-Model

### 6.1 Modelos Suportados

| Modelo | Provider | Custo Input | Custo Output | Contexto | Força |
|--------|----------|-------------|--------------|----------|-------|
| **DeepSeek-V3** | DeepSeek | $0.50/1M | $2.00/1M | 64K | **Código, barato** ← Padrão |
| **GPT-4o** | OpenAI | $2.50/1M | $10.00/1M | 128K | Raciocínio complexo |
| **Gemini 2.5** | Google | $1.25/1M | $5.00/1M | 1M | Contexto longo, multimodal |
| **Kimi K2.6** | Moonshot | $1.00/1M | $4.00/1M | 256K | Velocidade, chinês |
| **Claude 3.5** | Anthropic | $3.00/1M | $15.00/1M | 200K | Segurança, qualidade |
| **Local** | Ollama | Grátis | Grátis | 128K | Privacidade, offline |

### 6.2 Por que DeepSeek é o Padrão?

- **5x mais barato** que GPT-4o para código
- Qualidade **comparável** para tarefas de programação
- Suporte a **function calling** (tools)
- **Streaming** de respostas
- Velocidade excelente

### 6.3 Fallback Automático

Se o modelo escolhido falhar (timeout, rate limit, erro):

```
DeepSeek-V3 (principal)
    │
    └──► Falhou? → Kimi K2.6 (mesmo preço, similar)
            │
            └──► Falhou? → GPT-4o (garantido, mais caro)
                    │
                    └──► Falhou? → Gemini 2.5 (último recurso)
                            │
                            └──► Todos falharam? → Erro amigável
```

O usuário **nunca v erro técnico**. Só vê "Processando..." e depois a resposta.

### 6.4 Override por Agente

O usuário pode usar **modelos diferentes para tarefas específicas**:

| Agente | Modelo Sugerido | Por quê |
|--------|-----------------|---------|
| **Coder** | DeepSeek-V3 | Código barato e bom |
| **Planner** | GPT-4o | Raciocínio complexo |
| **Reviewer** | Claude 3.5 | Segurança e qualidade |
| **Game Designer** | GPT-4o | Criatividade |
| **UI Designer** | DeepSeek-V3 | Código de UI |
| **Performance** | DeepSeek-V3 | Análise de código |

---

## 7. Sistema de Agendamento (Fila de Comandos)

### 7.1 Por que Agendar?

O Backend **não manda tudo de uma vez**. Usa uma fila orquestrada:

| Problema se enviar tudo de uma vez | Solução com fila |
|---|---|
| Script 2 depende do Script 1 | Dependências: B só executa depois que A retorna DONE |
| Erro no comando 3 impede rollback | Execução sequencial permite parar e reportar |
| Studio trava com 50 comandos | Throttle: 1 comando a cada 500ms |
| Usuário quer ver em tempo real | Status por comando: "Executando 3 de 10..." |
| Undo precisa ser granular | Cada comando = 1 waypoint no ChangeHistory |

### 7.2 Estados da Fila

```
[PENDING] ──► [QUEUED] ──► [EXECUTING] ──► [DONE]
    │            │              │
    │            │              └──► [FAILED] ──► [RETRY] ──► [PENDING]
    │            │                                    │
    │            │                                    └──► [FAILED_FINAL]
    │            │
    └──► [CANCELLED] (usuário cancelou)
```

### 7.3 Regras de Ouro

1. **1 comando por vez no Plugin**
2. **Respeitar dependências** (topological sort)
3. **Throttle de 500ms** entre comandos
4. **ChangeHistoryService por comando** (undo granular)
5. **Retry automático** até 3x com backoff exponencial
6. **Cancelamento em lote** (rollback completo)
7. **Confirmação prévia** para ações destrutivas

---

## 8. Features Avançadas

### 8.1 Multi-Agent (Orquestração de Especialistas)

```
Supervisor Agent (GPT-4o)
    │
    ├──► Planner Agent ──► Quebra tarefas em subtarefas
    │
    ├──► Coder Agent (DeepSeek) ──► Escreve código Luau
    │
    ├──► Game Designer Agent ──► Balanceia números, economia
    │
    ├──► UI Designer Agent ──► Cria interfaces responsivas
    │
    ├──► Performance Engineer Agent ──► Otimiza scripts
    │
    ├──► Monetization Advisor Agent ──► Sugere game passes, preços
    │
    └──► Reviewer Agent (Claude) ──► Valida segurança e qualidade
```

### 8.2 Memória Avançada (Contexto de Longo Prazo)

| Tipo | O que Guarda | Tecnologia |
|------|-------------|------------|
| **Arquitetura do projeto** | Padrão OOP/Knit, estrutura de pastas | Pinecone Vector Store |
| **Erros passados** | Bugs e soluções | Embeddings semânticos |
| **Assets gerados** | AssetIDs, descrições | Busca por similaridade |
| **Preferências do usuário** | Estilo de código, linguagem | Persistido no PostgreSQL |
| **Decisões de design** | Por que algo foi feito daquele jeito | Contexto para IA |

### 8.3 Templates Inteligentes

| Template | O que Inclui | Comando |
|----------|-------------|---------|
| **Kit RPG** | Inventário, level, quests, loja, save, skills | *"Aplique template RPG"* |
| **Kit Obby** | Checkpoints, timer, leaderboards, death | *"Aplique template Obby"* |
| **Kit Tycoon** | Upgrades, workers, UI stats, rebirths | *"Aplique template Tycoon"* |
| **Kit Battle Royale** | Storm, loot, espectador, squad | *"Aplique template BR"* |
| **Kit Simulator** | Click, pets, rebirths, worlds, trade | *"Aplique template Simulator"* |

### 8.4 Geração Procedural de Mundo

```
[Vocé]: "Crie uma dungeon completa: 10 salas, 5 tipos de inimigos, loot, boss"

[IA]: Gera layout procedural (BSP/cellular automata)
      → Cria salas (Part blocks)
      → Posiciona inimigos (reutiliza assets ou gera novos via Meshy.ai)
      → Posiciona loot (cores por raridade)
      → Configura lighting escuro
      → Adiciona som ambiente
      → Cria sistema de spawn
```

### 8.5 Modo Deus (Criação Completa de Jogo)

> *"Crie um jogo de sobrevivência zumbi: mapa aberto, crafting, base building, zumbis com IA, dia/noite, multiplayer, monetização. 50 players, sessões de 30 min."*

**8 Fases (75 minutos):**

| Fase | O que Faz | Tempo |
|------|-----------|-------|
| 1. Design | Gênero, loop, economia, monetização | 5 min |
| 2. Mundo | Terreno procedural, POIs, spawns | 10 min |
| 3. Sistemas | Data, Player, Inventory, Combat, GameManager | 15 min |
| 4. UI | Menus, HUD, inventário, loja | 10 min |
| 5. Assets | Gera meshes, texturas, sons (ou reutiliza) | 20 min |
| 6. Balance | Números, drop rates, dificuldade | 5 min |
| 7. Polish | Lighting, partículas, feedback | 5 min |
| 8. Publish | Configura place, game passes, publica | 5 min |

**Resultado:** URL do jogo publicado no Roblox.

### 8.6 Integração com Ecossistema

| Integração | O que Faz |
|-----------|-----------|
| **Creator Hub Analytics** | Lê métricas de retenção, ARPU, playtime e sugere mudanças |
| **Roblox Open Cloud** | Upload de assets, publicação de places, gerenciamento |
| **Git/Rojo** | Commit automático, branch por feature, PR review |
| **Meshy.ai / Rodin** | Geração de meshes 3D via IA |

---

## 9. Segurança

### 9.1 Análise de Código Automática

| Problema Detectado | Severidade | Ação |
|---------------------|-----------|------|
| RemoteEvent sem validação no servidor | 🔴 CRÍTICO | Bloqueia + alerta |
| Uso de `loadstring` | 🔴 CRÍTICO | Bloqueia + explica |
| `require` de URL externa | 🔴 CRÍTICO | Bloqueia + explica |
| Uso de `_G` | 🟡 WARNING | Adverte, sugere ModuleScript |
| Evento não desconectado | 🟡 WARNING | Adverte, sugere :Disconnect() |

### 9.2 Audit Trail

Toda ação da IA é logada:
- Quem pediu
- O que mudou
- Estado antes/depois
- Quando
- Custo em tokens

Rollback possível em até 30 dias.

### 9.3 Camadas de Segurança

| Camada | Mecanismo |
|--------|-----------|
| Transporte | HTTPS obrigatório, TLS 1.3 |
| Autenticação | OAuth 2.0 + PKCE, JWT com expiração curta |
| Autorização | API Keys por projeto, rate limiting |
| Sandbox | Plugin só executa funções pré-definidas |
| Validação | Toda ação validada pelo Backend antes de chegar ao Plugin |

---

## 10. Modelo de Negócio

### 10.1 Planos

| Plano | Preço | Inclui |
|-------|-------|--------|
| **Free** | $0 | 50 mensagens/mês, DeepSeek only, single-file edits, 1 projeto |
| **Creator** | $19/mês | Mensagens ilimitadas, multi-model, multi-file edits, workspace manipulation, 5 projetos |
| **Studio** | $49/mês/dev | Multi-agent, cloud workflows, Git integration, assets AI ilimitados, 20 projetos |
| **Enterprise** | Custom | On-premise, SLA 99.9%, modelos locais, API privada, suporte dedicado |

### 10.2 Revenue Streams Adicionais

- **Pay-per-use:** Geração de meshes 3D, minutos de cloud compute
- **Marketplace de Templates:** Templates pré-configurados (RPG Kit, Obby Kit)
- **Affiliate:** Comissão em assets vendidos no Creator Store gerados pela IA

---

## 11. Roadmap

### Fase 1 — MVP (Semanas 1-4)
- [ ] Plugin básico (chat, sync, script creation)
- [ ] Backend com DeepSeek (padrão)
- [ ] Frontend com Explorer + Chat
- [ ] Fila de comandos simples
- [ ] Autenticação OAuth

### Fase 2 — Polish (Semanas 5-6)
- [ ] Multi-model (GPT, Gemini, Kimi, Claude)
- [ ] Diff viewer
- [ ] Memória de projeto
- [ ] Undo/redo perfeito

### Fase 3 — Agentic (Semanas 7-10)
- [ ] Multi-agent (Supervisor + especialistas)
- [ ] Templates inteligentes
- [ ] Geração procedural de mundo
- [ ] Integração Git/Rojo

### Fase 4 — Scale (Semanas 11-14)
- [ ] Modo Deus (criação completa)
- [ ] Creator Hub Analytics
- [ ] Marketplace de templates
- [ ] Mobile app companion

### Fase 5 — Enterprise (Semanas 15-20)
- [ ] On-premise deployment
- [ ] Modelos locais (Ollama)
- [ ] Team collaboration avançada
- [ ] SLA e suporte prioritário

---

## Resumo Executivo

Blox AI é o **primeiro agente de IA end-to-end para Roblox Studio**. Ele não sugere — ele **faz**.

**Stack:** Plugin Lua + Backend Node.js + Frontend Next.js + Multi-Model (DeepSeek padrão)

**Fluxo:** Usuário pede → IA planeja → Backend enfileira → Plugin executa um por vez → Usuário vê resultado em tempo real

**Diferencial:** Multi-model (escolha do usuário), multi-agent (especialistas), fila orquestrada (nunca tudo de uma vez), memória persistente (lembra de tudo), e Modo Deus (cria jogo completo do zero).
