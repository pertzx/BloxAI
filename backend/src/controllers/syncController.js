import { Project } from '../models/Project.js';

function normalizeNode(node) {
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

function countNodes(nodes = []) {
  return nodes.reduce((acc, node) => acc + 1 + countNodes(Array.isArray(node?.filhos) ? node.filhos : []), 0);
}

export const getSyncState = async (req, res) => {
  try {
    res.json({ success: true, diffs: [] });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao sincronizar estado' });
  }
};

export const postSyncState = async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    const data = req.body || {};
    project.lastSync = new Date();
    project.status = 'Online';

    if (data.type === 'FullSync' && data.tree) {
      project.workspaceNodes = Array.isArray(data.tree)
        ? data.tree.map(normalizeNode).filter(Boolean)
        : [];
    }

    project.markModified('workspaceNodes');
    await project.save();

    return res.json({
      success: true,
      workspaceNodeCount: countNodes(Array.isArray(project.workspaceNodes) ? project.workspaceNodes : []),
      lastSync: project.lastSync,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao receber estado' });
  }
};
