import mongoose from 'mongoose';

// Tarefa assíncrona de IA (modo Think). O cliente recebe o taskId na hora (202)
// e faz polling até status 'done'/'failed'.
const aiJobSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  intent: { type: String, required: true },
  chatId: { type: String, default: 'default' },
  chatTitle: { type: String, default: 'Chat principal' },
  model: { type: String, default: '' },
  mode: { type: String, default: 'think' },
  status: {
    type: String,
    enum: ['queued', 'processing', 'done', 'failed'],
    default: 'queued',
    index: true,
  },
  result: { type: mongoose.Schema.Types.Mixed, default: null }, // aiResult final
  billing: { type: mongoose.Schema.Types.Mixed, default: null },
  commandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Command', default: null },
  error: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

aiJobSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export const AiJob = mongoose.models.AiJob || mongoose.model('AiJob', aiJobSchema);
