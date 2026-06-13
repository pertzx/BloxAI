/**
 * Blox AI - API Client
 * Comunicação centralizada com o backend
 */

class BloxAPI {
    constructor(baseURL = '/api') {
        this.baseURL = baseURL;
        this.accessToken = localStorage.getItem('blox_access_token');
        this.refreshToken = localStorage.getItem('blox_refresh_token');
    }
    
    setTokens(accessToken, refreshToken) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        if (accessToken) localStorage.setItem('blox_access_token', accessToken);
        if (refreshToken) localStorage.setItem('blox_refresh_token', refreshToken);
    }
    
    clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
        localStorage.removeItem('blox_access_token');
        localStorage.removeItem('blox_refresh_token');
    }
    
    isAuthenticated() {
        return !!this.accessToken;
    }
    
    async request(method, endpoint, body = null, options = {}) {
        const url = this.baseURL + endpoint;
        console.log(`[DEBUG][API] ${method} ${url}`, body ? { ...body, password: body.password ? '***' : undefined } : null);

        const headers = {
            'Content-Type': 'application/json',
        };

        if (this.accessToken && !options.skipAuth) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        const config = {
            method,
            headers,
        };

        if (body && method !== 'GET') {
            config.body = JSON.stringify(body);
        }

        try {
            let response = await fetch(url, config);
            console.log(`[DEBUG][API] ${method} ${url} -> ${response.status}`);

            // Auto refresh token on 401
            if (response.status === 401 && this.refreshToken && !options.skipRefresh) {
                console.log('[DEBUG][API] attempting token refresh');
                const refreshed = await this.tryRefreshToken();
                if (refreshed) {
                    headers['Authorization'] = `Bearer ${this.accessToken}`;
                    response = await fetch(url, { ...config, headers });
                    console.log(`[DEBUG][API] retry ${method} ${url} -> ${response.status}`);
                }
            }

            const data = await response.json();
            console.log(`[DEBUG][API] response data:`, data);

            if (!response.ok) {
                throw new APIError(data.message || 'Erro na requisição', response.status, data);
            }

            return data;
        } catch (error) {
            console.error(`[DEBUG][API] ${method} ${url} FAILED:`, error.message);
            if (error instanceof APIError) throw error;
            throw new APIError('Erro de rede: ' + error.message, 0);
        }
    }
    
    async tryRefreshToken() {
        try {
            const response = await fetch(this.baseURL + '/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: this.refreshToken })
            });
            
            if (response.ok) {
                const data = await response.json();
                this.setTokens(data.accessToken, data.refreshToken);
                return true;
            }
        } catch (e) {
            console.error('Refresh failed:', e);
        }
        
        this.clearTokens();
        return false;
    }
    
    // Auth endpoints
    async register(data) {
        return this.request('POST', '/auth/register', data, { skipAuth: true });
    }
    
    async login(email, password) {
        const result = await this.request('POST', '/auth/login', { email, password }, { skipAuth: true });
        if (result.accessToken) {
            this.setTokens(result.accessToken, result.refreshToken);
        }
        return result;
    }
    
    async logout() {
        try {
            await this.request('POST', '/auth/logout', { refreshToken: this.refreshToken });
        } catch (e) {
            console.warn('Logout error:', e);
        }
        this.clearTokens();
    }
    
    async me() {
        return this.request('GET', '/auth/me');
    }
    
    async generateApiKey() {
        return this.request('POST', '/auth/api-key');
    }
    
    async changePassword(currentPassword, newPassword) {
        return this.request('POST', '/auth/change-password', { currentPassword, newPassword });
    }
    
    async updateProfile(data) {
        return this.request('PATCH', '/auth/profile', data);
    }
    
    // AI endpoints
    async getAIProviders() {
        return this.request('GET', '/ai/providers');
    }
    
    async getAIConfig() {
        return this.request('GET', '/ai/config');
    }
    
    async updateAIConfig(data) {
        return this.request('PATCH', '/ai/config', data);
    }
    
    async saveApiKey(provider, apiKey, extra = {}) {
        return this.request('POST', '/ai/apikeys', { provider, apiKey, ...extra });
    }
    
    async removeApiKey(provider) {
        return this.request('DELETE', `/ai/apikeys/${provider}`);
    }
    
    async testProvider(provider, apiKey, baseURL) {
        return this.request('POST', '/ai/test', { provider, apiKey, baseURL });
    }
    
    async generate(prompt, options = {}) {
        return this.request('POST', '/ai/generate', { prompt, ...options });
    }
    
    // Projects endpoints
    async getProjects() {
        return this.request('GET', '/projects');
    }
    
    async getProject(id) {
        return this.request('GET', `/projects/${id}`);
    }
    
    async createProject(data) {
        return this.request('POST', '/projects', data);
    }
    
    async updateProject(id, data) {
        return this.request('PATCH', `/projects/${id}`, data);
    }
    
    async deleteProject(id) {
        return this.request('DELETE', `/projects/${id}`);
    }
    
    // Sessions / History
    async getSessions() {
        return this.request('GET', '/sessions');
    }
    
    async getSession(id) {
        return this.request('GET', `/sessions/${id}`);
    }
    
    async deleteSession(id) {
        return this.request('DELETE', `/sessions/${id}`);
    }
    
    async clearHistory() {
        return this.request('DELETE', '/sessions/clear');
    }
    
    // Billing
    async getPlans() {
        return this.request('GET', '/billing/plans');
    }
    
    async createCheckout(priceId) {
        return this.request('POST', '/billing/checkout', { priceId });
    }
    
    async getBillingPortal() {
        return this.request('POST', '/billing/portal');
    }
    
    async cancelSubscription() {
        return this.request('POST', '/billing/cancel');
    }
    
    async getSubscription() {
        return this.request('GET', '/subscription/status');
    }
    
    // Backup
    async createBackup() {
        return this.request('POST', '/backup/create');
    }
    
    async listBackups() {
        return this.request('GET', '/backup');
    }
    
    async restoreBackup(id) {
        return this.request('POST', `/backup/${id}/restore`);
    }
}

class APIError extends Error {
    constructor(message, status, data = null) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

// Global instance
const api = new BloxAPI();
