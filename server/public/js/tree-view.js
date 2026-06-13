/**
 * Blox AI - Tree View Module
 * Visualização hierárquica do jogo
 */

class TreeView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.data = null;
        this.expandedNodes = new Set();
        this.currentFilter = 'all';
        this.searchTerm = '';
        
        if (this.container) {
            this.init();
        }
    }
    
    init() {
        this.bindEvents();
        this.loadData();
    }
    
    bindEvents() {
        // Search
        const searchInput = document.getElementById('treeSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.render();
            });
        }
        
        // Filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.render();
            });
        });
        
        // Toolbar actions
        const expandAll = document.getElementById('expandAllBtn');
        if (expandAll) {
            expandAll.addEventListener('click', () => this.expandAll());
        }
        
        const collapseAll = document.getElementById('collapseAllBtn');
        if (collapseAll) {
            collapseAll.addEventListener('click', () => this.collapseAll());
        }
        
        const refresh = document.getElementById('refreshTreeBtn');
        if (refresh) {
            refresh.addEventListener('click', () => this.loadData());
        }
    }
    
    async loadData() {
        this.showLoading();
        
        // Simulate loading data
        // In real use, this would fetch from plugin via API
        setTimeout(() => {
            this.data = this.getMockData();
            this.render();
        }, 800);
    }
    
    getMockData() {
        return {
            name: 'DataModel',
            className: 'DataModel',
            children: [
                {
                    name: 'Workspace',
                    className: 'Workspace',
                    icon: 'workspace',
                    children: [
                        { name: 'Baseplate', className: 'Part', icon: 'part' },
                        { name: 'SpawnLocation', className: 'SpawnLocation', icon: 'part' },
                        {
                            name: 'Map',
                            className: 'Model',
                            icon: 'model',
                            children: [
                                { name: 'Trees', className: 'Folder', icon: 'folder', children: [] },
                                { name: 'Buildings', className: 'Folder', icon: 'folder', children: [] }
                            ]
                        }
                    ]
                },
                {
                    name: 'ServerScriptService',
                    className: 'ServerScriptService',
                    icon: 'server',
                    children: [
                        { name: 'GameManager', className: 'ModuleScript', icon: 'module' },
                        { name: 'DataService', className: 'ModuleScript', icon: 'module' },
                        { name: 'PlayerHandler', className: 'Script', icon: 'server' }
                    ]
                },
                {
                    name: 'StarterPlayer',
                    className: 'StarterPlayer',
                    children: [
                        {
                            name: 'StarterPlayerScripts',
                            className: 'StarterPlayerScripts',
                            children: [
                                { name: 'PlayerClient', className: 'LocalScript', icon: 'client' }
                            ]
                        }
                    ]
                },
                {
                    name: 'StarterGui',
                    className: 'StarterGui',
                    icon: 'gui',
                    children: [
                        {
                            name: 'MainUI',
                            className: 'ScreenGui',
                            icon: 'gui',
                            children: [
                                { name: 'MainFrame', className: 'Frame', icon: 'gui' },
                                { name: 'InventoryUI', className: 'ScreenGui', icon: 'gui' }
                            ]
                        }
                    ]
                },
                {
                    name: 'ReplicatedStorage',
                    className: 'ReplicatedStorage',
                    children: [
                        { name: 'Events', className: 'Folder', icon: 'folder' },
                        { name: 'Modules', className: 'Folder', icon: 'folder' }
                    ]
                }
            ]
        };
    }
    
    showLoading() {
        this.container.innerHTML = `
            <div class="tree-loading">
                <i class="fas fa-spinner fa-spin"></i>
                Carregando estrutura do projeto...
            </div>
        `;
    }
    
    render() {
        if (!this.data) return;
        
        const filtered = this.filterData(this.data, this.searchTerm);
        const html = this.renderNode(filtered, 0, true);
        this.container.innerHTML = html;
        
        this.bindNodeEvents();
    }
    
    filterData(node, search) {
        if (!search) return node;
        
        const matchesSearch = node.name.toLowerCase().includes(search) ||
                             (node.className && node.className.toLowerCase().includes(search));
        
        const filteredChildren = node.children 
            ? node.children.map(c => this.filterData(c, search)).filter(c => c !== null)
            : [];
        
        if (matchesSearch || filteredChildren.length > 0) {
            return { ...node, children: filteredChildren };
        }
        
        return null;
    }
    
    matchesFilter(node) {
        if (this.currentFilter === 'all') return true;
        
        const type = node.className || '';
        const filters = {
            'scripts': ['Script', 'LocalScript', 'ModuleScript'],
            'parts': ['Part', 'MeshPart', 'SpawnLocation', 'BasePart'],
            'ui': ['ScreenGui', 'Frame', 'TextButton', 'TextLabel', 'BillboardGui', 'GuiObject'],
            'models': ['Model', 'Folder']
        };
        
        return filters[this.currentFilter]?.some(t => type.includes(t)) || false;
    }
    
    renderNode(node, depth, isRoot = false) {
        if (!node) return '';
        
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = this.expandedNodes.has(node.path || node.name) || depth < 2;
        const indent = depth * 20;
        const icon = this.getIcon(node);
        
        let html = `<div class="tree-node" style="margin-left: ${indent}px;">`;
        html += `<div class="tree-node-content" data-name="${this.escapeHTML(node.name)}" data-class="${this.escapeHTML(node.className)}">`;
        
        if (hasChildren) {
            html += `<i class="fas fa-chevron-right tree-toggle ${isExpanded ? 'expanded' : ''}"></i>`;
        } else {
            html += `<i class="fas fa-chevron-right tree-toggle empty"></i>`;
        }
        
        html += `<i class="fas fa-${icon} tree-icon ${this.getIconClass(node.className)}"></i>`;
        html += `<span class="tree-label">${this.escapeHTML(node.name)}</span>`;
        
        if (node.className && node.className !== node.name) {
            html += `<span class="tree-meta">${node.className}</span>`;
        }
        
        html += `</div>`;
        
        if (hasChildren) {
            html += `<div class="tree-children ${isExpanded ? 'expanded' : ''}">`;
            node.children.forEach(child => {
                html += this.renderNode(child, depth + 1);
            });
            html += `</div>`;
        }
        
        html += `</div>`;
        
        return html;
    }
    
    bindNodeEvents() {
        this.container.querySelectorAll('.tree-node-content').forEach(el => {
            el.addEventListener('click', (e) => {
                const node = e.currentTarget;
                const children = node.parentElement.querySelector('.tree-children');
                const toggle = node.querySelector('.tree-toggle');
                
                if (children && !toggle.classList.contains('empty')) {
                    children.classList.toggle('expanded');
                    toggle.classList.toggle('expanded');
                }
            });
        });
    }
    
    getIcon(node) {
        const icons = {
            'DataModel': 'database',
            'Workspace': 'briefcase',
            'ServerScriptService': 'server',
            'ReplicatedStorage': 'boxes',
            'StarterGui': 'window-maximize',
            'StarterPlayer': 'user',
            'StarterPack': 'box',
            'Lighting': 'lightbulb',
            'SoundService': 'volume-up',
            'Script': 'code',
            'LocalScript': 'laptop-code',
            'ModuleScript': 'cube',
            'Part': 'square',
            'MeshPart': 'shapes',
            'SpawnLocation': 'map-marker-alt',
            'Model': 'cubes',
            'Folder': 'folder',
            'ScreenGui': 'window-maximize',
            'Frame': 'square-full'
        };
        
        return icons[node.className] || 'circle';
    }
    
    getIconClass(className) {
        if (className === 'Script') return 'server';
        if (className === 'LocalScript') return 'client';
        if (className === 'ModuleScript') return 'module';
        if (className?.includes('Part')) return 'part';
        if (className?.includes('Gui')) return 'gui';
        if (className === 'Model') return 'model';
        if (className === 'Folder') return 'folder';
        if (className === 'Workspace') return 'workspace';
        return 'default';
    }
    
    expandAll() {
        this.container.querySelectorAll('.tree-children').forEach(el => {
            el.classList.add('expanded');
        });
        this.container.querySelectorAll('.tree-toggle').forEach(el => {
            if (!el.classList.contains('empty')) {
                el.classList.add('expanded');
            }
        });
    }
    
    collapseAll() {
        this.container.querySelectorAll('.tree-children').forEach(el => {
            el.classList.remove('expanded');
        });
        this.container.querySelectorAll('.tree-toggle').forEach(el => {
            el.classList.remove('expanded');
        });
    }
    
    getSnapshot() {
        return this.data;
    }
    
    getSelected() {
        return [];
    }
    
    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize
let treeView;
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('treeView')) {
        treeView = new TreeView('treeView');
        window.treeView = treeView;
    }
});
