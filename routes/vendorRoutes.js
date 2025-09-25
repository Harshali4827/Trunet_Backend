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
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', protect, upload.single('logo'), createVendorValidator, createVendor);
router.get('/', protect, getAllVendors);
router.get('/:id', protect, getVendorById);
router.put('/:id', protect, upload.single('logo'), updateVendorValidator, updateVendor);
router.delete('/:id', protect, deleteVendor);

export default router;
