import express from 'express';
import {
  createRole,
  getRoles,
  getRoleById,
  updateRole,
  deleteRole
} from '../controllers/rolesController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', protect, createRole);
router.get('/', protect, getRoles);
router.get('/:id', protect, getRoleById);
router.put('/:id', protect, updateRole);
router.delete('/:id', protect, deleteRole);

export default router;