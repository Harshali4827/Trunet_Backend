import mongoose from 'mongoose';

const packageDurationSchema = new mongoose.Schema(
  {
    packageDuration: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('PackageDuration', packageDurationSchema);
