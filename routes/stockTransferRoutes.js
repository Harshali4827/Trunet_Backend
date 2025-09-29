import express from 'express';
import {
  createStockTransfer,
  getAllStockTransfers,
  getStockTransferById,
  updateStockTransfer,
  deleteStockTransfer,
  updateStockTransferStatus,
  updateChallanDocument,
  getLatestTransferNumber,
  approveStockTransfer,
  shipStockTransfer,
  updateShippingInfo,
  rejectShipment,
  markAsIncomplete,
  completeStockTransfer,
  completeIncompleteTransfer,
  updateApprovedQuantities
} from '../controllers/stockTransferController.js';
import upload from '../config/multer.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();


router.route('/')
  .post(protect, createStockTransfer)
  .get(protect, getAllStockTransfers);
router.route('/latest-order')
  .get(protect, getLatestTransferNumber);
router.route('/:id')
  .get(protect, getStockTransferById)
  .put(protect, updateStockTransfer)
  .delete(protect, deleteStockTransfer);
router.post('/:id/approve', protect, approveStockTransfer);
router.post('/:id/ship', protect, shipStockTransfer);
router.post('/:id/complete', protect, completeStockTransfer);
router.post('/:id/mark-incomplete', protect, markAsIncomplete);
router.patch('/:id/complete-incomplete', protect, completeIncompleteTransfer);
router.patch('/:id/shipping-info', protect, updateShippingInfo);
router.patch('/:id/reject-shipment', protect, rejectShipment);
router.patch('/:id/approved-quantities', protect, updateApprovedQuantities);
router.patch('/:id/status', protect, updateStockTransferStatus);
router.patch('/:id/challan', protect, upload.single('challanDocument'), updateChallanDocument);

export default router;