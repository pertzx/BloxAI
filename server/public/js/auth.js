/**
 * Blox AI - Auth Module
 * Gerencia login, registro e sessão
 */

// === LOGIN PAGE ===
function initLoginPage() {
    const form = document.getElementById('loginForm');
    if (!form) return;
    
    // Toggle password visibility
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            const type = target.type === 'password' ? 'text' : 'password';
            target.type = type;
            btn.querySelector('i').className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
        });
    });
    
    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoader = submitBtn.querySelector('.btn-loader');
        
        // Clear errors
        document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const remember = document.getElementById('remember')?.checked;
        
        // Validation
        let hasError = false;
        if (!email) {
            document.getElementById('emailError').textContent = 'Email é obrigatório';
            hasError = true;
        }
        if (!password) {
            document.getElementById('passwordError').textContent = 'Senha é obrigatória';
            hasError = true;
        }
        if (hasError) return;
        
        // Submit
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-flex';
        submitBtn.disabled = true;
        
        try {
            const result = await api.login(email, password);
            
            if (remember) {
                localStorage.setItem('blox_remember_email', email);
            }
            
            showToast('success', 'Login realizado!', 'Redirecionando...');
            
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 800);
            
        } catch (error) {
            console.error('Login error:', error);
            
            if (error.status === 401) {
                showToast('error', 'Erro de login', 'Email ou senha incorretos');
            } else {
                showToast('error', 'Erro', error.message);
            }
            
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
            submitBtn.disabled = false;
        }
    });
    
    // Auto-fill remembered email
    const remembered = localStorage.getItem('blox_remember_email');
    if (remembered) {
        document.getElementById('email').value = remembered;
        document.getElementById('remember').checked = true;
    }
    
    // Social login handlers
    document.querySelectorAll('.social-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const provider = btn.dataset.provider;
            window.location.href = `/api/auth/${provider}`;
        });
    });
}

// === REGISTER PAGE ===
function initRegisterPage() {
    const form = document.getElementById('registerForm');
    if (!form) return;
    
    // Toggle password
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            const type = target.type === 'password' ? 'text' : 'password';
            target.type = type;
            btn.querySelector('i').className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
        });
    });
    
    // Password strength meter
    const passwordInput = document.getElementById('password');
    const strengthFill = document.getElementById('strengthFill');
    const strengthText = document.getElementById('strengthText');
    
    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            const password = passwordInput.value;
            const strength = calculatePasswordStrength(password);
            
            strengthFill.className = 'strength-fill';
            if (strength < 2) {
                strengthFill.classList.add('weak');
                strengthText.textContent = 'Senha fraca';
            } else if (strength < 4) {
                strengthFill.classList.add('medium');
                strengthText.textContent = 'Senha média';
            } else if (password.length > 0) {
                strengthFill.classList.add('strong');
                strengthText.textContent = 'Senha forte';
            } else {
                strengthText.textContent = 'Digite uma senha';
            }
        });
    }
    
    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoader = submitBtn.querySelector('.btn-loader');
        
        // Clear errors
        document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
        
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const terms = document.getElementById('terms').checked;
        
        // Validation
        let hasError = false;
        
        if (firstName.length < 2) {
            document.getElementById('firstNameError').textContent = 'Nome muito curto';
            hasError = true;
        }
        if (lastName.length < 2) {
            document.getElementById('lastNameError').textContent = 'Sobrenome muito curto';
            hasError = true;
        }
        if (!validateEmail(email)) {
            document.getElementById('emailError').textContent = 'Email inválido';
            hasError = true;
        }
        if (password.length < 8) {
            document.getElementById('passwordError').textContent = 'Senha deve ter no mínimo 8 caracteres';
            hasError = true;
        }
        if (password !== confirmPassword) {
            document.getElementById('confirmPasswordError').textContent = 'As senhas não coincidem';
            hasError = true;
        }
        if (!terms) {
            showToast('warning', 'Atenção', 'Você precisa aceitar os termos de uso');
            hasError = true;
        }
        
        if (hasError) return;
        
        // Submit
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-flex';
        submitBtn.disabled = true;
        
        try {
            const result = await api.register({
                firstName,
                lastName,
                email,
                password
            });
            
            showToast('success', 'Conta criada!', 'Redirecionando para o dashboard...');
            
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1000);
            
        } catch (error) {
            console.error('Register error:', error);
            
            if (error.status === 409) {
                document.getElementById('emailError').textContent = 'Este email já está em uso';
            } else {
                showToast('error', 'Erro ao criar conta', error.message);
            }
            
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
            submitBtn.disabled = false;
        }
    });
    
    // Social login
    document.querySelectorAll('.social-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const provider = btn.dataset.provider;
            window.location.href = `/api/auth/${provider}`;
        });
    });
}

function calculatePasswordStrength(password) {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z\d]/.test(password)) strength++;
    return strength;
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// === LOGOUT ===
async function logout() {
    try {
        await api.logout();
    } catch (e) {
        console.warn('Logout error:', e);
    }
    
    api.clearTokens();
    showToast('info', 'Sessão encerrada', 'Até logo!');
    
    setTimeout(() => {
        window.location.href = '/login';
    }, 500);
}

// === CHECK AUTHENTICATION ===
async function requireAuth() {
    if (!api.isAuthenticated()) {
        window.location.href = '/login';
        return false;
    }
    
    try {
        const user = await api.me();
        return user.data.user;
    } catch (error) {
        api.clearTokens();
        window.location.href = '/login';
        return false;
    }
}
