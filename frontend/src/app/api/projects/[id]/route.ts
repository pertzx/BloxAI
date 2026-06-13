import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/lib/models/Project';
import { verifyAuth } from '@/lib/auth';

const MODEL_OPTIONS = ['DeepSeek-V3', 'GPT-5.4 Mini', 'Claude 3.5'] as const;

function countNodes(nodes: any[]): number {
  return nodes.reduce((acc, node) => acc + 1 + countNodes(Array.isArray(node?.filhos) ? node.filhos : []), 0);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    await connectDB();
    const project = await Project.findOne({ _id: params.id, owner: user.id });
    
    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 });
    }

    const now = Date.now();
    const syncAgeMs = now - new Date(project.lastSync).getTime();
    const isOnline = syncAgeMs < 15000;
    const isSyncHealthy = syncAgeMs < 10000;
    if (project.status === 'Online' && !isOnline) {
      project.status = 'Offline';
      await project.save();
    } else if (project.status === 'Offline' && isOnline) {
      project.status = 'Online';
      await project.save();
    }

    const latestStudioProject = await Project.findOne({ owner: user.id })
      .sort({ lastSync: -1 })
      .select('_id name placeId lastSync status')
      .lean();

    const availableModels = MODEL_OPTIONS.filter((model) => {
      if (model === 'DeepSeek-V3') return Boolean(process.env.DEEPSEEK_API_KEY);
      if (model === 'GPT-5.4 Mini') return Boolean(process.env.OPENAI_API_KEY);
      return Boolean(process.env.ANTHROPIC_API_KEY);
    });

    const hasOtherActiveStudioProject =
      latestStudioProject &&
      String(latestStudioProject._id) !== String(project._id) &&
      now - new Date(latestStudioProject.lastSync).getTime() < 10000;

    return NextResponse.json({
      ...project.toObject(),
      syncAgeMs,
      isSyncHealthy,
      syncWarning: isSyncHealthy
        ? null
        : 'Projeto desincronizado ha mais de 10 segundos. Nao e seguro executar sem sincronizacao recente.',
      availableModels,
      activeStudioProject: hasOtherActiveStudioProject
        ? {
            id: String(latestStudioProject._id),
            name: latestStudioProject.name,
            placeId: latestStudioProject.placeId,
            lastSync: latestStudioProject.lastSync,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar detalhes' }, { status: 500 });
  }
}
