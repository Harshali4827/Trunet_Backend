import mongoose from "mongoose";

const testingMaterialSchema = new mongoose.Schema(
  {
    requestNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    fromCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
      validate: {
        validator: async function (centerId) {
          const Center = mongoose.model("Center");
          const center = await Center.findById(centerId);
          return center && center.centerType === "Outlet";
        },
        message: "Must be a valid Outlet center",
      },
    },
    toCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
      validate: {
        validator: async function (centerId) {
          const Center = mongoose.model("Center");
          const center = await Center.findById(centerId);
          return center && (center.centerType === "Center");
        },
        message: "Must be a valid Center",
      },
    },
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        serialNumbers: [{
          serialNumber: String,
          status: {
            type: String,
            enum: ["pending_testing", "under_testing", "tested", "returned", "rejected"],
            default: "pending_testing"
          }
        }],
        remark: String,
        testResult: {
          type: String,
          enum: ["passed", "failed", "under_testing", "pending"],
          default: "pending"
        },
        testRemark: String,
        testedAt: Date,
        testedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        }
      },
    ],
    status: {
      type: String,
      enum: ["pending_testing", "under_testing", "completed", "cancelled"],
      default: "pending_testing",
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    acceptedAt: Date,
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    completedAt: Date,
    remark: String,
    testResults: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
      result: {
        type: String,
        enum: ["passed", "failed", "inconclusive"],
      },
      remark: String,
      testedAt: Date,
      testedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    }],
  },
  { timestamps: true }
);

testingMaterialSchema.pre("save", async function (next) {
  if (this.isNew) {
    const count = await mongoose.model("TestingMaterial").countDocuments();
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    this.requestNumber = `TM${year}${month}${day}${(count + 1).toString().padStart(4, "0")}`;
  }
  next();
});

export default mongoose.model("TestingMaterial", testingMaterialSchema);