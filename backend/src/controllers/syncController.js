import Project from "../models/Project.js";

export const getTree = async (req, res) => {
  try {
    const project = await Project.findOne({ 
      _id: req.params.projectId, 
      owner: req.userId 
    });

    if (!project) {
      return res.status(404).json({ message: "Projeto não encontrado" });
    }

    res.json({ tree: project.tree || [] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateTree = async (req, res) => {
  try {
    const { tree } = req.body;
    
    const project = await Project.findOneAndUpdate(
      { _id: req.params.projectId, owner: req.userId },
      { tree, lastEdit: new Date() },
      { new: true }
    );

    if (!project) {
      return res.status(404).json({ message: "Projeto não encontrado" });
    }

    res.json({ tree: project.tree });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};