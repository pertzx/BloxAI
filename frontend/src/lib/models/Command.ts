import mongoose from 'mongoose';

const commandSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  chatId: { type: String, index: true, default: 'default' },
  chatTitle: { type: String, default: 'Chat principal' },
  requestId: { type: String, index: true },
  parentCommandId: { type: String, index: true },
  action: { type: String, required: true }, // ex: 'CreateScript', 'MovePart'
  payload: { type: mongoose.Schema.Types.Mixed, required: true }, // Dados do comando
  status: {
    type: String,
    enum: ['AWAITING_APPROVAL', 'PENDING', 'QUEUED', 'EXECUTING', 'DONE', 'FAILED', 'FAILED_FINAL', 'CANCELLED'],
    default: 'PENDING',
  },
  requiresApproval: { type: Boolean, default: false },
  approvedByUser: { type: Boolean, default: false },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 1 },
  result: { type: mongoose.Schema.Types.Mixed }, // Resultado da execução no Studio
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

commandSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

if (mongoose.models.Command) {
  delete mongoose.models.Command;
}

export const Command = mongoose.model('Command', commandSchema);
