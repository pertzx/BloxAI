const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  },
  robloxId: {
    type: String,
    unique: true,
    sparse: true
  },
  robloxUsername: {
    type: String
  },
  profile: {
    firstName: String,
    lastName: String,
    avatar: String
  },
  preferences: {
    language: { type: String, default: 'pt-BR' },
    codeStyle: { type: String, default: 'oop' },
    theme: { type: String, default: 'dark' }
  },
  apiKey: {
    type: String,
    unique: true,
    sparse: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLoginAt: Date,
  emailVerifiedAt: Date,
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  refreshTokens: [{
    token: String,
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date,
    deviceInfo: String
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

userSchema.index({ email: 1 });
userSchema.index({ robloxId: 1 });
userSchema.index({ apiKey: 1 });

userSchema.virtual('projects', {
  ref: 'Project',
  localField: '_id',
  foreignField: 'userId'
});

userSchema.virtual('subscription', {
  ref: 'Subscription',
  localField: '_id',
  foreignField: 'userId',
  justOne: true
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

module.exports = mongoose.model('User', userSchema);
