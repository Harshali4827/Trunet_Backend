import express from 'express';
import {
  createArea,
  getAreas,
  getAreasByPartner,
  getAreaById,
  updateArea,
  deleteArea,
} from '../controllers/areaController.js';

const router = express.Router();

router.post('/', createArea);
router.get('/', getAreas);
router.get('/partner/:partnerId', getAreasByPartner);
router.get('/:id', getAreaById);
router.put('/:id', updateArea);
router.delete('/:id', deleteArea);

export default router;
