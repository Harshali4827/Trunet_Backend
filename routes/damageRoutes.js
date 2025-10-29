
import express from 'express';
import {
  createDamageReturn,
  approveDamageReturn,
  rejectDamageReturn,
  getPendingDamageReturns,
  getAllDamageReturns
} from '../controllers/damageController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/damage-returns',protect, createDamageReturn);
router.patch('/:id/approve',protect, approveDamageReturn);
router.patch('/:id/reject',protect, rejectDamageReturn);
router.get('/pending',protect, getPendingDamageReturns);
router.get('/',protect, getAllDamageReturns); 
export default router;