import { Project } from '../models/Project.js';

export const getContextState = async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id }).lean();
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({ contextState: project.contextState || [] });
  } catch (err) {
    console.error('[context] getContextState:', err);
    res.status(500).json({ error: 'Falha ao carregar contexto.' });
  }
};

export const putContextState = async (req, res) => {
  try {
    const { contextState } = req.body || {};
    if (!Array.isArray(contextState)) {
      return res.status(400).json({ error: 'contextState deve ser um array.' });
    }

    const sanitized = contextState
      .filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string' && item.text.trim())
      .map((item) => ({
        id:        String(item.id),
        text:      String(item.text).trim().slice(0, 500),
        done:      Boolean(item.done),
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
      }))
      .slice(0, 100);

    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { $set: { contextState: sanitized } },
      { new: true }
    ).lean();

    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({ success: true, contextState: project.contextState });
  } catch (err) {
    console.error('[context] putContextState:', err);
    res.status(500).json({ error: 'Falha ao salvar contexto.' });
  }
};
