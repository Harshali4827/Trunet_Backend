import Role from '../models/Roles.js';
import User from '../models/User.js'

export const checkGetPermission = (module, options = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const user = await User.findById(req.user._id).populate('role');
      
      if (!user || !user.role) {
        return res.status(403).json({
          success: false,
          message: 'User role not found'
        });
      }

      const modulePermission = user.role.permissions.find(p => p.module === module);
      
      if (!modulePermission) {
        return res.status(403).json({
          success: false,
          message: `No permission for module: ${module}`
        });
      }

      const hasAnyReadPermission = modulePermission.read || 
                                  modulePermission.readAll || 
                                  modulePermission.readOwn || 
                                  modulePermission.readCenter || 
                                  modulePermission.readWarehouse;

      if (!hasAnyReadPermission) {
        return res.status(403).json({
          success: false,
          message: 'Read permission denied for this module'
        });
      }

      // Store permission details in request for controller to use
      req.getPermissions = {
        module: module,
        canReadAll: modulePermission.readAll,
        canReadOwn: modulePermission.readOwn,
        canReadCenter: modulePermission.readCenter,
        canReadWarehouse: modulePermission.readWarehouse,
        dataScope: modulePermission.dataScope,
        user: {
          _id: user._id,
          warehouse: user.warehouse,
          center: user.center,
          outlet: user.outlet,
          role: user.role
        }
      };

      next();
    } catch (error) {
      console.error('Get permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking read permissions'
      });
    }
  };
};