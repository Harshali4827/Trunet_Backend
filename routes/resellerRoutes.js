import express from "express";
import {
  createReseller,
  getResellers,
  getResellerById,
  updateReseller,
  deleteReseller
} from "../controllers/resellerController.js";
import { createResellerValidator, updateResellerValidator } from "../validations/resellerValidator.js";
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";


const MODULE = "Indent";
const router = express.Router();


router.post("/",protect, createResellerValidator,createReseller);
router.get("/",protect, getResellers);
router.get("/:id",protect, getResellerById);
router.put("/:id",protect, updateResellerValidator,updateReseller);
router.delete("/:id",protect, deleteReseller);


export default router;
