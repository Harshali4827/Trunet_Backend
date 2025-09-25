import Role from '../models/Roles.js';
import User from '../models/User.js';

export const createRole = async (req, res) => {
  try {
    console.log('Request body:', req.body); 
    console.log('Request headers:', req.headers);
    
    const { roleTitle, permissions } = req.body;

    if (!roleTitle || roleTitle.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: 'Role title is required' 
      });
    }

    const existingRole = await Role.roleExists(roleTitle);
    if (existingRole) {
      return res.status(409).json({ 
        success: false, 
        message: 'Role title already exists' 
      });
    }

    const role = new Role({
      roleTitle,
      permissions: permissions || [],
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
    const roles = await Role.find()
      .sort({ createdAt: -1 })
      .select('-__v');

    res.status(200).json({
      success: true,
      data: roles,
      count: roles.length
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
    const role = await Role.findById(req.params.id);

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
    const { roleTitle, permissions} = req.body;

    const existingRole = await Role.findById(id);
    if (!existingRole) {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found' 
      });
    }

    if (roleTitle && roleTitle.trim() !== '') {
      const titleExists = await Role.roleExists(roleTitle, id);
      if (titleExists) {
        return res.status(409).json({ 
          success: false, 
          message: 'Role title already exists' 
        });
      }
    }

    const role = await Role.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

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

    const usersWithRole = await User.countDocuments({ role: id });
    if (usersWithRole > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete role. ${usersWithRole} user(s) are assigned this role.` 
      });
    }

    const role = await Role.findByIdAndDelete(id);
    
    if (!role) {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found' 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Role deleted successfully',
      data: { _id: role._id, roleTitle: role.roleTitle }
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