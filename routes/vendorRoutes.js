import express from 'express';
import { 
  createVendor, 
  getAllVendors, 
  getVendorById, 
  updateVendor, 
  deleteVendor 
} from '../controllers/vendorController.js';
import { createVendorValidator, updateVendorValidator } from '../validations/vendorValidator.js';

const router = express.Router();

router.post('/', createVendorValidator, createVendor);
router.get('/', getAllVendors);
router.get('/:id', getVendorById);
router.put('/:id', updateVendorValidator, updateVendor);
router.delete('/:id', deleteVendor);

export default router;
