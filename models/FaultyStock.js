
// import mongoose from "mongoose";

// const faultyStockSchema = new mongoose.Schema({
//   date: {
//     type: Date,
//     required: true,
//     default: Date.now
//   },
  // usageReference: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: "StockUsage",
  //   required: true
  // },
//   center: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Center",
//     required: true
//   },
//   product: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Product",
//     required: true
//   },
//   quantity: {
//     type: Number,
//     required: true,
//     min: 1
//   },
//   serialNumbers: [{
//     type: String,
//     trim: true
//   }],
//   usageType: {
//     type: String,
//     required: true
//   },
//   remark: {
//     type: String,
//     trim: true
//   },
//   reportedBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "User",
//     required: true
//   },
//   status: {
//     type: String,
//     enum: ["damaged", "under_repair", "repaired", "disposed", "returned_to_vendor"],
//     default: "damaged"
//   },
//   damageDate: {
//     type: Date,
//     default: Date.now
//   },
//   repairDate: Date,
//   disposalDate: Date,
// }, { timestamps: true });

// export default mongoose.model("FaultyStock", faultyStockSchema);


import mongoose from "mongoose";

const faultyStockSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  usageReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StockUsage",
    required: true
  },
  center: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Center",
    required: true
  },
  reseller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reseller",
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
      trim: true,
      required: true
    },
    status: {
      type: String,
      enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor"],
      default: "damaged"
    },
    repairHistory: [{
      date: {
        type: Date,
        default: Date.now
      },
      status: {
        type: String,
        enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor"]
      },
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
    repairDate: Date,
    disposalDate: Date,
    vendorReturnDate: Date,
    repairCost: {
      type: Number,
      default: 0
    },
    technician: String,
    repairRemark: String
  }],
  usageType: {
    type: String,
    required: true
  },
  remark: {
    type: String,
    trim: true
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  overallStatus: {
    type: String,
    enum: ["damaged", "under_repair", "repaired", "irreparable", "disposed", "returned_to_vendor", "partially_repaired"],
    default: "damaged"
  },
  damageDate: {
    type: Date,
    default: Date.now
  },
  repairDate: Date,
  disposalDate: Date,
  vendorReturnDate: Date,
}, { timestamps: true });

faultyStockSchema.methods.updateOverallStatus = function() {
  const statusCount = {};
  
  this.serialNumbers.forEach(serial => {
    statusCount[serial.status] = (statusCount[serial.status] || 0) + 1;
  });

  const totalSerials = this.serialNumbers.length;
  
  if (statusCount.repaired === totalSerials) {
    this.overallStatus = "repaired";
  } else if (statusCount.irreparable === totalSerials) {
    this.overallStatus = "irreparable";
  } else if (statusCount.disposed === totalSerials) {
    this.overallStatus = "disposed";
  } else if (statusCount.returned_to_vendor === totalSerials) {
    this.overallStatus = "returned_to_vendor";
  } else if (statusCount.under_repair > 0 || statusCount.damaged > 0) {
    this.overallStatus = "partially_repaired";
  }
};

export default mongoose.model("FaultyStock", faultyStockSchema);