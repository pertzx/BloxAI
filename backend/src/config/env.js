import dotenv from 'dotenv';
dotenv.config();

export const PORT = process.env.PORT || 3000;
export const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback';
export const ROBLOX_OAUTH_CLIENT_ID = process.env.ROBLOX_OAUTH_CLIENT_ID || '';
export const ROBLOX_OAUTH_CLIENT_SECRET = process.env.ROBLOX_OAUTH_CLIENT_SECRET || '';
export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bloxai';
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// AI Keys
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
