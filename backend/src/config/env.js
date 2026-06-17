import dotenv from 'dotenv';
dotenv.config();

export const PORT = process.env.PORT || 3000;
export const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[CRITICAL] JWT_SECRET não definido em produção. Defina a variável de ambiente JWT_SECRET.');
  process.exit(1);
}
export const ROBLOX_OAUTH_CLIENT_ID = process.env.ROBLOX_OAUTH_CLIENT_ID || '';
export const ROBLOX_OAUTH_CLIENT_SECRET = process.env.ROBLOX_OAUTH_CLIENT_SECRET || '';
// URL do backend que a Roblox chama após autorizar (deve ser registrada no dev console da Roblox)
export const ROBLOX_REDIRECT_URI = process.env.ROBLOX_REDIRECT_URI || 'http://localhost:5000/api/auth/roblox/callback';
// URL do frontend para onde o backend redireciona após autenticar
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
// URL pública do próprio backend (usada nos links de e-mail). Deve usar o mesmo
// host que o usuário consegue acessar (ex.: o IP de LAN se testar de outro device).
export const API_URL = process.env.API_URL || 'http://localhost:5000';
// IDs Roblox que recebem role admin automaticamente (separados por vírgula)
export const ADMIN_ROBLOX_IDS = String(process.env.ADMIN_ROBLOX_IDS || '')
  .split(',').map((id) => id.trim()).filter(Boolean);
// SMTP (Nodemailer). Se SMTP_HOST vazio, e-mails são logados no console (dev).
export const SMTP_HOST = process.env.SMTP_HOST || '';
export const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
export const SMTP_USER = process.env.SMTP_USER || '';
export const SMTP_PASS = process.env.SMTP_PASS || '';
export const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@bloxai.app';
export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bloxai';
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Stripe (upgrades de plano recorrente)
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Cloudinary (armazenamento de imagens — NUNCA salvar imagem no banco)
export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '';
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';

// AI Keys
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// Pricing / Billing
// Margem de lucro padrão da plataforma (em %). O multiplicador inverso é 1 / (1 - M/100).
export const DEFAULT_MARGIN_PERCENT = clampNumber(process.env.PROFIT_MARGIN_PERCENT, 50, 0, 99);
// Saldo inicial (em dólares cobrados) concedido a cada nova conta. 0 = sem bônus.
export const SIGNUP_BONUS_BALANCE_USD = clampNumber(process.env.SIGNUP_BONUS_BALANCE_USD, 0, 0, Number.MAX_SAFE_INTEGER);
// Lista de e-mails que recebem papel de admin automaticamente no registro/login.
export const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

function clampNumber(raw, fallback, min, max) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
