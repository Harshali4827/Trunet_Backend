import express from 'express';
import {
  login,
  register,
  getMe,
  updatePassword,
  getAllUsers,
  logout,
} from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/login', login);
router.post('/register', register); 
router.get('/me', protect, getMe);
router.get('/', protect, getAllUsers);
router.put('/update-password', protect, updatePassword);
router.post('/logout', protect, logout);

export default router;