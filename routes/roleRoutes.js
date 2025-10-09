// import express from 'express';
// import {
//   createRole,
//   getRoles,
//   getRoleById,
//   updateRole,
//   deleteRole
// } from '../controllers/rolesController.js';
// import { protect } from '../middlewares/authMiddleware.js';

// const router = express.Router();

// router.post('/', createRole);
// router.get('/', getRoles);
// router.get('/:id', getRoleById);
// router.put('/:id', protect, updateRole);
// router.delete('/:id', protect, deleteRole);

// export default router;


// routes/roleRoutes.js
import express from 'express';
import {
  createRole,
  getRoles,
  getRoleById,
  updateRole,
  deleteRole,
  getAvailableModules,
  updateRoleStatus
} from '../controllers/rolesController.js';
import { checkPermission } from '../middlewares/checkPermissions.js';

const module = 'role-management';

const router = express.Router();

router.post('/', checkPermission(module, 'create'), createRole);
router.get('/', checkPermission(module, 'read'), getRoles);
router.get('/modules', checkPermission(module, 'read'), getAvailableModules);
router.get('/:id', checkPermission(module, 'read'), getRoleById);
router.put('/:id', checkPermission(module, 'update'), updateRole);
router.patch('/:id/status', checkPermission(module, 'update'), updateRoleStatus);
router.delete('/:id', checkPermission(module, 'delete'), deleteRole);

export default router;