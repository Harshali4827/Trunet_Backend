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

router.post('/', validateCreatePartner, createPartner);
router.get('/', getPartners);
router.get('/:id', validatePartnerId, getPartnerById);
router.put('/:id',protect, validatePartnerId, validateUpdatePartner, updatePartner);
router.delete('/:id',protect, validatePartnerId, deletePartner);

export default router;
