import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  roleTitle: {
    type: String,
    required: [true, 'Role title is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'Role title cannot exceed 50 characters']
  }
}, {
  timestamps: true
});

roleSchema.pre('save', function(next) {
  this.roleTitle = this.roleTitle.toLowerCase();
  next();
});

roleSchema.statics.roleExists = async function(roleTitle) {
  const role = await this.findOne({ roleTitle: roleTitle.toLowerCase() });
  return !!role;
};

export default mongoose.model('Role', roleSchema);