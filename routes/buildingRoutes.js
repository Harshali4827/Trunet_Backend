import express from "express";
import {
  createBuilding,
  getBuildings,
  getBuildingById,
  updateBuilding,
  deleteBuilding,
} from "../controllers/buildingController.js";
import {
  createBuildingValidator,
  updateBuildingValidator,
  buildingIdValidator,
} from "../validations/buildingValidator.js";
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();
const MODULE = "Settings";

router.post(
  "/",
  protect,
  authorizeAccess(
    MODULE,
    "manage_building_all_center",
    "manage_building_own_center"
  ),
  createBuildingValidator,
  createBuilding
);
router.get(
  "/",
  protect,
  authorizeAccess(
    MODULE,
    "view_building_own_center",
    "view_building_all_center"
  ),
  getBuildings
);
router.get(
  "/:id",
  protect,
  authorizeAccess(
    MODULE,
    "view_building_own_center",
    "view_building_all_center"
  ),
  buildingIdValidator,
  getBuildingById
);
router.put(
  "/:id",
  protect,
  authorizeAccess(
    MODULE,
    "manage_building_all_center",
    "manage_building_own_center"
  ),
  updateBuildingValidator,
  updateBuilding
);
router.delete(
  "/:id",
  protect,
  authorizeAccess(
    MODULE,
    "manage_building_all_center",
    "manage_building_own_center"
  ),
  buildingIdValidator,
  deleteBuilding
);

export default router;
