import express from 'express';
import {
  createRole,
  getRoles,
  getRoleById,
  updateRole,
  deleteRole
} from '../controllers/rolesController.js';

const router = express.Router();

router.post('/', createRole);
router.get('/', getRoles);
router.get('/:id', getRoleById);
router.put('/:id', updateRole);
router.delete('/:id', deleteRole);

export default router;