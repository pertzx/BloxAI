import mongoose from 'mongoose';

const emailQueueSchema = new mongoose.Schema({
  to: { type: String, required: true },
  subject: { type: String, required: true },
  html: { type: String, required: true },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: null },
  nextRetryAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

emailQueueSchema.index({ status: 1, nextRetryAt: 1 });

export default mongoose.model('EmailQueue', emailQueueSchema);
