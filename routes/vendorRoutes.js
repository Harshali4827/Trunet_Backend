import express from 'express';
import { 
  createVendor, 
  getAllVendors, 
  getVendorById, 
  updateVendor, 
  deleteVendor 
} from '../controllers/vendorController.js';
import { createVendorValidator, updateVendorValidator } from '../validations/vendorValidator.js';
import upload from '../config/multer.js';

const router = express.Router();

router.post('/', upload.single('logo'), createVendorValidator, createVendor);
router.get('/', getAllVendors);
router.get('/:id', getVendorById);
router.put('/:id', upload.single('logo'), updateVendorValidator, updateVendor);
router.delete('/:id', deleteVendor);

export default router;
