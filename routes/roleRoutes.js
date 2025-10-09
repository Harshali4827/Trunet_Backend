import express from "express";
import {
  createRole,
  getRoles,
  getRoleById,
  updateRole,
  deleteRole,
} from "../controllers/rolesController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", createRole);
router.get("/", getRoles);
router.get("/:id", getRoleById);
router.put("/:id", updateRole);
router.delete("/:id", protect, deleteRole);

export default router;
