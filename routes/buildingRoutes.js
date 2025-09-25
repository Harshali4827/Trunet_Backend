import express from 'express';
import {
  createBuilding,
  getBuildings,
  getBuildingById,
  updateBuilding,
  deleteBuilding,
} from '../controllers/buildingController.js';
import {
  createBuildingValidator,
  updateBuildingValidator,
  buildingIdValidator,
} from '../validations/buildingValidator.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', protect, createBuildingValidator, createBuilding);
router.get('/', protect, getBuildings);
router.get('/:id', protect, buildingIdValidator, getBuildingById);
router.put('/:id', protect, updateBuildingValidator, updateBuilding);
router.delete('/:id', protect, buildingIdValidator, deleteBuilding);

export default router;
