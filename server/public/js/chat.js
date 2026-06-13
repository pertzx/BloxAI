/**
 * Blox AI - Chat Module
 * Gerencia mensagens e comunicação com IA
 */

class ChatManager {
    constructor() {
        this.messages = [];
        this.currentSession = null;
        this.isProcessing = false;
        this.selectedProvider = 'blox';
        this.contextData = null;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.loadSession();
    }
    
    bindEvents() {
        // Form submission
        const form = document.getElementById('chatForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendMessage();
            });
        }
        
        // Auto-resize textarea
        const input = document.getElementById('chatInput');
        if (input) {
            input.addEventListener('input', () => {
                this.autoResize(input);
                this.updateCharCount();
            });
            
            // Enter to send (Shift+Enter for new line)
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
        
        // Suggestion chips
        document.querySelectorAll('.suggestion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const prompt = chip.dataset.prompt;
                if (prompt && document.getElementById('chatInput')) {
                    document.getElementById('chatInput').value = prompt;
                    this.sendMessage();
                }
            });
        });
        
        // New chat button
        const newChatBtn = document.getElementById('newChatBtn');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => this.newChat());
        }
        
        // Export button
        const exportBtn = document.getElementById('exportChatBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportChat());
        }
    }
    
    autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
    
    updateCharCount() {
        const input = document.getElementById('chatInput');
        const counter = document.getElementById('charCount');
        if (input && counter) {
            counter.textContent = input.value.length;
        }
    }
    
    async sendMessage() {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        
        if (!text || this.isProcessing) return;
        
        this.isProcessing = true;
        input.value = '';
        this.autoResize(input);
        this.updateCharCount();
        
        // Add user message to UI
        this.addMessage('user', text);
        
        // Show typing indicator
        this.showTyping();
        
        try {
            // Capture real-time context
            await this.captureContext();
            
            // Send to AI
            const result = await api.generate(text, {
                provider: this.selectedProvider,
                model: 'balanced',
                context: this.contextData,
                sessionId: this.currentSession
            });
            
            this.hideTyping();
            
            // Process AI response
            const response = result.data.result;
            this.addMessage('assistant', response.explanation || 'Resposta recebida', response);
            
            // Execute actions if any
            if (response.actions && response.actions.length > 0) {
                await this.executeActions(response.actions);
            }
            
            // Save to history
            this.saveToHistory(text, response);
            
        } catch (error) {
            this.hideTyping();
            console.error('Chat error:', error);
            this.addMessage('assistant', '❌ Desculpe, ocorreu um erro: ' + error.message);
            
            if (error.status === 429) {
                showToast('warning', 'Limite atingido', 'Você atingiu o limite de requisições do seu plano');
            }
        } finally {
            this.isProcessing = false;
        }
    }
    
    addMessage(role, content, data = null) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${role}`;
        
        const avatarContent = role === 'user' 
            ? '<i class="fas fa-user"></i>'
            : '<i class="fas fa-robot"></i>';
        
        let contentHTML = '';
        
        if (role === 'assistant' && typeof content === 'string') {
            contentHTML = this.formatAssistantMessage(content, data);
        } else {
            contentHTML = `<div class="message-bubble">${this.escapeHTML(content)}</div>`;
        }
        
        messageDiv.innerHTML = `
            <div class="message-avatar">${avatarContent}</div>
            <div class="message-content">
                ${contentHTML}
            </div>
        `;
        
        container.appendChild(messageDiv);
        
        // Highlight code
        if (role === 'assistant') {
            messageDiv.querySelectorAll('pre code').forEach(block => {
                if (typeof hljs !== 'undefined') {
                    hljs.highlightElement(block);
                }
            });
        }
        
        // Scroll to bottom
        this.scrollToBottom();
        
        // Store in memory
        this.messages.push({ role, content, data, timestamp: Date.now() });
    }
    
    formatAssistantMessage(text, data) {
        let html = `<div class="message-bubble">`;
        html += this.parseMarkdown(text);
        
        // Show actions executed
        if (data && data.actions && data.actions.length > 0) {
            html += '<div class="message-actions" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-border);">';
            html += '<strong style="font-size: 12px; color: var(--color-text-tertiary); display: block; margin-bottom: 8px;">AÇÕES EXECUTADAS:</strong>';
            data.actions.forEach((action, i) => {
                html += `<div class="action-item" style="padding: 8px; background: var(--color-bg-elevated); border-radius: 6px; margin-bottom: 4px; font-size: 12px;">`;
                html += `<i class="fas fa-${this.getActionIcon(action.type)}"></i> `;
                html += `<strong>${action.type}</strong> → ${action.targetPath || action.name || 'Ação'}`;
                html += `</div>`;
            });
            html += '</div>';
        }
        
        html += '</div>';
        return html;
    }
    
    parseMarkdown(text) {
        // Simple markdown parser
        let html = this.escapeHTML(text);
        
        // Code blocks
        html = html.replace(/```(\w+)?\n([\s\S]+?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang || 'lua'}">${code.trim()}</code></pre>`;
        });
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // Line breaks
        html = html.replace(/\n/g, '<br>');
        
        return html;
    }
    
    getActionIcon(type) {
        const icons = {
            'CREATE_SCRIPT': 'code',
            'EDIT_SCRIPT': 'edit',
            'CREATE_INSTANCE': 'plus-circle',
            'SET_PROPERTY': 'cog',
            'DELETE_SCRIPT': 'trash'
        };
        return icons[type] || 'bolt';
    }
    
    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showTyping() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.style.display = 'flex';
            this.scrollToBottom();
        }
    }
    
    hideTyping() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }
    
    scrollToBottom() {
        const container = document.getElementById('chatMessages');
        if (container) {
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 100);
        }
    }
    
    async captureContext() {
        // Capture real-time context for AI
        try {
            const tree = window.treeView;
            if (tree) {
                this.contextData = {
                    projectSnapshot: tree.getSnapshot(),
                    selectedObjects: tree.getSelected(),
                    timestamp: Date.now()
                };
            }
        } catch (e) {
            console.warn('Context capture failed:', e);
        }
    }
    
    async executeActions(actions) {
        // In a real plugin, this would communicate with Roblox Studio
        // For web preview, we just log them
        console.log('Actions to execute:', actions);
        
        // Show notification
        showToast('info', 'Ações executadas', `${actions.length} ação(ões) processada(s)`);
    }
    
    newChat() {
        if (this.messages.length === 0) return;
        
        if (confirm('Iniciar nova conversa? O histórico atual será salvo.')) {
            this.messages = [];
            this.currentSession = null;
            
            const container = document.getElementById('chatMessages');
            if (container) {
                container.innerHTML = '';
            }
            
            this.loadSession();
        }
    }
    
    exportChat() {
        if (this.messages.length === 0) {
            showToast('warning', 'Nada para exportar', 'Nenhuma mensagem na conversa');
            return;
        }
        
        let text = `# Conversa Blox AI - ${new Date().toLocaleString('pt-BR')}\n\n`;
        
        this.messages.forEach(msg => {
            const role = msg.role === 'user' ? '👤 Você' : '🤖 Blox AI';
            text += `## ${role}\n${msg.content}\n\n`;
        });
        
        const blob = new Blob([text], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `conversa-blox-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('success', 'Exportado!', 'Conversa salva em Markdown');
    }
    
    async loadSession() {
        try {
            const result = await api.getSessions();
            const sessions = result.data.sessions || [];
            
            if (sessions.length > 0) {
                this.currentSession = sessions[0]._id;
                // Load messages from session
            }
        } catch (e) {
            console.warn('Could not load sessions:', e);
        }
    }
    
    async saveToHistory(userMessage, aiResponse) {
        // Save conversation to history
        try {
            // This would save to the backend
            console.log('Saving to history...');
        } catch (e) {
            console.warn('Save history failed:', e);
        }
    }
    
    setProvider(provider) {
        this.selectedProvider = provider;
    }
}

// Initialize on page load
let chatManager;
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('chatMessages')) {
        chatManager = new ChatManager();
        window.chatManager = chatManager;
    }
});
