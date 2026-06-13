import mongoose from 'mongoose';
import { MONGODB_URI } from './env.js';

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('[Blox AI] Conectado ao MongoDB com sucesso.');
  } catch (error) {
    console.error('[Blox AI] Erro ao conectar ao MongoDB:', error);
    process.exit(1);
  }
};
