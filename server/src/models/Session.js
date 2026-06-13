const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  tokensUsed: Number,
  actions: [mongoose.Schema.Types.Mixed]
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  title: {
    type: String,
    default: 'Nova Conversa'
  },
  messages: [messageSchema],
  context: {
    projectSnapshotAtStart: mongoose.Schema.Types.Mixed,
    preferences: mongoose.Schema.Types.Mixed
  },
  stats: {
    totalMessages: { type: Number, default: 0 },
    totalActions: { type: Number, default: 0 },
    tokensUsed: { type: Number, default: 0 }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  endedAt: Date
}, {
  timestamps: true
});

sessionSchema.index({ userId: 1 });
sessionSchema.index({ projectId: 1 });
sessionSchema.index({ userId: 1, updatedAt: -1 });
sessionSchema.index({ isActive: 1 });

sessionSchema.methods.addMessage = async function(role, content, tokensUsed = 0, actions = []) {
  this.messages.push({
    role,
    content,
    tokensUsed,
    actions
  });
  this.stats.totalMessages += 1;
  this.stats.tokensUsed += tokensUsed;
  if (actions) {
    this.stats.totalActions += actions.length;
  }
  await this.save();
};

sessionSchema.methods.end = async function() {
  this.isActive = false;
  this.endedAt = new Date();
  await this.save();
};

sessionSchema.methods.getRecentMessages = function(limit = 10) {
  return this.messages.slice(-limit);
};

module.exports = mongoose.model('Session', sessionSchema);
