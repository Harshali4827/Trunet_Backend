import express from "express";
import {
  createStockClosing,
  getAllStockClosings,
  getStockClosingById,
  updateStockClosing,
  deleteStockClosing,
} from "../controllers/reportSubmissionController.js";
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post("/", protect, createStockClosing);

router.get("/", protect, getAllStockClosings);

router.get("/:id", protect, getStockClosingById);

router.put("/:id", protect, updateStockClosing);

router.delete("/:id", protect, deleteStockClosing);

export default router;
