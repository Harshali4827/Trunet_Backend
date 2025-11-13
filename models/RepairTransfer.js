import mongoose from "mongoose";

const repairTransferSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  faultyStock: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FaultyStock",
    required: true
  },
  fromCenter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Center",
    required: true
  },
  toCenter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Center",
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  serialNumbers: [{
    serialNumber: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor"],
      required: true
    },
    repairHistory: [{
      date: Date,
      status: String,
      remark: String,
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      cost: Number
    }]
  }],
  transferRemark: {
    type: String,
    trim: true
  },
  transferredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  status: {
    type: String,
    enum: ["transferred", "in_repair", "repaired", "returned", "cancelled"],
    default: "transferred"
  },
  repairUpdates: [{
    date: {
      type: Date,
      default: Date.now
    },
    status: String,
    remark: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    cost: {
      type: Number,
      default: 0
    }
  }],
  expectedReturnDate: Date,
  actualReturnDate: Date,
  totalRepairCost: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

repairTransferSchema.methods.updateStatus = function() {
  const statusCount = {};
  
  this.serialNumbers.forEach(serial => {
    statusCount[serial.status] = (statusCount[serial.status] || 0) + 1;
  });

  const totalSerials = this.serialNumbers.length;
  
  if (statusCount.repaired === totalSerials) {
    this.status = "repaired";
  } else if (statusCount.under_repair > 0 || statusCount.damaged > 0) {
    this.status = "in_repair";
  }
};

export default mongoose.model("RepairTransfer", repairTransferSchema);