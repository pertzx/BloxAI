import { Project } from '../models/Project.js';
import { Command } from '../models/Command.js';
import { ModelRegistry } from '../services/ModelRegistry.js';
import crypto from 'crypto';

export const getProjects = async (req, res) => {
  try {
    const projects = await Project.find({ owner: req.user.id });
    const logIntents = await Command.find({
      action: 'LogIntent',
      project: { $in: projects.map((item) => item._id) },
    })
      .select('project payload createdAt')
      .lean();

    const now = Date.now();
    const updatedProjects = await Promise.all(
      projects.map(async (project) => {
        const isOnline = now - new Date(project.lastSync).getTime() < 15000;

        if (project.status === 'Online' && !isOnline) {
          project.status = 'Offline';
          await project.save();
        } else if (project.status === 'Offline' && isOnline) {
          project.status = 'Online';
          await project.save();
        }

        return project;
      })
    );

    const metricsByProject = new Map();
    for (const item of logIntents) {
      const key = String(item.project);
      const telemetry = item.payload?.aiTelemetry || {};
      const current = metricsByProject.get(key) || {
        messages: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      };
      current.messages += 1;
      current.inputTokens += Number(telemetry.inputTokens || 0);
      current.outputTokens += Number(telemetry.outputTokens || 0);
      current.totalTokens += Number(telemetry.totalTokens || 0);
      current.estimatedCostUsd += Number(telemetry.estimatedCostUsd || 0);
      metricsByProject.set(key, current);
    }

    res.json(
      updatedProjects.map((project) => {
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
    res.status(500).json({ error: 'Erro ao buscar projetos' });
  }
};

export const createProject = async (req, res) => {
  try {
    const { name, placeId } = req.body;
    
    if (!name || !placeId) {
      return res.status(400).json({ error: 'Nome e Place ID são obrigatórios' });
    }

    const apiKey = crypto.randomBytes(32).toString('hex');

    const newProject = await Project.create({
      name,
      placeId,
      owner: req.user.id,
      apiKey
    });

    res.status(201).json(newProject);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar projeto' });
  }
};

export const getProjectDetails = async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });

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

    const latestStudioProject = await Project.findOne({ owner: req.user.id })
      .sort({ lastSync: -1 })
      .select('_id name placeId lastSync status')
      .lean();

    // Modelos disponíveis = habilitados pelo admin com chave de provedor configurada.
    const availableModels = ModelRegistry.availableLabels();

    const hasOtherActiveStudioProject =
      latestStudioProject &&
      String(latestStudioProject._id) !== String(project._id) &&
      now - new Date(latestStudioProject.lastSync).getTime() < 10000;

    res.json({
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
    res.status(500).json({ error: 'Erro ao buscar detalhes do projeto' });
  }
};

function countNodes(nodes = []) {
  return nodes.reduce((acc, node) => acc + 1 + countNodes(Array.isArray(node?.filhos) ? node.filhos : []), 0);
}
