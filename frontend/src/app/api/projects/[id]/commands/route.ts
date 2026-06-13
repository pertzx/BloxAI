import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Command } from '@/lib/models/Command';
import { Project } from '@/lib/models/Project';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    await connectDB();
    const project = await Project.findOne({ _id: params.id, owner: user.id });
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('chatId');
    const filter: Record<string, unknown> = { project: params.id };

    if (chatId) {
      filter.chatId = chatId;
    }

    const commands = await Command.find(filter).sort({ createdAt: 1 });
    
    return NextResponse.json(commands);
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar comandos' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    await connectDB();
    const project = await Project.findOne({ _id: params.id, owner: user.id });
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 });

    const { parentCommandId, decision } = await req.json();
    if (!parentCommandId || !['approve', 'cancel'].includes(decision)) {
      return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    const parentCommand = await Command.findOne({
      _id: parentCommandId,
      project: params.id,
      action: 'LogIntent',
    });
    if (!parentCommand) {
      return NextResponse.json({ error: 'Requisição não encontrada' }, { status: 404 });
    }

    const requestId = parentCommand.requestId || String(parentCommand._id);
    const now = new Date();

    if (decision === 'approve') {
      await Command.updateMany(
        { project: params.id, requestId, parentCommandId: String(parentCommand._id), status: 'AWAITING_APPROVAL' },
        {
          $set: {
            status: 'PENDING',
            approvedByUser: true,
            approvedAt: now,
            updatedAt: now,
          },
        }
      );

      parentCommand.status = 'QUEUED';
      parentCommand.requiresApproval = true;
      parentCommand.approvedByUser = true;
      parentCommand.approvedAt = now;
      parentCommand.payload = {
        ...(parentCommand.payload || {}),
        approvalState: 'approved',
      };
      await parentCommand.save();
    }

    if (decision === 'cancel') {
      await Command.updateMany(
        {
          project: params.id,
          requestId,
          parentCommandId: String(parentCommand._id),
          status: { $in: ['AWAITING_APPROVAL', 'PENDING', 'QUEUED'] },
        },
        {
          $set: {
            status: 'CANCELLED',
            rejectedAt: now,
            updatedAt: now,
            result: 'Cancelado pelo usuário antes da execução.',
          },
        }
      );

      parentCommand.status = 'CANCELLED';
      parentCommand.rejectedAt = now;
      parentCommand.payload = {
        ...(parentCommand.payload || {}),
        approvalState: 'cancelled',
      };
      await parentCommand.save();
    }

    const commands = await Command.find({ project: params.id, requestId }).sort({ createdAt: 1 });
    return NextResponse.json({ success: true, commands });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao atualizar aprovação' }, { status: 500 });
  }
}
