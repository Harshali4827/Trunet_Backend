import express from 'express';

import {
  bulkUploadCenterStock,
  downloadCenterStockSampleCSV,
  downloadCenterStockCSV
} from '../controllers/bulkCenterStockController.js';

import upload from '../middlewares/upload.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Bulk upload routes
router.post('/bulk-upload', upload.single('file'), bulkUploadCenterStock);
router.get('/download/sample', downloadCenterStockSampleCSV);
router.get('/download/csv', downloadCenterStockCSV);

export default router;