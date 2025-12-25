import RepairCost from "../models/RepairCost.js";
import Product from "../models/Product.js";


export const getAllRepairCosts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
    } = req.query;

    const filter = {};
    const [repairCosts, total] = await Promise.all([
      RepairCost.find(filter)
        .populate({
          path: "product",
          select: "_id productTitle productCode productPrice salePrice hsnCode trackSerialNumber"
        })
        .populate("createdBy", "_id fullName email")
        .populate("updatedBy", "_id fullName email")
        .sort({ updatedAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean(),

      RepairCost.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      message: "Repair costs retrieved successfully",
      data: repairCosts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error retrieving repair costs:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving repair costs",
      error: error.message
    });
  }
};
export const getRepairCostById = async (req, res) => {
  try {
    const { id } = req.params;

    const repairCost = await RepairCost.findById(id)
      .populate({
        path: "product",
        select: "_id productTitle productCode productPrice salePrice hsnCode trackSerialNumber"
      })
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .lean();

    if (!repairCost) {
      return res.status(404).json({
        success: false,
        message: "Repair cost not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Repair cost retrieved successfully",
      data: repairCost
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid repair cost ID"
      });
    }
    
    console.error("Error retrieving repair cost:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving repair cost",
      error: error.message
    });
  }
};

export const getRepairCostByProductId = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const repairCost = await RepairCost.findOne({ product: productId })
      .populate({
        path: "product",
        select: "_id productTitle productCode productPrice salePrice hsnCode trackSerialNumber"
      })
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .lean();

    if (!repairCost) {
      return res.status(200).json({
        success: true,
        message: "No specific repair cost found for this product. Using default.",
        data: {
          product: product,
          repairCost: 150,
          isDefault: true
        }
      });
    }

    res.status(200).json({
      success: true,
      message: "Repair cost retrieved successfully",
      data: repairCost
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }
    
    console.error("Error retrieving repair cost:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving repair cost",
      error: error.message
    });
  }
};

export const createRepairCost = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required"
      });
    }

    const { product, repairCost} = req.body;

    if (!product) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required"
      });
    }

    if (!repairCost || repairCost < 0) {
      return res.status(400).json({
        success: false,
        message: "Valid repair cost (greater than or equal to 0) is required"
      });
    }

    const productExists = await Product.findById(product);
    if (!productExists) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const existingRepairCost = await RepairCost.findOne({ product });
    if (existingRepairCost) {
      return res.status(400).json({
        success: false,
        message: "Repair cost already exists for this product. Use update instead."
      });
    }
    const newRepairCost = new RepairCost({
      product,
      repairCost: parseFloat(repairCost),
      createdBy: userId,
      updatedBy: userId
    });

    await newRepairCost.save();

    const populatedRepairCost = await RepairCost.findById(newRepairCost._id)
      .populate({
        path: "product",
        select: "_id productTitle productCode productPrice salePrice hsnCode trackSerialNumber"
      })
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(201).json({
      success: true,
      message: "Repair cost created successfully",
      data: populatedRepairCost
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Repair cost already exists for this product"
      });
    }

    console.error("Error creating repair cost:", error);
    res.status(500).json({
      success: false,
      message: "Error creating repair cost",
      error: error.message
    });
  }
};

export const updateRepairCost = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required"
      });
    }

    const { id } = req.params;
    const { repairCost} = req.body;

    const existingRepairCost = await RepairCost.findById(id);
    if (!existingRepairCost) {
      return res.status(404).json({
        success: false,
        message: "Repair cost not found"
      });
    }

    if (repairCost !== undefined && repairCost < 0) {
      return res.status(400).json({
        success: false,
        message: "Repair cost must be greater than or equal to 0"
      });
    }
    const updateData = {
      updatedBy: userId,
      updatedAt: new Date()
    };

    if (repairCost !== undefined) {
      updateData.repairCost = parseFloat(repairCost);
    }
    const updatedRepairCost = await RepairCost.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate({
        path: "product",
        select: "_id productTitle productCode productPrice salePrice hsnCode trackSerialNumber"
      })
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Repair cost updated successfully",
      data: updatedRepairCost
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid repair cost ID"
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors
      });
    }

    console.error("Error updating repair cost:", error);
    res.status(500).json({
      success: false,
      message: "Error updating repair cost",
      error: error.message
    });
  }
};

export const deleteRepairCost = async (req, res) => {
  try {
    const { id } = req.params;

    const repairCost = await RepairCost.findById(id);
    if (!repairCost) {
      return res.status(404).json({
        success: false,
        message: "Repair cost not found"
      });
    }

    await RepairCost.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Repair cost deleted successfully"
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid repair cost ID"
      });
    }

    console.error("Error deleting repair cost:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting repair cost",
      error: error.message
    });
  }
};
