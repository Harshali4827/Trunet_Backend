import express from "express";
import {
  controlRoomIdValidator,
  createControlRoomValidator,
  updateControlRoomValidator,
} from "../validations/controlRoomValidator.js";
import {
  createControlRoom,
  deleteControlRoom,
  getControlRoomById,
  getControlRooms,
  updateControlRoom,
} from "../controllers/controlRoomController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createControlRoomValidator, createControlRoom);
router.get("/", protect, getControlRooms);
router.get("/:id", protect, controlRoomIdValidator, getControlRoomById);
router.put("/:id", protect, updateControlRoomValidator, updateControlRoom);
router.delete("/:id", protect, controlRoomIdValidator, deleteControlRoom);

export default router;
