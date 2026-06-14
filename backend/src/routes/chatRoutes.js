import express from "express";
const router = express.Router();
import { send, stream, history } from "../controllers/chatController.js";
import authMiddleware from "../middlewares/auth.js";

router.post("/", authMiddleware, send);
router.get("/stream", stream); // SSE — token via query
router.get("/history/:projectId", authMiddleware, history);

export default router;
