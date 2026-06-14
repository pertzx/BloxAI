import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  universeId: { type: String, required: true },
  plan: { type: String, enum: ["free", "pro", "enterprise"], default: "free" },
  tokensUsed: { type: Number, default: 0 },
  tokensLimit: { type: Number, default: 100000 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("User", userSchema);
