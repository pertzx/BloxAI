import mongoose from "mongoose";

const commandSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  command: { type: String, required: true },
  mode: { type: String, enum: ["think", "instant"], default: "think" },
  status: { type: String, enum: ["pending", "success", "error", "rolledback"], default: "pending" },
  response: { type: String },
  snapshot: { type: Object }, // Para rollback
  codeBlocks: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Command", commandSchema);
