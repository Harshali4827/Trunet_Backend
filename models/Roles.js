// import mongoose from 'mongoose';

// const roleSchema = new mongoose.Schema({
//   roleTitle: {
//     type: String,
//     required: [true, 'Role title is required'],
//     unique: true,
//     trim: true,
//     maxlength: [50, 'Role title cannot exceed 50 characters']
//   }
// }, {
//   timestamps: true
// });

// roleSchema.pre('save', function(next) {
//   this.roleTitle = this.roleTitle.toLowerCase();
//   next();
// });

// roleSchema.statics.roleExists = async function(roleTitle) {
//   const role = await this.findOne({ roleTitle: roleTitle.toLowerCase() });
//   return !!role;
// };

// export default mongoose.model('Role', roleSchema);

// models/Roles.js
import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema({
  module: {
    type: String,
    required: [true, 'Module name is required'],
    trim: true
  },
  // Basic action permissions
  create: { type: Boolean, default: false },
  read: { type: Boolean, default: false },
  update: { type: Boolean, default: false },
  delete: { type: Boolean, default: false },
  export: { type: Boolean, default: false },
  
  // Specific read permissions for GET operations
  readAll: { type: Boolean, default: false },        // Can read all records in system
  readWarehouse: { type: Boolean, default: false },  // Can read all records in warehouse
  readCenter: { type: Boolean, default: false },     // Can read all records in center
  readOwn: { type: Boolean, default: false },        // Can read only own records
  
  // Data scope for write operations
  dataScope: {
    type: String,
    enum: ['none', 'own', 'outlet', 'center', 'warehouse', 'all'],
    default: 'none'
  }
}, { _id: false }); // No need for individual permission IDs

const roleSchema = new mongoose.Schema({
  roleTitle: {
    type: String,
    required: [true, 'Role title is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'Role title cannot exceed 50 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  permissions: [permissionSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  isSystemRole: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Pre-save middleware
roleSchema.pre('save', function(next) {
  this.roleTitle = this.roleTitle.toLowerCase().trim();
  
  // Ensure at least one read permission if read is true
  this.permissions.forEach(permission => {
    if (permission.read && !permission.readAll && !permission.readWarehouse && 
        !permission.readCenter && !permission.readOwn) {
      permission.readOwn = true; // Default to readOwn if no specific read permission set
    }
  });
  
  next();
});

// Static methods
roleSchema.statics.roleExists = async function(roleTitle, excludeId = null) {
  const query = { roleTitle: roleTitle.toLowerCase().trim() };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const role = await this.findOne(query);
  return !!role;
};

roleSchema.statics.getAvailableModules = function() {
  return [
    'stock-purchase',
    'stock-transfer', 
    'stock-usage',
    'stock-inventory',
    'reports',
    'user-management',
    'role-management',
    'supplier-management',
    'customer-management',
    'warehouse-management',
    'center-management',
    'outlet-management'
  ];
};

// Instance methods
roleSchema.methods.hasPermission = function(module, action) {
  const modulePermission = this.permissions.find(p => p.module === module);
  if (!modulePermission) return false;
  
  return modulePermission[action] === true;
};

roleSchema.methods.hasReadPermission = function(module) {
  const modulePermission = this.permissions.find(p => p.module === module);
  if (!modulePermission) return false;
  
  return modulePermission.read || 
         modulePermission.readAll || 
         modulePermission.readWarehouse || 
         modulePermission.readCenter || 
         modulePermission.readOwn;
};

roleSchema.methods.getDataScope = function(module) {
  const modulePermission = this.permissions.find(p => p.module === module);
  return modulePermission ? modulePermission.dataScope : 'none';
};

roleSchema.methods.getReadPermissions = function(module) {
  const modulePermission = this.permissions.find(p => p.module === module);
  if (!modulePermission) return null;
  
  return {
    readAll: modulePermission.readAll,
    readWarehouse: modulePermission.readWarehouse,
    readCenter: modulePermission.readCenter,
    readOwn: modulePermission.readOwn
  };
};

// Index for better performance
roleSchema.index({ roleTitle: 1 });
roleSchema.index({ isActive: 1 });
roleSchema.index({ 'permissions.module': 1 });

export default mongoose.model('Role', roleSchema);