import StockClosing from "../models/ReportSubmission.js";
import mongoose from "mongoose";

export const createStockClosing = async (req, res) => {
  try {
    const { date, stockClosingForOtherCenter, center, products, status } =
      req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Products array with at least one product is required",
      });
    }

    for (const [index, product] of products.entries()) {
      if (
        !product.product ||
        product.productQty === undefined ||
        product.damageQty === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: `Product at index ${index} is missing required fields (product, productQty, damageQty)`,
        });
      }

      if (product.damageQty > product.productQty) {
        return res.status(400).json({
          success: false,
          message: `Damage quantity cannot exceed product quantity for product at index ${index}`,
        });
      }
    }

    if (stockClosingForOtherCenter === true && !center) {
      return res.status(400).json({
        success: false,
        message: "Center is required when stock closing is for other center",
      });
    }

    const stockClosingData = {
      date: date || new Date(),
      stockClosingForOtherCenter: stockClosingForOtherCenter || false,
      products,
      status: status || "Draft",
      createdBy: req.user?.id,
    };

    if (stockClosingForOtherCenter === true) {
      stockClosingData.center = center;
    }

    const stockClosing = new StockClosing(stockClosingData);
    await stockClosing.save();

    await stockClosing.populate([
      {
        path: "products.product",
        select: "productTitle productCode productPrice",
      },
      { path: "center", select: "centerName centerCode" },
      { path: "createdBy", select: "name email" },
    ]);

    const responseData = stockClosing.toObject();

    delete responseData.totalProductQty;
    delete responseData.totalDamageQty;
    delete responseData.totalQty;
    delete responseData.id;

    if (responseData.products && Array.isArray(responseData.products)) {
      responseData.products.forEach((product) => {
        if (product.product && product.product.id) {
          delete product.product.id;
        }
      });
    }

    res.status(201).json({
      success: true,
      message: "Stock closing created successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Create stock closing error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating stock closing",
    });
  }
};

export const getAllStockClosings = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "date",
      sortOrder = "desc",
      startDate,
      endDate,
      stockClosingForOtherCenter,
      center,
      product,
    } = req.query;

    const filter = {};

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (stockClosingForOtherCenter !== undefined) {
      filter.stockClosingForOtherCenter = stockClosingForOtherCenter === "true";
    }

    if (center) filter.center = center;

    if (product) {
      filter["products.product"] = product;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const [stockClosings, totalCount] = await Promise.all([
      StockClosing.find(filter)
        .populate([
          {
            path: "products.product",
            select: "productTitle productCode productPrice",
          },
          { path: "center", select: "centerName centerCode" },
          { path: "createdBy", select: "name email" },
        ])
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),

      StockClosing.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    res.json({
      success: true,
      message: "Stock closings retrieved successfully",
      data: {
        stockClosings,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limitNum,
          hasNext,
          hasPrev,
        },
      },
    });
  } catch (error) {
    console.error("Get all stock closings error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving stock closings",
    });
  }
};

export const getStockClosingById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock closing ID",
      });
    }

    const stockClosing = await StockClosing.findById(id).populate([
      {
        path: "products.product",
        select: "productTitle productCode productPrice productImage",
      },
      {
        path: "center",
        select: "centerName centerCode centerType addressLine1 city",
      },
      { path: "createdBy", select: "name email" },
    ]);

    if (!stockClosing) {
      return res.status(404).json({
        success: false,
        message: "Stock closing not found",
      });
    }

    res.json({
      success: true,
      message: "Stock closing retrieved successfully",
      data: stockClosing,
    });
  } catch (error) {
    console.error("Get stock closing by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving stock closing",
    });
  }
};

export const updateStockClosing = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, stockClosingForOtherCenter, center, products, status } =
      req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock closing ID",
      });
    }

    const existingStockClosing = await StockClosing.findById(id);
    if (!existingStockClosing) {
      return res.status(404).json({
        success: false,
        message: "Stock closing not found",
      });
    }

    if (products && Array.isArray(products)) {
      if (products.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Products array cannot be empty",
        });
      }

      for (const [index, product] of products.entries()) {
        if (
          !product.product ||
          product.productQty === undefined ||
          product.damageQty === undefined
        ) {
          return res.status(400).json({
            success: false,
            message: `Product at index ${index} is missing required fields (product, productQty, damageQty)`,
          });
        }

        if (product.damageQty > product.productQty) {
          return res.status(400).json({
            success: false,
            message: `Damage quantity cannot exceed product quantity for product at index ${index}`,
          });
        }
      }
    }

    if (stockClosingForOtherCenter === true && !center) {
      return res.status(400).json({
        success: false,
        message: "Center is required when stock closing is for other center",
      });
    }

    const updateData = {};

    if (date !== undefined) updateData.date = date;
    if (stockClosingForOtherCenter !== undefined)
      updateData.stockClosingForOtherCenter = stockClosingForOtherCenter;
    if (products !== undefined) updateData.products = products;
    if (status !== undefined) updateData.status = status;

    if (stockClosingForOtherCenter === true) {
      updateData.center = center;
    } else if (stockClosingForOtherCenter === false) {
      updateData.center = undefined;
    }

    const updatedStockClosing = await StockClosing.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      {
        path: "products.product",
        select: "productTitle productCode productPrice",
      },
      { path: "center", select: "centerName centerCode" },
      { path: "createdBy", select: "name email" },
    ]);

    res.json({
      success: true,
      message: "Stock closing updated successfully",
      data: updatedStockClosing,
    });
  } catch (error) {
    console.error("Update stock closing error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating stock closing",
    });
  }
};

export const deleteStockClosing = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock closing ID",
      });
    }

    const stockClosing = await StockClosing.findByIdAndDelete(id);

    if (!stockClosing) {
      return res.status(404).json({
        success: false,
        message: "Stock closing not found",
      });
    }

    res.json({
      success: true,
      message: "Stock closing deleted successfully",
    });
  } catch (error) {
    console.error("Delete stock closing error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting stock closing",
    });
  }
};
