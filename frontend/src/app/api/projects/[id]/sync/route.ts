import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/lib/models/Project';
import { verifyAuth } from '@/lib/auth';

function normalizeNode(node: any): any {
  if (!node || typeof node !== 'object') return null;

  const nome = typeof node.nome === 'string' ? node.nome.trim() : '';
  const propriedades = node.propriedades && typeof node.propriedades === 'object' ? node.propriedades : {};
  const filhos = Array.isArray(node.filhos) ? node.filhos.map(normalizeNode).filter(Boolean) : [];

  if (!nome) return null;

  const normalizedProps = Object.fromEntries(
    Object.entries(propriedades).filter(([key, value]) => typeof key === 'string' && value !== undefined)
  );

  return { nome, propriedades: normalizedProps, filhos };
}

function countNodes(nodes: any[]): number {
  return nodes.reduce((acc, node) => acc + 1 + countNodes(Array.isArray(node?.filhos) ? node.filhos : []), 0);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json({ success: true, diffs: [] });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao sincronizar estado' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    await connectDB();
    const rawBody = await req.text();
    let data: any = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch (parseError) {
      return NextResponse.json({ error: 'JSON inválido no sync' }, { status: 400 });
    }

    const project = await Project.findOne({ _id: params.id, owner: user.id });
    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 });
    }

    // Atualiza o lastSync e o status para Online sempre que o plugin envia um heartbeat/diff
    project.lastSync = new Date();
    project.status = 'Online';

    if (data.type === 'FullSync' && data.tree) {
      const normalizedTree = Array.isArray(data.tree)
        ? data.tree.map(normalizeNode).filter(Boolean)
        : [];
      project.workspaceNodes = normalizedTree;
    }

    project.markModified('workspaceNodes');
    await project.save();

    return NextResponse.json({
      success: true,
      workspaceNodeCount: countNodes(Array.isArray(project.workspaceNodes) ? project.workspaceNodes : []),
      lastSync: project.lastSync,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao receber estado' }, { status: 500 });
  }
}
