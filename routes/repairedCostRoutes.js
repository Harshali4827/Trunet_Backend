import express from "express";
import {
  getAllRepairCosts,
  getRepairCostById,
  getRepairCostByProductId,
  createRepairCost,
  updateRepairCost,
  deleteRepairCost,
} from "../controllers/repairCostController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getAllRepairCosts);

router.get("/:id", getRepairCostById);

router.get("/product/:productId", getRepairCostByProductId);

router.post("/", createRepairCost);

router.put("/:id", updateRepairCost);

router.delete("/:id", deleteRepairCost);

export default router;