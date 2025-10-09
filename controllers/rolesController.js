// import Role from '../models/Roles.js';
// import User from '../models/User.js';

// export const createRole = async (req, res) => {
//   try {
//     console.log('Request body:', req.body); 
//     console.log('Request headers:', req.headers);
    
//     const { roleTitle, permissions } = req.body;

//     if (!roleTitle || roleTitle.trim() === '') {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'Role title is required' 
//       });
//     }

//     const existingRole = await Role.roleExists(roleTitle);
//     if (existingRole) {
//       return res.status(409).json({ 
//         success: false, 
//         message: 'Role title already exists' 
//       });
//     }

//     const role = new Role({
//       roleTitle,
//       permissions: permissions || [],
//       createdBy: req.user?._id 
//     });

//     await role.save();

//     res.status(201).json({ 
//       success: true, 
//       message: 'Role created successfully',
//       data: role 
//     });
//   } catch (error) {
//     console.error('Error creating role:', error);
    
//     if (error.name === 'ValidationError') {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'Validation error',
//         errors: Object.values(error.errors).map(err => err.message) 
//       });
//     }
    
//     if (error.code === 11000) {
//       return res.status(409).json({ 
//         success: false, 
//         message: 'Role title already exists' 
//       });
//     }
    
//     res.status(500).json({ 
//       success: false, 
//       message: 'Internal server error',
//       error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//     });
//   }
// };

// export const getRoles = async (req, res) => {
//   try {
//     const roles = await Role.find()
//       .sort({ createdAt: -1 })
//       .select('-__v');

//     res.status(200).json({
//       success: true,
//       data: roles,
//       count: roles.length
//     });
    
//   } catch (error) {
//     console.error('Error fetching roles:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error fetching roles',
//       error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//     });
//   }
// };

// export const getRoleById = async (req, res) => {
//   try {
//     const role = await Role.findById(req.params.id);

//     if (!role) {
//       return res.status(404).json({ 
//         success: false, 
//         message: 'Role not found' 
//       });
//     }
    
//     res.status(200).json({ 
//       success: true, 
//       data: role 
//     });
//   } catch (error) {
//     console.error('Error fetching role:', error);
    
//     if (error.name === 'CastError') {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'Invalid role ID format' 
//       });
//     }
    
//     res.status(500).json({ 
//       success: false, 
//       message: 'Internal server error',
//       error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//     });
//   }
// };

// export const updateRole = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { roleTitle, permissions} = req.body;

//     const existingRole = await Role.findById(id);
//     if (!existingRole) {
//       return res.status(404).json({ 
//         success: false, 
//         message: 'Role not found' 
//       });
//     }

//     if (roleTitle && roleTitle.trim() !== '') {
//       const titleExists = await Role.roleExists(roleTitle, id);
//       if (titleExists) {
//         return res.status(409).json({ 
//           success: false, 
//           message: 'Role title already exists' 
//         });
//       }
//     }

//     const role = await Role.findByIdAndUpdate(id, req.body, {
//       new: true,
//       runValidators: true,
//     });

//     res.status(200).json({ 
//       success: true, 
//       message: 'Role updated successfully',
//       data: role 
//     });
//   } catch (error) {
//     console.error('Error updating role:', error);
    
//     if (error.name === 'ValidationError') {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'Validation error',
//         errors: Object.values(error.errors).map(err => err.message) 
//       });
//     }
    
//     if (error.name === 'CastError') {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'Invalid role ID format' 
//       });
//     }
    
//     if (error.code === 11000) {
//       return res.status(409).json({ 
//         success: false, 
//         message: 'Role title already exists' 
//       });
//     }
    
//     res.status(500).json({ 
//       success: false, 
//       message: 'Internal server error',
//       error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//     });
//   }
// };

// export const deleteRole = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const usersWithRole = await User.countDocuments({ role: id });
//     if (usersWithRole > 0) {
//       return res.status(400).json({ 
//         success: false, 
//         message: `Cannot delete role. ${usersWithRole} user(s) are assigned this role.` 
//       });
//     }

//     const role = await Role.findByIdAndDelete(id);
    
//     if (!role) {
//       return res.status(404).json({ 
//         success: false, 
//         message: 'Role not found' 
//       });
//     }

//     res.status(200).json({ 
//       success: true, 
//       message: 'Role deleted successfully',
//       data: { _id: role._id, roleTitle: role.roleTitle }
//     });
//   } catch (error) {
//     console.error('Error deleting role:', error);
    
//     if (error.name === 'CastError') {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'Invalid role ID format' 
//       });
//     }
    
//     res.status(500).json({ 
//       success: false, 
//       message: 'Internal server error',
//       error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//     });
//   }
// };


// controllers/roleController.js
import Role from '../models/Roles.js';
import User from '../models/User.js';

// Validation helper functions
const validatePermission = (permission, availableModules) => {
  const errors = [];
  
  if (!permission.module || !availableModules.includes(permission.module)) {
    errors.push(`Invalid module: ${permission.module}`);
  }
  
  // Validate that at least one read permission is set if read is true
  if (permission.read && !permission.readAll && !permission.readWarehouse && 
      !permission.readCenter && !permission.readOwn) {
    errors.push(`Module ${permission.module}: Must have at least one read permission (readAll, readWarehouse, readCenter, or readOwn) when read is true`);
  }
  
  // Validate data scope consistency
  if (permission.dataScope === 'warehouse' && !permission.readWarehouse) {
    errors.push(`Module ${permission.module}: dataScope 'warehouse' requires readWarehouse permission`);
  }
  
  if (permission.dataScope === 'center' && !permission.readCenter) {
    errors.push(`Module ${permission.module}: dataScope 'center' requires readCenter permission`);
  }
  
  if (permission.dataScope === 'own' && !permission.readOwn) {
    errors.push(`Module ${permission.module}: dataScope 'own' requires readOwn permission`);
  }
  
  return errors;
};

export const createRole = async (req, res) => {
  try {
    const { roleTitle, description, permissions = [] } = req.body;

    // Basic validation
    if (!roleTitle || roleTitle.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: 'Role title is required' 
      });
    }

    // Check if role already exists
    const existingRole = await Role.roleExists(roleTitle);
    if (existingRole) {
      return res.status(409).json({ 
        success: false, 
        message: 'Role title already exists' 
      });
    }

    // Validate permissions
    const availableModules = Role.getAvailableModules();
    const validationErrors = [];

    permissions.forEach(permission => {
      const errors = validatePermission(permission, availableModules);
      validationErrors.push(...errors);
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Permission validation failed',
        errors: validationErrors
      });
    }

    // Create role
    const role = new Role({
      roleTitle,
      description,
      permissions,
      createdBy: req.user?._id
    });

    await role.save();

    res.status(201).json({ 
      success: true, 
      message: 'Role created successfully',
      data: role 
    });
  } catch (error) {
    console.error('Error creating role:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message) 
      });
    }
    
    if (error.code === 11000) {
      return res.status(409).json({ 
        success: false, 
        message: 'Role title already exists' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const getRoles = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, isActive } = req.query;
    
    // Build filter
    let filter = {};
    
    if (search) {
      filter.roleTitle = { $regex: search, $options: 'i' };
    }
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const roles = await Role.find(filter)
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-__v');

    const total = await Role.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: roles,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
    
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching roles',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const getRoleById = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id)
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!role) {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found' 
      });
    }
    
    res.status(200).json({ 
      success: true, 
      data: role 
    });
  } catch (error) {
    console.error('Error fetching role:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role ID format' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { roleTitle, description, permissions, isActive } = req.body;

    // Find existing role
    const existingRole = await Role.findById(id);
    if (!existingRole) {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found' 
      });
    }

    // Check if system role (prevent modification of system roles)
    if (existingRole.isSystemRole) {
      return res.status(403).json({
        success: false,
        message: 'System roles cannot be modified'
      });
    }

    // Check role title uniqueness if provided
    if (roleTitle && roleTitle.trim() !== '') {
      const titleExists = await Role.roleExists(roleTitle, id);
      if (titleExists) {
        return res.status(409).json({ 
          success: false, 
          message: 'Role title already exists' 
        });
      }
    }

    // Validate permissions if provided
    if (permissions && Array.isArray(permissions)) {
      const availableModules = Role.getAvailableModules();
      const validationErrors = [];

      permissions.forEach(permission => {
        const errors = validatePermission(permission, availableModules);
        validationErrors.push(...errors);
      });

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Permission validation failed',
          errors: validationErrors
        });
      }
    }

    // Prepare update data
    const updateData = {};
    if (roleTitle) updateData.roleTitle = roleTitle;
    if (description !== undefined) updateData.description = description;
    if (permissions !== undefined) updateData.permissions = permissions;
    if (isActive !== undefined) updateData.isActive = isActive;
    updateData.updatedBy = req.user?._id;

    const role = await Role.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(200).json({ 
      success: true, 
      message: 'Role updated successfully',
      data: role 
    });
  } catch (error) {
    console.error('Error updating role:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message) 
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role ID format' 
      });
    }
    
    if (error.code === 11000) {
      return res.status(409).json({ 
        success: false, 
        message: 'Role title already exists' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    // Find role first
    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found' 
      });
    }

    // Check if system role
    if (role.isSystemRole) {
      return res.status(403).json({
        success: false,
        message: 'System roles cannot be deleted'
      });
    }

    // Check if role is assigned to any users
    const usersWithRole = await User.countDocuments({ role: id });
    if (usersWithRole > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete role. ${usersWithRole} user(s) are assigned this role.` 
      });
    }

    // Delete role
    await Role.findByIdAndDelete(id);

    res.status(200).json({ 
      success: true, 
      message: 'Role deleted successfully',
      data: { 
        _id: role._id, 
        roleTitle: role.roleTitle,
        deletedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error deleting role:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role ID format' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const getAvailableModules = async (req, res) => {
  try {
    const modules = Role.getAvailableModules();
    res.status(200).json({
      success: true,
      data: modules
    });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available modules'
    });
  }
};

export const updateRoleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be a boolean'
      });
    }

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    if (role.isSystemRole && !isActive) {
      return res.status(403).json({
        success: false,
        message: 'Cannot deactivate system roles'
      });
    }

    role.isActive = isActive;
    role.updatedBy = req.user?._id;
    await role.save();

    res.status(200).json({
      success: true,
      message: `Role ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: role
    });
  } catch (error) {
    console.error('Error updating role status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating role status'
    });
  }
};