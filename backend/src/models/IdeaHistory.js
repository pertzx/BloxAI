import mongoose from 'mongoose';

const ideaSchema = new mongoose.Schema({
  title: String,
  tagline: String,
  genre: String,
  coreLoop: String,
  viralMechanic: String,
  monetization: { type: [String], default: [] },
  uniqueHook: String,
  targetAudience: String,
  estimatedDifficulty: String,
}, { _id: false });

const ideaHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  theme: { type: String, default: '' },
  idea: { type: ideaSchema, required: true },
  imageUrl: { type: String, default: '' }, // data URL (base64) da imagem gerada
  model: { type: String, default: '' },
  // Quando esta ideia nasceu de uma edição/refino de outra.
  refinedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'IdeaHistory', default: null },
  instruction: { type: String, default: '' }, // instrução de edição usada (se refino)
  appliedTo: {
    type: [{
      projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
      projectName: String,
      at: { type: Date, default: Date.now },
    }],
    default: [],
  },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const IdeaHistory = mongoose.models.IdeaHistory || mongoose.model('IdeaHistory', ideaHistorySchema);
