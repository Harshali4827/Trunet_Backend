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
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";
const MODULE = "Settings";
const router = express.Router();

router.post(
  "/",
  protect,
  authorizeAccess(
    MODULE,
    "manage_control_room_all_center",
    "manage_control_room_own_center"
  ),
  createControlRoomValidator,
  createControlRoom
);
router.get(
  "/",  protect,
  authorizeAccess(
    MODULE,
    "view_control_room_own_center",
    "view_control_room_all_center"
  ),

  getControlRooms
);
router.get(
  "/:id",  protect,
  authorizeAccess(
    MODULE,
    "view_control_room_own_center",
    "view_control_room_all_center"
  ),

  controlRoomIdValidator,
  getControlRoomById
);
router.put(
  "/:id",
  protect,
  authorizeAccess(
    MODULE,
    "manage_control_room_all_center",
    "manage_control_room_own_center"
  ),
  updateControlRoomValidator,
  updateControlRoom
);
router.delete(
  "/:id",
  protect,
  authorizeAccess(
    MODULE,
    "manage_control_room_all_center",
    "manage_control_room_own_center"
  ),
  controlRoomIdValidator,
  deleteControlRoom
);

export default router;
