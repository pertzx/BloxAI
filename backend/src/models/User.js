import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  username: { type: String, required: true },
  plan: { type: String, enum: ['Free', 'Creator', 'Studio', 'Enterprise'], default: 'Free' },
  createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.model('User', userSchema);
