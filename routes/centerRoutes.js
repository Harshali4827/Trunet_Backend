import express from 'express';
import {
  createCenter,
  getCenters,
  getCenterById,
  getCentersByPartner,
  getCentersByArea,
  updateCenter,
  deleteCenter,
} from '../controllers/centerController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/',protect, createCenter);
router.get('/',protect, getCenters);
router.get('/:id',protect, getCenterById);
router.get('/partner/:partnerId',protect, getCentersByPartner);
router.get('/area/:areaId',protect, getCentersByArea);
router.put('/:id',protect, updateCenter);
router.delete('/:id',protect, deleteCenter);

export default router;
