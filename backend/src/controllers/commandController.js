import Command from "../models/Command.js";

export const list = async (req, res) => {
  try {
    const { projectId } = req.query;
    const query = projectId && projectId !== "all" ? { projectId } : { userId: req.userId };
    
    const commands = await Command.find(query)
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json(commands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const { projectId, command, type } = req.body;
    
    const cmd = new Command({
      projectId,
      userId: req.userId,
      command,
      mode: type || "think",
      status: "pending",
    });

    await cmd.save();
    res.status(201).json(cmd);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const rollback = async (req, res) => {
  try {
    const command = await Command.findOne({ _id: req.params.id, userId: req.userId });
    if (!command) {
      return res.status(404).json({ message: "Comando não encontrado" });
    }

    command.status = "rolledback";
    await command.save();

    // Aqui você implementaria a lógica real de rollback usando command.snapshot
    res.json({ message: "Rollback executado", command });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};