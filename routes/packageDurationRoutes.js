import express from 'express';
import {
  createPackageDuration,
  getPackageDurations,
  getPackageDurationById,
  updatePackageDuration,
  deletePackageDuration,
} from '../controllers/packageDurationController.js';
import { 
  validateCreatePackageDuration, 
  validatePackageDurationId, 
  validateUpdatePackageDuration 
} from '../validations/packageDurationValidation.js';

const router = express.Router();

router.post('/', validateCreatePackageDuration, createPackageDuration);
router.get('/', getPackageDurations);
router.get('/:id', validatePackageDurationId, getPackageDurationById);
router.put('/:id', validatePackageDurationId, validateUpdatePackageDuration, updatePackageDuration);
router.delete('/:id', validatePackageDurationId, deletePackageDuration);

export default router;