import mongoose from "mongoose";

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  universeId: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["active", "paused", "archived"], default: "active" },
  tokensUsed: { type: Number, default: 0 },
  tree: { type: Array, default: [] },
  lastEdit: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Project", projectSchema);
