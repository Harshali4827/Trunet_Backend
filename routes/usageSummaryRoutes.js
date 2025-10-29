import express from "express";
import { getUsageSummary } from "../controllers/usageSummaryController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/reports/indent-usage-summary", protect, getUsageSummary);

export default router;