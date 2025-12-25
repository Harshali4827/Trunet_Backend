
import express from "express";
import {
  createCenterReturn,
} from "../controllers/centerReturnController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();
router.post("/",protect, createCenterReturn);

export default router;