import express from "express";
const router = express.Router();
import { list, create, get, update, deleteProject } from "../controllers/projectController.js";
import authMiddleware from "../middlewares/auth.js";

router.get("/", authMiddleware, list);
router.post("/", authMiddleware, create);
router.get("/:id", authMiddleware, get);
router.put("/:id", authMiddleware, update);
router.delete("/:id", authMiddleware, deleteProject);

export default router;
