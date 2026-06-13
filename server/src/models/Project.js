const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  placeId: {
    type: String,
    sparse: true
  },
  snapshot: {
    lastScanAt: Date,
    dataModelHash: String,
    services: [{
      name: String,
      className: String,
      children: [mongoose.Schema.Types.Mixed]
    }],
    scripts: [{
      path: String,
      name: String,
      scriptType: String,
      lineCount: Number,
      hash: String
    }],
    stats: {
      totalInstances: Number,
      totalScripts: Number,
      totalParts: Number,
      totalUIs: Number
    }
  },
  preferences: {
    language: { type: String, default: 'pt-BR' },
    codeStyle: { type: String, default: 'oop' },
    autoApply: { type: Boolean, default: false },
    confirmBeforeEdit: { type: Boolean, default: true }
  },
  stats: {
    totalSessions: { type: Number, default: 0 },
    totalActions: { type: Number, default: 0 },
    lastAccessedAt: Date
  },
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

projectSchema.index({ userId: 1 });
projectSchema.index({ userId: 1, name: 1 });
projectSchema.index({ placeId: 1 });
projectSchema.index({ isArchived: 1 });

projectSchema.virtual('sessions', {
  ref: 'Session',
  localField: '_id',
  foreignField: 'projectId'
});

projectSchema.methods.updateLastAccessed = async function() {
  this.stats.lastAccessedAt = new Date();
  await this.save();
};

projectSchema.methods.archive = async function() {
  this.isArchived = true;
  await this.save();
};

module.exports = mongoose.model('Project', projectSchema);
