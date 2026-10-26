const categoriesService = require("./categories.service");
const ApiResponse = require("../../utils/apiResponse");

class CategoriesController {
  async list(req, res) {
    const categories = await categoriesService.listCategories(req.query);
    return ApiResponse.success(res, {
      message: "Categories retrieved successfully",
      data: { categories },
      categories
    });
  }

  async getMostBought(req, res) {
    const categories = await categoriesService.getMostBoughtCategories(req.query);
    return ApiResponse.success(res, {
      message: "Most bought categories retrieved successfully",
      data: { categories },
      categories
    });
  }

  async getById(req, res) {
    const category = await categoriesService.getCategoryById(req.params.id);
    return ApiResponse.success(res, {
      message: "Category retrieved successfully",
      data: category,
      category
    });
  }

  async create(req, res) {
    const category = await categoriesService.createCategory(req.body);
    return ApiResponse.created(res, {
      message: "Category created successfully",
      data: category,
      category
    });
  }

  async update(req, res) {
    const category = await categoriesService.updateCategory(req.params.id, req.body);
    return ApiResponse.success(res, {
      message: "Category updated successfully",
      data: category,
      category
    });
  }

  async delete(req, res) {
    const hard = req.query.hard === "true" || req.query.permanent === "true";
    const result = await categoriesService.deleteCategory(req.params.id, hard);
    return ApiResponse.success(res, {
      message: result.message,
      data: result
    });
  }
}

module.exports = new CategoriesController();
