import express from 'express';
import {
  createArea,
  getAreas,
  getAreasByPartner,
  getAreaById,
  updateArea,
  deleteArea,
} from '../controllers/areaController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', protect, createArea);
router.get('/', protect, getAreas);
router.get('/partner/:partnerId', protect, getAreasByPartner);
router.get('/:id', protect, getAreaById);
router.put('/:id', protect, updateArea);
router.delete('/:id', protect, deleteArea);

export default router;
