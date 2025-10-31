import express from "express";
import { getAllData } from "../controllers/getAllDataController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/all-data",protect, getAllData);


export default router;
