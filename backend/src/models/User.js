import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  // ── Identidade Roblox (fonte primária de autenticação) ────────────────────
  robloxId: { type: String, required: true, unique: true },
  robloxUsername: { type: String, default: '' },
  robloxDisplayName: { type: String, default: '' },
  robloxAvatarUrl: { type: String, default: '' },

  // ── E-mail de segurança (opcional, apenas para recuperação de conta) ───────
  securityEmail: { type: String, default: null },
  securityEmailVerified: { type: Boolean, default: false },
  // Token enviado no e-mail de verificação (SHA-256 hex)
  securityEmailToken: { type: String, default: null, select: false },
  securityEmailTokenExpires: { type: Date, default: null },

  // ── Magic link de recuperação de conta ───────────────────────────────────
  recoveryToken: { type: String, default: null, select: false },
  recoveryTokenExpires: { type: Date, default: null },

  // ── Plano e role ──────────────────────────────────────────────────────────
  // planKey referencia Plan.key (config dinâmica). `plan` guarda o nome de exibição.
  planKey: { type: String, default: 'free' },
  plan: { type: String, default: 'Free' },
  planType: { type: String, enum: ['recurring', 'prepaid'], default: 'prepaid' },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
  suspendedUntil: { type: Date, default: null },

  // ── Carteira pré-paga ─────────────────────────────────────────────────────
  balanceUsd: { type: Number, default: 0 },
  walletStartUsd: { type: Number, default: 0 },
  marginPercent: { type: Number, default: null },

  // ── Auditoria lifetime ────────────────────────────────────────────────────
  totalRealCostUsd: { type: Number, default: 0 },
  totalChargedUsd: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
});

// Index para recuperação por e-mail de segurança
userSchema.index({ securityEmail: 1 }, { sparse: true });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
