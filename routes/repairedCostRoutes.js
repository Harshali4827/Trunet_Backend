import express from "express";
import upload from '../middlewares/upload.js';
import {
  getAllRepairCosts,
  getRepairCostById,
  getRepairCostByProductId,
  createRepairCost,
  updateRepairCost,
  deleteRepairCost,
  bulkImportRepairCosts,
  downloadRepairCostTemplate,
} from "../controllers/repairCostController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getAllRepairCosts);
router.get("/template", downloadRepairCostTemplate);
router.get("/:id", getRepairCostById);

router.get("/product/:productId", getRepairCostByProductId);

router.post("/", createRepairCost);

router.put("/:id", updateRepairCost);

router.delete("/:id", deleteRepairCost);
router.post("/bulk-import", upload.single('file'), bulkImportRepairCosts);

export default router;