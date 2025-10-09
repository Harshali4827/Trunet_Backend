import ProductCategory from "../models/ProductCategory.js";

export const createProductCategory = async (req, res) => {
  try {
    const { productCategory, remark } = req.body;

    const existingCategory = await ProductCategory.findOne({ productCategory });
    if (existingCategory) {
      return res
        .status(400)
        .json({ message: "Product category already exists" });
    }

    const category = await ProductCategory.create({ productCategory, remark });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllCategories = async (req, res) => {
  try {
    const {
      search,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    if (search?.trim()) {
      const searchTerm = search.trim();
      filter.$or = [
        { name: { $regex: searchTerm, $options: "i" } },
        { description: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [categories, totalCategories] = await Promise.all([
      ProductCategory.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .select("-__v"),

      ProductCategory.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCategories / limit);

    res.json({
      success: true,
      data: categories,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalCategories,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching categories",
      error: error.message,
    });
  }
};

export const getCategoryById = async (req, res) => {
  try {
    const category = await ProductCategory.findById(req.params.id);
    if (!category)
      return res.status(404).json({ message: "Category not found" });
    res.status(200).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const category = await ProductCategory.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!category)
      return res.status(404).json({ message: "Category not found" });
    res.status(200).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const category = await ProductCategory.findByIdAndDelete(req.params.id);
    if (!category)
      return res.status(404).json({ message: "Category not found" });
    res
      .status(200)
      .json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
