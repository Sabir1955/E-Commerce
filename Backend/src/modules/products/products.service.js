const Product = require("../../models/Product");
const Category = require("../../models/Category");
const { parsePagination, formatPaginationMeta } = require("../../utils/pagination");
const { BadRequestError, NotFoundError } = require("../../utils/errors");
const { isNonNegativeNumber, isNonNegativeInteger } = require("../../utils/request");
const { storageService, postgresImageService } = require("../../config/storage");

function sanitizeProductImageUrl(rawUrl, defaultPlaceholder = "/api/products/placeholder") {
  if (!rawUrl || typeof rawUrl !== "string") return defaultPlaceholder;
  const trimmed = rawUrl.trim();
  if (!trimmed) return defaultPlaceholder;

  // Reject local Windows paths like C:\... or file://
  if (/^[a-zA-Z]:[\\/]/i.test(trimmed) || trimmed.startsWith("file://")) {
    return defaultPlaceholder;
  }
  // Reject data: or blob: urls from persistent DB storage
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return defaultPlaceholder;
  }

  // 1. If image API url was provided (e.g. /api/products/images/:fileId)
  const imgMatch = trimmed.match(/(?:\/api)?\/products\/images\/([a-zA-Z0-9_-]+)/i);
  if (imgMatch) {
    return `/api/products/images/${imgMatch[1]}`;
  }

  // Direct ID (e.g. 24-hex string or uuid)
  if (/^[a-zA-Z0-9_-]{12,64}$/.test(trimmed)) {
    return `/api/products/images/${trimmed}`;
  }

  // 2. If /api/products/:id/image was provided
  const prodImgMatch = trimmed.match(/(?:\/api)?\/products\/([a-zA-Z0-9_-]+)\/image/i);
  if (prodImgMatch) {
    return `/api/products/${prodImgMatch[1]}/image`;
  }

  // 3. Reject any localhost or 127.0.0.1 URLs from being stored into DB
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(trimmed)) {
    return defaultPlaceholder;
  }

  return trimmed;
}

function extractImageFileId(urlOrId) {
  if (!urlOrId) return null;
  const str = String(urlOrId).trim();
  if (/^[a-zA-Z0-9_-]{12,64}$/.test(str)) {
    return str;
  }
  const match = str.match(/(?:\/api)?\/products\/images\/([a-zA-Z0-9_-]+)/i);
  if (match) return match[1];
  return null;
}

function extractAllImageFileIds(productData) {
  const ids = new Set();
  if (productData.imageFileId) {
    const id = extractImageFileId(productData.imageFileId);
    if (id) ids.add(id);
  }
  if (productData.imageUrl) {
    const id = extractImageFileId(productData.imageUrl);
    if (id) ids.add(id);
  }
  if (Array.isArray(productData.imageFileIds)) {
    for (const fid of productData.imageFileIds) {
      const id = extractImageFileId(fid);
      if (id) ids.add(id);
    }
  }
  if (Array.isArray(productData.images)) {
    for (const img of productData.images) {
      const id = extractImageFileId(img);
      if (id) ids.add(id);
    }
  }
  return Array.from(ids);
}

class ProductsService {
  async listProducts(query) {
    const maxLimit = (query.all === "true" || query.includeInactive === "true") ? 1000 : 100;
    const pageData = parsePagination(query, 50, maxLimit);
    if (pageData.error) {
      throw new BadRequestError(pageData.error);
    }

    const andConditions = [];

    if (query.all !== "true" && query.includeInactive !== "true") {
      andConditions.push({ active: true });
    }

    if (query.category && query.category !== "All") {
      const cleanCat = String(query.category).trim();
      const catDoc = await Category.findOne({
        $or: [
          { slug: cleanCat.toLowerCase() },
          { name: cleanCat },
          { id: cleanCat },
          { _id: cleanCat }
        ]
      });
      if (catDoc) {
        andConditions.push({
          $or: [
            { category: catDoc.name },
            { categoryId: catDoc.id },
            { category: { $regex: catDoc.name } }
          ]
        });
      } else {
        andConditions.push({
          $or: [
            { category: cleanCat },
            { categoryId: cleanCat },
            { category: { $regex: cleanCat } }
          ]
        });
      }
    }

    if (query.brand) andConditions.push({ brand: query.brand });

    if (query.search || query.q) {
      const term = String(query.search || query.q).trim();
      andConditions.push({
        $or: [
          { name: { $regex: term, $options: "i" } },
          { description: { $regex: term, $options: "i" } },
          { category: { $regex: term, $options: "i" } },
          { brand: { $regex: term, $options: "i" } },
          { material: { $regex: term, $options: "i" } },
          { sku: { $regex: term, $options: "i" } }
        ]
      });
    }

    if (query.sku) andConditions.push({ sku: String(query.sku).trim().toUpperCase() });
    if (query.featured === "true") andConditions.push({ featured: true });

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const min = query.minPrice === undefined ? 0 : Number(query.minPrice);
      const max = query.maxPrice === undefined ? Infinity : Number(query.maxPrice);
      if (
        (query.minPrice !== undefined && (String(query.minPrice).trim() === "" || !Number.isFinite(min) || min < 0)) ||
        (query.maxPrice !== undefined && (String(query.maxPrice).trim() === "" || !Number.isFinite(max) || max < 0)) ||
        max < min
      ) {
        throw new BadRequestError("Price range must use non-negative numbers with minPrice <= maxPrice");
      }
      andConditions.push({
        price: {
          ...(query.minPrice !== undefined ? { $gte: min } : {}),
          ...(query.maxPrice !== undefined ? { $lte: max } : {})
        }
      });
    }

    if (query.available === "true" || query.inStock === "true") {
      andConditions.push({ stock: { $gt: 0 } });
    }

    const filter = andConditions.length > 0 ? { $and: andConditions } : {};

    let sort = { createdAt: -1 };
    if (query.sort === "popularity" || query.sort === "popular") {
      sort = { popularity: -1, reviewCount: -1 };
    } else if (query.sort === "price_asc" || query.sort === "price-low-high") {
      sort = { price: 1 };
    } else if (query.sort === "price_desc" || query.sort === "price-high-low") {
      sort = { price: -1 };
    } else if (query.sort === "rating") {
      sort = { rating: -1, reviewCount: -1 };
    } else if (query.sort === "newest" || query.sort === "latest") {
      sort = { createdAt: -1 };
    }

    const [products, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(pageData.skip).limit(pageData.limit),
      Product.countDocuments(filter)
    ]);

    return {
      products,
      pagination: formatPaginationMeta(total, pageData.page, pageData.limit)
    };
  }

  async getFeaturedProducts(query) {
    const pageData = parsePagination(query);
    if (pageData.error) {
      throw new BadRequestError(pageData.error);
    }

    const filter = { active: true, featured: true };
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ popularity: -1, createdAt: -1 }).skip(pageData.skip).limit(pageData.limit),
      Product.countDocuments(filter)
    ]);

    return {
      products,
      pagination: formatPaginationMeta(total, pageData.page, pageData.limit)
    };
  }

  async getLatestProducts(query) {
    const pageData = parsePagination(query, 12);
    if (pageData.error) {
      throw new BadRequestError(pageData.error);
    }

    const filter = { active: true };
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(pageData.skip).limit(pageData.limit),
      Product.countDocuments(filter)
    ]);

    return {
      products,
      pagination: formatPaginationMeta(total, pageData.page, pageData.limit)
    };
  }

  async getProductById(idOrSlug) {
    const isObjectId = /^[a-f\d]{24}$/i.test(idOrSlug);
    const filter = {
      ...(isObjectId ? { _id: idOrSlug } : { slug: idOrSlug }),
      active: true
    };
    const product = await Product.findOne(filter);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return product;
  }

  async findProductQuietly(idOrSlug) {
    if (!idOrSlug) return null;
    const isObjectId = /^[a-f\d]{24}$/i.test(idOrSlug);
    const filter = isObjectId ? { _id: idOrSlug } : { slug: idOrSlug };
    return Product.findOne(filter);
  }

  async createProduct(body) {
    let categoryName = body.category ? String(body.category).trim() : "";
    let categoryId = (body.categoryId || body.category_id) ? String(body.categoryId || body.category_id).trim() : null;

    if (categoryId) {
      const catDoc = await Category.findById(categoryId);
      if (catDoc) {
        categoryName = catDoc.name;
        categoryId = catDoc.id;
      }
    } else if (categoryName) {
      const catDoc = await Category.findOne({
        $or: [
          { name: categoryName },
          { slug: categoryName.toLowerCase() },
          { id: categoryName },
          { _id: categoryName }
        ]
      });
      if (catDoc) {
        categoryName = catDoc.name;
        categoryId = catDoc.id;
      }
    }

    if (!body.name || !body.description || !categoryName ||
        !isNonNegativeNumber(body.price) || !isNonNegativeInteger(body.stock)) {
      throw new BadRequestError("name, description, category, non-negative price, and non-negative integer stock are required");
    }

    // Default image if none provided
    const defaultPlaceholder = "/api/products/placeholder";
    const rawImage = body.imageUrl || (Array.isArray(body.images) && body.images[0]) || "";
    const sanitizedImage = sanitizeProductImageUrl(rawImage, defaultPlaceholder);

    let imagesList = Array.isArray(body.images) && body.images.length > 0
      ? body.images.map((img) => sanitizeProductImageUrl(img, defaultPlaceholder)).filter(Boolean)
      : [sanitizedImage];

    if (sanitizedImage !== defaultPlaceholder) {
      imagesList = imagesList.filter((img) => img !== defaultPlaceholder);
      if (!imagesList.includes(sanitizedImage)) {
        imagesList.unshift(sanitizedImage);
      }
    }

    const primaryFileId = extractImageFileId(body.imageFileId) || extractImageFileId(sanitizedImage);
    const allFileIds = extractAllImageFileIds({
      imageUrl: sanitizedImage,
      images: imagesList,
      imageFileId: primaryFileId,
      imageFileIds: body.imageFileIds
    });

    const isAvailableVal = body.isAvailable !== undefined
      ? Boolean(body.isAvailable)
      : (body.is_available !== undefined
        ? Boolean(body.is_available)
        : (body.available !== undefined ? Boolean(body.available) : true));

    const productData = {
      ...body,
      category: categoryName,
      categoryId: categoryId || null,
      imageUrl: sanitizedImage,
      images: imagesList.length > 0 ? imagesList : [defaultPlaceholder],
      imageFileId: primaryFileId ? String(primaryFileId) : null,
      imageFileIds: allFileIds.map((id) => String(id)),
      isAvailable: isAvailableVal,
      is_available: isAvailableVal,
      available: isAvailableVal,
      active: body.active !== undefined ? Boolean(body.active) : true
    };

    const product = await Product.create(productData);
    const prodId = product.id || product._id;

    if (allFileIds.length > 0) {
      await postgresImageService.linkImagesToProduct(allFileIds, prodId, primaryFileId);
    }

    return product;
  }

  async updateProduct(id, body) {
    if (body.price !== undefined && !isNonNegativeNumber(body.price)) {
      throw new BadRequestError("price must be a non-negative number");
    }
    if (body.stock !== undefined && !isNonNegativeInteger(body.stock)) {
      throw new BadRequestError("stock must be a non-negative integer");
    }
    if (body.available !== undefined) {
      body.isAvailable = Boolean(body.available);
      body.available = Boolean(body.available);
    } else if (body.isAvailable !== undefined) {
      body.isAvailable = Boolean(body.isAvailable);
      body.available = Boolean(body.isAvailable);
    } else if (body.is_available !== undefined) {
      body.isAvailable = Boolean(body.is_available);
      body.available = Boolean(body.is_available);
    }

    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      throw new NotFoundError("Product not found");
    }

    if (body.category !== undefined || body.categoryId !== undefined || body.category_id !== undefined) {
      let categoryName = body.category !== undefined ? String(body.category).trim() : existingProduct.category;
      let categoryId = (body.categoryId !== undefined || body.category_id !== undefined)
        ? String(body.categoryId || body.category_id || "").trim()
        : existingProduct.categoryId;

      if (categoryId) {
        const catDoc = await Category.findById(categoryId);
        if (catDoc) {
          categoryName = catDoc.name;
          categoryId = catDoc.id;
        }
      } else if (categoryName) {
        const catDoc = await Category.findOne({
          $or: [
            { name: categoryName },
            { slug: categoryName.toLowerCase() },
            { id: categoryName },
            { _id: categoryName }
          ]
        });
        if (catDoc) {
          categoryName = catDoc.name;
          categoryId = catDoc.id;
        }
      }

      body.category = categoryName;
      body.categoryId = categoryId || null;
    }

    const oldFileIds = extractAllImageFileIds(existingProduct);

    const defaultPlaceholder = "/api/products/placeholder";
    if (body.imageUrl !== undefined) {
      body.imageUrl = sanitizeProductImageUrl(body.imageUrl, defaultPlaceholder);
    }
    if (Array.isArray(body.images)) {
      body.images = body.images.map((img) => sanitizeProductImageUrl(img, defaultPlaceholder)).filter(Boolean);
    }

    const nextImageUrl = body.imageUrl !== undefined ? body.imageUrl : existingProduct.imageUrl;
    const nextImages = body.images !== undefined ? body.images : existingProduct.images;

    const primaryFileId = extractImageFileId(body.imageFileId) || extractImageFileId(nextImageUrl);
    const newFileIds = extractAllImageFileIds({
      imageUrl: nextImageUrl,
      images: nextImages,
      imageFileId: primaryFileId,
      imageFileIds: body.imageFileIds
    });

    body.imageFileId = primaryFileId ? String(primaryFileId) : null;
    body.imageFileIds = newFileIds.map((fid) => String(fid));

    const product = await Product.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true
    });

    const prodId = product.id || product._id || id;
    if (newFileIds.length > 0) {
      await postgresImageService.linkImagesToProduct(newFileIds, prodId, primaryFileId);
    }

    // Clean up replaced images that are no longer referenced
    const removedFileIds = oldFileIds.filter((fid) => !newFileIds.includes(fid));
    for (const fid of removedFileIds) {
      await postgresImageService.deleteImage(fid).catch(() => {});
    }

    return product;
  }

  async setProductInventory(id, quantity, availability) {
    const update = {};
    if (quantity !== undefined) {
      if (!isNonNegativeInteger(quantity)) {
        throw new BadRequestError("quantity must be a non-negative integer");
      }
      update.stock = Number(quantity);
    }
    if (availability !== undefined) {
      update.isAvailable = Boolean(availability);
      update.available = Boolean(availability);
    }
    if (Object.keys(update).length === 0) {
      throw new BadRequestError("quantity or available must be provided");
    }
    const product = await Product.findByIdAndUpdate(
      id,
      update,
      { new: true, runValidators: true }
    );
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return product;
  }

  async adjustProductInventory(id, amount) {
    const intAmount = Number(amount);
    if (!Number.isInteger(intAmount) || intAmount === 0) {
      throw new BadRequestError("amount must be a non-zero integer");
    }

    const product = await Product.findOneAndUpdate(
      { id, stock: { $gte: -intAmount } },
      { $inc: { stock: intAmount } },
      { new: true, runValidators: true }
    );
    if (!product) {
      throw new BadRequestError("Insufficient stock or product not found");
    }
    return product;
  }

  async archiveProduct(id, hard = false) {
    if (hard) {
      const product = await Product.findByIdAndDelete(id);
      if (!product) {
        throw new NotFoundError("Product not found");
      }
      await postgresImageService.deleteImagesByProductId(id).catch(() => {});
      return product;
    }
    const product = await Product.findByIdAndUpdate(
      id,
      { active: false },
      { new: true }
    );
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return product;
  }

  async uploadProductImages(id, files) {
    const isObjectId = /^[a-f\d]{24}$/i.test(id);
    const filter = isObjectId ? { _id: id } : { id };
    const product = await Product.findOne(filter);
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    const fileList = Array.isArray(files) ? files : files ? [files] : [];
    if (fileList.length === 0) {
      throw new BadRequestError("No image files provided");
    }

    const prodId = product.id || product._id || id;
    const uploadResults = [];
    for (const file of fileList) {
      const result = await postgresImageService.uploadImage(file, { productId: prodId });
      uploadResults.push(result);
    }

    const uploadedUrls = uploadResults.map((r) => r.url);
    const uploadedFileIds = uploadResults.map((r) => r.fileId ? String(r.fileId) : r.url);

    // Remove placeholder entries so real uploaded image becomes primary
    product.images = (product.images || []).filter((img) => img && !img.includes("placeholder"));
    product.images.unshift(...uploadedUrls);
    product.imageUrl = uploadedUrls[0];
    product.imageFileId = uploadedFileIds[0];
    product.imageFileIds = [...uploadedFileIds, ...(product.imageFileIds || [])];

    await product.save();
    await postgresImageService.linkImagesToProduct(uploadedFileIds, prodId, uploadedFileIds[0]);
    return product;
  }

  async getRelatedProducts(idOrSlug, limit = 4) {
    const product = await this.getProductById(idOrSlug);
    const related = await Product.find({
      _id: { $ne: product._id },
      category: product.category,
      active: true
    })
      .sort({ popularity: -1, rating: -1 })
      .limit(Number(limit) || 4);
    return related;
  }
}

module.exports = new ProductsService();
