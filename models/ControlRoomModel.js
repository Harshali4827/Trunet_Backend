import mongoose from 'mongoose';

const controlRoomSchema = new mongoose.Schema(
  {
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Center',
      required: true,
    },
    buildingName: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    address1: {
      type: String,
      required: true,
    },
    address2: {
      type: String,
    },
    landmark: {
      type: String,
    },
    pincode: {
      type: String,
      required: false,
      match: /^[1-9][0-9]{5}$/,
    },
  },
  { timestamps: true }
);

const ControlRoom = mongoose.model('ControlRoom', controlRoomSchema);

export default ControlRoom;
