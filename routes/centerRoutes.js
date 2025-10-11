import express from "express";
import {
  createCenter,
  getCenters,
  getCenterById,
  getCentersByPartner,
  getCentersByArea,
  updateCenter,
  deleteCenter,
} from "../controllers/centerController.js";
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();
const MODULE = "Center";

router.use(protect);

router.post(
  "/",
  authorizeAccess(MODULE, "manage_all_center", "manage_own_center"),
  createCenter
);

router.get(
  "/",
  protect,
  authorizeAccess(MODULE, "view_own_center", "view_all_center"),
  getCenters
);

router.get(
  "/:id",
  authorizeAccess(MODULE, "view_own_center", "view_all_center"),
  getCenterById
);

router.get(
  "/partner/:partnerId",
  authorizeAccess(MODULE, "view_own_center", "view_all_center"),
  getCentersByPartner
);

router.get(
  "/area/:areaId",
  authorizeAccess(MODULE, "view_own_center", "view_all_center"),
  getCentersByArea
);

router.put(
  "/:id",
  authorizeAccess(MODULE, "manage_own_center", "manage_all_center"),
  updateCenter
);

router.delete(
  "/:id",
  authorizeAccess(MODULE, "manage_own_center", "manage_all_center"),
  deleteCenter
);

export default router;
