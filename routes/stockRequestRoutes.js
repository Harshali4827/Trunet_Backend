import express from 'express';
import {
  createStockRequest,
  getAllStockRequests,
  getStockRequestById,
  updateStockRequest,
  deleteStockRequest,
  updateStockRequestStatus
} from '../controllers/stockRequestController.js';

const router = express.Router();

router.post('/', createStockRequest);
router.get('/', getAllStockRequests);
router.get('/:id', getStockRequestById);
router.put('/:id', updateStockRequest);
router.delete('/:id', deleteStockRequest);
router.patch('/:id/status', updateStockRequestStatus);

export default router;