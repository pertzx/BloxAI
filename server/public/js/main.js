/**
 * Blox AI - Main JavaScript
 * Funções utilitárias e inicialização
 */

// === TOAST NOTIFICATIONS ===
function showToast(type, title, message = '', duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const icons = {
        success: 'check',
        error: 'times',
        warning: 'exclamation',
        info: 'info'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas fa-${icons[type] || 'info'}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            ${message ? `<div class="toast-message">${message}</div>` : ''}
        </div>
        <button class="toast-close">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(toast);
    
    // Auto remove
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s reverse';
        setTimeout(() => toast.remove(), 300);
    }, duration);
    
    // Manual close
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.style.animation = 'slideInRight 0.3s reverse';
        setTimeout(() => toast.remove(), 300);
    });
}

// === LOADING OVERLAY ===
function showLoading(text = 'Carregando...') {
    const overlay = document.getElementById('loadingOverlay');
    const textEl = document.getElementById('loadingText');
    if (overlay) {
        if (textEl) textEl.textContent = text;
        overlay.style.display = 'flex';
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

// === MODAL ===
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

// Bind close buttons
document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) {
        const target = e.target.matches('[data-close]') ? e.target : e.target.closest('[data-close]');
        closeModal(target.dataset.close);
    }
    
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// === KEYBOARD SHORTCUTS ===
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const search = document.getElementById('globalSearch');
        if (search) search.focus();
    }
    
    // Escape to close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});

// === NAVIGATION (Dashboard) ===
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    const sections = document.querySelectorAll('.content-section');
    const sectionTitle = document.getElementById('sectionTitle');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            const target = item.dataset.section;
            
            // Update nav
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            
            // Update section
            sections.forEach(s => s.classList.remove('active'));
            const targetSection = document.getElementById(`section-${target}`);
            if (targetSection) {
                targetSection.classList.add('active');
            }
            
            // Update breadcrumb
            if (sectionTitle) {
                sectionTitle.textContent = item.querySelector('span')?.textContent || target;
            }
            
            // Update URL hash
            window.location.hash = target;
            
            // Close sidebar on mobile
            if (window.innerWidth < 768) {
                document.getElementById('sidebar')?.classList.remove('active');
            }
        });
    });
    
    // Handle initial hash
    const hash = window.location.hash.slice(1) || 'chat';
    const initialNav = document.querySelector(`.nav-item[data-section="${hash}"]`);
    if (initialNav) initialNav.click();
}

// === SIDEBAR TOGGLE (Mobile) ===
function initSidebarToggle() {
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const mobileToggle = document.getElementById('sidebarToggleMobile');
    
    if (toggle) {
        toggle.addEventListener('click', () => {
            sidebar?.classList.toggle('active');
        });
    }
    
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            sidebar?.classList.remove('active');
        });
    }
}

// === USER MENU ===
function initUserMenu() {
    const btn = document.getElementById('userMenuBtn');
    const menu = document.getElementById('userMenu');
    
    if (btn && menu) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('active');
        });
        
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== btn) {
                menu.classList.remove('active');
            }
        });
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await logout();
        });
    }
}

// === PROVIDER SELECTOR ===
function initProviderSelector() {
    const btn = document.getElementById('providerBtn');
    const menu = document.getElementById('providerMenu');
    
    if (btn && menu) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('active');
        });
        
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                menu.classList.remove('active');
            }
        });
        
        menu.querySelectorAll('.provider-option').forEach(option => {
            option.addEventListener('click', () => {
                const provider = option.dataset.provider;
                const name = option.querySelector('strong').textContent;
                
                // Update UI
                document.getElementById('currentProvider').textContent = name;
                menu.querySelectorAll('.provider-option').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                
                // Update chat manager
                if (window.chatManager) {
                    window.chatManager.setProvider(provider);
                }
                
                menu.classList.remove('active');
                showToast('success', 'Provider alterado', `Agora usando ${name}`);
            });
        });
    }
}

// === SETTINGS TABS ===
function initSettingsTabs() {
    const tabs = document.querySelectorAll('.settings-tab');
    const panels = document.querySelectorAll('.settings-panel');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            panels.forEach(p => p.classList.remove('active'));
            const targetPanel = document.getElementById(`panel-${target}`);
            if (targetPanel) targetPanel.classList.add('active');
        });
    });
}

// === INITIALIZE ===
document.addEventListener('DOMContentLoaded', () => {
    // Check auth on dashboard pages
    if (window.location.pathname.includes('/dashboard')) {
        if (!api.isAuthenticated()) {
            window.location.href = '/login';
            return;
        }
        
        initNavigation();
        initSidebarToggle();
        initUserMenu();
        initProviderSelector();
        initSettingsTabs();
        loadUserData();
    }
});

async function loadUserData() {
    try {
        const result = await api.me();
        const user = result.data.user;
        
        // Update UI
        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        
        setText('userName', user.profile?.firstName || user.email.split('@')[0]);
        setText('userEmail', user.email);
        
        const avatar = document.getElementById('userAvatar');
        if (avatar) {
            const initial = (user.profile?.firstName?.[0] || user.email[0]).toUpperCase();
            avatar.textContent = initial;
        }
        
        // Update subscription info if available
        if (user.subscription) {
            setText('subTitle', user.subscription.plan === 'free' ? 'Plano Grátis' : `Plano ${user.subscription.plan}`);
            const badge = document.getElementById('subBadge');
            if (badge) {
                badge.textContent = user.subscription.plan.toUpperCase();
                badge.className = `sub-badge ${user.subscription.plan}`;
            }
            
            // Update usage
            if (user.subscription.usage) {
                const { requestsUsed, requestsLimit } = user.subscription.usage;
                setText('usageText', `${requestsUsed}/${requestsLimit}`);
                const fill = document.getElementById('usageFill');
                if (fill) {
                    const pct = (requestsUsed / requestsLimit) * 100;
                    fill.style.width = `${Math.min(pct, 100)}%`;
                }
            }
        }
        
    } catch (error) {
        console.error('Failed to load user:', error);
        if (error.status === 401) {
            api.clearTokens();
            window.location.href = '/login';
        }
    }
}
