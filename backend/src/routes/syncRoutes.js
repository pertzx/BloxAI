import express from "express";
const router = express.Router();
import { getTree, updateTree } from "../controllers/syncController.js";
import authMiddleware from "../middlewares/auth.js";

router.get("/tree/:projectId", authMiddleware, getTree);
router.post("/tree/:projectId", authMiddleware, updateTree);

export default router;
