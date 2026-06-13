import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Command } from '@/lib/models/Command';
import { Project } from '@/lib/models/Project';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    await connectDB();
    
    // O plugin passa a enviar Authorization header
    // Retorna comandos baseados no projeto do usuário (mais recente)
    const project = await Project.findOne({ owner: user.id }).sort({ lastSync: -1 });
    if (!project) return NextResponse.json({ command: null });

    const command = await Command.findOne({ project: project._id, status: 'PENDING' }).sort({ createdAt: 1 });
    if (!command) {
      return NextResponse.json({ command: null });
    }

    if (command.parentCommandId) {
      await Command.updateOne(
        { _id: command.parentCommandId },
        { $set: { status: 'EXECUTING', updatedAt: new Date() } }
      );
    }

    command.status = 'EXECUTING';
    await command.save();
    
    return NextResponse.json({ command });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar comando' }, { status: 500 });
  }
}
