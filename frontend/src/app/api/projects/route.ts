import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/lib/models/Project';
import { Command } from '@/lib/models/Command';
import { verifyAuth } from '@/lib/auth';
import crypto from 'crypto';

function countNodes(nodes: any[]): number {
  return nodes.reduce((acc, node) => acc + 1 + countNodes(Array.isArray(node?.filhos) ? node.filhos : []), 0);
}

export async function GET(req: Request) {
  try {
    const user = verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    await connectDB();
    const projects = await Project.find({ owner: user.id });
    const logIntents = await Command.find({ action: 'LogIntent', project: { $in: projects.map((item) => item._id) } })
      .select('project payload createdAt')
      .lean();
    
    // Calcula dinamicamente quem está Online (heartbeat nos últimos 15 segundos)
    const now = new Date().getTime();
    const updatedProjects = await Promise.all(projects.map(async (p) => {
      const isOnline = (now - new Date(p.lastSync).getTime()) < 15000; // 15 segundos
      
      if (p.status === 'Online' && !isOnline) {
        p.status = 'Offline';
        await p.save();
      } else if (p.status === 'Offline' && isOnline) {
        p.status = 'Online';
        await p.save();
      }
      return p;
    }));

    // #region debug-point api-projects-read
    console.info(
      '[debug projects list] count:',
      updatedProjects.length,
      'projects:',
      updatedProjects.map((project) => ({
        id: String(project._id),
        name: project.name,
        roots: Array.isArray(project.workspaceNodes) ? project.workspaceNodes.length : 0,
        totalNodes: countNodes(Array.isArray(project.workspaceNodes) ? project.workspaceNodes : []),
        status: project.status,
      }))
    );
    // #endregion

    const metricsByProject = new Map<string, any>();
    for (const item of logIntents) {
      const key = String(item.project);
      const telemetry = item.payload?.aiTelemetry || {};
      const current = metricsByProject.get(key) || {
        messages: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        avgResponseMs: 0,
      };
      current.messages += 1;
      current.inputTokens += Number(telemetry.inputTokens || 0);
      current.outputTokens += Number(telemetry.outputTokens || 0);
      current.totalTokens += Number(telemetry.totalTokens || 0);
      current.estimatedCostUsd += Number(telemetry.estimatedCostUsd || 0);
      metricsByProject.set(key, current);
    }

    return NextResponse.json(
      updatedProjects.map((project: any) => {
        const metrics = metricsByProject.get(String(project._id)) || {
          messages: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
        };
        return {
          ...project.toObject(),
          metrics: {
            ...metrics,
            estimatedCostUsd: Number(metrics.estimatedCostUsd.toFixed(6)),
          },
        };
      })
    );
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar projetos' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    await connectDB();
    const { name, placeId } = await req.json();
    
    if (!name || !placeId) {
      return NextResponse.json({ error: 'Nome e Place ID são obrigatórios' }, { status: 400 });
    }

    const apiKey = crypto.randomBytes(32).toString('hex');

    const newProject = await Project.create({
      name,
      placeId,
      owner: user.id,
      apiKey
    });

    return NextResponse.json(newProject, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao criar projeto' }, { status: 500 });
  }
}
