import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  placeId: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Online', 'Offline'], default: 'Offline' },
  lastSync: { type: Date, default: Date.now },
  apiKey: { type: String, required: true, unique: true },
  workspaceNodes: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
});

const existingProjectModel = mongoose.models.Project;

if (existingProjectModel && !existingProjectModel.schema.path('workspaceNodes')) {
  delete mongoose.models.Project;
}

export const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);
