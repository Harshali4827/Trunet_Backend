import express from "express";
import {
  createReseller,
  getResellers,
  getResellerById,
  updateReseller,
  deleteReseller
} from "../controllers/resellerController.js";
import { createResellerValidator, updateResellerValidator } from "../validations/resellerValidator.js";

const router = express.Router();

router.post("/", createResellerValidator,createReseller);
router.get("/", getResellers);
router.get("/:id", getResellerById);
router.put("/:id", updateResellerValidator,updateReseller);
router.delete("/:id", deleteReseller);

export default router;
