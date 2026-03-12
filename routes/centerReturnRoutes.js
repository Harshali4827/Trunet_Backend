
import express from "express";
import {
  // acceptCenterReturn,
  createCenterReturn,
} from "../controllers/centerReturnController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();
router.post("/",protect, createCenterReturn);
// router.put("/:returnId/accept", protect, acceptCenterReturn)
export default router;