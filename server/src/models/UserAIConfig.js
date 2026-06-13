const mongoose = require('mongoose');

const userAIConfigSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  defaultProvider: {
    type: String,
    enum: ['openai', 'gemini', 'kimi', 'custom', 'blox'],
    default: 'blox'
  },
  defaultModel: {
    type: String,
    default: 'balanced'
  },
  apiKeys: {
    openai: {
      key: { type: String, select: false },
      isValid: { type: Boolean, default: false },
      validatedAt: Date
    },
    gemini: {
      key: { type: String, select: false },
      isValid: { type: Boolean, default: false },
      validatedAt: Date
    },
    kimi: {
      key: { type: String, select: false },
      isValid: { type: Boolean, default: false },
      validatedAt: Date
    },
    custom: {
      key: { type: String, select: false },
      baseURL: String,
      model: String,
      isValid: { type: Boolean, default: false },
      validatedAt: Date
    }
  },
  usage: {
    openai: {
      requestsToday: { type: Number, default: 0 },
      lastRequestAt: Date
    },
    gemini: {
      requestsToday: { type: Number, default: 0 },
      lastRequestAt: Date
    },
    kimi: {
      requestsToday: { type: Number, default: 0 },
      lastRequestAt: Date
    },
    custom: {
      requestsToday: { type: Number, default: 0 },
      lastRequestAt: Date
    }
  },
  preferences: {
    temperature: { type: Number, default: 0.1, min: 0, max: 2 },
    maxTokens: { type: Number, default: 4000 },
    timeout: { type: Number, default: 30000 }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

userAIConfigSchema.index({ userId: 1 });
userAIConfigSchema.index({ 'apiKeys.openai.isValid': 1 });
userAIConfigSchema.index({ 'apiKeys.gemini.isValid': 1 });

userAIConfigSchema.methods.getApiKey = async function(provider) {
  const encryptedKey = this.apiKeys[provider]?.key;
  if (!encryptedKey) return null;
  
  const { decrypt } = require('../utils/encryption');
  return decrypt(encryptedKey);
};

userAIConfigSchema.methods.setApiKey = async function(provider, key) {
  const { encrypt } = require('../utils/encryption');
  const encryptedKey = encrypt(key);
  
  this.apiKeys[provider].key = encryptedKey;
  this.apiKeys[provider].validatedAt = new Date();
  await this.save();
};

userAIConfigSchema.methods.incrementUsage = async function(provider) {
  this.usage[provider].requestsToday += 1;
  this.usage[provider].lastRequestAt = new Date();
  await this.save();
};

module.exports = mongoose.model('UserAIConfig', userAIConfigSchema);
