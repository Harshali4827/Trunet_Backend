import express from 'express';
import {
  createPartner,
  getPartners,
  getPartnerById,
  updatePartner,
  deletePartner,
} from '../controllers/partnerController.js';
import { validateCreatePartner, validatePartnerId, validateUpdatePartner } from '../validations/partnerValidator.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/',protect, validateCreatePartner, createPartner);
router.get('/',protect, getPartners);
router.get('/:id',protect, validatePartnerId, getPartnerById);
router.put('/:id',protect, validatePartnerId, validateUpdatePartner, updatePartner);
router.delete('/:id',protect, validatePartnerId, deletePartner);

export default router;
