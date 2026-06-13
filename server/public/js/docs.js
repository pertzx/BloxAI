/**
 * Blox AI - Documentation Module
 */

class DocsManager {
    constructor() {
        this.docs = {};
        this.favorites = JSON.parse(localStorage.getItem('blox_doc_favorites') || '[]');
        this.notes = JSON.parse(localStorage.getItem('blox_doc_notes') || '{}');
        this.init();
    }
    
    init() {
        this.loadDocs();
        this.bindEvents();
        this.renderSidebar();
        this.renderContent('getting-started');
    }
    
    loadDocs() {
        this.docs = {
            'getting-started': {
                title: '🚀 Começando',
                content: `
                    <h2>Bem-vindo ao Blox AI</h2>
                    <p>O Blox AI é o agente de IA mais avançado para desenvolvimento Roblox. Este guia irá ajudá-lo a começar.</p>
                    
                    <h3>1. Instalação do Plugin</h3>
                    <p>Baixe e instale o plugin no Roblox Studio para começar.</p>
                    <pre><code class="language-bash"># Via Roblox Creator Marketplace
1. Abra o Roblox Studio
2. Vá em Plugins > Manage Plugins
3. Busque por "Blox AI"
4. Clique em Install</code></pre>
                    
                    <h3>2. Configuração Inicial</h3>
                    <p>Após instalar, configure sua API Key nas configurações do plugin.</p>
                    
                    <h3>3. Primeiro Comando</h3>
                    <p>No chat, digite:</p>
                    <pre><code>Crie um script de olá mundo em ServerScriptService</code></pre>
                    
                    <h3>4. Recursos Avançados</h3>
                    <ul>
                        <li>Multi-provider (GPT-4o, Gemini, Kimi)</li>
                        <li>Memória persistente entre sessões</li>
                        <li>Auto-aplicação de mudanças</li>
                        <li>Backup automático</li>
                    </ul>
                `
            },
            'guides': {
                title: '📚 Guias',
                content: `
                    <h2>Guias Práticos</h2>
                    
                    <h3>Criando Sistemas Complexos</h3>
                    <p>Aprenda a criar sistemas completos com IA.</p>
                    
                    <h4>Sistema de Inventário</h4>
                    <pre><code class="language-lua">-- Peça ao Blox AI:
" Crie um sistema de inventário completo com:
- DataStore para persistência
- UI responsiva
- Sincronização cliente-servidor "</code></pre>
                    
                    <h4>Sistema de Combate</h4>
                    <pre><code class="language-lua">-- Peça ao Blox AI:
" Crie um sistema de combate com:
- Habilidades com cooldowns
- Detecção de hits via Raycast
- Feedback visual e sonoro "</code></pre>
                    
                    <h3>UI/UX Design</h3>
                    <p>Crie interfaces profissionais.</p>
                    
                    <h3>Otimização de Performance</h3>
                    <p>Aprenda boas práticas.</p>
                `
            },
            'api': {
                title: '🔌 API Reference',
                content: `
                    <h2>API Reference</h2>
                    
                    <h3>Autenticação</h3>
                    <pre><code class="language-bash">POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout</code></pre>
                    
                    <h3>AI / LLM</h3>
                    <pre><code class="language-bash">GET  /api/ai/providers
GET  /api/ai/config
POST /api/ai/apikeys
POST /api/ai/generate</code></pre>
                    
                    <h3>Projetos</h3>
                    <pre><code class="language-bash">GET    /api/projects
POST   /api/projects
PATCH  /api/projects/:id
DELETE /api/projects/:id</code></pre>
                    
                    <h3>Billing</h3>
                    <pre><code class="language-bash">GET  /api/billing/plans
POST /api/billing/checkout
POST /api/billing/portal
GET  /api/subscription/status</code></pre>
                `
            },
            'examples': {
                title: '💡 Exemplos',
                content: `
                    <h2>Exemplos Práticos</h2>
                    
                    <h3>DataService (ModuleScript)</h3>
                    <pre><code class="language-lua">local DataService = {}
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")

local playerData = {}

function DataService:getData(player)
    local userId = player.UserId
    local success, data = pcall(function()
        return DataStoreService:GetDataStore("PlayerData"):GetAsync("Data_" .. userId)
    end)
    
    if success and data then
        return data
    end
    
    return {
        coins = 100,
        level = 1,
        inventory = {}
    }
end

function DataService:saveData(player)
    local userId = player.UserId
    local data = playerData[userId]
    
    if not data then return end
    
    pcall(function()
        DataStoreService:GetDataStore("PlayerData"):SetAsync("Data_" .. userId, data)
    end)
end

Players.PlayerAdded:Connect(function(player)
    playerData[player.UserId] = DataService:getData(player)
end)

Players.PlayerRemoving:Connect(function(player)
    DataService:saveData(player)
    playerData[player.UserId] = nil
end)

game:BindToClose(function()
    for _, player in ipairs(Players:GetPlayers()) do
        DataService:saveData(player)
    end
end)

return DataService</code></pre>
                `
            },
            'best-practices': {
                title: '⭐ Boas Práticas',
                content: `
                    <h2>Boas Práticas</h2>
                    
                    <h3>1. Segurança</h3>
                    <ul>
                        <li>Nunca confie no cliente (valide no servidor)</li>
                        <li>Use pcall em DataStores</li>
                        <li>Rate limit requisições</li>
                        <li>Sanitize inputs de UI</li>
                    </ul>
                    
                    <h3>2. Performance</h3>
                    <ul>
                        <li>Use Object Pooling</li>
                        <li>Evite loops em RenderStepped</li>
                        <li>Cache resultados</li>
                        <li>Lazy loading de assets</li>
                    </ul>
                    
                    <h3>3. Código Limpo</h3>
                    <ul>
                        <li>Type hints em Luau</li>
                        <li>Modularize com ModuleScripts</li>
                        <li>Documentação inline</li>
                        <li>Nomes descritivos</li>
                    </ul>
                `
            },
            'troubleshooting': {
                title: '🔧 Troubleshooting',
                content: `
                    <h2>Solução de Problemas</h2>
                    
                    <h3>Plugin não conecta</h3>
                    <p>Verifique:</p>
                    <ul>
                        <li>Backend está rodando? (curl http://localhost:5000/health)</li>
                        <li>Firewall permite conexões?</li>
                        <li>API Key está correta?</li>
                    </ul>
                    
                    <h3>IA retorna erro</h3>
                    <ul>
                        <li>Verifique créditos da OpenAI/Google</li>
                        <li>Tente outro provider</li>
                        <li>Reduza o tamanho do prompt</li>
                    </ul>
                    
                    <h3>Performance lenta</h3>
                    <ul>
                        <li>Use GPT-4o-mini para tarefas simples</li>
                        <li>Limite histórico de chat</li>
                        <li>Configure cache Redis</li>
                    </ul>
                `
            }
        };
    }
    
    bindEvents() {
        const search = document.getElementById('docsSearch');
        if (search) {
            search.addEventListener('input', (e) => {
                this.search(e.target.value);
            });
        }
        
        document.querySelectorAll('.docs-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const target = item.getAttribute('href').slice(1);
                this.renderContent(target);
                
                document.querySelectorAll('.docs-nav-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
    }
    
    renderSidebar() {
        // Sidebar already has nav items in HTML
    }
    
    renderContent(key) {
        const doc = this.docs[key];
        const content = document.getElementById('docsContent');
        
        if (!content || !doc) return;
        
        const isFavorite = this.favorites.includes(key);
        
        content.innerHTML = `
            <div class="doc-page">
                <div class="doc-header">
                    <h1>${doc.title}</h1>
                    <div class="doc-actions">
                        <button class="icon-btn ${isFavorite ? 'active' : ''}" data-fav="${key}" title="Favoritar">
                            <i class="fas fa-star"></i>
                        </button>
                        <button class="icon-btn" id="addNoteBtn" title="Adicionar nota">
                            <i class="fas fa-sticky-note"></i>
                        </button>
                    </div>
                </div>
                <div class="doc-content">
                    ${doc.content}
                </div>
                
                <div class="doc-notes" id="docNotes">
                    ${this.renderNotes(key)}
                </div>
            </div>
        `;
        
        // Highlight code
        content.querySelectorAll('pre code').forEach(block => {
            if (typeof hljs !== 'undefined') hljs.highlightElement(block);
        });
        
        // Bind favorite
        const favBtn = content.querySelector('[data-fav]');
        if (favBtn) {
            favBtn.addEventListener('click', () => this.toggleFavorite(key));
        }
        
        // Bind notes
        const noteBtn = content.querySelector('#addNoteBtn');
        if (noteBtn) {
            noteBtn.addEventListener('click', () => this.addNote(key));
        }
    }
    
    toggleFavorite(key) {
        const idx = this.favorites.indexOf(key);
        if (idx > -1) {
            this.favorites.splice(idx, 1);
        } else {
            this.favorites.push(key);
        }
        localStorage.setItem('blox_doc_favorites', JSON.stringify(this.favorites));
        this.renderContent(key);
        showToast('success', 'Favorito atualizado');
    }
    
    addNote(key) {
        const note = prompt('Digite sua anotação:');
        if (note) {
            if (!this.notes[key]) this.notes[key] = [];
            this.notes[key].push({ text: note, date: Date.now() });
            localStorage.setItem('blox_doc_notes', JSON.stringify(this.notes));
            this.renderContent(key);
        }
    }
    
    renderNotes(key) {
        const notes = this.notes[key] || [];
        if (notes.length === 0) return '';
        
        return `
            <div class="notes-section">
                <h3>📝 Suas Anotações</h3>
                ${notes.map(n => `
                    <div class="note-item">
                        <p>${n.text}</p>
                        <small>${new Date(n.date).toLocaleString('pt-BR')}</small>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    search(term) {
        // Simple search - highlight matches
        const content = document.getElementById('docsContent');
        if (!content) return;
        
        // Implementation
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('docsContent')) {
        new DocsManager();
    }
});
