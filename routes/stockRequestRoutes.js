import express from 'express';
import {
  createStockRequest,
  getAllStockRequests,
  getStockRequestById,
  updateStockRequest,
  deleteStockRequest,
  updateStockRequestStatus,
  approveStockRequest,
  shipStockRequest,
  completeStockRequest,
  markAsIncomplete,
  updateApprovedQuantities
} from '../controllers/stockRequestController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();
router.post('/', protect, createStockRequest);
router.get('/', protect, getAllStockRequests);
router.get('/:id', protect, getStockRequestById);
router.put('/:id', protect, updateStockRequest);
router.delete('/:id', protect, deleteStockRequest);
router.patch('/:id/status', protect, updateStockRequestStatus);
router.post('/:id/approve', protect, approveStockRequest);
router.post('/:id/ship', protect, shipStockRequest);
router.post('/:id/complete', protect, completeStockRequest);
router.post('/:id/mark-incomplete', protect, markAsIncomplete);
router.patch('/:id/approved-quantities', protect, updateApprovedQuantities);

export default router;