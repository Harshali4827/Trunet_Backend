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

router.post('/', createArea);
router.get('/', getAreas);
router.get('/partner/:partnerId', getAreasByPartner);
router.get('/:id', getAreaById);
router.put('/:id', protect, updateArea);
router.delete('/:id', protect, deleteArea);

export default router;
