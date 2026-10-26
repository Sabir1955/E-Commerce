const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Use memoryStorage for streaming images directly into MongoDB GridFS
const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml"
]);

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);

const SVG_DANGEROUS_PATTERN = /<script\b|javascript\s*:|vbscript\s*:|on[a-zA-Z]+\s*=|xlink:href\s*=\s*["']?data:|<foreignObject\b/i;

function validateUploadedBuffer(file) {
  if (!file || !file.buffer) return;
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ext === ".svg") {
    const content = file.buffer.toString("utf8");
    if (SVG_DANGEROUS_PATTERN.test(content)) {
      throw new Error("Upload rejected: SVG contains prohibited executable scripts or active handlers");
    }
  }
}

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB max for high-res images
  },
  fileFilter: (req, file, callback) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const isImageMime = file.mimetype && ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase());
    const isImageExt = ALLOWED_EXTENSIONS.has(ext);

    if (isImageMime && isImageExt) {
      callback(null, true);
    } else {
      callback(new Error("Only valid image files (JPG, PNG, WebP, SVG, GIF) with matching MIME types are allowed"));
    }
  }
});

const uploadArrayMiddleware = (fieldName = "images", maxCount = 8) => {
  return (req, res, next) => {
    upload.fields([
      { name: fieldName, maxCount },
      { name: "photo", maxCount: 1 },
      { name: "images", maxCount },
      { name: "image", maxCount: 1 },
      { name: "file", maxCount: 1 }
    ])(req, res, (err) => {
      if (err) return next(err);
      if (req.files) {
        const normalized = [
          ...(req.files[fieldName] || []),
          ...(req.files.photo || []),
          ...(req.files.images || []),
          ...(req.files.image || []),
          ...(req.files.file || [])
        ];
        req.files = normalized;
        if (normalized.length > 0) {
          req.file = normalized[0];
        }
      } else if (req.file) {
        req.files = [req.file];
      } else {
        req.files = [];
      }

      try {
        for (const f of req.files) {
          validateUploadedBuffer(f);
        }
      } catch (validationErr) {
        return next(validationErr);
      }

      next();
    });
  };
};

module.exports = {
  uploadSingle: (fieldName = "image") => {
    const single = upload.single(fieldName);
    return (req, res, next) => {
      single(req, res, (err) => {
        if (err) return next(err);
        try {
          if (req.file) {
            validateUploadedBuffer(req.file);
          }
        } catch (valErr) {
          return next(valErr);
        }
        next();
      });
    };
  },
  uploadArray: uploadArrayMiddleware
};
