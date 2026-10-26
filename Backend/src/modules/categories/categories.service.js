const Category = require("../../models/Category");
const Product = require("../../models/Product");
const Order = require("../../models/Order");
const { BadRequestError, NotFoundError } = require("../../utils/errors");

class CategoriesService {
  async listCategories(query = {}) {
    const filter = (query.all === "true" || query.includeInactive === "true") ? {} : { active: true };
    const categories = await Category.find(filter).sort({ name: 1 });

    const countMap = {};
    try {
      const db = require("../../database/db");
      const res = await db.query(
        "SELECT category, category_id, COUNT(*)::int AS count FROM products WHERE active = true GROUP BY category, category_id"
      );
      for (const row of res.rows) {
        if (row.category) {
          const kName = row.category.trim().toLowerCase();
          countMap[kName] = (countMap[kName] || 0) + row.count;
        }
        if (row.category_id) {
          countMap[row.category_id] = (countMap[row.category_id] || 0) + row.count;
        }
      }
    } catch {
      try {
        const db = require("../../database/db");
        const res = await db.query(
          "SELECT category, COUNT(*)::int AS count FROM products WHERE active = true GROUP BY category"
        );
        for (const row of res.rows) {
          if (row.category) {
            const kName = row.category.trim().toLowerCase();
            countMap[kName] = (countMap[kName] || 0) + row.count;
          }
        }
      } catch (err) {
        console.warn("[CategoriesService] Could not count products:", err.message);
      }
    }

    return categories.map((cat) => {
      const catObj = cat.toObject ? cat.toObject() : { ...cat };
      const nameKey = (cat.name || "").trim().toLowerCase();
      const count = countMap[cat.id] || countMap[nameKey] || 0;
      return {
        ...catObj,
        _id: cat.id,
        id: cat.id,
        productCount: count
      };
    });
  }

  async getMostBoughtCategories(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 6, 1), 6);
    const includeInactive = query.all === "true" || query.includeInactive === "true";

    const defaultMeta = {
      "Rudraksha": { icon: "ॐ", sanskrit: "रुद्राक्ष माला" },
      "Sacred Yantras": { icon: "✦", sanskrit: "यन्त्र साधना" },
      "Healing Crystals": { icon: "✧", sanskrit: "स्फटिक एवं रत्न" },
      "Vastu & Feng Shui": { icon: "☯", sanskrit: "वास्तु दोष निवारण" },
      "Gemstones": { icon: "💎", sanskrit: "नवग्रह रत्न" },
      "Puja Essentials": { icon: "🪔", sanskrit: "पूजा सामग्री" }
    };

    try {
      const db = require("../../database/db");
      const activeClause = includeInactive ? "" : "WHERE c.active = true";
      const sql = `
        SELECT
          c.id,
          c.name,
          c.slug,
          c.description,
          c.icon,
          c.sanskrit,
          c.active,
          COALESCE(SUM(oi.quantity), 0)::int AS total_sold,
          COUNT(DISTINCT oi.order_id)::int AS order_count
        FROM categories c
        JOIN products p ON (p.category_id = c.id OR LOWER(TRIM(p.category)) = LOWER(TRIM(c.name)))
        JOIN order_items oi ON (oi.product_id = p.id OR LOWER(TRIM(oi.name)) = LOWER(TRIM(p.name)))
        JOIN orders o ON o.id = oi.order_id AND LOWER(TRIM(o.status)) != 'cancelled'
        ${activeClause}
        GROUP BY c.id, c.name, c.slug, c.description, c.icon, c.sanskrit, c.active
        HAVING COALESCE(SUM(oi.quantity), 0) > 0
        ORDER BY total_sold DESC, order_count DESC, c.name ASC
        LIMIT $1;
      `;

      const { rows } = await db.query(sql, [limit]);

      return rows.map((row) => {
        const meta = defaultMeta[row.name] || {};
        return {
          _id: row.id,
          id: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description || "",
          icon: row.icon || meta.icon || "✦",
          sanskrit: row.sanskrit || meta.sanskrit || "पवित्र संग्रह",
          active: row.active !== false,
          totalSold: Number(row.total_sold) || 0,
          orderCount: Number(row.order_count) || 0
        };
      });
    } catch (err) {
      console.error("Failed to fetch most bought categories via SQL, falling back to model calculation:", err);
      const filter = includeInactive ? {} : { active: true };
      const allCategories = await Category.find(filter);
      const allProducts = await Product.find({});
      const orders = await Order.find({ status: { $ne: "cancelled" } });

      const prodById = new Map(allProducts.map((p) => [p._id.toString(), p]));
      const prodByName = new Map(allProducts.map((p) => [p.name.trim().toLowerCase(), p]));

      const categoryStats = new Map();
      for (const cat of allCategories) {
        const meta = defaultMeta[cat.name] || {};
        categoryStats.set(cat.name, {
          _id: cat._id || cat.id,
          id: cat.id || cat._id,
          name: cat.name,
          slug: cat.slug,
          description: cat.description || "",
          icon: cat.icon || meta.icon || "✦",
          sanskrit: cat.sanskrit || meta.sanskrit || "पवित्र संग्रह",
          active: cat.active !== false,
          totalSold: 0,
          orderCount: 0,
          orders: new Set()
        });
      }

      for (const order of orders) {
        for (const item of (order.items || [])) {
          let catName = null;
          let p = prodById.get(item.product?.toString());
          if (!p && item.name) {
            p = prodByName.get(item.name.trim().toLowerCase());
          }
          if (p) {
            catName = p.category;
          } else if (item.name) {
            const lowerName = item.name.toLowerCase();
            for (const cat of allCategories) {
              if (
                lowerName.includes(cat.name.toLowerCase()) ||
                lowerName.includes(cat.slug.toLowerCase()) ||
                (cat.name.toLowerCase().endsWith("s") && lowerName.includes(cat.name.toLowerCase().slice(0, -1)))
              ) {
                catName = cat.name;
                break;
              }
            }
          }

          if (catName && categoryStats.has(catName)) {
            const stat = categoryStats.get(catName);
            stat.totalSold += (Number(item.quantity) || 1);
            stat.orders.add(order._id.toString());
          }
        }
      }

      const result = [];
      for (const stat of categoryStats.values()) {
        stat.orderCount = stat.orders.size;
        delete stat.orders;
        if (stat.totalSold > 0) {
          result.push(stat);
        }
      }

      result.sort((a, b) => b.totalSold - a.totalSold || b.orderCount - a.orderCount || a.name.localeCompare(b.name));
      return result.slice(0, limit);
    }
  }

  async getCategoryById(idOrSlug) {
    if (!idOrSlug) {
      throw new BadRequestError("Category ID or slug is required");
    }
    const clean = String(idOrSlug).trim();
    const category = await Category.findOne({
      $or: [
        { _id: clean },
        { id: clean },
        { slug: clean.toLowerCase() },
        { name: clean }
      ]
    });
    if (!category) {
      throw new NotFoundError("Category not found");
    }
    return category;
  }

  async createCategory({ name, slug, description, icon, sanskrit, active, displayOrder, display_order }) {
    if (!name || typeof name !== "string" || !name.trim()) {
      throw new BadRequestError("name is required");
    }
    const trimmedName = name.trim();
    let cleanSlug = (slug || trimmedName)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    if (!cleanSlug) {
      cleanSlug = `cat-${Date.now()}`;
    }

    // Check if category name or slug already exists
    const existing = await Category.findOne({
      $or: [
        { name: trimmedName },
        { slug: cleanSlug }
      ]
    });
    if (existing) {
      throw new BadRequestError(`Category "${trimmedName}" already exists`);
    }

    return Category.create({
      name: trimmedName,
      slug: cleanSlug,
      description: description ? description.trim() : "",
      icon: icon || null,
      sanskrit: sanskrit || null,
      active: active !== false,
      display_order: Number(displayOrder ?? display_order) || 0
    });
  }

  async updateCategory(id, body) {
    if (!id || typeof id !== "string" || !id.trim()) {
      throw new BadRequestError("Invalid category ID");
    }
    const oldCat = await Category.findById(id);
    if (!oldCat) {
      throw new NotFoundError("Category not found");
    }

    const updates = {};
    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (!trimmed) {
        throw new BadRequestError("Category name cannot be empty");
      }
      const existing = await Category.findOne({
        name: trimmed,
        _id: { $ne: id }
      });
      if (existing) {
        throw new BadRequestError(`Category "${trimmed}" already exists`);
      }
      updates.name = trimmed;
    }
    if (body.slug !== undefined) {
      const cleanSlug = body.slug.trim().toLowerCase();
      const existing = await Category.findOne({
        slug: cleanSlug,
        _id: { $ne: id }
      });
      if (existing) {
        throw new BadRequestError(`Category with slug "${cleanSlug}" already exists`);
      }
      updates.slug = cleanSlug;
    }
    if (body.description !== undefined) updates.description = body.description.trim();
    if (body.active !== undefined) updates.active = Boolean(body.active);
    if (body.icon !== undefined) updates.icon = body.icon;
    if (body.sanskrit !== undefined) updates.sanskrit = body.sanskrit;
    if (body.displayOrder !== undefined || body.display_order !== undefined) {
      updates.display_order = Number(body.displayOrder ?? body.display_order) || 0;
    }

    const category = await Category.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });

    if (updates.name && oldCat.name !== updates.name) {
      await Product.updateMany({ category: oldCat.name }, { category: updates.name });
      await Product.updateMany({ category_id: oldCat.id }, { category: updates.name });
    }

    return category;
  }

  async deleteCategory(id, hard = false) {
    if (!id || typeof id !== "string" || !id.trim()) {
      throw new BadRequestError("Invalid category ID");
    }
    if (hard) {
      const deleted = await Category.findByIdAndDelete(id);
      if (!deleted) {
        throw new NotFoundError("Category not found");
      }
      await Product.updateMany({ category: deleted.name }, { category: "Uncategorized", category_id: null });
      await Product.updateMany({ category_id: id }, { category: "Uncategorized", category_id: null });
      return { message: "Category permanently deleted", id, deleted: true };
    }

    const category = await Category.findByIdAndUpdate(id, { active: false }, { new: true });
    if (!category) {
      throw new NotFoundError("Category not found");
    }
    return { message: "Category archived successfully", id: category._id, active: false };
  }
}

module.exports = new CategoriesService();
