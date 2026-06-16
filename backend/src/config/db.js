import mongoose from 'mongoose';
import { MONGODB_URI } from './env.js';

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      // Pool conservador: evita esgotar cota de conexões do Atlas Free (max 500)
      maxPoolSize: 10,
      minPoolSize: 2,
      // Falha rápido se o cluster estiver inacessível (5s)
      serverSelectionTimeoutMS: 5000,
      // Fecha sockets ociosos após 45s para liberar cota
      socketTimeoutMS: 45000,
      // Mata conexões paradas no pool após 30s
      maxIdleTimeMS: 30000,
    });
    console.log('[Blox AI] Conectado ao MongoDB com sucesso.');
  } catch (error) {
    console.error('[Blox AI] Erro ao conectar ao MongoDB:', error);
    process.exit(1);
  }
};
