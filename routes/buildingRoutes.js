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

const router = express.Router();

router.post('/', createBuildingValidator, createBuilding);
router.get('/', getBuildings);
router.get('/:id', buildingIdValidator, getBuildingById);
router.put('/:id', updateBuildingValidator, updateBuilding);
router.delete('/:id', buildingIdValidator, deleteBuilding);

export default router;
