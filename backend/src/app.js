import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/bloxai")
  .then(() => console.log("MongoDB conectado"))
  .catch((err) => console.error("MongoDB erro:", err));

// Routes
import authRoutes from "./routes/authRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import commandRoutes from "./routes/commandRoutes.js";
import syncRoutes from "./routes/syncRoutes.js";
import pluginRoutes from "./routes/pluginRoutes.js";

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/chat", chatRoutes);        // NOVO
app.use("/api/commands", commandRoutes);  // NOVO
app.use("/api/sync", syncRoutes);        // NOVO
app.use("/api/plugin", pluginRoutes);

// Health check
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Erro interno do servidor" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));

export default app;
