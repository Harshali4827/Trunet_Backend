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

const router = express.Router();

router.post('/', createCenter);
router.get('/', getCenters);
router.get('/:id', getCenterById);
router.get('/partner/:partnerId', getCentersByPartner);
router.get('/area/:areaId', getCentersByArea);
router.put('/:id', updateCenter);
router.delete('/:id', deleteCenter);

export default router;
