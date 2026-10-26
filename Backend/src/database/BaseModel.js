const crypto = require("crypto");
const db = require("./db");

function generateId() {
  return crypto.randomBytes(12).toString("hex");
}

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Translate MongoDB-style filter object into parameterized SQL WHERE clause
 */
function buildWhereClause(filter = {}, columnMap = {}, jsonColumns = new Set(), values = []) {
  if (!filter || Object.keys(filter).length === 0) {
    return { clause: "", values };
  }

  const conditions = [];

  function mapCol(key) {
    if (key === "_id" || key === "id") return "id";
    if (columnMap[key]) return columnMap[key];
    return camelToSnake(key);
  }

  function addCondition(cond, val) {
    values.push(val);
    conditions.push(cond.replace(/\$IDX/g, `$${values.length}`));
  }

  for (const [key, val] of Object.entries(filter)) {
    if (key === "$or" && Array.isArray(val)) {
      const orParts = [];
      for (const subFilter of val) {
        const sub = buildWhereClause(subFilter, columnMap, jsonColumns, values);
        if (sub.clause) {
          orParts.push(`(${sub.clause})`);
        }
      }
      if (orParts.length > 0) {
        conditions.push(`(${orParts.join(" OR ")})`);
      }
      continue;
    }

    if (key === "$and" && Array.isArray(val)) {
      for (const subFilter of val) {
        const sub = buildWhereClause(subFilter, columnMap, jsonColumns, values);
        if (sub.clause) {
          conditions.push(`(${sub.clause})`);
        }
      }
      continue;
    }

    // JSONB path queries like 'shipment.shippedAt' or 'shippingAddress.fullName' or 'items.product'
    if (key.includes(".")) {
      const parts = key.split(".");
      const rootCol = mapCol(parts[0]);
      const jsonProp = parts[1];

      if (!SAFE_IDENTIFIER_REGEX.test(rootCol) || !SAFE_IDENTIFIER_REGEX.test(jsonProp)) {
        continue;
      }

      if (rootCol === "items") {
        addCondition(`EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE("${rootCol}", '[]'::jsonb)) elem WHERE elem->>'${jsonProp}' = $IDX)`, String(val));
        continue;
      }

      const isDateComparison = val && typeof val === "object" && (val.$gte instanceof Date || val.$lte instanceof Date || val.$gt instanceof Date || val.$lt instanceof Date);

      const expr = isDateComparison
        ? `NULLIF("${rootCol}"->>'${jsonProp}', '')::timestamptz`
        : `"${rootCol}"->>'${jsonProp}'`;

      if (val && typeof val === "object" && !(val instanceof Date)) {
        if (val.$regex) {
          const regexStr = val.$regex.replace(/\\/g, "");
          addCondition(`${expr} ILIKE $IDX`, `%${regexStr}%`);
        } else {
          if (val.$gte !== undefined) addCondition(`${expr} >= $IDX`, val.$gte);
          if (val.$gt !== undefined) addCondition(`${expr} > $IDX`, val.$gt);
          if (val.$lte !== undefined) addCondition(`${expr} <= $IDX`, val.$lte);
          if (val.$lt !== undefined) addCondition(`${expr} < $IDX`, val.$lt);
        }
      } else {
        if (jsonProp.toLowerCase().includes("email")) {
          addCondition(`LOWER(${expr}) = LOWER($IDX)`, String(val));
        } else {
          addCondition(`${expr} = $IDX`, String(val));
        }
      }
      continue;
    }

    const col = mapCol(key);
    if (!SAFE_IDENTIFIER_REGEX.test(col)) {
      continue;
    }

    if (val === null || val === undefined) {
      conditions.push(`${col} IS NULL`);
      continue;
    }

    if (typeof val === "object" && !(val instanceof Date) && !Array.isArray(val)) {
      if (val.$ne !== undefined) {
        if (val.$ne === null) {
          conditions.push(`${col} IS NOT NULL`);
        } else {
          addCondition(`${col} != $IDX`, val.$ne);
        }
      } else if (val.$in !== undefined && Array.isArray(val.$in)) {
        if (val.$in.length === 0) {
          conditions.push("1=0");
        } else {
          addCondition(`${col} = ANY($IDX)`, val.$in);
        }
      } else if (val.$nin !== undefined && Array.isArray(val.$nin)) {
        if (val.$nin.length > 0) {
          addCondition(`${col} != ALL($IDX)`, val.$nin);
        }
      } else if (val.$regex !== undefined) {
        const pattern = typeof val.$regex === "string" ? val.$regex : val.$regex.source;
        const cleanPattern = pattern.replace(/^\^|\$$/g, "").replace(/\\/g, "");
        addCondition(`${col} ILIKE $IDX`, `%${cleanPattern}%`);
      } else if (val instanceof RegExp) {
        const cleanPattern = val.source.replace(/^\^|\$$/g, "").replace(/\\/g, "");
        addCondition(`${col} ILIKE $IDX`, `%${cleanPattern}%`);
      } else if (val.$exists !== undefined) {
        conditions.push(val.$exists ? `${col} IS NOT NULL` : `${col} IS NULL`);
      } else if (val.$not !== undefined) {
        if (typeof val.$not === "object" && val.$not.$regex !== undefined) {
          const pattern = typeof val.$not.$regex === "string" ? val.$not.$regex : val.$not.$regex.source;
          const cleanPattern = pattern.replace(/^\^|\$$/g, "").replace(/\\/g, "");
          addCondition(`${col} NOT ILIKE $IDX`, `%${cleanPattern}%`);
        } else if (val.$not instanceof RegExp) {
          const cleanPattern = val.$not.source.replace(/^\^|\$$/g, "").replace(/\\/g, "");
          addCondition(`${col} NOT ILIKE $IDX`, `%${cleanPattern}%`);
        } else {
          addCondition(`${col} != $IDX`, val.$not);
        }
      } else if (val.$gt !== undefined || val.$gte !== undefined || val.$lt !== undefined || val.$lte !== undefined) {
        if (val.$gte !== undefined) addCondition(`${col} >= $IDX`, val.$gte);
        if (val.$gt !== undefined) addCondition(`${col} > $IDX`, val.$gt);
        if (val.$lte !== undefined) addCondition(`${col} <= $IDX`, val.$lte);
        if (val.$lt !== undefined) addCondition(`${col} < $IDX`, val.$lt);
      } else if (jsonColumns.has(col)) {
        addCondition(`${col} = $IDX::jsonb`, JSON.stringify(val));
      } else {
        addCondition(`${col} = $IDX`, typeof val === "object" ? JSON.stringify(val) : val);
      }
    } else {
      if (typeof val === "string" && (key === "email" || key === "code")) {
        addCondition(`LOWER(${col}) = LOWER($IDX)`, val);
      } else {
        addCondition(`${col} = $IDX`, val);
      }
    }
  }

  const clause = conditions.length > 0 ? conditions.join(" AND ") : "";
  return { clause, values };
}

/**
 * Awaitable query builder supporting .sort(), .skip(), .limit(), .populate()
 */
class QueryBuilder {
  constructor(model, filter = {}, single = false) {
    this.model = model;
    this.filter = filter;
    this.single = single;
    this._sort = null;
    this._skip = null;
    this._limit = null;
    this._select = null;
    this._populates = [];
  }

  sort(sortObj) {
    if (sortObj) this._sort = sortObj;
    return this;
  }

  skip(count) {
    if (Number.isInteger(count) && count >= 0) this._skip = count;
    return this;
  }

  limit(count) {
    if (Number.isInteger(count) && count > 0) this._limit = count;
    return this;
  }

  select(fields) {
    if (fields) this._select = fields;
    return this;
  }

  populate(path, select) {
    if (Array.isArray(path)) {
      for (const item of path) {
        if (typeof item === "string") {
          this._populates.push({ path: item });
        } else if (item && typeof item === "object") {
          this._populates.push({ path: item.path, select: item.select });
        }
      }
    } else if (typeof path === "string" && path.includes(" ")) {
      for (const p of path.split(/\s+/).filter(Boolean)) {
        this._populates.push({ path: p, select });
      }
    } else if (path) {
      this._populates.push({ path, select });
    }
    return this;
  }

  lean() {
    return this; // Model instances already support JSON conversion and plain object spread
  }

  async exec() {
    const { clause, values } = buildWhereClause(this.filter, this.model.columnMap, this.model.jsonColumns);
    let sql = `SELECT * FROM ${this.model.tableName}`;
    if (clause) {
      sql += ` WHERE ${clause}`;
    }

    if (this._sort) {
      const orderParts = [];
      if (typeof this._sort === "string") {
        if (!/[;'"\\]|--|\/\*/.test(this._sort)) {
          const parts = this._sort.trim().split(/\s+/);
          parts.forEach((p) => {
            const isDesc = p.startsWith("-");
            const rawCol = isDesc ? p.slice(1) : p;
            if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rawCol)) {
              const mapped = this.model.mapColumn(rawCol);
              if (SAFE_IDENTIFIER_REGEX.test(mapped)) {
                orderParts.push(`"${mapped}" ${isDesc ? "DESC" : "ASC"}`);
              }
            }
          });
        }
      } else if (typeof this._sort === "object") {
        for (const [k, v] of Object.entries(this._sort)) {
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)) {
            const mapped = this.model.mapColumn(k);
            if (SAFE_IDENTIFIER_REGEX.test(mapped)) {
              const dir = v === -1 || String(v).toLowerCase() === "desc" ? "DESC" : "ASC";
              orderParts.push(`"${mapped}" ${dir}`);
            }
          }
        }
      }
      if (orderParts.length > 0) {
        sql += ` ORDER BY ${orderParts.join(", ")}`;
      } else {
        sql += ` ORDER BY created_at DESC`;
      }
    } else {
      sql += ` ORDER BY created_at DESC`;
    }

    if (this._limit !== null && this._limit !== undefined) {
      const parsedLim = parseInt(this._limit, 10);
      if (Number.isInteger(parsedLim) && parsedLim >= 0) {
        sql += ` LIMIT ${parsedLim}`;
      }
    }
    if (this._skip !== null && this._skip !== undefined) {
      const parsedSkip = parseInt(this._skip, 10);
      if (Number.isInteger(parsedSkip) && parsedSkip >= 0) {
        sql += ` OFFSET ${parsedSkip}`;
      }
    }

    const res = await db.query(sql, values);
    let rows = res.rows.map((row) => this.model.wrap(row));

    // Handle populates
    if (this._populates.length > 0 && rows.length > 0) {
      for (const pop of this._populates) {
        await this.model.handlePopulate(rows, pop.path, pop.select);
      }
    }

    if (this.single) {
      return rows.length > 0 ? rows[0] : null;
    }
    return rows;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }
}

/**
 * Base PostgreSQL Model
 */
class BaseModel {
  constructor(data = {}) {
    this._data = { ...data };
    this._isNew = !data.id && !data._id;
    this.id = data.id || data._id || generateId();
    this._id = this.id;
    this._data.id = this.id;
    this._data._id = this.id;

    // Attach properties directly to this instance
    for (const [k, v] of Object.entries(data)) {
      if (k !== "id" && k !== "_id") {
        this[k] = v;
      }
    }
  }

  toObject() {
    const obj = { ...this._data, ...this };
    delete obj._data;
    delete obj._isNew;
    obj.id = this.id;
    obj._id = this.id;
    return obj;
  }

  toJSON() {
    return this.toObject();
  }

  validate() {
    return Promise.resolve();
  }

  async save() {
    if (typeof this.validate === "function") {
      await this.validate();
    }
    const cls = this.constructor;
    const currentData = this.toObject();
    const columns = [];
    const values = [];
    const updates = [];

    currentData.updated_at = new Date();
    currentData.updatedAt = currentData.updated_at;

    const colIndex = new Map();

    for (const [prop, val] of Object.entries(currentData)) {
      if (prop.startsWith("_") && prop !== "_id") continue;
      const col = cls.mapColumn(prop);

      let dbVal = val;
      if (cls.jsonColumns.has(col)) {
        dbVal = typeof val === "string" ? val : JSON.stringify(val);
      } else if (cls.numericColumns.has(col)) {
        dbVal = val === null || val === undefined ? null : Number(val);
      } else if (cls.booleanColumns.has(col)) {
        dbVal = Boolean(val);
      } else if (dbVal && typeof dbVal === "object" && !(dbVal instanceof Date)) {
        dbVal = dbVal._id || dbVal.id || null;
      }

      if (colIndex.has(col)) {
        const idx = colIndex.get(col);
        values[idx] = dbVal;
      } else {
        colIndex.set(col, columns.length);
        columns.push(col);
        values.push(dbVal);
        if (col !== "id") {
          updates.push(`${col} = EXCLUDED.${col}`);
        }
      }
    }

    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(", ");
    const sql = `
      INSERT INTO ${cls.tableName} (${columns.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT (id) DO UPDATE SET ${updates.join(", ")}
      RETURNING *;
    `;

    const res = await db.query(sql, values);
    const updated = cls.wrap(res.rows[0]);
    Object.assign(this, updated);
    this._isNew = false;
    return this;
  }

  async deleteOne() {
    const id = this.id || this._id;
    if (!id) return { deletedCount: 0 };
    return this.constructor.deleteOne({ id });
  }

  async delete() {
    return this.deleteOne();
  }

  async populate(path, select) {
    const cls = this.constructor;
    if (Array.isArray(path)) {
      for (const item of path) {
        if (typeof item === "string") {
          await cls.handlePopulate([this], item);
        } else if (item && typeof item === "object") {
          await cls.handlePopulate([this], item.path, item.select);
        }
      }
      return this;
    }
    if (typeof path === "string" && path.includes(" ")) {
      for (const p of path.split(/\s+/).filter(Boolean)) {
        await cls.handlePopulate([this], p, select);
      }
      return this;
    }
    await cls.handlePopulate([this], path, select);
    return this;
  }

  // --- Static Class Methods ---

  static get tableName() {
    throw new Error("tableName must be defined on Model");
  }

  static get columnMap() {
    return {};
  }

  static get jsonColumns() {
    return new Set();
  }

  static get numericColumns() {
    return new Set();
  }

  static get booleanColumns() {
    return new Set();
  }

  static mapColumn(prop) {
    if (prop === "_id" || prop === "id") return "id";
    if (this.columnMap[prop]) return this.columnMap[prop];
    return camelToSnake(prop);
  }

  static mapProp(col) {
    if (col === "id") return "id";
    // Check reverse column map
    for (const [prop, c] of Object.entries(this.columnMap)) {
      if (c === col) return prop;
    }
    return snakeToCamel(col);
  }

  static wrap(row) {
    if (!row) return null;
    const data = {};
    for (const [col, val] of Object.entries(row)) {
      const prop = this.mapProp(col);
      let parsedVal = val;
      if (this.numericColumns.has(col) && val !== null && val !== undefined) {
        parsedVal = Number(val);
      } else if (this.jsonColumns.has(col) && typeof val === "string") {
        try {
          parsedVal = JSON.parse(val);
        } catch {
          parsedVal = val;
        }
      }
      data[prop] = parsedVal;

      // Populate any secondary aliases for this column defined in columnMap
      for (const [aliasProp, aliasCol] of Object.entries(this.columnMap)) {
        if (aliasCol === col && aliasProp !== prop) {
          data[aliasProp] = parsedVal;
        }
      }
    }

    data.id = String(row.id);
    data._id = data.id;

    // Backward-compatibility aliases for timestamps
    if (row.created_at) data.createdAt = row.created_at;
    if (row.updated_at) data.updatedAt = row.updated_at;

    const instance = new this(data);
    instance._isNew = false;
    return instance;
  }

  static fromRow(row) {
    return this.wrap(row);
  }

  static find(filter = {}) {
    return new QueryBuilder(this, filter, false);
  }

  static findOne(filter = {}) {
    return new QueryBuilder(this, filter, true);
  }

  static findById(id) {
    if (!id) return Promise.resolve(null);
    return this.findOne({ _id: String(id) });
  }

  static async countDocuments(filter = {}) {
    const { clause, values } = buildWhereClause(filter, this.columnMap, this.jsonColumns);
    let sql = `SELECT COUNT(*)::int AS count FROM ${this.tableName}`;
    if (clause) sql += ` WHERE ${clause}`;
    const res = await db.query(sql, values);
    return res.rows[0].count;
  }

  static async exists(filter = {}) {
    const count = await this.countDocuments(filter);
    return count > 0;
  }

  static async create(docOrDocs) {
    if (Array.isArray(docOrDocs)) {
      const instances = [];
      for (const d of docOrDocs) {
        const inst = new this(d);
        await inst.save();
        instances.push(inst);
      }
      return instances;
    }
    const inst = new this(docOrDocs);
    await inst.save();
    return inst;
  }

  static async insertMany(docs) {
    return this.create(docs);
  }

  static async updateOne(filter, update) {
    const doc = await this.findOne(filter);
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    this.applyUpdate(doc, update);
    await doc.save();
    return { matchedCount: 1, modifiedCount: 1 };
  }

  static async updateMany(filter, update) {
    const docs = await this.find(filter);
    for (const doc of docs) {
      this.applyUpdate(doc, update);
      await doc.save();
    }
    return { matchedCount: docs.length, modifiedCount: docs.length };
  }

  static async deleteOne(filter) {
    const { clause, values } = buildWhereClause(filter, this.columnMap, this.jsonColumns);
    if (!clause) return { deletedCount: 0 };
    const sql = `DELETE FROM ${this.tableName} WHERE id IN (SELECT id FROM ${this.tableName} WHERE ${clause} LIMIT 1)`;
    const res = await db.query(sql, values);
    return { deletedCount: res.rowCount };
  }

  static async deleteMany(filter) {
    const { clause, values } = buildWhereClause(filter, this.columnMap, this.jsonColumns);
    const sql = clause ? `DELETE FROM ${this.tableName} WHERE ${clause}` : `DELETE FROM ${this.tableName}`;
    const res = await db.query(sql, values);
    return { deletedCount: res.rowCount };
  }

  static async findByIdAndUpdate(id, update, options = {}) {
    return this.findOneAndUpdate({ _id: id }, update, options);
  }

  static async findOneAndUpdate(filter, update, options = {}) {
    let doc = await this.findOne(filter);
    if (!doc) {
      if (options.upsert) {
        const initial = { ...filter };
        if (update.$setOnInsert) Object.assign(initial, update.$setOnInsert);
        this.applyUpdate(initial, update);
        return this.create(initial);
      }
      return null;
    }

    this.applyUpdate(doc, update);
    await doc.save();
    return doc;
  }

  static async findByIdAndDelete(id) {
    const doc = await this.findById(id);
    if (!doc) return null;
    await db.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
    return doc;
  }

  static async findOneAndDelete(filter) {
    const doc = await this.findOne(filter);
    if (!doc) return null;
    await db.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [doc.id]);
    return doc;
  }

  static async aggregate(pipeline = []) {
    return [];
  }

  static applyUpdate(target, update) {
    if (!update) return;

    if (update.$set) {
      for (const [k, v] of Object.entries(update.$set)) {
        target[k] = v;
      }
    }
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        target[k] = (Number(target[k]) || 0) + Number(v);
      }
    }
    if (update.$unset) {
      for (const k of Object.keys(update.$unset)) {
        delete target[k];
      }
    }

    // Direct field updates
    for (const [k, v] of Object.entries(update)) {
      if (!k.startsWith("$")) {
        target[k] = v;
      }
    }
  }

  static async handlePopulate(instances, path) {
    // Override in specific models or default handler
  }
}

module.exports = {
  BaseModel,
  QueryBuilder,
  buildWhereClause,
  generateId
};
