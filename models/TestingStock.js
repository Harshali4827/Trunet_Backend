import mongoose from "mongoose";

const testingStockSchema = new mongoose.Schema(
  {
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
      validate: {
        validator: async function (centerId) {
          const Center = mongoose.model("Center");
          const center = await Center.findById(centerId);
          return center && center.centerType === "Center";
        },
        message: "Must be a valid Center (Testing Center)",
      },
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    totalQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    availableQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    underTestingQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    testedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    passedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    failedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    serialNumbers: [
      {
        serialNumber: {
          type: String,
          required: true,
          trim: true,
        },
        testingRequestId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "TestingMaterial",
          required: true,
        },
        originalOutlet: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Center",
          required: true,
        },
        status: {
          type: String,
          enum: [
            "pending_testing",
            "under_testing", 
            "tested",
            "passed",
            "failed",
            "returned",
            "rejected"
          ],
          default: "pending_testing",
        },
        testResult: {
          type: String,
          enum: ["passed", "failed", "inconclusive", "pending"],
          default: "pending"
        },
        testRemark: String,
        testedAt: Date,
        testedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        currentLocation: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Center",
        },
        transferHistory: [
          {
            fromCenter: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Center",
            },
            toCenter: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Center",
            },
            transferDate: Date,
            transferType: {
              type: String,
              enum: [
                "testing_inbound",
                "testing_return",
                "testing_failed_return",
                "testing_transfer"
              ],
            },
            testingRequestId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "TestingMaterial",
            },
            status: String,
            testResult: String,
          },
        ],
      },
    ],
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

testingStockSchema.index({ center: 1, product: 1 }, { unique: true });
testingStockSchema.index({ "serialNumbers.serialNumber": 1 });
testingStockSchema.index({ "serialNumbers.testingRequestId": 1 });

// Static method to update testing stock
testingStockSchema.statics.updateTestingStock = async function (
  centerId,
  productId,
  quantity,
  serialNumbers = [],
  originalOutlet,
  testingRequestId,
  transferType = "testing_inbound"
) {
  const updateData = {
    $inc: {
      totalQuantity: quantity,
      availableQuantity: quantity,
      underTestingQuantity: quantity,
    },
    lastUpdated: new Date(),
  };

  if (serialNumbers.length > 0) {
    const serialsToAdd = serialNumbers.map((serialItem) => ({
      serialNumber: serialItem.serialNumber,
      testingRequestId: testingRequestId,
      originalOutlet: originalOutlet,
      status: serialItem.status || "pending_testing",
      currentLocation: centerId,
      transferHistory: [
        {
          fromCenter: originalOutlet,
          toCenter: centerId,
          transferDate: new Date(),
          transferType: transferType,
          testingRequestId: testingRequestId,
          status: serialItem.status || "pending_testing",
        },
      ],
    }));

    updateData.$push = {
      serialNumbers: { $each: serialsToAdd },
    };
  }

  return this.findOneAndUpdate(
    { center: centerId, product: productId },
    updateData,
    { upsert: true, new: true }
  );
};

// Method to validate serial numbers
testingStockSchema.methods.validateAndGetSerials = function (
  requestedSerials,
  currentLocation
) {
  try {
    const availableSerials = [];

    for (const requestedSerial of requestedSerials) {
      const serial = this.serialNumbers.find(
        (sn) =>
          sn.serialNumber === requestedSerial &&
          (sn.status === "available" || sn.status === "pending_testing") &&
          sn.currentLocation?.toString() === currentLocation.toString()
      );

      if (serial) {
        availableSerials.push(requestedSerial);
      }
    }

    return availableSerials;
  } catch (error) {
    throw new Error(`Error validating serial numbers: ${error.message}`);
  }
};

// Method to update serial test results
testingStockSchema.methods.updateSerialTestResult = async function (
  serialNumber,
  testResult,
  testRemark = "",
  testedBy = null
) {
  const serial = this.serialNumbers.find(
    (sn) => sn.serialNumber === serialNumber
  );

  if (!serial) {
    throw new Error(`Serial number ${serialNumber} not found`);
  }

  // Update serial status based on test result
  if (testResult === "passed") {
    serial.status = "passed";
    serial.testResult = "passed";
    this.passedQuantity += 1;
    this.underTestingQuantity -= 1;
  } else if (testResult === "failed") {
    serial.status = "failed";
    serial.testResult = "failed";
    this.failedQuantity += 1;
    this.underTestingQuantity -= 1;
  } else {
    serial.status = "tested";
    serial.testResult = testResult;
    this.testedQuantity += 1;
    this.underTestingQuantity -= 1;
  }

  serial.testRemark = testRemark;
  serial.testedAt = new Date();
  serial.testedBy = testedBy;

  // Update transfer history
  if (serial.transferHistory.length > 0) {
    const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
    lastTransfer.status = serial.status;
    lastTransfer.testResult = testResult;
  }

  await this.save();
  return serial;
};

// Method to return tested items to outlet
testingStockSchema.methods.returnToOutlet = async function (
  serialNumbers = [],
  toOutlet,
  returnType = "testing_return"
) {
  let returnedSerials = [];

  for (const serialNumber of serialNumbers) {
    const serial = this.serialNumbers.find(
      (sn) => sn.serialNumber === serialNumber
    );

    if (!serial) {
      throw new Error(`Serial number ${serialNumber} not found`);
    }

    // Update serial status
    serial.status = "returned";
    serial.currentLocation = toOutlet;
    
    // Update quantities
    if (serial.testResult === "passed") {
      this.passedQuantity -= 1;
    } else if (serial.testResult === "failed") {
      this.failedQuantity -= 1;
    } else {
      this.testedQuantity -= 1;
    }
    this.totalQuantity -= 1;
    this.availableQuantity -= 1;

    // Add transfer history
    serial.transferHistory.push({
      fromCenter: this.center,
      toCenter: toOutlet,
      transferDate: new Date(),
      transferType: returnType,
      status: "returned",
      testResult: serial.testResult,
    });

    returnedSerials.push(serialNumber);
  }

  await this.save();
  return returnedSerials;
};

// Static method to get testing stock summary
testingStockSchema.statics.getTestingStockSummary = async function (centerId) {
  return this.aggregate([
    { $match: { center: mongoose.Types.ObjectId(centerId) } },
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "productDetails",
      },
    },
    {
      $project: {
        product: 1,
        productName: { $arrayElemAt: ["$productDetails.productTitle", 0] },
        productCode: { $arrayElemAt: ["$productDetails.productCode", 0] },
        totalQuantity: 1,
        availableQuantity: 1,
        underTestingQuantity: 1,
        testedQuantity: 1,
        passedQuantity: 1,
        failedQuantity: 1,
        lastUpdated: 1,
      },
    },
    { $sort: { productName: 1 } },
  ]);
};

// Method to get serial numbers by status
testingStockSchema.methods.getSerialsByStatus = function (status) {
  return this.serialNumbers
    .filter(sn => sn.status === status)
    .map(sn => ({
      serialNumber: sn.serialNumber,
      testingRequestId: sn.testingRequestId,
      testResult: sn.testResult,
      testRemark: sn.testRemark,
      testedAt: sn.testedAt,
      testedBy: sn.testedBy,
    }));
};

export default mongoose.model("TestingStock", testingStockSchema);