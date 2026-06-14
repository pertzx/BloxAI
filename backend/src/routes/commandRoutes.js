import express from "express";
const router = express.Router();
import { list, create, rollback } from "../controllers/commandController.js";
import authMiddleware from "../middlewares/auth.js";

router.get("/", authMiddleware, list);
router.post("/", authMiddleware, create);
router.post("/:id/rollback", authMiddleware, rollback);

export default router;
